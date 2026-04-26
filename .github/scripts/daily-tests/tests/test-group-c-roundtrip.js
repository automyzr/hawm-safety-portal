const { get } = require('../lib/http-client');
const { createResult } = require('../lib/result-logger');
const fs = require('fs');
const path = require('path');

/**
 * Group C: Probe Round-Trip Tests
 * Tests: C.01-C.04 (Read probe list, transform via mapProbeItemToEntity, verify round-trip)
 */

/**
 * HAWMTracker site ID (where _DailyTestProbe list lives, created by BT-DAILY.02)
 * This is the authoritative probe list site and must not fall back to env vars.
 */
const HAWMTRACKER_SITE_ID = 'heaveawaynl.sharepoint.com,9c28e984-711f-4f10-820d-62ae3beccb44,8f01ebb8-4334-4623-9f66-94443f5e2b05';

/**
 * Helper: Read .env.probe and parse PROBE_LIST_ID
 * @param {string} envProbePath - Path to .env.probe file
 * @returns {string|null} - PROBE_LIST_ID or null if missing/invalid
 */
function loadProbeListId(envProbePath) {
  // Prefer process.env (set by GHA workflow from secret); fall back to .env.probe file (local dev)
  if (process.env.PROBE_LIST_ID) {
    return process.env.PROBE_LIST_ID;
  }

  try {
    if (!fs.existsSync(envProbePath)) {
      return null;
    }
    const content = fs.readFileSync(envProbePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('PROBE_LIST_ID=')) {
        const value = trimmed.substring('PROBE_LIST_ID='.length).trim();
        return value || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Helper: Transform Graph list item to entity with id field
 * Extracts fields from item.fields, includes item.id in the result
 * Parses ProbeData JSON string to object
 * @param {object} item - Graph list item response
 * @returns {object} - Entity with id + fields + parsed probeData
 */
function mapProbeItemToEntity(item) {
  const entity = {
    id: item.id,
    ...item.fields
  };

  // Parse ProbeData if present
  if (entity.ProbeData && typeof entity.ProbeData === 'string') {
    try {
      entity.probeData = JSON.parse(entity.ProbeData);
    } catch {
      entity.probeData = null;
    }
  }

  return entity;
}

/**
 * C.01 — Read probe list + verify .id
 * GET /sites/{siteId}/lists/{probeListId}/items?$expand=fields&$top=1
 * Assert ≥1 item and .id is present + non-empty GUID
 */
async function testReadProbeListVerifyId(env, probeListId) {
  const startTime = Date.now();

  try {
    if (!probeListId) {
      throw new Error('PROBE_LIST_ID not configured (run BT-DAILY.02)');
    }

    const url = `https://graph.microsoft.com/v1.0/sites/${HAWMTRACKER_SITE_ID}/lists/${probeListId}/items?$expand=fields&$top=1`;
    const response = await get(url, env);
    const duration = Date.now() - startTime;

    if (response.statusCode === 404) {
      // List doesn't exist yet (BT-DAILY.02 not run)
      return createResult({
        testId: 'C.01',
        testName: 'C.01 — Read probe list + verify .id',
        status: 'skipped',
        duration,
        evidence: { reason: '_DailyTestProbe list not found (run BT-DAILY.02)' }
      });
    }

    if (response.statusCode !== 200) {
      throw new Error(
        `Graph API returned HTTP ${response.statusCode}: ${response.body || 'no body'}`
      );
    }

    const data = response.parsed || {};
    if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
      throw new Error('Probe list is empty or invalid response structure');
    }

    const item = data.value[0];
    const transformed = mapProbeItemToEntity(item);

    // Verify .id is present and is a valid identifier (GUID or numeric)
    if (!transformed.id || typeof transformed.id !== 'string' || transformed.id.trim() === '') {
      throw new Error('Transformed entity .id is missing, null, or empty');
    }

    // Accept either GUID pattern (36 chars with hyphens) or numeric ID
    if (!/^([a-f0-9\-]{36}|\d+)$/.test(transformed.id)) {
      throw new Error(`Transformed entity .id "${transformed.id}" does not match GUID or numeric pattern`);
    }

    return createResult({
      testId: 'C.01',
      testName: 'C.01 — Read probe list + verify .id',
      status: 'passed',
      duration,
      evidence: {
        rowId: transformed.id,
        transformed: {
          id: transformed.id,
          entityType: transformed.EntityType
        },
        expectedFields: ['id'],
        missingFields: [],
        passedFields: ['id']
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'C.01',
      testName: 'C.01 — Read probe list + verify .id',
      status: error.message.includes('not configured') ? 'skipped' : 'failed',
      duration,
      evidence: error.message.includes('not configured') ? { reason: error.message } : undefined,
      error: error.message.includes('not configured') ? null : error
    });
  }
}

/**
 * C.02 — Person entity round-trip
 * Query probe list for EntityType = 'Person'
 * Assert id + name, company, department, status fields present in probeData
 */
async function testPersonRoundTrip(env, probeListId) {
  const startTime = Date.now();

  try {
    if (!probeListId) {
      throw new Error('PROBE_LIST_ID not configured (run BT-DAILY.02)');
    }

    const filter = encodeURIComponent("fields/EntityType eq 'Person'");
    const url = `https://graph.microsoft.com/v1.0/sites/${HAWMTRACKER_SITE_ID}/lists/${probeListId}/items?$expand=fields&$filter=${filter}`;
    // EntityType is not indexed; use Prefer header to allow non-indexed queries
    const response = await get(url, env, {
      headers: {
        'Prefer': 'HonorNonIndexedQueriesWarningMayFailRandomly'
      }
    });
    const duration = Date.now() - startTime;

    if (response.statusCode === 404) {
      // List doesn't exist yet (BT-DAILY.02 not run)
      return createResult({
        testId: 'C.02',
        testName: 'C.02 — Person entity round-trip',
        status: 'skipped',
        duration,
        evidence: { reason: '_DailyTestProbe list not found (run BT-DAILY.02)' }
      });
    }

    if (response.statusCode !== 200) {
      throw new Error(
        `Graph API returned HTTP ${response.statusCode}: ${response.body || 'no body'}`
      );
    }

    const data = response.parsed || {};
    if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
      return createResult({
        testId: 'C.02',
        testName: 'C.02 — Person entity round-trip',
        status: 'skipped',
        duration,
        evidence: { reason: 'No Person entity in probe list' }
      });
    }

    const item = data.value[0];
    const transformed = mapProbeItemToEntity(item);
    const probeData = transformed.probeData || {};

    // Verify required fields
    const expectedFields = ['name', 'company', 'department', 'status'];
    const missingFields = [];
    const passedFields = [];

    expectedFields.forEach(field => {
      if (probeData[field] === null || probeData[field] === undefined) {
        missingFields.push(field);
      } else {
        passedFields.push(field);
      }
    });

    if (!transformed.id) {
      missingFields.push('id');
    } else {
      passedFields.push('id');
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing fields in Person entity: ${missingFields.join(', ')}`
      );
    }

    return createResult({
      testId: 'C.02',
      testName: 'C.02 — Person entity round-trip',
      status: 'passed',
      duration,
      evidence: {
        rowId: transformed.id,
        transformed: {
          id: transformed.id,
          ...probeData
        },
        expectedFields,
        missingFields: [],
        passedFields
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'C.02',
      testName: 'C.02 — Person entity round-trip',
      status: error.message.includes('not configured') || error.message.includes('No Person') ? 'skipped' : 'failed',
      duration,
      evidence: (error.message.includes('not configured') || error.message.includes('No Person')) ? { reason: error.message } : undefined,
      error: (error.message.includes('not configured') || error.message.includes('No Person')) ? null : error
    });
  }
}

/**
 * C.03 — Incident entity round-trip
 * Query probe list for EntityType = 'Incident'
 * Assert id + incidentNumber, employee, location, severity
 * EXPLICITLY check witnesses field exists (even if empty)
 */
async function testIncidentRoundTrip(env, probeListId) {
  const startTime = Date.now();

  try {
    if (!probeListId) {
      throw new Error('PROBE_LIST_ID not configured (run BT-DAILY.02)');
    }

    const filter = encodeURIComponent("fields/EntityType eq 'Incident'");
    const url = `https://graph.microsoft.com/v1.0/sites/${HAWMTRACKER_SITE_ID}/lists/${probeListId}/items?$expand=fields&$filter=${filter}`;
    // EntityType is not indexed; use Prefer header to allow non-indexed queries
    const response = await get(url, env, {
      headers: {
        'Prefer': 'HonorNonIndexedQueriesWarningMayFailRandomly'
      }
    });
    const duration = Date.now() - startTime;

    if (response.statusCode === 404) {
      // List doesn't exist yet (BT-DAILY.02 not run)
      return createResult({
        testId: 'C.03',
        testName: 'C.03 — Incident entity round-trip',
        status: 'skipped',
        duration,
        evidence: { reason: '_DailyTestProbe list not found (run BT-DAILY.02)' }
      });
    }

    if (response.statusCode !== 200) {
      throw new Error(
        `Graph API returned HTTP ${response.statusCode}: ${response.body || 'no body'}`
      );
    }

    const data = response.parsed || {};
    if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
      return createResult({
        testId: 'C.03',
        testName: 'C.03 — Incident entity round-trip',
        status: 'skipped',
        duration,
        evidence: { reason: 'No Incident entity in probe list' }
      });
    }

    const item = data.value[0];
    const transformed = mapProbeItemToEntity(item);
    const probeData = transformed.probeData || {};

    // Verify required fields
    const expectedFields = ['incidentNumber', 'employee', 'location', 'severity'];
    const missingFields = [];
    const passedFields = [];

    expectedFields.forEach(field => {
      if (probeData[field] === null || probeData[field] === undefined) {
        missingFields.push(field);
      } else {
        passedFields.push(field);
      }
    });

    // Explicitly check witnesses field exists (even if empty)
    if (!('witnesses' in probeData)) {
      missingFields.push('witnesses');
    } else {
      passedFields.push('witnesses');
    }

    if (!transformed.id) {
      missingFields.push('id');
    } else {
      passedFields.push('id');
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing fields in Incident entity: ${missingFields.join(', ')}`
      );
    }

    return createResult({
      testId: 'C.03',
      testName: 'C.03 — Incident entity round-trip',
      status: 'passed',
      duration,
      evidence: {
        rowId: transformed.id,
        transformed: {
          id: transformed.id,
          ...probeData
        },
        expectedFields: [...expectedFields, 'witnesses'],
        missingFields: [],
        passedFields
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'C.03',
      testName: 'C.03 — Incident entity round-trip',
      status: error.message.includes('not configured') || error.message.includes('No Incident') ? 'skipped' : 'failed',
      duration,
      evidence: (error.message.includes('not configured') || error.message.includes('No Incident')) ? { reason: error.message } : undefined,
      error: (error.message.includes('not configured') || error.message.includes('No Incident')) ? null : error
    });
  }
}

/**
 * C.04 — Vehicle entity round-trip
 * Query probe list for EntityType = 'Vehicle'
 * Assert id + unit, company
 */
async function testVehicleRoundTrip(env, probeListId) {
  const startTime = Date.now();

  try {
    if (!probeListId) {
      throw new Error('PROBE_LIST_ID not configured (run BT-DAILY.02)');
    }

    const filter = encodeURIComponent("fields/EntityType eq 'Vehicle'");
    const url = `https://graph.microsoft.com/v1.0/sites/${HAWMTRACKER_SITE_ID}/lists/${probeListId}/items?$expand=fields&$filter=${filter}`;
    // EntityType is not indexed; use Prefer header to allow non-indexed queries
    const response = await get(url, env, {
      headers: {
        'Prefer': 'HonorNonIndexedQueriesWarningMayFailRandomly'
      }
    });
    const duration = Date.now() - startTime;

    if (response.statusCode === 404) {
      // List doesn't exist yet (BT-DAILY.02 not run)
      return createResult({
        testId: 'C.04',
        testName: 'C.04 — Vehicle entity round-trip',
        status: 'skipped',
        duration,
        evidence: { reason: '_DailyTestProbe list not found (run BT-DAILY.02)' }
      });
    }

    if (response.statusCode !== 200) {
      throw new Error(
        `Graph API returned HTTP ${response.statusCode}: ${response.body || 'no body'}`
      );
    }

    const data = response.parsed || {};
    if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
      return createResult({
        testId: 'C.04',
        testName: 'C.04 — Vehicle entity round-trip',
        status: 'skipped',
        duration,
        evidence: { reason: 'No Vehicle entity in probe list' }
      });
    }

    const item = data.value[0];
    const transformed = mapProbeItemToEntity(item);
    const probeData = transformed.probeData || {};

    // Verify required fields
    const expectedFields = ['unit', 'company'];
    const missingFields = [];
    const passedFields = [];

    expectedFields.forEach(field => {
      if (probeData[field] === null || probeData[field] === undefined) {
        missingFields.push(field);
      } else {
        passedFields.push(field);
      }
    });

    if (!transformed.id) {
      missingFields.push('id');
    } else {
      passedFields.push('id');
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing fields in Vehicle entity: ${missingFields.join(', ')}`
      );
    }

    return createResult({
      testId: 'C.04',
      testName: 'C.04 — Vehicle entity round-trip',
      status: 'passed',
      duration,
      evidence: {
        rowId: transformed.id,
        transformed: {
          id: transformed.id,
          ...probeData
        },
        expectedFields,
        missingFields: [],
        passedFields
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'C.04',
      testName: 'C.04 — Vehicle entity round-trip',
      status: error.message.includes('not configured') || error.message.includes('No Vehicle') ? 'skipped' : 'failed',
      duration,
      evidence: (error.message.includes('not configured') || error.message.includes('No Vehicle')) ? { reason: error.message } : undefined,
      error: (error.message.includes('not configured') || error.message.includes('No Vehicle')) ? null : error
    });
  }
}

/**
 * Main test function: Run all 4 tests (C.01 - C.04)
 * Returns array of result objects
 */
async function runGroupCTests(env) {
  // Load PROBE_LIST_ID from .env.probe
  const envProbePath = path.join(__dirname, '../.env.probe');
  const probeListId = loadProbeListId(envProbePath);

  const results = [];

  // Run all 4 tests in sequence
  results.push(await testReadProbeListVerifyId(env, probeListId));
  results.push(await testPersonRoundTrip(env, probeListId));
  results.push(await testIncidentRoundTrip(env, probeListId));
  results.push(await testVehicleRoundTrip(env, probeListId));

  return results;
}

// Export as a test module that the runner can invoke
module.exports = {
  id: 'group-c',
  name: 'Group C: Probe Round-Trip',
  run: async function (env) {
    const results = await runGroupCTests(env);

    // Log results to console for visibility
    console.log('\n=== Group C Test Results ===');
    results.forEach((result) => {
      const status = result.status.toUpperCase();
      console.log(`[${status}] ${result.testId}: ${result.testName}`);
      if (result.evidence) {
        console.log(`      Evidence: ${JSON.stringify(result.evidence)}`);
      }
    });
    console.log('============================\n');

    // Return the array of results directly (no throw)
    return results;
  }
};
