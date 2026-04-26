#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env-loader');
const { createResult } = require('./lib/result-logger');

/**
 * Test runner: discovers and executes test modules from tests/ directory
 * Collects results into passed/failed/skipped arrays
 * Emits JSON to logs/ with exit code 0/1/2
 */

const TESTS_DIR = path.join(__dirname, 'tests');
const LOGS_DIR = path.join(__dirname, 'logs');
const PARALLEL = process.argv.includes('--parallel');
const GROUP_FILTER = process.argv.find((arg) => arg.startsWith('--group='))?.split('=')[1];

/**
 * Discover test modules from tests/ directory
 * @returns {Array<string>} - Array of test file paths
 */
function discoverTests() {
  if (!fs.existsSync(TESTS_DIR)) {
    fs.mkdirSync(TESTS_DIR, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(TESTS_DIR);
  return files
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(TESTS_DIR, f))
    .sort();
}

/**
 * Filter tests by group if --group flag provided
 * @param {Array<string>} tests - Test file paths
 * @param {string} groupFilter - Group filter from CLI
 * @returns {Array<string>} - Filtered test files
 */
function filterTests(tests, groupFilter) {
  if (!groupFilter) {
    return tests;
  }

  return tests.filter((testPath) => {
    const filename = path.basename(testPath);
    // Filename format: {group}-{name}.js
    const [fileGroup] = filename.split('-');
    return fileGroup.toLowerCase() === groupFilter.toLowerCase();
  });
}

/**
 * Load a test module and extract test functions
 * @param {string} testPath - Path to test file
 * @returns {object} - { testId, testName, testFn }
 */
function loadTest(testPath) {
  try {
    // Clear require cache to reload test module fresh
    delete require.cache[require.resolve(testPath)];
    const module = require(testPath);

    // Test modules should export a default function or { run, name, id }
    if (typeof module === 'function') {
      return {
        testId: path.basename(testPath, '.js'),
        testName: path.basename(testPath, '.js'),
        testFn: module
      };
    }

    if (module.run && typeof module.run === 'function') {
      return {
        testId: module.id || path.basename(testPath, '.js'),
        testName: module.name || path.basename(testPath, '.js'),
        testFn: module.run
      };
    }

    throw new Error('Test module must export a function or { run, name, id }');
  } catch (err) {
    throw new Error(`Failed to load test ${testPath}: ${err.message}`);
  }
}

/**
 * Run a single test and return result(s)
 * Test functions can return either a single result object or an array of result objects
 * @param {string} testId - Test identifier
 * @param {string} testName - Test name
 * @param {Function} testFn - Test function (async or sync)
 * @param {object} env - Environment variables
 * @returns {Promise<Array<object>>} - Array of result objects
 */
async function runTest(testId, testName, testFn, env) {
  const startTime = Date.now();

  try {
    // Call test function with env
    const result = await Promise.resolve(testFn(env));

    const duration = Date.now() - startTime;

    // Handle both single result object and array of results
    if (Array.isArray(result)) {
      // Test returned multiple results; return them as-is
      return result;
    } else if (result === undefined || result === null) {
      // Test completed without returning a result; create a passed result
      return [createResult({
        testId,
        testName,
        status: 'passed',
        duration
      })];
    } else {
      // Test returned a single result object
      return [result];
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    return [createResult({
      testId,
      testName,
      status: 'failed',
      duration,
      error
    })];
  }
}

/**
 * Run all tests sequentially or in parallel
 * @param {Array<object>} tests - Array of test objects
 * @param {object} env - Environment variables
 * @param {boolean} parallel - Whether to run tests in parallel
 * @returns {Promise<Array<object>>} - Flattened array of result objects
 */
async function runTests(tests, env, parallel) {
  let allResults = [];

  if (parallel) {
    // Run all tests concurrently
    const resultArrays = await Promise.all(
      tests.map((test) =>
        runTest(test.testId, test.testName, test.testFn, env)
      )
    );
    // Flatten array of arrays into single array
    resultArrays.forEach(resultArray => {
      allResults.push(...resultArray);
    });
  } else {
    // Run tests sequentially
    for (const test of tests) {
      const resultArray = await runTest(test.testId, test.testName, test.testFn, env);
      allResults.push(...resultArray);
    }
  }

  return allResults;
}

/**
 * Main entry point
 */
async function main() {
  let allResults = [];
  let unexpectedError = null;

  try {
    // Load environment
    const env = loadEnv();

    // Discover and filter tests
    let testPaths = discoverTests();
    testPaths = filterTests(testPaths, GROUP_FILTER);

    // Load test modules with error handling
    const tests = [];
    for (const testPath of testPaths) {
      try {
        const test = loadTest(testPath);
        tests.push(test);
      } catch (loadErr) {
        // Synthetic failure entry for load error
        allResults.push(
          createResult({
            testId: 'LOAD_ERROR',
            testName: testPath,
            status: 'failed',
            duration: 0,
            error: loadErr
          })
        );
      }
    }

    // Run tests
    const startTime = Date.now();
    const runResults = await runTests(tests, env, PARALLEL);
    const totalDuration = Date.now() - startTime;
    // runResults is already flattened from runTests()
    allResults.push(...runResults);

    // Aggregate results
    const passed = allResults.filter((r) => r.status === 'passed');
    const failed = allResults.filter((r) => r.status === 'failed');
    const skipped = allResults.filter((r) => r.status === 'skipped');

    // Determine exit code
    let exitCode = 0;
    if (failed.length > 0) {
      exitCode = 1;
    }

    // Ensure logs directory exists
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    // Emit results JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(LOGS_DIR, `test-results-${timestamp}.json`);

    const report = {
      timestamp: new Date().toISOString(),
      passed: passed.map((r) => r.testId),
      failed: failed.map((r) => r.testId),
      skipped: skipped.map((r) => r.testId),
      totalDuration,
      exitCode,
      results: allResults // Include full result objects for detailed analysis
    };

    if (unexpectedError) {
      report.unexpectedError = {
        message: unexpectedError.message,
        stack: unexpectedError.stack
      };
    }

    fs.writeFileSync(logFile, JSON.stringify(report, null, 2));
    console.log(`Test results written to ${logFile}`);
    console.log(`Tests: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);

    // Exit with appropriate code
    process.exit(exitCode);
  } catch (err) {
    unexpectedError = err;
    console.error('Test runner error:', err.message);

    // Ensure logs directory exists and emit partial results JSON
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(LOGS_DIR, `test-results-${timestamp}.json`);

    const report = {
      timestamp: new Date().toISOString(),
      passed: [],
      failed: [],
      skipped: [],
      totalDuration: 0,
      exitCode: 2,
      results: allResults,
      unexpectedError: {
        message: err.message,
        stack: err.stack
      }
    };

    fs.writeFileSync(logFile, JSON.stringify(report, null, 2));
    console.log(`Test results (partial) written to ${logFile}`);

    process.exit(2);
  }
}

// Run main
main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
