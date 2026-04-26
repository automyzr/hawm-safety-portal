#!/usr/bin/env node

/**
 * Seed Witnesses Field Helper
 *
 * Updates the _TEST_INCIDENT_001 probe row to include a witnesses field in ProbeData.
 * This is a one-shot utility that runs before daily tests to ensure the seed data
 * has the witnesses field required by C.03 tests.
 *
 * Usage:
 *   node scripts/seed-witnesses-field.js
 *
 * Requires:
 *   - PROBE_LIST_ID in .env.probe
 *   - Graph API token from AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET environment
 */

const { get, patch } = require('../lib/http-client');
const path = require('path');
const fs = require('fs');

/**
 * Helper: Read .env.probe and parse PROBE_LIST_ID
 */
function loadProbeListId(envProbePath) {
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
 * Seed the witnesses field on the incident row
 */
async function seedWitnessesField(env) {
  const HAWMTRACKER_SITE_ID = 'heaveawaynl.sharepoint.com,9c28e984-711f-4f10-820d-62ae3beccb44,8f01ebb8-4334-4623-9f66-94443f5e2b05';

  // Load PROBE_LIST_ID from .env.probe
  const envProbePath = path.join(__dirname, '../.env.probe');
  const probeListId = loadProbeListId(envProbePath);

  if (!probeListId) {
    console.error('ERROR: PROBE_LIST_ID not found in .env.probe (run BT-DAILY.02)');
    process.exit(1);
  }

  console.log(`Seeding witnesses field for Incident entity in probe list ${probeListId}...`);

  try {
    // Step 1: Query probe list for Incident rows
    const filter = encodeURIComponent("fields/EntityType eq 'Incident'");
    const queryUrl = `https://graph.microsoft.com/v1.0/sites/${HAWMTRACKER_SITE_ID}/lists/${probeListId}/items?$expand=fields&$filter=${filter}`;

    console.log(`Querying incidents from probe list...`);
    // EntityType is not indexed; use Prefer header to allow non-indexed queries
    const queryResponse = await get(queryUrl, env, {
      headers: {
        'Prefer': 'HonorNonIndexedQueriesWarningMayFailRandomly'
      }
    });

    if (queryResponse.statusCode !== 200) {
      throw new Error(
        `Failed to query Incident rows: HTTP ${queryResponse.statusCode}: ${queryResponse.body || 'no body'}`
      );
    }

    const data = queryResponse.parsed || {};
    if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
      console.log('No Incident rows found in probe list (OK if test data not yet created)');
      process.exit(0);
    }

    // Step 2: Find the _TEST_INCIDENT_001 row and patch its ProbeData
    const incidentRow = data.value[0];
    const incidentId = incidentRow.id;
    const currentProbeData = incidentRow.fields?.ProbeData;

    console.log(`Found Incident row ID: ${incidentId}`);
    console.log(`Current ProbeData: ${currentProbeData}`);

    // Parse existing ProbeData to preserve other fields
    let probeDataObj = {};
    if (currentProbeData && typeof currentProbeData === 'string') {
      try {
        probeDataObj = JSON.parse(currentProbeData);
      } catch (err) {
        console.warn(`Warning: Could not parse ProbeData JSON, starting fresh`);
      }
    }

    // Add witnesses field if not present
    if (!('witnesses' in probeDataObj)) {
      probeDataObj.witnesses = ['Test Witness 1', 'Test Witness 2'];
      console.log(`Adding witnesses field: ${JSON.stringify(probeDataObj.witnesses)}`);
    } else {
      console.log(`Witnesses field already present: ${JSON.stringify(probeDataObj.witnesses)}`);
    }

    // Step 3: PATCH the item's fields
    const patchUrl = `https://graph.microsoft.com/v1.0/sites/${HAWMTRACKER_SITE_ID}/lists/${probeListId}/items/${incidentId}/fields`;
    const patchBody = {
      ProbeData: JSON.stringify(probeDataObj)
    };

    console.log(`Patching ProbeData field...`);
    const patchResponse = await patch(patchUrl, patchBody, env);

    if (patchResponse.statusCode !== 200 && patchResponse.statusCode !== 204) {
      throw new Error(
        `Failed to patch ProbeData: HTTP ${patchResponse.statusCode}: ${patchResponse.body || 'no body'}`
      );
    }

    console.log(`SUCCESS: ProbeData updated with witnesses field`);
    console.log(`Updated ProbeData: ${JSON.stringify(probeDataObj)}`);
    process.exit(0);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

// Load environment and run
const envLoader = require('../env-loader');
const env = envLoader.loadEnv();

seedWitnessesField(env).catch((err) => {
  console.error(`Unhandled error: ${err.message}`);
  process.exit(1);
});
