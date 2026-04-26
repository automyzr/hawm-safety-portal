const https = require('https');
const { get } = require('../lib/http-client');
const { createResult } = require('../lib/result-logger');

/**
 * Group A: Deploy + Auth Health Checks
 * Tests: A.01 (SWA), A.02 (GitHub Actions), A.03 (Entra), A.04 (MSAL CDN)
 */

/**
 * A.01 — SWA health check
 * GET https://victorious-desert-0ff90be0f.7.azurestaticapps.net/
 * Accept 302 redirect or 200 (depends on auth gate state)
 */
async function testSwaHealth(env) {
  const startTime = Date.now();
  const url = 'https://victorious-desert-0ff90be0f.7.azurestaticapps.net/';

  try {
    const response = await httpsGet(url, { followRedirects: false });
    const duration = Date.now() - startTime;

    // Accept 302 (redirect to auth gate) or 200 (authenticated)
    if (response.statusCode === 302 || response.statusCode === 200) {
      return createResult({
        testId: 'A.01',
        testName: 'A.01 — SWA health check',
        status: 'passed',
        duration,
        evidence: {
          url,
          statusCode: response.statusCode,
          location: response.headers.location || '(no redirect)',
          contentLength: response.body.length
        }
      });
    } else {
      throw new Error(
        `Expected HTTP 302 or 200, got HTTP ${response.statusCode}`
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'A.01',
      testName: 'A.01 — SWA health check',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * A.02 — GitHub Actions latest deploy run
 * GET /repos/automyzr/hawm-safety-portal/actions/runs?per_page=1&status=completed
 * Skip if GITHUB_TOKEN not in env
 */
async function testGitHubActions(env) {
  const startTime = Date.now();

  try {
    // Check if GITHUB_TOKEN is available
    if (!env.GITHUB_TOKEN) {
      const duration = Date.now() - startTime;
      return createResult({
        testId: 'A.02',
        testName: 'A.02 — GitHub Actions latest deploy run',
        status: 'skipped',
        duration,
        evidence: {
          reason: 'GITHUB_TOKEN not in .env (GitHub Actions CI provides auto-injected token)'
        }
      });
    }

    // Fetch latest completed run
    const url = 'https://api.github.com/repos/automyzr/hawm-safety-portal/actions/runs?per_page=1&status=completed';
    const response = await httpsGet(url, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'HAWM-Safety-Portal-Tests'
      }
    });

    if (response.statusCode !== 200) {
      throw new Error(
        `GitHub API returned HTTP ${response.statusCode}: ${response.body}`
      );
    }

    const data = JSON.parse(response.body);
    if (!data.workflow_runs || data.workflow_runs.length === 0) {
      throw new Error('No completed workflow runs found');
    }

    const latestRun = data.workflow_runs[0];
    const duration = Date.now() - startTime;

    if (latestRun.conclusion === 'success') {
      return createResult({
        testId: 'A.02',
        testName: 'A.02 — GitHub Actions latest deploy run',
        status: 'passed',
        duration,
        evidence: {
          runId: latestRun.id,
          runName: latestRun.name,
          conclusion: latestRun.conclusion,
          createdAt: latestRun.created_at,
          updatedAt: latestRun.updated_at
        }
      });
    } else {
      throw new Error(
        `Latest run conclusion is "${latestRun.conclusion}", expected "success" (run ID: ${latestRun.id})`
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'A.02',
      testName: 'A.02 — GitHub Actions latest deploy run',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * A.03 — Entra app metadata
 * Verify Safety Portal Entra app exists via token-endpoint negative probe.
 * Sends a deliberately-invalid client_secret; inspects error code.
 * AADSTS7000215 = app exists (wrong secret) → PASS
 * AADSTS700016 / AADSTS900023 = app doesn't exist → FAIL
 * Other code → fail-with-note (unexpected, surface for triage)
 */
async function testEntraAppMetadata(env) {
  const SAFETY_PORTAL_CLIENT_ID = '8525c5f0-92ed-42cc-a352-381515a02145';
  const tenantId = env.M365_TENANT_ID;
  if (!tenantId) {
    return createResult({
      testId: 'A.03',
      testName: 'A.03 — Entra app metadata',
      status: 'skipped',
      evidence: { reason: 'M365_TENANT_ID not set' }
    });
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: SAFETY_PORTAL_CLIENT_ID,
    client_secret: 'DELIBERATELY_INVALID_PROBE_SECRET',
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  }).toString();

  // Use inline HTTPS POST helper — DO NOT use lib/http-client.js (that injects Graph token; we need raw HTTPS here)
  const url = require('url');
  const parsedUrl = url.parse(tokenUrl);

  const responseBody = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout after 10s')); });
    req.write(body);
    req.end();
  });

  let parsed;
  try { parsed = JSON.parse(responseBody.body); } catch (e) {
    return createResult({
      testId: 'A.03',
      testName: 'A.03 — Entra app metadata',
      status: 'failed',
      evidence: { reason: 'Token endpoint returned non-JSON', statusCode: responseBody.statusCode, body: responseBody.body.slice(0, 500) },
      error: new Error('Unexpected token endpoint response')
    });
  }

  const errorCode = parsed.error;
  const errorDescription = parsed.error_description || '';
  // The error_description starts with "AADSTSXXXXXX:"
  const aadstsMatch = errorDescription.match(/AADSTS(\d+)/);
  const aadstsCode = aadstsMatch ? aadstsMatch[1] : null;

  // AADSTS7000215 = invalid client secret → app exists, app is configured for client-credentials
  // AADSTS700016 / AADSTS900023 = app not found in tenant
  if (aadstsCode === '7000215') {
    return createResult({
      testId: 'A.03',
      testName: 'A.03 — Entra app metadata',
      status: 'passed',
      evidence: {
        method: 'token-endpoint negative probe',
        aadstsCode,
        appId: SAFETY_PORTAL_CLIENT_ID,
        tenantId,
        interpretation: 'App exists in tenant, configured for client_credentials (returned wrong-secret error as expected)'
      }
    });
  } else if (aadstsCode === '700016' || aadstsCode === '900023') {
    return createResult({
      testId: 'A.03',
      testName: 'A.03 — Entra app metadata',
      status: 'failed',
      evidence: {
        method: 'token-endpoint negative probe',
        aadstsCode,
        appId: SAFETY_PORTAL_CLIENT_ID,
        tenantId,
        interpretation: 'App NOT found in tenant — Safety Portal Entra app was deleted or moved',
        errorDescription: errorDescription.slice(0, 400)
      },
      error: new Error(`Entra app ${SAFETY_PORTAL_CLIENT_ID} not found in tenant ${tenantId}`)
    });
  } else {
    // Unexpected code — could be config drift; fail with note
    return createResult({
      testId: 'A.03',
      testName: 'A.03 — Entra app metadata',
      status: 'failed',
      evidence: {
        method: 'token-endpoint negative probe',
        aadstsCode,
        unexpectedErrorCode: errorCode,
        errorDescription: errorDescription.slice(0, 400),
        statusCode: responseBody.statusCode,
        interpretation: 'Unexpected error code — review manually'
      },
      error: new Error(`Unexpected error: ${errorCode} (AADSTS${aadstsCode})`)
    });
  }
}

/**
 * A.04 — MSAL CDN resolution
 * GET https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.39.0/lib/msal-browser.min.js
 * Assert HTTP 200 and Content-Type is application/javascript
 */
async function testMsalCdn(env) {
  const startTime = Date.now();
  const url = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.39.0/lib/msal-browser.min.js';

  try {
    const response = await httpsGet(url);
    const duration = Date.now() - startTime;

    if (response.statusCode !== 200) {
      throw new Error(`Expected HTTP 200, got HTTP ${response.statusCode}`);
    }

    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('application/javascript')) {
      throw new Error(
        `Expected Content-Type "application/javascript", got "${contentType}"`
      );
    }

    return createResult({
      testId: 'A.04',
      testName: 'A.04 — MSAL CDN resolution',
      status: 'passed',
      duration,
      evidence: {
        url,
        statusCode: response.statusCode,
        contentType,
        contentLength: response.body.length,
        contentLengthMB: (response.body.length / 1024 / 1024).toFixed(2)
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'A.04',
      testName: 'A.04 — MSAL CDN resolution',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * Utility: HTTPS GET without Graph token injection
 * Used for non-Graph endpoints (SWA, MSAL CDN, GitHub API with custom auth)
 * Includes timeout handling (default 10 seconds)
 */
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const headers = {
      'User-Agent': 'HAWM-Safety-Portal-Tests',
      ...(options.headers || {})
    };

    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
      followRedirects: options.followRedirects !== false,
      timeout: options.timeout || 10000 // Default 10 seconds
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // Handle redirects if followRedirects is true
        if (options.followRedirects !== false && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308)) {
          const location = res.headers.location;
          if (location) {
            return resolve(httpsGet(location, options));
          }
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTPS request timeout: request exceeded configured timeout'));
    });

    req.on('error', (err) => {
      reject(new Error(`HTTPS request failed: ${err.message}`));
    });

    req.end();
  });
}

/**
 * Main test function: Run all 4 tests (A.01 - A.04)
 * Returns array of result objects (runner will flatten)
 */
async function runGroupATests(env) {
  const results = [];

  // Run all 4 tests in sequence
  results.push(await testSwaHealth(env));
  results.push(await testGitHubActions(env));
  results.push(await testEntraAppMetadata(env));
  results.push(await testMsalCdn(env));

  return results;
}

// Export as a test module that the runner can invoke
module.exports = {
  id: 'group-a',
  name: 'Group A: Deploy + Auth Health',
  run: async function (env) {
    const results = await runGroupATests(env);

    // Log results to console for visibility
    console.log('\n=== Group A Test Results ===');
    results.forEach((result) => {
      const status = result.status.toUpperCase();
      console.log(`[${status}] ${result.testId}: ${result.testName}`);
      if (result.evidence) {
        console.log(`      Evidence: ${JSON.stringify(result.evidence)}`);
      }
    });
    console.log('============================\n');

    // Return the array of results directly (no throw)
    // The runner will detect failures and set exit code accordingly
    return results;
  }
};
