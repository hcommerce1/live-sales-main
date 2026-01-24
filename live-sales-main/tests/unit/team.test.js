/**
 * Team Service and Routes Tests
 *
 * Tests for team management: invitations, roles, permissions.
 */

const teamService = require('../../backend/services/team.service');

// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    companyMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  })),
}));

// Mock feature service
jest.mock('../../backend/services/feature.service', () => ({
  canInviteMember: jest.fn().mockResolvedValue({ allowed: true, limit: 10, usage: 2 }),
}));

// Mock security audit service
jest.mock('../../backend/services/security-audit.service', () => ({
  logDataEvent: jest.fn().mockResolvedValue({}),
  AUDIT_ACTIONS: {
    MEMBER_INVITED: 'MEMBER_INVITED',
    MEMBER_JOINED: 'MEMBER_JOINED',
    MEMBER_REMOVED: 'MEMBER_REMOVED',
    ROLE_CHANGE: 'ROLE_CHANGE',
  },
}));

// Mock logger
jest.mock('../../backend/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('Team Service', () => {
  let mockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    const { PrismaClient } = require('@prisma/client');
    mockPrisma = new PrismaClient();
  });

  describe('ROLES configuration', () => {
    test('owner has highest level', () => {
      expect(teamService.ROLES.owner.level).toBe(3);
      expect(teamService.ROLES.admin.level).toBe(2);
      expect(teamService.ROLES.member.level).toBe(1);
    });

    test('owner can invite admin and member', () => {
      expect(teamService.ROLES.owner.canInvite).toContain('admin');
      expect(teamService.ROLES.owner.canInvite).toContain('member');
    });

    test('admin can invite admin and member', () => {
      expect(teamService.ROLES.admin.canInvite).toContain('admin');
      expect(teamService.ROLES.admin.canInvite).toContain('member');
    });

    test('member cannot invite anyone', () => {
      expect(teamService.ROLES.member.canInvite).toHaveLength(0);
    });

    test('owner can remove admin and member', () => {
      expect(teamService.ROLES.owner.canRemove).toContain('admin');
      expect(teamService.ROLES.owner.canRemove).toContain('member');
    });

    test('admin can only remove member', () => {
      expect(teamService.ROLES.admin.canRemove).toContain('member');
      expect(teamService.ROLES.admin.canRemove).not.toContain('admin');
    });

    test('member cannot remove anyone', () => {
      expect(teamService.ROLES.member.canRemove).toHaveLength(0);
    });
  });

  describe('generateInvitationToken', () => {
    test('generates 64-character hex token', () => {
      const token = teamService.generateInvitationToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    test('generates unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(teamService.generateInvitationToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('getRolePermissions', () => {
    test('returns owner permissions', () => {
      const perms = teamService.getRolePermissions('owner');
      expect(perms.level).toBe(3);
      expect(perms.canInvite).toBe(true);
      expect(perms.canRemove).toBe(true);
      expect(perms.canChangeRoles).toBe(true);
      expect(perms.canManageBilling).toBe(true);
      expect(perms.canTransferOwnership).toBe(true);
      expect(perms.canDeleteCompany).toBe(true);
    });

    test('returns admin permissions', () => {
      const perms = teamService.getRolePermissions('admin');
      expect(perms.level).toBe(2);
      expect(perms.canInvite).toBe(true);
      expect(perms.canRemove).toBe(true);
      expect(perms.canManageBilling).toBe(true);
      expect(perms.canTransferOwnership).toBe(false);
    });

    test('returns member permissions', () => {
      const perms = teamService.getRolePermissions('member');
      expect(perms.level).toBe(1);
      expect(perms.canInvite).toBe(false);
      expect(perms.canRemove).toBe(false);
      expect(perms.canChangeRoles).toBe(false);
      expect(perms.canManageBilling).toBe(false);
    });

    test('returns empty permissions for invalid role', () => {
      const perms = teamService.getRolePermissions('invalid');
      expect(perms.level).toBe(0);
      expect(perms.canInvite).toBe(false);
    });
  });

  describe('getTeamMembers', () => {
    test('returns formatted member list', async () => {
      mockPrisma.companyMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          userId: 'user-1',
          role: 'owner',
          joinedAt: new Date('2024-01-01'),
          invitedAt: null,
          isActive: true,
          invitationToken: null,
          user: {
            id: 'user-1',
            email: 'owner@test.com',
            lastLoginAt: new Date('2024-01-15'),
            lastActivityAt: new Date('2024-01-16'),
          },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          role: 'member',
          joinedAt: new Date('2024-01-10'),
          invitedAt: new Date('2024-01-05'),
          isActive: true,
          invitationToken: null,
          user: {
            id: 'user-2',
            email: 'member@test.com',
            lastLoginAt: null,
            lastActivityAt: null,
          },
        },
      ]);

      const members = await teamService.getTeamMembers('company-1');

      expect(members).toHaveLength(2);
      expect(members[0].email).toBe('owner@test.com');
      expect(members[0].role).toBe('owner');
      expect(members[0].isPending).toBe(false);
      expect(members[1].email).toBe('member@test.com');
      expect(members[1].isPending).toBe(false);
    });

    test('identifies pending members correctly', async () => {
      mockPrisma.companyMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          userId: null,
          role: 'member',
          joinedAt: null,
          invitedAt: new Date('2024-01-05'),
          isActive: true,
          invitationToken: 'abc123',
          user: null,
        },
      ]);

      const members = await teamService.getTeamMembers('company-1');

      expect(members).toHaveLength(1);
      expect(members[0].isPending).toBe(true);
    });
  });

  describe('inviteMember', () => {
    const validInviteParams = {
      companyId: 'company-1',
      email: 'newuser@test.com',
      role: 'member',
      invitedBy: 'user-1',
    };

    test('rejects invalid role', async () => {
      await expect(
        teamService.inviteMember({ ...validInviteParams, role: 'owner' })
      ).rejects.toThrow('Invalid role');
    });

    test('rejects non-member inviter', async () => {
      mockPrisma.companyMember.findFirst.mockResolvedValue(null);

      await expect(
        teamService.inviteMember(validInviteParams)
      ).rejects.toThrow('not a member');
    });

    test('rejects member trying to invite', async () => {
      mockPrisma.companyMember.findFirst.mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        role: 'member',
        isActive: true,
      });

      await expect(
        teamService.inviteMember(validInviteParams)
      ).rejects.toThrow('member cannot invite');
    });
  });

  describe('acceptInvitation', () => {
    test('rejects invalid token', async () => {
      mockPrisma.companyMember.findUnique.mockResolvedValue(null);

      await expect(
        teamService.acceptInvitation('invalid-token', 'user-1')
      ).rejects.toThrow('Invalid invitation token');
    });

    test('rejects expired invitation', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      mockPrisma.companyMember.findUnique.mockResolvedValue({
        id: 'member-1',
        companyId: 'company-1',
        invitationExpires: expiredDate,
        joinedAt: null,
        company: { id: 'company-1', name: 'Test Company' },
      });

      await expect(
        teamService.acceptInvitation('valid-token', 'user-1')
      ).rejects.toThrow('expired');
    });

    test('rejects already accepted invitation', async () => {
      mockPrisma.companyMember.findUnique.mockResolvedValue({
        id: 'member-1',
        companyId: 'company-1',
        invitationExpires: new Date(Date.now() + 86400000),
        joinedAt: new Date(), // Already joined
        company: { id: 'company-1', name: 'Test Company' },
      });

      await expect(
        teamService.acceptInvitation('valid-token', 'user-1')
      ).rejects.toThrow('already been accepted');
    });
  });

  describe('removeMember', () => {
    test('cannot remove owner', async () => {
      mockPrisma.companyMember.findUnique.mockResolvedValue({
        id: 'member-1',
        companyId: 'company-1',
        userId: 'owner-user',
        role: 'owner',
      });

      await expect(
        teamService.removeMember('member-1', 'admin-user')
      ).rejects.toThrow('Cannot remove company owner');
    });

    test('admin cannot remove another admin', async () => {
      mockPrisma.companyMember.findUnique.mockResolvedValue({
        id: 'member-1',
        companyId: 'company-1',
        userId: 'admin-user-2',
        role: 'admin',
      });

      mockPrisma.companyMember.findFirst.mockResolvedValue({
        id: 'member-2',
        companyId: 'company-1',
        userId: 'admin-user',
        role: 'admin',
        isActive: true,
      });

      await expect(
        teamService.removeMember('member-1', 'admin-user')
      ).rejects.toThrow('admin cannot remove admin');
    });
  });

  describe('changeRole', () => {
    test('cannot change to owner role', async () => {
      await expect(
        teamService.changeRole('member-1', 'owner', 'admin-user')
      ).rejects.toThrow('Invalid role');
    });

    test('cannot change owner role', async () => {
      mockPrisma.companyMember.findUnique.mockResolvedValue({
        id: 'member-1',
        companyId: 'company-1',
        role: 'owner',
      });

      await expect(
        teamService.changeRole('member-1', 'admin', 'some-user')
      ).rejects.toThrow('Cannot change owner role');
    });
  });

  describe('transferOwnership', () => {
    test('only owner can transfer ownership', async () => {
      mockPrisma.companyMember.findFirst
        .mockResolvedValueOnce(null); // Current user is not owner

      await expect(
        teamService.transferOwnership('company-1', 'new-owner', 'not-owner')
      ).rejects.toThrow('not the owner');
    });

    test('cannot transfer to self', async () => {
      mockPrisma.companyMember.findFirst
        .mockResolvedValueOnce({
          id: 'member-1',
          companyId: 'company-1',
          userId: 'owner-user',
          role: 'owner',
          isActive: true,
        })
        .mockResolvedValueOnce({
          id: 'member-1',
          companyId: 'company-1',
          userId: 'owner-user',
          role: 'owner',
          isActive: true,
        });

      await expect(
        teamService.transferOwnership('company-1', 'owner-user', 'owner-user')
      ).rejects.toThrow('already the owner');
    });
  });

  describe('leaveCompany', () => {
    test('owner cannot leave', async () => {
      mockPrisma.companyMember.findFirst.mockResolvedValue({
        id: 'member-1',
        companyId: 'company-1',
        userId: 'owner-user',
        role: 'owner',
        isActive: true,
      });

      await expect(
        teamService.leaveCompany('company-1', 'owner-user')
      ).rejects.toThrow('Owner cannot leave');
    });

    test('non-member cannot leave', async () => {
      mockPrisma.companyMember.findFirst.mockResolvedValue(null);

      await expect(
        teamService.leaveCompany('company-1', 'random-user')
      ).rejects.toThrow('not a member');
    });
  });
});

describe('Team Email Templates', () => {
  const { generateInvitationEmail, generateInvitationReminderEmail } = require('../../backend/templates/emails/team-invitation');

  test('generates invitation email with all fields', () => {
    const params = {
      inviterName: 'Jan Kowalski',
      inviterEmail: 'jan@example.com',
      companyName: 'Test Company',
      role: 'admin',
      invitationLink: 'https://app.example.com/invite/abc123',
      expiresAt: '2024-01-20T00:00:00.000Z',
    };

    const email = generateInvitationEmail(params);

    expect(email.subject).toContain('Test Company');
    expect(email.html).toContain('Jan Kowalski');
    expect(email.html).toContain('Test Company');
    expect(email.html).toContain('Administrator');
    expect(email.html).toContain('https://app.example.com/invite/abc123');
    expect(email.text).toContain('Jan Kowalski');
    expect(email.text).toContain('Test Company');
  });

  test('generates reminder email', () => {
    const params = {
      inviterName: 'Jan Kowalski',
      inviterEmail: 'jan@example.com',
      companyName: 'Test Company',
      role: 'member',
      invitationLink: 'https://app.example.com/invite/abc123',
      expiresAt: '2024-01-20T00:00:00.000Z',
    };

    const email = generateInvitationReminderEmail(params);

    expect(email.subject).toContain('Przypomnienie');
    expect(email.html).toContain('wkrótce wygaśnie');
    expect(email.html).toContain('Member');
  });

  test('uses email when inviter name not provided', () => {
    const params = {
      inviterName: null,
      inviterEmail: 'jan@example.com',
      companyName: 'Test Company',
      role: 'member',
      invitationLink: 'https://app.example.com/invite/abc123',
      expiresAt: '2024-01-20T00:00:00.000Z',
    };

    const email = generateInvitationEmail(params);

    expect(email.html).toContain('jan@example.com');
    expect(email.text).toContain('jan@example.com');
  });
});
