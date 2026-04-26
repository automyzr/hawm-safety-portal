const https = require('https');

/**
 * OAuth 2.0 client credentials flow for Microsoft Graph
 * Implements token caching to avoid re-requesting on every API call
 */

let cachedToken = null;
let tokenExpiry = null;

/**
 * Get a cached Graph access token or request a new one
 * @param {object} env - Environment object with HAWM_AUTOMATION_CLIENT_ID, etc.
 * @returns {Promise<string>} - Access token
 */
async function getToken(env) {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  // Request new token via OAuth 2.0 client credentials flow
  const clientId = env.HAWM_AUTOMATION_CLIENT_ID;
  const clientSecret = env.HAWM_AUTOMATION_CLIENT_SECRET;
  const tenantId = env.M365_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Missing OAuth 2.0 credentials in environment');
  }

  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default'
    }).toString();

    const options = {
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(
            new Error(
              `Token request failed with status ${res.statusCode}: ${data}`
            )
          );
          return;
        }

        try {
          const parsed = JSON.parse(data);
          cachedToken = parsed.access_token;

          // Calculate token expiry (subtract 1 minute for safety buffer)
          tokenExpiry = Date.now() + parsed.expires_in * 1000 - 60 * 1000;

          resolve(cachedToken);
        } catch (err) {
          reject(new Error(`Failed to parse token response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Token request failed: ${err.message}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Clear cached token (useful for testing token refresh)
 */
function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = null;
}

module.exports = {
  getToken,
  clearTokenCache
};
