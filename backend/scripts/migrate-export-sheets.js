/**
 * Migration script: Populate companyId and spreadsheetId in ExportSheet table
 *
 * Run with: node backend/scripts/migrate-export-sheets.js
 *
 * This script:
 * 1. Finds all ExportSheet records missing companyId or spreadsheetId
 * 2. Populates companyId from the related Export
 * 3. Extracts spreadsheetId and gid from sheetUrl
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function extractSheetIdentifiers(url) {
  if (!url) return { spreadsheetId: null, gid: '0' };

  const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[#&?]gid=(\d+)/);

  return {
    spreadsheetId: spreadsheetMatch ? spreadsheetMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : '0'
  };
}

async function migrateExportSheets() {
  console.log('Starting ExportSheet migration...');

  try {
    // Find all sheets that need migration
    const sheetsToMigrate = await prisma.exportSheet.findMany({
      where: {
        OR: [
          { companyId: null },
          { spreadsheetId: null }
        ]
      },
      include: {
        export: {
          select: { companyId: true }
        }
      }
    });

    console.log(`Found ${sheetsToMigrate.length} sheets to migrate`);

    let migrated = 0;
    let errors = 0;

    for (const sheet of sheetsToMigrate) {
      try {
        const identifiers = extractSheetIdentifiers(sheet.sheetUrl);

        await prisma.exportSheet.update({
          where: { id: sheet.id },
          data: {
            companyId: sheet.export?.companyId || null,
            spreadsheetId: identifiers.spreadsheetId,
            gid: identifiers.gid
          }
        });

        migrated++;
        console.log(`  Migrated sheet ${sheet.id}: spreadsheetId=${identifiers.spreadsheetId}, gid=${identifiers.gid}`);
      } catch (err) {
        errors++;
        console.error(`  Error migrating sheet ${sheet.id}:`, err.message);
      }
    }

    console.log(`\nMigration complete: ${migrated} migrated, ${errors} errors`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateExportSheets();
