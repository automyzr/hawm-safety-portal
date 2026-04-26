const fs = require('fs');
const path = require('path');

/**
 * Load and validate environment variables from .env file
 * Required variables:
 * - HAWM_AUTOMATION_CLIENT_ID (SP_CLIENT_ID alias)
 * - HAWM_AUTOMATION_CLIENT_SECRET (SP_CLIENT_SECRET alias)
 * - SP_SITE_ID
 * - M365_TENANT_ID
 */

function loadEnv() {
  // Allow override via env var for mirrored test locations (e.g., GHA workflow)
  // Fallback to canonical relative path for local development
  const envPath = process.env.DAILY_TESTS_DOTENV_PATH || path.join(__dirname, '../../.env');

  if (!fs.existsSync(envPath)) {
    throw new Error(`Environment file not found: ${envPath}`);
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};

  // Parse .env file line by line
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    // Parse KEY=VALUE
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();

    if (key && value) {
      env[key] = value;
    }
  });

  // Map SP_CLIENT_ID -> HAWM_AUTOMATION_CLIENT_ID for test harness
  // Use fallback logic to preserve GHA-supplied vars (which use HAWM_AUTOMATION_* directly)
  env.HAWM_AUTOMATION_CLIENT_ID = env.HAWM_AUTOMATION_CLIENT_ID || env.SP_CLIENT_ID;
  env.HAWM_AUTOMATION_CLIENT_SECRET = env.HAWM_AUTOMATION_CLIENT_SECRET || env.SP_CLIENT_SECRET;

  // Validate required variables
  const required = [
    'HAWM_AUTOMATION_CLIENT_ID',
    'HAWM_AUTOMATION_CLIENT_SECRET',
    'SP_SITE_ID',
    'M365_TENANT_ID'
  ];

  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return env;
}

module.exports = {
  loadEnv
};
