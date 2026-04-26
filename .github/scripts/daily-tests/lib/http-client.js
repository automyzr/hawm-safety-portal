const https = require('https');
const { getToken, clearTokenCache } = require('../graph-token');

/**
 * HTTP client with Graph API token injection and retry logic
 * Handles 429 (rate limit) and 503 (service unavailable) with exponential backoff
 */

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second
const REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * Make a GET request with Graph API token
 * @param {string} url - Full URL to request
 * @param {object} env - Environment object for token retrieval
 * @param {object} options - Optional request options (headers, etc.)
 * @returns {Promise<{statusCode: number, body: string, parsed: *}>}
 */
async function get(url, env, options = {}) {
  const token = await getToken(env);
  return makeRequest(url, 'GET', null, token, { ...options, env });
}

/**
 * Make a POST request with Graph API token and JSON body
 * @param {string} url - Full URL to request
 * @param {object} body - Request body (will be JSON-stringified)
 * @param {object} env - Environment object for token retrieval
 * @param {object} options - Optional request options (headers, etc.)
 * @returns {Promise<{statusCode: number, body: string, parsed: *}>}
 */
async function post(url, body, env, options = {}) {
  const token = await getToken(env);
  return makeRequest(url, 'POST', body, token, { ...options, env });
}

/**
 * Make a PATCH request with Graph API token and JSON body
 * @param {string} url - Full URL to request
 * @param {object} body - Request body (will be JSON-stringified)
 * @param {object} env - Environment object for token retrieval
 * @param {object} options - Optional request options (headers, etc.)
 * @returns {Promise<{statusCode: number, body: string, parsed: *}>}
 */
async function patch(url, body, env, options = {}) {
  const token = await getToken(env);
  return makeRequest(url, 'PATCH', body, token, { ...options, env });
}

/**
 * Internal: make HTTP request with retry and Graph token injection
 * Handles retries for 401 (token expiry), 429 (rate limit), 503 (service unavailable), and network errors
 */
async function makeRequest(url, method, body, token, options = {}, attempt = 0, tokenRefreshed = false) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout: REQUEST_TIMEOUT
    };

    const req = https.request(requestOptions, async (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', async () => {
        // Handle 401 with token refresh (once per request)
        if (res.statusCode === 401 && !tokenRefreshed) {
          clearTokenCache();
          try {
            const newToken = await getToken(options.env);
            return resolve(makeRequest(url, method, body, newToken, options, 0, true));
          } catch (err) {
            return reject(new Error(`Failed to refresh token: ${err.message}`));
          }
        }

        // Handle other retryable status codes (429, 503) and network errors
        if ((res.statusCode === 429 || res.statusCode === 503) && attempt < MAX_RETRIES) {
          const backoffMs = INITIAL_BACKOFF * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          return resolve(makeRequest(url, method, body, token, options, attempt + 1, tokenRefreshed));
        }

        // Parse JSON if possible
        let parsed = null;
        if (data) {
          try {
            parsed = JSON.parse(data);
          } catch {
            // Not JSON, leave parsed as null
          }
        }

        resolve({
          statusCode: res.statusCode,
          body: data,
          parsed
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP request timeout: request exceeded ${REQUEST_TIMEOUT}ms timeout`));
    });

    req.on('error', async (err) => {
      // Retry on network errors (transient failures)
      if (attempt < MAX_RETRIES) {
        const backoffMs = INITIAL_BACKOFF * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return resolve(makeRequest(url, method, body, token, options, attempt + 1, tokenRefreshed));
      }
      reject(new Error(`HTTP request failed: ${err.message}`));
    });

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(bodyStr);
    }

    req.end();
  });
}

module.exports = {
  get,
  post,
  patch
};
