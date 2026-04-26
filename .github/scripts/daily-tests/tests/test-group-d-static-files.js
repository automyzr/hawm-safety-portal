const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createResult } = require('../lib/result-logger');

/**
 * Group D: Static File Checks
 * Tests: D.01 (index.html size), D.02 (index.html parseable), D.03 (staticwebapp.config.json), D.04 (logo asset)
 */

// Support env-var override for mirrored layouts (e.g., GHA); fallback to canonical relative path
const PORTAL_ROOT = process.env.PORTAL_ROOT || path.join(__dirname, '../../../hawm-safety-portal');

/**
 * D.01 — index.html present + gzip size < 600 KB
 */
function testIndexHtmlSize() {
  const startTime = Date.now();
  const indexPath = path.join(PORTAL_ROOT, 'index.html');

  try {
    // Check file exists
    if (!fs.existsSync(indexPath)) {
      throw new Error(`index.html not found at ${indexPath}`);
    }

    // Get file size
    const stats = fs.statSync(indexPath);
    const fileSizeBytes = stats.size;

    // Check size < 600 KB
    const MAX_SIZE = 600_000; // 600 KB
    if (fileSizeBytes >= MAX_SIZE) {
      throw new Error(
        `index.html size ${fileSizeBytes} bytes exceeds max ${MAX_SIZE} bytes`
      );
    }

    // Read file and compute gzip size
    const content = fs.readFileSync(indexPath);
    const gzipSize = zlib.gzipSync(content).length;

    const duration = Date.now() - startTime;

    return createResult({
      testId: 'D.01',
      testName: 'D.01 — index.html present + gzip size',
      status: 'passed',
      duration,
      evidence: {
        fileSizeBytes,
        gzipSizeBytes: gzipSize,
        compressionRatio: (gzipSize / fileSizeBytes).toFixed(3),
        maxAllowedBytes: MAX_SIZE,
        passesCheck: fileSizeBytes < MAX_SIZE
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'D.01',
      testName: 'D.01 — index.html present + gzip size',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * D.02 — index.html parseable (UTF-8, DOCTYPE, html tags)
 */
function testIndexHtmlParseable() {
  const startTime = Date.now();
  const indexPath = path.join(PORTAL_ROOT, 'index.html');

  try {
    // Check file exists
    if (!fs.existsSync(indexPath)) {
      throw new Error(`index.html not found at ${indexPath}`);
    }

    // Read as UTF-8
    let content;
    try {
      content = fs.readFileSync(indexPath, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read index.html as UTF-8: ${err.message}`);
    }

    // Check DOCTYPE
    const hasDoctype = content.startsWith('<!DOCTYPE html');
    if (!hasDoctype) {
      throw new Error('index.html does not start with <!DOCTYPE html');
    }

    // Check html tags
    const hasHtmlOpen = content.includes('<html');
    const hasHtmlClose = content.includes('</html>');
    if (!hasHtmlOpen || !hasHtmlClose) {
      throw new Error('index.html missing <html> or </html> tag');
    }

    const duration = Date.now() - startTime;

    return createResult({
      testId: 'D.02',
      testName: 'D.02 — index.html parseable',
      status: 'passed',
      duration,
      evidence: {
        hasDoctype,
        hasHtmlOpen,
        hasHtmlClose,
        fileSizeBytes: content.length
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'D.02',
      testName: 'D.02 — index.html parseable',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * D.03 — staticwebapp.config.json valid JSON with expected keys
 */
function testStaticWebAppConfig() {
  const startTime = Date.now();
  const configPath = path.join(PORTAL_ROOT, 'staticwebapp.config.json');

  try {
    // Check file exists
    if (!fs.existsSync(configPath)) {
      throw new Error(`staticwebapp.config.json not found at ${configPath}`);
    }

    // Read and parse JSON
    let config;
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to parse staticwebapp.config.json: ${err.message}`);
    }

    // Check expected root keys
    const hasAuth = 'auth' in config;
    const hasRoutes = 'routes' in config;
    const hasResponseOverrides = 'responseOverrides' in config;

    if (!hasRoutes || !hasResponseOverrides) {
      throw new Error(
        `staticwebapp.config.json missing required keys. Has: auth=${hasAuth}, routes=${hasRoutes}, responseOverrides=${hasResponseOverrides}`
      );
    }

    // Check responseOverrides has 401 and 403
    const overrides = config.responseOverrides || {};
    const has401 = '401' in overrides;
    const has403 = '403' in overrides;

    if (!has401 || !has403) {
      throw new Error(
        `responseOverrides missing required status codes. Has: 401=${has401}, 403=${has403}`
      );
    }

    const duration = Date.now() - startTime;

    return createResult({
      testId: 'D.03',
      testName: 'D.03 — staticwebapp.config.json valid JSON',
      status: 'passed',
      duration,
      evidence: {
        hasAuth,
        hasRoutes,
        hasResponseOverrides,
        has401Override: has401,
        has403Override: has403,
        responseOverrideStatuses: Object.keys(overrides)
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'D.03',
      testName: 'D.03 — staticwebapp.config.json valid JSON',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * D.04 — hawm-logo.png exists + non-empty + PNG magic bytes
 */
function testLogoAsset() {
  const startTime = Date.now();
  const logoPath = path.join(PORTAL_ROOT, 'assets/hawm-logo.png');

  try {
    // Check file exists
    if (!fs.existsSync(logoPath)) {
      throw new Error(`hawm-logo.png not found at ${logoPath}`);
    }

    // Read file
    const buffer = fs.readFileSync(logoPath);

    // Check size
    const fileSizeBytes = buffer.length;
    const MIN_SIZE = 1;
    const MAX_SIZE = 1_000_000; // 1 MB

    if (fileSizeBytes < MIN_SIZE) {
      throw new Error(`hawm-logo.png is empty (${fileSizeBytes} bytes)`);
    }

    if (fileSizeBytes > MAX_SIZE) {
      throw new Error(
        `hawm-logo.png exceeds max size: ${fileSizeBytes} > ${MAX_SIZE} bytes`
      );
    }

    // Check PNG magic bytes (0x89 0x50 0x4E 0x47 = ‰PNG)
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
    const hasMagic =
      buffer.length >= 4 &&
      buffer[0] === PNG_MAGIC[0] &&
      buffer[1] === PNG_MAGIC[1] &&
      buffer[2] === PNG_MAGIC[2] &&
      buffer[3] === PNG_MAGIC[3];

    if (!hasMagic) {
      throw new Error(
        `hawm-logo.png does not have PNG magic bytes. Got: ${buffer
          .slice(0, 4)
          .toString('hex')}`
      );
    }

    const duration = Date.now() - startTime;

    return createResult({
      testId: 'D.04',
      testName: 'D.04 — hawm-logo.png exists + valid PNG',
      status: 'passed',
      duration,
      evidence: {
        fileSizeBytes,
        magicBytes: buffer.slice(0, 4).toString('hex'),
        hasValidMagic: hasMagic,
        minAllowedBytes: MIN_SIZE,
        maxAllowedBytes: MAX_SIZE
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'D.04',
      testName: 'D.04 — hawm-logo.png exists + valid PNG',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * Main test function: Run all 4 tests (D.01 - D.04)
 * Returns array of result objects
 */
function runGroupDTests() {
  const results = [];

  // Run all 4 tests in sequence
  results.push(testIndexHtmlSize());
  results.push(testIndexHtmlParseable());
  results.push(testStaticWebAppConfig());
  results.push(testLogoAsset());

  return results;
}

// Export as a test module that the runner can invoke
module.exports = {
  id: 'group-d',
  name: 'Group D: Static File Checks',
  run: function (env) {
    const results = runGroupDTests();

    // Log results to console for visibility
    results.forEach((result) => {
      const icon = result.status === 'passed' ? '✓' : '✗';
      console.log(
        `${icon} ${result.testId}: ${result.testName} (${result.duration}ms)`
      );
      if (result.error) {
        console.log(`  Error: ${result.error.message}`);
      }
    });

    return results;
  }
};
