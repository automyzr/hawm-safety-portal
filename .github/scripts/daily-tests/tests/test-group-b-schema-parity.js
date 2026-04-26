const { get } = require('../lib/http-client');
const { createResult } = require('../lib/result-logger');
const fs = require('fs');
const path = require('path');

/**
 * Group B: SharePoint Schema Parity Tests
 * Tests: B.01 (List existence), B.02-B.17 (Schema per list)
 */

/**
 * Load the schema fixture
 * @returns {object} - Fixture with expected lists and fields
 */
function loadSchemaFixture() {
  const fixturePath = path.join(__dirname, '../fixtures/schema-fixture.json');
  const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(fixtureContent);
}

/**
 * Extract field names from Graph columns response
 * @param {Array} columns - Graph columns array
 * @returns {Array<string>} - List of displayName values
 */
function extractFieldNames(columns) {
  return columns.map(col => col.displayName || col.name).filter(Boolean);
}

/**
 * Determine if an actual column type matches an expected type
 * Handles multi-choice normalization: Collection(Edm.String) matches Choice with allowMultipleSelection
 * Single Choice matches Edm.String; null fieldValueType is treated as a pass (can't verify)
 * @param {string} expectedType - Expected OData type (e.g., "Edm.String", "Collection(Edm.String)")
 * @param {object} actualColumn - Graph column object { fieldValueType, choice: {allowMultipleSelection}, text, number, dateTime, boolean }
 * @returns {boolean} - true if types match or cannot be verified
 */
function typeMatches(expectedType, actualColumn) {
  // If fieldValueType is null/undefined, we can't verify — assume match
  if (!actualColumn.fieldValueType) {
    return true;
  }

  const actual = actualColumn.fieldValueType;

  // Collection(Edm.String) handling: matches Graph Collection(Edm.String) OR Choice with allowMultipleSelection
  if (expectedType === 'Collection(Edm.String)') {
    if (actual === 'Collection(Edm.String)') {
      return true;
    }
    // Check if it's a multi-select Choice
    if (actual === 'Choice' && actualColumn.choice && actualColumn.choice.allowMultipleSelection === true) {
      return true;
    }
    return false;
  }

  // Edm.String handling: matches Graph Edm.String OR Choice with single-select (no allowMultipleSelection)
  if (expectedType === 'Edm.String') {
    if (actual === 'Edm.String') {
      return true;
    }
    // Check if it's a single-select Choice
    if (actual === 'Choice' && (!actualColumn.choice || actualColumn.choice.allowMultipleSelection !== true)) {
      return true;
    }
    return false;
  }

  // All other types: exact match only
  return actual === expectedType;
}

/**
 * Compare expected fields against actual fields
 * @param {Array<object>} expectedFields - Expected field specs
 * @param {Array} actualColumns - Actual Graph columns
 * @returns {object} - Comparison result { missingFields, driftedFields }
 */
function compareSchemas(expectedFields, actualColumns) {
  const actualFields = extractFieldNames(actualColumns);
  const actualFieldsLower = actualFields.map(f => f.toLowerCase());

  const missingFields = [];
  const driftedFields = {};

  expectedFields.forEach(expectedField => {
    // Check if field exists (case-insensitive)
    const expectedLower = expectedField.name.toLowerCase();
    const foundIndex = actualFieldsLower.findIndex(f => f === expectedLower);

    if (foundIndex === -1) {
      missingFields.push({
        name: expectedField.name,
        expectedType: expectedField.type
      });
    } else {
      // Field exists; check type with flexible matching
      const actualColumn = actualColumns[foundIndex];
      if (!typeMatches(expectedField.type, actualColumn)) {
        // Record drift with metadata for investigation
        driftedFields[expectedField.name] = {
          expected: expectedField.type,
          actual: actualColumn.fieldValueType,
          columnMetadata: {
            displayName: actualColumn.displayName,
            name: actualColumn.name,
            fieldValueType: actualColumn.fieldValueType,
            choice: actualColumn.choice || null,
            text: actualColumn.text || null,
            number: actualColumn.number || null,
            dateTime: actualColumn.dateTime || null,
            boolean: actualColumn.boolean || null
          }
        };
      }
    }
  });

  return { missingFields, driftedFields };
}

/**
 * B.01 — List existence check
 * GET /sites/{siteId}/lists?$select=id,displayName,name
 * Assert all 16 expected list names present
 */
async function testListExistence(env) {
  const startTime = Date.now();
  const siteId = env.SP_SITE_ID;

  try {
    if (!siteId) {
      throw new Error('SP_SITE_ID not configured in environment');
    }

    const fixture = loadSchemaFixture();
    const expectedListNames = Object.keys(fixture.lists);

    // Call Graph API to list all lists
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$select=id,displayName,name`;
    const response = await get(url, env);

    if (response.statusCode !== 200) {
      throw new Error(
        `Graph API returned HTTP ${response.statusCode}: ${response.body}`
      );
    }

    const data = response.parsed;
    if (!data || !Array.isArray(data.value)) {
      throw new Error('Invalid Graph API response: expected value array');
    }

    const actualListNames = data.value.map(list => list.displayName).filter(Boolean);
    const actualListsMap = {};
    data.value.forEach(list => {
      actualListsMap[list.displayName] = list.id;
    });

    // Check for missing lists
    const missingLists = expectedListNames.filter(
      name => !actualListNames.includes(name)
    );

    const duration = Date.now() - startTime;

    if (missingLists.length > 0) {
      return createResult({
        testId: 'B.01',
        testName: 'B.01 — List existence',
        status: 'failed',
        duration,
        evidence: {
          expectedLists: expectedListNames,
          actualLists: actualListNames,
          missingLists,
          foundCount: actualListNames.length,
          expectedCount: expectedListNames.length
        }
      });
    }

    // Success: store list IDs for dependent tests
    return {
      testId: 'B.01',
      testName: 'B.01 — List existence',
      status: 'passed',
      duration,
      listIds: actualListsMap,
      evidence: {
        expectedLists: expectedListNames,
        actualLists: actualListNames,
        foundCount: actualListNames.length
      }
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId: 'B.01',
      testName: 'B.01 — List existence',
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * Test schema parity for a single list (B.02-B.17)
 * @param {string} listName - Name of the list
 * @param {string} listId - SharePoint list ID
 * @param {Array<object>} expectedFields - Expected field specifications
 * @param {number} testIndex - Test number (2-17)
 * @param {object} env - Environment variables
 * @returns {Promise<object>} - Result object
 */
async function testListSchema(listName, listId, expectedFields, testIndex, env) {
  const startTime = Date.now();
  const testId = `B.${String(testIndex).padStart(2, '0')}`;
  const testName = `B.${String(testIndex).padStart(2, '0')} — ${listName} schema`;

  try {
    const siteId = env.SP_SITE_ID;

    // Call Graph API to get columns with expanded sub-properties
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns?$select=id,displayName,name,fieldValueType,choice,text,number,dateTime,boolean`;
    const response = await get(url, env);

    if (response.statusCode !== 200) {
      throw new Error(
        `Graph API returned HTTP ${response.statusCode} for list ${listName}: ${response.body}`
      );
    }

    const data = response.parsed;
    if (!data || !Array.isArray(data.value)) {
      throw new Error(`Invalid Graph API response for list ${listName}: expected value array`);
    }

    // Compare schemas
    const { missingFields, driftedFields } = compareSchemas(expectedFields, data.value);
    const duration = Date.now() - startTime;

    // Check for failures
    const hasMissing = missingFields.length > 0;
    const hasDrift = Object.keys(driftedFields).length > 0;

    if (hasMissing || hasDrift) {
      return createResult({
        testId,
        testName,
        status: 'failed',
        duration,
        evidence: {
          listName,
          expectedFields: expectedFields.map(f => ({ name: f.name, type: f.type })),
          actualFieldCount: data.value.length,
          missingFields: hasMissing ? missingFields : [],
          driftedFields: hasDrift ? driftedFields : {}
        }
      });
    }

    // Success
    return createResult({
      testId,
      testName,
      status: 'passed',
      duration,
      evidence: {
        listName,
        expectedFieldCount: expectedFields.length,
        actualFieldCount: data.value.length,
        allFieldsPresent: true
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    return createResult({
      testId,
      testName,
      status: 'failed',
      duration,
      error
    });
  }
}

/**
 * Main test function: Run all Group B tests (B.01 - B.17)
 * Returns array of result objects
 */
async function runGroupBTests(env) {
  const results = [];

  // Run B.01 (list existence)
  const b01Result = await testListExistence(env);
  results.push(b01Result);

  // If B.01 failed or didn't provide list IDs, remaining tests are skipped/blocked
  if (b01Result.status === 'failed' || !b01Result.listIds) {
    // Create placeholder failed results for B.02-B.17
    const fixture = loadSchemaFixture();
    const listNames = Object.keys(fixture.lists);
    for (let i = 2; i <= 17; i++) {
      const listName = listNames[i - 2] || `UnknownList${i}`;
      results.push(
        createResult({
          testId: `B.${String(i).padStart(2, '0')}`,
          testName: `B.${String(i).padStart(2, '0')} — ${listName} schema`,
          status: 'skipped',
          duration: 0,
          evidence: {
            reason: 'Skipped because B.01 list existence check failed or list ID lookup failed'
          }
        })
      );
    }
    return results;
  }

  // Run B.02-B.17 (schema tests for each list)
  const fixture = loadSchemaFixture();
  const listNames = Object.keys(fixture.lists);

  for (let i = 0; i < listNames.length && i < 16; i++) {
    const listName = listNames[i];
    const listId = b01Result.listIds[listName];

    if (!listId) {
      // List ID not found; mark test as failed
      results.push(
        createResult({
          testId: `B.${String(i + 2).padStart(2, '0')}`,
          testName: `B.${String(i + 2).padStart(2, '0')} — ${listName} schema`,
          status: 'failed',
          duration: 0,
          evidence: {
            reason: `List ID not found for ${listName} in B.01 response`
          }
        })
      );
      continue;
    }

    const expectedFields = fixture.lists[listName].fields;
    const result = await testListSchema(
      listName,
      listId,
      expectedFields,
      i + 2, // Test index starts at 2
      env
    );
    results.push(result);
  }

  return results;
}

// Export as a test module that the runner can invoke
module.exports = {
  id: 'group-b',
  name: 'Group B: SP Schema Parity',
  run: async function (env) {
    const results = await runGroupBTests(env);

    // Log results to console for visibility
    console.log('\n=== Group B Test Results ===');
    results.forEach((result) => {
      const status = result.status.toUpperCase().padEnd(7);
      console.log(`[${status}] ${result.testId}: ${result.testName}`);
      if (result.evidence) {
        const evidenceStr = JSON.stringify(result.evidence);
        if (evidenceStr.length > 100) {
          console.log(`      Evidence: ${evidenceStr.substring(0, 100)}...`);
        } else {
          console.log(`      Evidence: ${evidenceStr}`);
        }
      }
    });
    console.log('============================\n');

    // Return the array of results directly (no throw)
    // The runner will detect failures and set exit code accordingly
    return results;
  }
};
