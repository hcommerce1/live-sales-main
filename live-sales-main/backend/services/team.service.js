/**
 * Team Service
 *
 * Manages company team members: invitations, roles, and permissions.
 * Feature flag: company.enabled
 *
 * Roles:
 * - owner: Full access, can transfer ownership, delete company
 * - admin: Manage team, billing, all exports
 * - member: Access exports, limited settings
 *
 * Rules:
 * - One owner per company (transferable)
 * - Owner cannot leave without transferring
 * - Admins can invite members and admins
 * - Members can only view team
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const featureService = require('./feature.service');
const { logDataEvent, AUDIT_ACTIONS } = require('./security-audit.service');

// Lazy load Prisma
let prisma = null;
function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Role hierarchy and permissions
 */
const ROLES = {
  owner: {
    level: 3,
    canInvite: ['admin', 'member'],
    canRemove: ['admin', 'member'],
    canChangeRole: ['admin', 'member'],
  },
  admin: {
    level: 2,
    canInvite: ['admin', 'member'],
    canRemove: ['member'],
    canChangeRole: ['member'],
  },
  member: {
    level: 1,
    canInvite: [],
    canRemove: [],
    canChangeRole: [],
  },
};

/**
 * Invitation expiry time (7 days)
 */
const INVITATION_EXPIRY_DAYS = 7;

/**
 * Generate secure invitation token
 * @returns {string} 64-char hex token
 */
function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get team members for a company
 *
 * @param {string} companyId
 * @param {Object} [options]
 * @param {boolean} [options.includeInactive=false]
 * @param {boolean} [options.includePending=true]
 * @returns {Promise<Array>}
 */
async function getTeamMembers(companyId, options = {}) {
  const { includeInactive = false, includePending = true } = options;
  const db = getPrisma();

  const where = { companyId };

  if (!includeInactive) {
    where.isActive = true;
  }

  const members = await db.companyMember.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          lastLoginAt: true,
          lastActivityAt: true,
        },
      },
    },
    orderBy: [
      { role: 'asc' }, // owner first
      { joinedAt: 'asc' },
    ],
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    email: member.user?.email || null,
    role: member.role,
    joinedAt: member.joinedAt,
    invitedAt: member.invitedAt,
    isActive: member.isActive,
    isPending: !member.joinedAt && member.invitationToken,
    lastActivity: member.user?.lastActivityAt || member.user?.lastLoginAt,
  }));
}

/**
 * Get single team member
 *
 * @param {string} memberId
 * @returns {Promise<Object|null>}
 */
async function getTeamMember(memberId) {
  const db = getPrisma();

  return db.companyMember.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Invite a new team member
 *
 * @param {Object} params
 * @param {string} params.companyId
 * @param {string} params.email - Email of person to invite
 * @param {string} params.role - Role to assign (admin/member)
 * @param {string} params.invitedBy - User ID of inviter
 * @returns {Promise<{member: Object, token: string}>}
 */
async function inviteMember({ companyId, email, role, invitedBy }) {
  const db = getPrisma();

  // Validate role
  if (!['admin', 'member'].includes(role)) {
    throw new Error('Invalid role. Must be admin or member.');
  }

  // Check inviter permissions
  const inviter = await db.companyMember.findFirst({
    where: { companyId, userId: invitedBy, isActive: true },
  });

  if (!inviter) {
    throw new Error('Inviter is not a member of this company');
  }

  const inviterRole = ROLES[inviter.role];
  if (!inviterRole.canInvite.includes(role)) {
    throw new Error(`${inviter.role} cannot invite ${role}`);
  }

  // Check team member limit
  const canInvite = await featureService.canInviteMember(companyId);
  if (!canInvite.allowed) {
    const error = new Error(canInvite.reason || 'Team member limit reached');
    error.code = 'TEAM_LIMIT_REACHED';
    error.limit = canInvite.limit;
    error.usage = canInvite.usage;
    throw error;
  }

  // Check if email already exists in team
  const existingUser = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });

  if (existingUser) {
    const existingMember = await db.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId,
          userId: existingUser.id,
        },
      },
    });

    if (existingMember) {
      if (existingMember.isActive) {
        throw new Error('User is already a member of this company');
      } else {
        // Reactivate inactive member
        const token = generateInvitationToken();
        const expires = new Date();
        expires.setDate(expires.getDate() + INVITATION_EXPIRY_DAYS);

        const member = await db.companyMember.update({
          where: { id: existingMember.id },
          data: {
            role,
            isActive: true,
            invitedBy,
            invitedAt: new Date(),
            invitationToken: token,
            invitationExpires: expires,
            joinedAt: null, // Reset join date
          },
        });

        await logDataEvent(AUDIT_ACTIONS.MEMBER_INVITED, {
          userId: invitedBy,
          companyId,
          resourceType: 'companyMember',
          resourceId: member.id,
          changes: { email, role, reactivated: true },
        });

        return { member, token };
      }
    }
  }

  // Check if there's a pending invitation for this email
  const pendingInvitation = await db.companyMember.findFirst({
    where: {
      companyId,
      invitationToken: { not: null },
      user: { email: email.toLowerCase() },
    },
  });

  if (pendingInvitation) {
    throw new Error('There is already a pending invitation for this email');
  }

  // Generate invitation token
  const token = generateInvitationToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITATION_EXPIRY_DAYS);

  // Create pending member (without user relation for now)
  // User will be linked when they accept the invitation
  const member = await db.companyMember.create({
    data: {
      companyId,
      userId: existingUser?.id || null, // Will be set on accept if user doesn't exist
      role,
      invitedBy,
      invitedAt: new Date(),
      invitationToken: token,
      invitationExpires: expires,
      isActive: true,
    },
  });

  // If user doesn't exist, store email in metadata for lookup
  // This is a simplified approach - production might use a separate invitations table

  await logDataEvent(AUDIT_ACTIONS.MEMBER_INVITED, {
    userId: invitedBy,
    companyId,
    resourceType: 'companyMember',
    resourceId: member.id,
    changes: { email, role },
  });

  logger.info('Team member invited', {
    companyId,
    email,
    role,
    invitedBy,
    memberId: member.id,
  });

  return { member, token, email };
}

/**
 * Accept an invitation
 *
 * @param {string} token - Invitation token
 * @param {string} userId - User accepting the invitation
 * @returns {Promise<Object>} Updated member
 */
async function acceptInvitation(token, userId) {
  const db = getPrisma();

  // Find invitation
  const member = await db.companyMember.findUnique({
    where: { invitationToken: token },
    include: {
      company: { select: { id: true, name: true } },
    },
  });

  if (!member) {
    throw new Error('Invalid invitation token');
  }

  if (member.invitationExpires < new Date()) {
    throw new Error('Invitation has expired');
  }

  if (member.joinedAt) {
    throw new Error('Invitation has already been accepted');
  }

  // Check if user is already member of this company
  const existingMembership = await db.companyMember.findUnique({
    where: {
      companyId_userId: {
        companyId: member.companyId,
        userId,
      },
    },
  });

  if (existingMembership && existingMembership.id !== member.id) {
    throw new Error('You are already a member of this company');
  }

  // Update member record
  const updatedMember = await db.companyMember.update({
    where: { id: member.id },
    data: {
      userId,
      joinedAt: new Date(),
      invitationToken: null,
      invitationExpires: null,
    },
    include: {
      company: { select: { id: true, name: true } },
    },
  });

  await logDataEvent(AUDIT_ACTIONS.MEMBER_JOINED, {
    userId,
    companyId: member.companyId,
    resourceType: 'companyMember',
    resourceId: member.id,
  });

  logger.info('Invitation accepted', {
    memberId: member.id,
    companyId: member.companyId,
    userId,
  });

  return updatedMember;
}

/**
 * Remove a team member
 *
 * @param {string} memberId - Member to remove
 * @param {string} removedBy - User ID performing removal
 * @returns {Promise<Object>}
 */
async function removeMember(memberId, removedBy) {
  const db = getPrisma();

  const member = await db.companyMember.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw new Error('Member not found');
  }

  // Cannot remove owner
  if (member.role === 'owner') {
    throw new Error('Cannot remove company owner. Transfer ownership first.');
  }

  // Check remover permissions
  const remover = await db.companyMember.findFirst({
    where: { companyId: member.companyId, userId: removedBy, isActive: true },
  });

  if (!remover) {
    throw new Error('You are not a member of this company');
  }

  const removerRole = ROLES[remover.role];
  if (!removerRole.canRemove.includes(member.role)) {
    throw new Error(`${remover.role} cannot remove ${member.role}`);
  }

  // Soft delete (deactivate)
  const updatedMember = await db.companyMember.update({
    where: { id: memberId },
    data: {
      isActive: false,
      invitationToken: null,
    },
  });

  await logDataEvent(AUDIT_ACTIONS.MEMBER_REMOVED, {
    userId: removedBy,
    companyId: member.companyId,
    resourceType: 'companyMember',
    resourceId: memberId,
    changes: { removedUserId: member.userId },
  });

  logger.info('Team member removed', {
    memberId,
    companyId: member.companyId,
    removedBy,
  });

  return updatedMember;
}

/**
 * Change a member's role
 *
 * @param {string} memberId
 * @param {string} newRole
 * @param {string} changedBy - User ID making the change
 * @returns {Promise<Object>}
 */
async function changeRole(memberId, newRole, changedBy) {
  const db = getPrisma();

  if (!['admin', 'member'].includes(newRole)) {
    throw new Error('Invalid role. Use transferOwnership for owner changes.');
  }

  const member = await db.companyMember.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw new Error('Member not found');
  }

  if (member.role === 'owner') {
    throw new Error('Cannot change owner role. Use transferOwnership.');
  }

  // Check changer permissions
  const changer = await db.companyMember.findFirst({
    where: { companyId: member.companyId, userId: changedBy, isActive: true },
  });

  if (!changer) {
    throw new Error('You are not a member of this company');
  }

  const changerRole = ROLES[changer.role];
  if (!changerRole.canChangeRole.includes(member.role) && !changerRole.canChangeRole.includes(newRole)) {
    throw new Error(`${changer.role} cannot change role to/from ${member.role}/${newRole}`);
  }

  const oldRole = member.role;

  const updatedMember = await db.companyMember.update({
    where: { id: memberId },
    data: { role: newRole },
  });

  await logDataEvent(AUDIT_ACTIONS.ROLE_CHANGE, {
    userId: changedBy,
    companyId: member.companyId,
    resourceType: 'companyMember',
    resourceId: memberId,
    changes: { oldRole, newRole },
  });

  logger.info('Member role changed', {
    memberId,
    companyId: member.companyId,
    oldRole,
    newRole,
    changedBy,
  });

  return updatedMember;
}

/**
 * Transfer company ownership
 *
 * @param {string} companyId
 * @param {string} newOwnerId - User ID of new owner
 * @param {string} currentOwnerId - Current owner's user ID
 * @returns {Promise<Object>}
 */
async function transferOwnership(companyId, newOwnerId, currentOwnerId) {
  const db = getPrisma();

  // Verify current owner
  const currentOwner = await db.companyMember.findFirst({
    where: { companyId, userId: currentOwnerId, role: 'owner', isActive: true },
  });

  if (!currentOwner) {
    throw new Error('You are not the owner of this company');
  }

  // Verify new owner is a member
  const newOwner = await db.companyMember.findFirst({
    where: { companyId, userId: newOwnerId, isActive: true },
  });

  if (!newOwner) {
    throw new Error('New owner must be an existing team member');
  }

  if (newOwner.userId === currentOwnerId) {
    throw new Error('You are already the owner');
  }

  // Atomic transfer
  await db.$transaction([
    // Demote current owner to admin
    db.companyMember.update({
      where: { id: currentOwner.id },
      data: { role: 'admin' },
    }),
    // Promote new owner
    db.companyMember.update({
      where: { id: newOwner.id },
      data: { role: 'owner' },
    }),
  ]);

  await logDataEvent(AUDIT_ACTIONS.ROLE_CHANGE, {
    userId: currentOwnerId,
    companyId,
    resourceType: 'company',
    resourceId: companyId,
    changes: {
      action: 'ownership_transfer',
      previousOwner: currentOwnerId,
      newOwner: newOwnerId,
    },
  });

  logger.info('Ownership transferred', {
    companyId,
    previousOwner: currentOwnerId,
    newOwner: newOwnerId,
  });

  return { success: true };
}

/**
 * Leave a company
 *
 * @param {string} companyId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function leaveCompany(companyId, userId) {
  const db = getPrisma();

  const member = await db.companyMember.findFirst({
    where: { companyId, userId, isActive: true },
  });

  if (!member) {
    throw new Error('You are not a member of this company');
  }

  if (member.role === 'owner') {
    throw new Error('Owner cannot leave. Transfer ownership first.');
  }

  await db.companyMember.update({
    where: { id: member.id },
    data: { isActive: false },
  });

  logger.info('User left company', {
    companyId,
    userId,
    role: member.role,
  });

  return { success: true };
}

/**
 * Cancel pending invitation
 *
 * @param {string} memberId
 * @param {string} canceledBy
 * @returns {Promise<Object>}
 */
async function cancelInvitation(memberId, canceledBy) {
  const db = getPrisma();

  const member = await db.companyMember.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw new Error('Invitation not found');
  }

  if (member.joinedAt) {
    throw new Error('Cannot cancel - invitation already accepted');
  }

  // Check permissions
  const canceler = await db.companyMember.findFirst({
    where: { companyId: member.companyId, userId: canceledBy, isActive: true },
  });

  if (!canceler || !['owner', 'admin'].includes(canceler.role)) {
    throw new Error('Only owner or admin can cancel invitations');
  }

  await db.companyMember.delete({
    where: { id: memberId },
  });

  logger.info('Invitation canceled', {
    memberId,
    companyId: member.companyId,
    canceledBy,
  });

  return { success: true };
}

/**
 * Resend invitation email
 *
 * @param {string} memberId
 * @param {string} resentBy
 * @returns {Promise<{token: string}>}
 */
async function resendInvitation(memberId, resentBy) {
  const db = getPrisma();

  const member = await db.companyMember.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw new Error('Invitation not found');
  }

  if (member.joinedAt) {
    throw new Error('Cannot resend - invitation already accepted');
  }

  // Generate new token with extended expiry
  const token = generateInvitationToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITATION_EXPIRY_DAYS);

  await db.companyMember.update({
    where: { id: memberId },
    data: {
      invitationToken: token,
      invitationExpires: expires,
    },
  });

  logger.info('Invitation resent', {
    memberId,
    companyId: member.companyId,
    resentBy,
  });

  return { token };
}

/**
 * Get invitation details by token
 *
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
async function getInvitationByToken(token) {
  const db = getPrisma();

  const member = await db.companyMember.findUnique({
    where: { invitationToken: token },
    include: {
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!member) {
    return null;
  }

  return {
    id: member.id,
    companyId: member.companyId,
    companyName: member.company.name,
    role: member.role,
    invitedAt: member.invitedAt,
    expiresAt: member.invitationExpires,
    isExpired: member.invitationExpires < new Date(),
  };
}

/**
 * Get pending invitations for a company
 *
 * @param {string} companyId
 * @returns {Promise<Array>}
 */
async function getPendingInvitations(companyId) {
  const db = getPrisma();

  const pendingMembers = await db.companyMember.findMany({
    where: {
      companyId,
      joinedAt: null,
      invitationToken: { not: null },
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: { invitedAt: 'desc' },
  });

  return pendingMembers.map((member) => ({
    id: member.id,
    email: member.user?.email || null,
    role: member.role,
    invitedAt: member.invitedAt,
    expiresAt: member.invitationExpires,
    isExpired: member.invitationExpires < new Date(),
    invitationToken: member.invitationToken, // For cancel/resend operations
  }));
}

/**
 * Get role permissions for display
 *
 * @param {string} role
 * @returns {Object}
 */
function getRolePermissions(role) {
  const roleConfig = ROLES[role];

  if (!roleConfig) {
    return {
      level: 0,
      canInvite: false,
      canRemove: false,
      canChangeRoles: false,
      canManageBilling: false,
      canTransferOwnership: false,
    };
  }

  return {
    level: roleConfig.level,
    canInvite: roleConfig.canInvite.length > 0,
    canInviteRoles: roleConfig.canInvite,
    canRemove: roleConfig.canRemove.length > 0,
    canRemoveRoles: roleConfig.canRemove,
    canChangeRoles: roleConfig.canChangeRole.length > 0,
    canManageBilling: role === 'owner' || role === 'admin',
    canTransferOwnership: role === 'owner',
    canDeleteCompany: role === 'owner',
  };
}

module.exports = {
  ROLES,
  getTeamMembers,
  getTeamMember,
  inviteMember,
  acceptInvitation,
  removeMember,
  changeRole,
  transferOwnership,
  leaveCompany,
  cancelInvitation,
  resendInvitation,
  getInvitationByToken,
  getPendingInvitations,
  getRolePermissions,
  generateInvitationToken,
};
