/**
 * Migration Script: Users to Companies
 *
 * Migrates existing users to the company model:
 * 1. Creates a Company for each existing user (with placeholder NIP)
 * 2. Creates CompanyMember (role: owner) linking user to company
 * 3. Updates exports with companyId (dual-write)
 *
 * IMPORTANT:
 * - Run this AFTER schema migration is applied
 * - Feature flag 'company.enabled' should be OFF during migration
 * - This is a one-time migration, idempotent (safe to re-run)
 *
 * Usage:
 *   node backend/scripts/migrate-users-to-companies.js [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;

async function main() {
  console.log('====================================');
  console.log('Migration: Users to Companies');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('====================================\n');

  // Step 1: Count users and existing migrations
  const totalUsers = await prisma.user.count();
  const usersWithCompany = await prisma.companyMember.count({
    where: { role: 'owner' },
  });

  console.log(`Total users: ${totalUsers}`);
  console.log(`Users already migrated (have company): ${usersWithCompany}`);
  console.log(`Users to migrate: ${totalUsers - usersWithCompany}\n`);

  if (totalUsers === usersWithCompany) {
    console.log('✅ All users already migrated. Nothing to do.');
    return;
  }

  // Step 2: Find users without company membership
  const usersToMigrate = await prisma.user.findMany({
    where: {
      companyMembers: {
        none: {},
      },
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
    take: BATCH_SIZE,
  });

  console.log(`Processing batch of ${usersToMigrate.length} users...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const user of usersToMigrate) {
    try {
      console.log(`Processing user: ${user.email} (${user.id})`);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would create company and membership`);
        successCount++;
        continue;
      }

      // Create company and membership in transaction
      await prisma.$transaction(async (tx) => {
        // Generate placeholder NIP (will need to be updated by user)
        // Format: MIGR + first 6 chars of user ID
        const placeholderNip = `MIGR${user.id.replace(/-/g, '').slice(0, 6)}`;

        // Check if placeholder NIP already exists (edge case)
        const existingCompany = await tx.company.findUnique({
          where: { nip: placeholderNip },
        });

        if (existingCompany) {
          console.log(`  ⚠️ Placeholder NIP collision, skipping (already migrated?)`);
          return;
        }

        // Create company
        const company = await tx.company.create({
          data: {
            nip: placeholderNip,
            name: `Company for ${user.email}`, // Placeholder name
            addressCountry: 'PL',
            createdAt: user.createdAt, // Preserve original date
          },
        });

        console.log(`  Created company: ${company.id}`);

        // Create membership (owner)
        await tx.companyMember.create({
          data: {
            companyId: company.id,
            userId: user.id,
            role: 'owner',
            joinedAt: user.createdAt,
          },
        });

        console.log(`  Created membership: owner`);

        // Update user's exports with companyId (dual-write)
        const exportUpdateResult = await tx.export.updateMany({
          where: { userId: user.id },
          data: {
            companyId: company.id,
            createdBy: user.id,
          },
        });

        console.log(`  Updated ${exportUpdateResult.count} exports`);
      });

      successCount++;
      console.log(`  ✅ Migrated successfully\n`);
    } catch (error) {
      errorCount++;
      console.error(`  ❌ Error: ${error.message}\n`);
    }
  }

  // Summary
  console.log('\n====================================');
  console.log('Migration Summary');
  console.log('====================================');
  console.log(`Processed: ${usersToMigrate.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);

  if (usersToMigrate.length === BATCH_SIZE) {
    console.log(`\n⚠️ More users to migrate. Run script again.`);
  } else if (errorCount === 0 && !DRY_RUN) {
    console.log(`\n✅ Migration complete!`);
  }

  if (DRY_RUN) {
    console.log(`\nThis was a DRY RUN. Run without --dry-run to apply changes.`);
  }
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
