/**
 * Test assertion helpers
 */

/**
 * Assert that two values are equal
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} message - Optional message
 * @throws {Error} - If assertion fails
 */
function equals(actual, expected, message) {
  if (actual !== expected) {
    const msg =
      message ||
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

/**
 * Assert that a string contains a substring
 * @param {string} actual - Actual string
 * @param {string} substring - Substring to find
 * @param {string} message - Optional message
 * @throws {Error} - If assertion fails
 */
function contains(actual, substring, message) {
  if (!actual.includes(substring)) {
    const msg =
      message ||
      `Expected "${actual}" to contain "${substring}"`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

/**
 * Assert that a value is not empty
 * @param {*} value - Value to check
 * @param {string} message - Optional message
 * @throws {Error} - If assertion fails
 */
function notEmpty(value, message) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0);

  if (isEmpty) {
    const msg = message || `Expected non-empty value, got ${JSON.stringify(value)}`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

/**
 * Assert that a string matches a regex pattern
 * @param {string} actual - Actual string
 * @param {RegExp|string} pattern - Regex pattern
 * @param {string} message - Optional message
 * @throws {Error} - If assertion fails
 */
function matches(actual, pattern, message) {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  if (!regex.test(actual)) {
    const msg =
      message ||
      `Expected "${actual}" to match ${regex.toString()}`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

/**
 * Assert that an HTTP status code is as expected
 * @param {number} actual - Actual HTTP status code
 * @param {number} expected - Expected HTTP status code
 * @param {string} message - Optional message
 * @throws {Error} - If assertion fails
 */
function httpStatus(actual, expected, message) {
  if (actual !== expected) {
    const msg =
      message ||
      `Expected HTTP ${expected}, got HTTP ${actual}`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

module.exports = {
  equals,
  contains,
  notEmpty,
  matches,
  httpStatus
};
