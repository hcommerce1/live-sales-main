/**
 * Team Routes
 *
 * Endpoints for team management: invitations, roles, members.
 * Feature flag: company.enabled (team features require company context)
 *
 * All routes require authentication and company context.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const teamService = require('../services/team.service');
const logger = require('../utils/logger');

// ============================================
// Validation Schemas
// ============================================

const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member']).default('member'),
});

const changeRoleSchema = z.object({
  newRole: z.enum(['admin', 'member']),
});

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid('Invalid member ID'),
});

// ============================================
// Helper: Validate request body
// ============================================

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.validatedBody = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

// ============================================
// Routes
// ============================================

/**
 * GET /api/team
 * List all team members for the current company
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const members = await teamService.getTeamMembers(req.company.id);

    res.json({
      success: true,
      data: {
        members,
        total: members.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get team members', {
      companyId: req.company?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * GET /api/team/pending
 * List pending invitations for the current company
 */
router.get('/pending', async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const pendingInvitations = await teamService.getPendingInvitations(req.company.id);

    res.json({
      success: true,
      data: {
        invitations: pendingInvitations,
        total: pendingInvitations.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get pending invitations', {
      companyId: req.company?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * POST /api/team/invite
 * Invite a new member to the company
 */
router.post('/invite', validateBody(inviteMemberSchema), async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const { email, role } = req.validatedBody;

    const result = await teamService.inviteMember({
      companyId: req.company.id,
      invitedBy: req.user.id,
      email,
      role,
    });

    logger.info('Team member invited', {
      companyId: req.company.id,
      invitedBy: req.user.id,
      invitedEmail: email,
      role,
    });

    res.status(201).json({
      success: true,
      data: {
        memberId: result.member.id,
        email: result.email,
        role: result.member.role,
        invitationToken: result.token,
        expiresAt: result.member.invitationExpires,
      },
      message: 'Invitation sent successfully',
    });
  } catch (error) {
    // Handle specific error types
    if (error.message.includes('cannot invite')) {
      return res.status(403).json({
        error: error.message,
        code: 'PERMISSION_DENIED',
      });
    }
    if (error.message.includes('already a member')) {
      return res.status(409).json({
        error: error.message,
        code: 'ALREADY_MEMBER',
      });
    }
    if (error.code === 'TEAM_LIMIT_REACHED') {
      return res.status(402).json({
        error: error.message,
        code: 'LIMIT_EXCEEDED',
        limit: error.limit,
        usage: error.usage,
        requiredPlan: 'basic',
      });
    }

    logger.error('Failed to invite team member', {
      companyId: req.company?.id,
      email: req.validatedBody?.email,
      error: error.message,
    });
    next(error);
  }
});

/**
 * POST /api/team/invitations/:token/accept
 * Accept an invitation using the token
 * Note: This route does NOT require company context (user joining new company)
 */
router.post('/invitations/:token/accept', async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: 'Invitation token required',
        code: 'TOKEN_REQUIRED',
      });
    }

    const result = await teamService.acceptInvitation(token, req.user.id);

    logger.info('Invitation accepted', {
      userId: req.user.id,
      companyId: result.companyId,
      role: result.role,
    });

    res.json({
      success: true,
      data: {
        companyId: result.companyId,
        companyName: result.company?.name,
        role: result.role,
      },
      message: 'You have joined the company',
    });
  } catch (error) {
    if (error.message.includes('Invalid invitation token')) {
      return res.status(400).json({
        error: error.message,
        code: 'INVALID_TOKEN',
      });
    }
    if (error.message.includes('expired')) {
      return res.status(400).json({
        error: error.message,
        code: 'EXPIRED_TOKEN',
      });
    }
    if (error.message.includes('already been accepted')) {
      return res.status(400).json({
        error: error.message,
        code: 'ALREADY_ACCEPTED',
      });
    }
    if (error.message.includes('already a member')) {
      return res.status(409).json({
        error: error.message,
        code: 'ALREADY_MEMBER',
      });
    }

    logger.error('Failed to accept invitation', {
      userId: req.user?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * DELETE /api/team/invitations/:token
 * Cancel a pending invitation
 */
router.delete('/invitations/:token', async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const { token } = req.params;

    // First find the member by token to get memberId
    const invitation = await teamService.getInvitationByToken(token);
    if (!invitation || invitation.companyId !== req.company.id) {
      return res.status(404).json({
        error: 'Invitation not found',
        code: 'INVITATION_NOT_FOUND',
      });
    }

    await teamService.cancelInvitation(invitation.id, req.user.id);

    logger.info('Invitation cancelled', {
      companyId: req.company.id,
      cancelledBy: req.user.id,
    });

    res.json({
      success: true,
      message: 'Invitation cancelled',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
        code: 'INVITATION_NOT_FOUND',
      });
    }
    if (error.message.includes('Only owner or admin')) {
      return res.status(403).json({
        error: error.message,
        code: 'PERMISSION_DENIED',
      });
    }

    logger.error('Failed to cancel invitation', {
      companyId: req.company?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * POST /api/team/invitations/:token/resend
 * Resend an invitation email
 */
router.post('/invitations/:token/resend', async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const { token } = req.params;

    // First find the member by token to get memberId
    const invitation = await teamService.getInvitationByToken(token);
    if (!invitation || invitation.companyId !== req.company.id) {
      return res.status(404).json({
        error: 'Invitation not found',
        code: 'INVITATION_NOT_FOUND',
      });
    }

    const result = await teamService.resendInvitation(invitation.id, req.user.id);

    logger.info('Invitation resent', {
      companyId: req.company.id,
      resendBy: req.user.id,
    });

    res.json({
      success: true,
      data: {
        newToken: result.token,
        expiresAt: result.expiresAt,
      },
      message: 'Invitation resent with new token',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
        code: 'INVITATION_NOT_FOUND',
      });
    }

    logger.error('Failed to resend invitation', {
      companyId: req.company?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * DELETE /api/team/:memberId
 * Remove a member from the company
 */
router.delete('/:memberId', async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const { memberId } = req.params;

    // Verify member belongs to this company
    const member = await teamService.getTeamMember(memberId);
    if (!member || member.companyId !== req.company.id) {
      return res.status(404).json({
        error: 'Member not found',
        code: 'MEMBER_NOT_FOUND',
      });
    }

    await teamService.removeMember(memberId, req.user.id);

    logger.info('Team member removed', {
      companyId: req.company.id,
      removedMemberId: memberId,
      removedBy: req.user.id,
    });

    res.json({
      success: true,
      message: 'Member removed from company',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
        code: 'MEMBER_NOT_FOUND',
      });
    }
    if (error.message.includes('Cannot remove') || error.message.includes('cannot remove')) {
      return res.status(403).json({
        error: error.message,
        code: 'PERMISSION_DENIED',
      });
    }

    logger.error('Failed to remove team member', {
      companyId: req.company?.id,
      memberId: req.params.memberId,
      error: error.message,
    });
    next(error);
  }
});

/**
 * PATCH /api/team/:memberId/role
 * Change a member's role
 */
router.patch('/:memberId/role', validateBody(changeRoleSchema), async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const { memberId } = req.params;
    const { newRole } = req.validatedBody;

    // Verify member belongs to this company
    const member = await teamService.getTeamMember(memberId);
    if (!member || member.companyId !== req.company.id) {
      return res.status(404).json({
        error: 'Member not found',
        code: 'MEMBER_NOT_FOUND',
      });
    }

    const oldRole = member.role;
    await teamService.changeRole(memberId, newRole, req.user.id);

    logger.info('Team member role changed', {
      companyId: req.company.id,
      memberId,
      oldRole,
      newRole,
      changedBy: req.user.id,
    });

    res.json({
      success: true,
      data: {
        memberId,
        oldRole,
        newRole,
      },
      message: 'Role updated successfully',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
        code: 'MEMBER_NOT_FOUND',
      });
    }
    if (error.message.includes('Cannot change') || error.message.includes('cannot change')) {
      return res.status(403).json({
        error: error.message,
        code: 'PERMISSION_DENIED',
      });
    }

    logger.error('Failed to change member role', {
      companyId: req.company?.id,
      memberId: req.params.memberId,
      error: error.message,
    });
    next(error);
  }
});

/**
 * POST /api/team/transfer-ownership
 * Transfer company ownership to another member
 */
router.post('/transfer-ownership', validateBody(transferOwnershipSchema), async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    const { newOwnerId } = req.validatedBody;

    await teamService.transferOwnership(req.company.id, newOwnerId, req.user.id);

    logger.info('Company ownership transferred', {
      companyId: req.company.id,
      previousOwner: req.user.id,
      newOwner: newOwnerId,
    });

    res.json({
      success: true,
      data: {
        previousOwnerNewRole: 'admin',
        newOwnerRole: 'owner',
      },
      message: 'Ownership transferred successfully',
    });
  } catch (error) {
    if (error.message.includes('not the owner')) {
      return res.status(403).json({
        error: error.message,
        code: 'NOT_OWNER',
      });
    }
    if (error.message.includes('existing team member')) {
      return res.status(404).json({
        error: error.message,
        code: 'MEMBER_NOT_FOUND',
      });
    }
    if (error.message.includes('already the owner')) {
      return res.status(400).json({
        error: error.message,
        code: 'ALREADY_OWNER',
      });
    }

    logger.error('Failed to transfer ownership', {
      companyId: req.company?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * POST /api/team/leave
 * Leave the current company
 */
router.post('/leave', async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    await teamService.leaveCompany(req.company.id, req.user.id);

    logger.info('User left company', {
      companyId: req.company.id,
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: 'You have left the company',
    });
  } catch (error) {
    if (error.message.includes('Owner cannot leave')) {
      return res.status(403).json({
        error: error.message,
        code: 'OWNER_CANNOT_LEAVE',
        hint: 'Transfer ownership before leaving',
      });
    }
    if (error.message.includes('not a member')) {
      return res.status(404).json({
        error: error.message,
        code: 'NOT_A_MEMBER',
      });
    }

    logger.error('Failed to leave company', {
      companyId: req.company?.id,
      userId: req.user?.id,
      error: error.message,
    });
    next(error);
  }
});

/**
 * GET /api/team/my-role
 * Get current user's role in the company
 */
router.get('/my-role', async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    // memberRole should be set by company context middleware
    const role = req.memberRole;

    if (!role) {
      return res.status(404).json({
        error: 'You are not a member of this company',
        code: 'NOT_A_MEMBER',
      });
    }

    res.json({
      success: true,
      data: {
        role,
        permissions: teamService.getRolePermissions(role),
      },
    });
  } catch (error) {
    logger.error('Failed to get user role', {
      companyId: req.company?.id,
      userId: req.user?.id,
      error: error.message,
    });
    next(error);
  }
});

module.exports = router;
