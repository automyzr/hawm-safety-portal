#!/usr/bin/env node

/**
 * notify-trello.js
 * ============================================================================
 * Reads test results from logs/test-results-*.json and creates a Trello card
 * on Automyz x HAWM board if any test failed.
 *
 * - If all tests passed: silent (no card created)
 * - If any test failed: creates card on "Blocked" list with failing test IDs
 * - Uses TRELLO_API_KEY and TRELLO_TOKEN from environment
 * - Logs GitHub Actions run URL for traceability
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const LOGS_DIR = path.join(__dirname, 'logs');
const BOARD_ID = '69dccf6c044cf169a1e2a447'; // Automyz x HAWM
const DRY_RUN = process.env.DRY_RUN === '1';

// Color helpers for console output
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  cyan:    '\x1b[36m',
  bgBlue:  '\x1b[44m',
  white:   '\x1b[37m',
};

function info(msg)  { console.log(`${C.cyan}[INFO]${C.reset}  ${msg}`); }
function ok(msg)    { console.log(`${C.green}[OK]${C.reset}    ${msg}`); }
function warn(msg)  { console.log(`${C.yellow}[WARN]${C.reset}  ${msg}`); }
function err(msg)   { console.log(`${C.red}[ERROR]${C.reset} ${msg}`); }

/**
 * Make HTTPS request to Trello API
 */
function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;

    if (!apiKey || !token) {
      reject(new Error('Missing TRELLO_API_KEY or TRELLO_TOKEN in environment'));
      return;
    }

    const fullPath = `${path}?key=${apiKey}&token=${token}`;
    const options = {
      hostname: 'api.trello.com',
      port: 443,
      path: fullPath,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Fetch all lists on the Automyz x HAWM board
 */
async function fetchBoardLists() {
  info(`Fetching lists for board ${BOARD_ID}...`);
  return await apiCall('GET', `/1/boards/${BOARD_ID}/lists`);
}

/**
 * Find the "Blocked" list ID, or fall back to first list
 */
async function getBlockedListId() {
  try {
    const lists = await fetchBoardLists();
    const blockedList = lists.find(l => l.name === 'Blocked');

    if (blockedList) {
      info(`Found "Blocked" list: ${blockedList.id}`);
      return blockedList.id;
    }

    warn(`"Blocked" list not found. Using first available list: ${lists[0].name}`);
    return lists[0].id;
  } catch (e) {
    err(`Failed to fetch board lists: ${e.message}`);
    throw e;
  }
}

/**
 * Create a Trello card on the specified list
 */
async function createCard(listId, title, description) {
  if (DRY_RUN) {
    info(`[DRY RUN] Would create card: "${title}"`);
    return { id: 'dry-run-card-id' };
  }

  info(`Creating card on list ${listId}: "${title}"`);
  const cardBody = {
    idList: listId,
    name: title,
    desc: description,
    urlSource: process.env.GITHUB_SERVER_URL ?
      `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined
  };

  try {
    const card = await apiCall('POST', '/1/cards', cardBody);
    ok(`Card created: ${card.id}`);
    return card;
  } catch (e) {
    err(`Failed to create card: ${e.message}`);
    throw e;
  }
}

/**
 * Add a comment to a Trello card
 */
async function addCardComment(cardId, comment) {
  if (DRY_RUN) {
    info(`[DRY RUN] Would add comment to card ${cardId}`);
    return;
  }

  info(`Adding comment to card ${cardId}...`);
  const commentBody = { text: comment };

  try {
    await apiCall('POST', `/1/cards/${cardId}/actions/comments`, commentBody);
    ok(`Comment added to card ${cardId}`);
  } catch (e) {
    err(`Failed to add comment: ${e.message}`);
    throw e;
  }
}

/**
 * Load the latest test results file from logs/
 */
function getLatestTestResults() {
  if (!fs.existsSync(LOGS_DIR)) {
    warn(`Logs directory not found: ${LOGS_DIR}`);
    return null;
  }

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('test-results-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    warn(`No test results files found in ${LOGS_DIR}`);
    return null;
  }

  const latestFile = path.join(LOGS_DIR, files[0]);
  info(`Loading test results from: ${latestFile}`);

  try {
    const content = fs.readFileSync(latestFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    err(`Failed to parse test results: ${e.message}`);
    return null;
  }
}

/**
 * Build card description from test results
 * results is the top-level object with { passed: [...], failed: [...], skipped: [...], results: [...] }
 */
function buildCardDescription(testResultsObj) {
  const passed = testResultsObj.passed || [];
  const failed = testResultsObj.failed || [];
  const skipped = testResultsObj.skipped || [];
  const total = (testResultsObj.results || []).length;

  const summary = `
**Test Summary:**
- Total: ${total}
- Passed: ${passed.length}
- Failed: ${failed.length}
- Skipped: ${skipped.length}

**Failing Tests:**
${failed.map(testId => `- \`${testId}\``).join('\n')}
  `.trim();

  return summary;
}

/**
 * Build card comment with orchestrator tag and GitHub Actions run URL
 */
function buildCardComment() {
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : 'GitHub Actions run URL not available';

  return `[orch:safety-fleet] Automated daily test failure notification\n\nRun: ${runUrl}`;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const testResultsObj = getLatestTestResults();

    if (!testResultsObj) {
      warn('No test results found; skipping notification');
      process.exit(0);
    }

    const failedTests = testResultsObj.failed || [];

    if (failedTests.length === 0) {
      ok('All tests passed; no Trello card created');
      process.exit(0);
    }

    // Build card content
    const dateStr = new Date().toISOString().split('T')[0];
    const cardTitle = `[DAILY-TEST FAIL] ${dateStr} — ${failedTests.length} test(s) failed`;
    const cardDescription = buildCardDescription(testResultsObj);
    const cardComment = buildCardComment();

    // Get list ID (try "Blocked" first, fall back to first list)
    const listId = await getBlockedListId();

    // Create card
    const card = await createCard(listId, cardTitle, cardDescription);

    // Add comment with orchestrator tag
    if (!DRY_RUN) {
      await addCardComment(card.id, cardComment);
    }

    ok(`Notification complete. Card ID: ${card.id}`);
    process.exit(0);

  } catch (e) {
    err(`Notification error: ${e.message}`);
    // Don't fail the workflow on notification errors
    process.exit(0);
  }
}

main();
