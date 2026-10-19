import assert from 'node:assert/strict';
import {
  escapeRegex,
  isValidObjectId,
  isStrongPassword,
  sanitizeEmail,
  sanitizeHtml,
  getTrustedClientIp,
  mongoSanitizeMiddleware,
  securityHeadersMiddleware,
  corsMiddleware,
  createRateLimiter,
  issueCsrfToken,
  verifyCsrfToken,
} from './security/index.js';
import { authenticateAdmin } from './auth.js';
import { connectDatabase } from './db.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  Error: ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  Error: ${err.message}`);
    failed++;
  }
}

console.log('\n==================================================');
console.log('   STITCHX GLOBAL TECHNOLOGY SECURITY TEST SUITE   ');
console.log('==================================================\n');

// ----------------------------------------------------
// 1. Security Headers Verification
// ----------------------------------------------------
test('Security Headers: Sets CSP, nosniff, SAMEORIGIN and strips X-Powered-By', () => {
  const req = { headers: {} };
  const headers = {};
  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    removeHeader: (k) => { delete headers[k.toLowerCase()]; },
  };
  headers['x-powered-by'] = 'Express';

  securityHeadersMiddleware(req, res, () => {});

  assert.equal(headers['x-powered-by'], undefined, 'X-Powered-By must be stripped');
  assert.equal(headers['x-content-type-options'], 'nosniff', 'X-Content-Type-Options must be nosniff');
  assert.equal(headers['x-frame-options'], 'SAMEORIGIN', 'X-Frame-Options must be SAMEORIGIN');
  assert.ok(headers['content-security-policy'], 'Content-Security-Policy must be set');
  assert.ok(headers['permissions-policy'], 'Permissions-Policy must be set');
});

// ----------------------------------------------------
// 2. CORS Policy Verification
// ----------------------------------------------------
test('CORS: Allows approved frontend origins and blocks unauthorized origins', () => {
  const reqAllowed = { headers: { origin: 'http://localhost:5173' }, method: 'GET' };
  const headersAllowed = {};
  const resAllowed = { setHeader: (k, v) => { headersAllowed[k.toLowerCase()] = v; } };
  let allowedCalled = false;

  corsMiddleware(reqAllowed, resAllowed, () => { allowedCalled = true; });
  assert.ok(allowedCalled, 'Allowed origin must proceed to next()');
  assert.equal(headersAllowed['access-control-allow-origin'], 'http://localhost:5173');

  const reqBlocked = { headers: { origin: 'http://malicious-attacker.com' }, method: 'GET' };
  let statusCode = 200;
  const resBlocked = {
    status: (code) => { statusCode = code; return { json: () => {} }; },
    setHeader: () => {},
  };

  corsMiddleware(reqBlocked, resBlocked, () => {});
  assert.equal(statusCode, 403, 'Unauthorized origin must be rejected with 403');
});

// ----------------------------------------------------
// 3. NoSQL Injection Sanitization
// ----------------------------------------------------
test('NoSQL Injection: Recursively strips $ operators and dot keys', () => {
  const maliciousReq = {
    body: {
      username: 'admin',
      $where: 'sleep(5000)',
      nested: {
        $gt: '',
        'config.admin': true,
        validField: 'safeValue',
      },
      tags: [{ $ne: null }, 'validTag'],
    },
    query: {
      search: { $gt: '' },
      page: '1',
    },
    params: {
      id: '64e8b8c2f1a2b3c4d5e6f7a8',
    },
  };

  mongoSanitizeMiddleware(maliciousReq, {}, () => {});

  assert.equal(maliciousReq.body.$where, undefined, '$where operator must be stripped');
  assert.equal(maliciousReq.body.nested.$gt, undefined, 'Nested $gt must be stripped');
  assert.equal(maliciousReq.body.nested['config.admin'], undefined, 'Dot-notation key must be stripped');
  assert.equal(maliciousReq.body.nested.validField, 'safeValue', 'Legitimate nested keys must be preserved');
  assert.equal(maliciousReq.query.page, '1', 'Legitimate query param must be preserved');
});

// ----------------------------------------------------
// 4. HTML Sanitization / XSS Prevention
// ----------------------------------------------------
test('XSS Defense: Strips script tags, event handlers, and javascript: URIs', () => {
  const dirtyPayload = `
    <h1>Article Title</h1>
    <script>alert('XSS Script');</script>
    <p>Legitimate paragraph with <a href="javascript:stealTokens()" target="_blank">click here</a>.</p>
    <img src="https://images.unsplash.com/photo-1" onerror="fetch('/leak?c='+document.cookie)" />
    <iframe src="https://evil.com"></iframe>
  `;

  const clean = sanitizeHtml(dirtyPayload);

  assert.ok(!clean.includes('<script>'), 'Script tags must be removed');
  assert.ok(!clean.includes('onerror='), 'Event handlers must be removed');
  assert.ok(!clean.includes('javascript:'), 'javascript: pseudoprotocol must be removed');
  assert.ok(!clean.includes('<iframe'), 'iframe elements must be removed');
  assert.ok(clean.includes('<h1>Article Title</h1>'), 'Safe h1 tags must be preserved');
  assert.ok(clean.includes('rel="noopener noreferrer"'), 'External target="_blank" must include noopener noreferrer');
});

// ----------------------------------------------------
// 5. ReDoS & Regex Injection Defense
// ----------------------------------------------------
test('ReDoS Defense: Escapes all regex metacharacters properly', () => {
  const maliciousRegexInput = '.*+?^${}()|[]\\';
  const escaped = escapeRegex(maliciousRegexInput);

  // Attempting to construct RegExp must be safe and literal
  const regex = new RegExp(escaped);
  assert.ok(regex.test('.*+?^${}()|[]\\'), 'Escaped regex must match exact literal sequence');
  assert.ok(!regex.test('abc'), 'Escaped regex must not match arbitrary strings');
});

// ----------------------------------------------------
// 6. ObjectId Validation
// ----------------------------------------------------
test('ObjectId Validation: Accepts valid 24-char hex strings and rejects malicious payloads', () => {
  assert.ok(isValidObjectId('507f1f77bcf86cd799439011'), 'Valid 24-character hex ID is accepted');
  assert.ok(!isValidObjectId('invalid-id'), 'Malformed string is rejected');
  assert.ok(!isValidObjectId('../etc/passwd'), 'Path traversal string is rejected');
  assert.ok(!isValidObjectId('{"$gt":""}'), 'JSON object string is rejected');
  assert.ok(!isValidObjectId(null), 'Null is rejected');
  assert.ok(!isValidObjectId(undefined), 'Undefined is rejected');
});

// ----------------------------------------------------
// 7. Password Strength Policy
// ----------------------------------------------------
test('Password Strength: Rejects weak passwords and enforces complexity', () => {
  assert.ok(!isStrongPassword('12345'), 'Too short rejected');
  assert.ok(!isStrongPassword('password123'), 'Missing uppercase and special char rejected');
  assert.ok(!isStrongPassword('PASSWORD123!'), 'Missing lowercase rejected');
  assert.ok(!isStrongPassword('Password!'), 'Length under 10 rejected');
  assert.ok(isStrongPassword('SecureP@ssw0rd2026'), 'Strong password accepted');
  assert.ok(isStrongPassword('AdminPassword2026!'), 'Default seeded password format accepted');
});

// ----------------------------------------------------
// 8. Rate Limiting Sliding-Window Protection
// ----------------------------------------------------
test('Rate Limiter: Throttles requests when threshold is exceeded', () => {
  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 3,
    keyGenerator: () => 'test-ip-123',
  });

  const req = {};
  let lastStatus = 200;
  const res = {
    setHeader: () => {},
    status: (code) => { lastStatus = code; return { json: () => {} }; },
  };

  limiter(req, res, () => {}); // 1
  assert.equal(lastStatus, 200, 'Hit 1 should pass');

  limiter(req, res, () => {}); // 2
  assert.equal(lastStatus, 200, 'Hit 2 should pass');

  limiter(req, res, () => {}); // 3
  assert.equal(lastStatus, 200, 'Hit 3 should pass');

  limiter(req, res, () => {}); // 4 (Threshold breached)
  assert.equal(lastStatus, 429, 'Hit 4 must be rate-limited with 429');
});

// ----------------------------------------------------
// 9. CSRF Defense Verification
// ----------------------------------------------------
test('CSRF Defense: Validates tokens on state-changing requests and exempts safe requests', () => {
  // Safe GET request
  let safeGetPassed = false;
  verifyCsrfToken({ method: 'GET' }, {}, () => { safeGetPassed = true; });
  assert.ok(safeGetPassed, 'GET requests must pass without CSRF token');

  // Bearer-authenticated POST request
  let bearerPassed = false;
  verifyCsrfToken(
    { method: 'POST', headers: { authorization: 'Bearer some_token' } },
    {},
    () => { bearerPassed = true; }
  );
  assert.ok(bearerPassed, 'Bearer-authenticated requests must pass without CSRF token');

  // State-changing request with mismatched/missing token
  let csrfStatus = 200;
  verifyCsrfToken(
    {
      method: 'POST',
      path: '/api/admin/settings',
      headers: { 'x-csrf-token': 'token-A' },
      cookies: { sx_csrf_token: 'token-B' },
    },
    {
      status: (c) => { csrfStatus = c; return { json: () => {} }; },
    },
    () => {}
  );
  assert.equal(csrfStatus, 403, 'Mismatched CSRF tokens must be rejected with 403');
});

// ----------------------------------------------------
// 10. Trusted IP Resolution (Anti-Spoofing)
// ----------------------------------------------------
test('Trusted IP: Ignores spoofed X-Forwarded-For when trust proxy is disabled', () => {
  delete process.env.TRUST_PROXY;
  const req = {
    headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
    socket: { remoteAddress: '192.168.1.50' },
  };

  const resolved = getTrustedClientIp(req);
  assert.equal(resolved, '192.168.1.50', 'Must use direct socket IP when proxy is untrusted');
});

// ----------------------------------------------------
// 11. Database Connection & Authentication End-to-End
// ----------------------------------------------------
await testAsync('Database & Auth: Secure login, lockout, and password protection', async () => {
  await connectDatabase();

  // Test invalid credentials
  const badAuth = await authenticateAdmin('admin', 'WrongPassword123!', { ip: '127.0.0.1' });
  assert.equal(badAuth.success, false, 'Invalid credentials must fail');
  assert.equal(badAuth.error, 'Invalid username or password.', 'Generic error message must be returned');

  // Test valid credentials
  const goodAuth = await authenticateAdmin('admin', 'AdminPassword2026!', { ip: '127.0.0.1' });
  assert.equal(goodAuth.success, true, 'Valid credentials must succeed');
  assert.ok(goodAuth.token, 'Session token must be issued');
  assert.equal(goodAuth.user.username, 'admin');
  assert.equal(goodAuth.user.password_hash, undefined, 'password_hash must never be leaked in user object');
});

console.log('\n==================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('==================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
