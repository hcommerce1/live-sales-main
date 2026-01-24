/**
 * Google Sheets API Configuration
 *
 * API Documentation: https://developers.google.com/sheets/api
 */

module.exports = {
  // Option 1: Use full credentials JSON (recommended)
  credentialsJson: process.env.GOOGLE_CREDENTIALS_JSON ?
    JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON) :
    null,

  // Option 2: Fallback to separate email/key (legacy)
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  privateKey: process.env.GOOGLE_PRIVATE_KEY ?
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') :
    null,

  // Scopes
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
  ],

  // Default write mode
  defaultWriteMode: 'append', // 'append' or 'replace'

  // Batch update size
  batchSize: 1000,
};
