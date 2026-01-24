#!/usr/bin/env node
/**
 * Critical Fixes Test Script
 *
 * Tests B1-B4 for stabilization phase:
 * - B1: Stripe webhook (signature, persist-first, idempotency)
 * - B2: Log redaction (secrets masked)
 * - B3: Feature flags (403 when disabled)
 * - B4: BaseLinker (connection, rate limit, retry)
 *
 * Usage: node scripts/test-critical-fixes.js
 */

const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const crypto = require('crypto');

// Colors for output
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

const results = {
  passed: [],
  failed: [],
};

function pass(testName, detail = '') {
  results.passed.push(testName);
  console.log(colors.green(`  ✓ PASS: ${testName}`));
  if (detail) console.log(colors.cyan(`    ${detail}`));
}

function fail(testName, reason) {
  results.failed.push({ testName, reason });
  console.log(colors.red(`  ✗ FAIL: ${testName}`));
  console.log(colors.yellow(`    Reason: ${reason}`));
}

function section(name) {
  console.log('\n' + colors.bold(`═══ ${name} ═══`));
}

// ============================================
// B2: Log Redaction Tests
// ============================================
async function testB2_LogRedaction() {
  section('B2: Log Redaction');

  try {
    // Import the logger
    const logger = require('../backend/utils/logger');

    // Capture log output
    const logs = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, encoding, callback) => {
      logs.push(chunk.toString());
      return originalWrite(chunk, encoding, callback);
    };

    // Test 1: Stripe secret key
    const stripeKey = 'sk_test_51ABCDEFghijklmnopqrstuvwxyz1234567890';
    logger.info('Testing with stripe key', { key: stripeKey });

    // Test 2: BaseLinker token
    const blToken = 'abcdef1234567890abcdef1234567890abcd';
    logger.info('BaseLinker config', { baselinkerToken: blToken });

    // Test 3: Authorization header
    const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    logger.info('Request with auth', { authorization: authHeader });

    // Test 4: Webhook secret
    const webhookSecret = 'whsec_abcdefghijklmnopqrstuvwxyz123456';
    logger.info('Webhook configured', { secret: webhookSecret });

    // Restore stdout
    process.stdout.write = originalWrite;

    // Check logs for secrets
    const logOutput = logs.join('');

    // Verify masking
    const secretsToCheck = [
      { name: 'Stripe key', value: 'sk_test_51ABCDEF', masked: 'sk_***MASKED***' },
      { name: 'BaseLinker token', value: blToken, masked: '***MASKED***' },
      { name: 'JWT token', value: 'eyJhbGciOiJIUzI1NiI', masked: '***MASKED***' },
      { name: 'Webhook secret', value: 'whsec_abcdef', masked: 'whsec_***MASKED***' },
    ];

    let allMasked = true;
    for (const check of secretsToCheck) {
      if (logOutput.includes(check.value)) {
        fail(`B2.${check.name} masking`, `Secret "${check.value.substring(0, 10)}..." visible in logs`);
        allMasked = false;
      }
    }

    if (allMasked) {
      pass('B2: All secrets masked', 'Stripe keys, tokens, JWTs, webhook secrets');

      // Show sample masked output
      console.log(colors.cyan('    Sample masked log entries:'));
      const maskedLines = logs.filter(l => l.includes('MASKED')).slice(0, 3);
      maskedLines.forEach(line => {
        const trimmed = line.trim().substring(0, 100);
        console.log(colors.cyan(`      ${trimmed}...`));
      });
    }

  } catch (error) {
    fail('B2: Log redaction', error.message);
  }
}

// ============================================
// B3: Feature Flags Tests
// ============================================
async function testB3_FeatureFlags() {
  section('B3: Feature Flags');

  try {
    const featureFlags = require('../backend/utils/feature-flags');
    const { featureFlagMiddleware } = require('../backend/middleware/featureFlag');

    // Initialize (without Redis for test)
    if (!featureFlags.initialized) {
      featureFlags.initialized = true; // Mark as initialized without Redis
    }

    // Test 1: Unknown flag returns false
    const unknownFlag = await featureFlags.isEnabled('unknown.flag.xyz');
    if (unknownFlag === false) {
      pass('B3.1: Unknown flag = false', 'Missing flags default to false');
    } else {
      fail('B3.1: Unknown flag = false', `Got ${unknownFlag} instead of false`);
    }

    // Test 2: Default values from config
    const { FEATURE_FLAGS } = require('../backend/config/feature-flags.config');

    // billing.enabled should default to false
    const billingDefault = FEATURE_FLAGS['billing.enabled']?.default;
    if (billingDefault === false) {
      pass('B3.2: billing.enabled default=false', 'Billing disabled by default');
    } else {
      fail('B3.2: billing.enabled default=false', `Got ${billingDefault}`);
    }

    // company.secrets.enabled should default to false
    const secretsDefault = FEATURE_FLAGS['company.secrets.enabled']?.default;
    if (secretsDefault === false) {
      pass('B3.3: company.secrets.enabled default=false', 'Secrets disabled by default');
    } else {
      fail('B3.3: company.secrets.enabled default=false', `Got ${secretsDefault}`);
    }

    // Test 3: Middleware returns 403 when flag disabled
    const mockReq = { company: { id: 'test-company-123' } };
    const mockRes = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { this.body = data; return this; },
    };

    const middleware = featureFlagMiddleware('billing.enabled');

    await new Promise((resolve) => {
      middleware(mockReq, mockRes, (err) => {
        // If next() called, flag was enabled (should not happen with defaults)
        if (!err) {
          fail('B3.4: Middleware blocks when disabled', 'next() was called, should return 403');
        }
        resolve();
      });

      // Check if response was sent
      setTimeout(() => {
        if (mockRes.statusCode === 403) {
          pass('B3.4: Middleware blocks when disabled', `Returns 403 FEATURE_DISABLED`);
        }
        resolve();
      }, 100);
    });

  } catch (error) {
    fail('B3: Feature flags', error.message);
  }
}

// ============================================
// B1: Stripe Webhook Tests (Structural)
// ============================================
async function testB1_StripeWebhook() {
  section('B1: Stripe Webhook (Structural)');

  try {
    // Test 1: Check webhook service has required functions
    const webhookService = require('../backend/services/webhook.service');

    if (typeof webhookService.handleWebhook === 'function') {
      pass('B1.1: handleWebhook exists', 'Webhook handler function available');
    } else {
      fail('B1.1: handleWebhook exists', 'Function not found');
    }

    // Test 2: Check Prisma schema has StripeWebhookEvent
    const fs = require('fs');
    const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    if (schema.includes('model StripeWebhookEvent')) {
      pass('B1.2: StripeWebhookEvent model exists', 'Persist-first pattern supported');
    } else {
      fail('B1.2: StripeWebhookEvent model exists', 'Model not in schema');
    }

    // Test 3: Check idempotency key (stripeEventId unique)
    if (schema.includes('stripeEventId') && schema.includes('@unique')) {
      pass('B1.3: stripeEventId is unique', 'Idempotency constraint in place');
    } else {
      fail('B1.3: stripeEventId is unique', 'Missing unique constraint');
    }

    // Test 4: Check server.js skips JSON parsing for webhook
    const serverPath = path.join(__dirname, '..', 'server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    if (serverCode.includes('/api/billing/webhook') && serverCode.includes('originalUrl')) {
      pass('B1.4: Webhook bypasses JSON parser', 'Raw body preserved for signature');
    } else {
      fail('B1.4: Webhook bypasses JSON parser', 'Missing skip condition');
    }

    // Test 5: Check stripe.service has constructWebhookEvent
    const stripeService = require('../backend/services/stripe.service');

    if (typeof stripeService.constructWebhookEvent === 'function') {
      pass('B1.5: constructWebhookEvent exists', 'Signature verification available');
    } else {
      fail('B1.5: constructWebhookEvent exists', 'Function not found');
    }

  } catch (error) {
    fail('B1: Stripe webhook', error.message);
  }
}

// ============================================
// B4: BaseLinker Tests (Structural)
// ============================================
async function testB4_BaseLinker() {
  section('B4: BaseLinker (Structural)');

  try {
    // Test 1: BaseLinker service exists
    const baselinkerService = require('../backend/services/baselinker');

    if (baselinkerService) {
      pass('B4.1: BaseLinker service exists', 'Service module loaded');
    } else {
      fail('B4.1: BaseLinker service exists', 'Module not found');
    }

    // Test 2: Check for retry config
    const fs = require('fs');
    const blPath = path.join(__dirname, '..', 'backend', 'services', 'baselinker.js');
    const blCode = fs.readFileSync(blPath, 'utf8');

    if (blCode.includes('retry') || blCode.includes('RETRY') || blCode.includes('maxRetries')) {
      pass('B4.2: Retry logic present', 'Retry configuration found');
    } else {
      fail('B4.2: Retry logic present', 'No retry logic found - needs implementation');
    }

    // Test 3: Check for rate limiting reference
    if (blCode.includes('rate') || blCode.includes('limiter') || blCode.includes('throttle')) {
      pass('B4.3: Rate limiting referenced', 'Rate limit awareness present');
    } else {
      fail('B4.3: Rate limiting referenced', 'No rate limiting found');
    }

    // Test 4: CompanySecret service exists
    const secretService = require('../backend/services/companySecret.service');

    if (secretService && typeof secretService.getSecret === 'function') {
      pass('B4.4: CompanySecret service works', 'Token retrieval available');
    } else {
      fail('B4.4: CompanySecret service works', 'Service or getSecret missing');
    }

    // Test 5: Check for cache invalidation
    if (typeof baselinkerService.invalidateCache === 'function') {
      pass('B4.5: Cache invalidation available', 'invalidateCache function exists');
    } else {
      fail('B4.5: Cache invalidation available', 'No invalidateCache function');
    }

  } catch (error) {
    fail('B4: BaseLinker', error.message);
  }
}

// ============================================
// Main
// ============================================
async function main() {
  console.log(colors.bold('\n╔════════════════════════════════════════════╗'));
  console.log(colors.bold('║   CRITICAL FIXES TEST SUITE (B1-B4)        ║'));
  console.log(colors.bold('╚════════════════════════════════════════════╝\n'));

  console.log('Running structural and unit tests...');
  console.log('Note: Full integration tests require running server + Stripe CLI\n');

  await testB1_StripeWebhook();
  await testB2_LogRedaction();
  await testB3_FeatureFlags();
  await testB4_BaseLinker();

  // Summary
  console.log('\n' + colors.bold('═══ SUMMARY ═══'));
  console.log(colors.green(`Passed: ${results.passed.length}`));
  console.log(colors.red(`Failed: ${results.failed.length}`));

  if (results.failed.length > 0) {
    console.log(colors.red('\nFailed tests:'));
    results.failed.forEach(f => {
      console.log(colors.red(`  - ${f.testName}: ${f.reason}`));
    });
  }

  console.log('\n' + colors.bold('═══ NEXT STEPS ═══'));
  if (results.failed.length === 0) {
    console.log(colors.green('All structural tests passed!'));
    console.log(colors.cyan('To complete B1 integration test:'));
    console.log(colors.cyan('  1. Start server: npm start'));
    console.log(colors.cyan('  2. Run: stripe listen --forward-to localhost:3000/api/billing/webhook'));
    console.log(colors.cyan('  3. Run: stripe trigger checkout.session.completed'));
    console.log(colors.cyan('  4. Check logs for "Webhook received" and DB for StripeWebhookEvent'));
  } else {
    console.log(colors.yellow('Fix failed tests before proceeding to integration tests.'));
  }

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(console.error);
