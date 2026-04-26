/**
 * Test result object builder
 */

/**
 * Create a test result object
 * @param {object} options - Result options
 * @param {string} options.testId - Unique test identifier
 * @param {string} options.testName - Human-readable test name
 * @param {string} options.status - Test status: 'passed', 'failed', 'skipped'
 * @param {number} options.duration - Test duration in milliseconds
 * @param {object} options.evidence - Optional evidence object (response, assertions, etc.)
 * @param {Error} options.error - Optional error object if test failed
 * @returns {object} - Result object
 */
function createResult(options) {
  const {
    testId,
    testName,
    status,
    duration,
    evidence = null,
    error = null
  } = options;

  if (!testId || !testName || !status) {
    throw new Error('testId, testName, and status are required');
  }

  const result = {
    testId,
    testName,
    status,
    duration,
    timestamp: new Date().toISOString()
  };

  if (evidence) {
    result.evidence = evidence;
  }

  if (error) {
    result.error = {
      message: error.message,
      stack: error.stack
    };
  }

  return result;
}

module.exports = {
  createResult
};
