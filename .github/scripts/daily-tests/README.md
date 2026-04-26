# Daily Test Suite

Automated test harness for HAWM Safety Portal and integration testing.

> **Note:** This directory is a mirror of the canonical source at `/Users/david/Downloads/AI_Operations/scripts/daily-tests/`. Changes to the canonical source must be re-mirrored here. See BT-DAILY.08 for the sync process.

## Structure

```
scripts/daily-tests/
├── test-runner.js        # Main entry point (executable)
├── env-loader.js         # Environment variable loader
├── graph-token.js        # OAuth 2.0 client credentials flow for Microsoft Graph
├── lib/
│   ├── assertions.js     # Test assertion helpers
│   ├── http-client.js    # HTTP client with Graph token injection
│   └── result-logger.js  # Test result object builder
├── tests/                # Test modules (discovered and executed)
├── logs/                 # Test results JSON output
└── README.md             # This file
```

## Usage

### Run all tests

```bash
node scripts/daily-tests/test-runner.js
```

### Run tests in a specific group

Tests are organized by group prefix in filename. For example, `A-smoke.js` belongs to group A.

```bash
node scripts/daily-tests/test-runner.js --group A
```

### Run tests in parallel

By default, tests execute sequentially. Enable parallel execution:

```bash
node scripts/daily-tests/test-runner.js --parallel
```

### Output

- **Console**: Summary of passed/failed/skipped counts and file path
- **JSON Report**: `logs/test-results-{ISO8601}.json` with full details
- **Exit Codes**:
  - `0` = All tests passed
  - `1` = One or more tests failed
  - `2` = Unexpected error during test execution

## JSON Output Schema

```json
{
  "timestamp": "2026-04-26T12:34:56.789Z",
  "passed": ["test-id-1", "test-id-2"],
  "failed": ["test-id-3"],
  "skipped": [],
  "totalDuration": 1234,
  "exitCode": 1,
  "results": [
    {
      "testId": "test-id-1",
      "testName": "Smoke test for GraphAPI",
      "status": "passed",
      "duration": 500,
      "timestamp": "2026-04-26T12:34:56.789Z"
    },
    {
      "testId": "test-id-3",
      "testName": "SharePoint list sync",
      "status": "failed",
      "duration": 200,
      "timestamp": "2026-04-26T12:34:56.789Z",
      "error": {
        "message": "Expected HTTP 200, got HTTP 403",
        "stack": "..."
      }
    }
  ]
}
```

## Writing Tests

Test modules live in `tests/` directory with `.js` extension. They are discovered automatically.

### Test Module Format

#### Option 1: Default Export Function

```javascript
// tests/A-smoke.js
const { get } = require('../lib/http-client');
const assert = require('../lib/assertions');

module.exports = async function (env) {
  // Test code here
  const result = await get(
    'https://graph.microsoft.com/v1.0/me',
    env
  );
  assert.httpStatus(result.statusCode, 200);
};
```

#### Option 2: Named Exports with Single Result

```javascript
// tests/B-list-sync.js
const { get } = require('../lib/http-client');

module.exports = {
  id: 'sp-list-sync',
  name: 'SharePoint list synchronization',
  run: async function (env) {
    // Test code here
    // Return a single result object
  }
};
```

#### Option 3: Named Exports with Array of Results

Test modules may return an **array of result objects** for multi-part tests (e.g., Group B schema parity with 17 sub-tests):

```javascript
// tests/B-schema-parity.js
const { get } = require('../lib/http-client');
const { createResult } = require('../lib/result-logger');

module.exports = {
  id: 'group-b',
  name: 'Group B: SP Schema Parity',
  run: async function (env) {
    const results = [];

    // Sub-test 1
    results.push(await runSubTest1(env));
    // Sub-test 2
    results.push(await runSubTest2(env));

    // Return array; runner will flatten and aggregate
    return results;
  }
};
```

**Array Result Contract:**
- Test module MAY return either a single result object OR an array of result objects
- On array-return, each element must have the full schema: `{ testId, testName, status, evidence, error }`
- Runner flattens arrays before aggregation
- Exit code is `1` if ANY entry has `status: "failed"`; `0` if all are `"passed"` or `"skipped"`
- Modules SHOULD NOT throw on partial failure — return failure entries instead
- Use `createResult()` helper to ensure schema compliance

**Example multi-test module:**

```javascript
const results = [];

// B.01: Dependency test
const b01 = await checkListExistence(env);
results.push(b01);

if (b01.status !== 'passed') {
  // B.02-B.17 become dependent on B.01; mark as skipped
  for (let i = 2; i <= 17; i++) {
    results.push(createResult({
      testId: `B.${i}`,
      testName: `B.${i} — Skipped (dependency failed)`,
      status: 'skipped',
      duration: 0
    }));
  }
  return results;
}

// B.02-B.17: Independent tests (B.01 passed)
for (let i = 2; i <= 17; i++) {
  results.push(await testSchema(i, env));
}

return results;
```

### Using Assertion Helpers

```javascript
const assert = require('../lib/assertions');

// Exact equality
assert.equals(actual, expected, 'optional message');

// String containment
assert.contains(text, substring);

// Non-empty
assert.notEmpty(value);

// Regex match
assert.matches(text, /pattern/);

// HTTP status code
assert.httpStatus(statusCode, 200);
```

### Using HTTP Client

```javascript
const { get, post } = require('../lib/http-client');

// GET request
const getResult = await get(
  'https://graph.microsoft.com/v1.0/sites/{siteId}',
  env
);

// POST request
const postResult = await post(
  'https://graph.microsoft.com/v1.0/sites/{siteId}/lists',
  { displayName: 'New List' },
  env
);

// Result structure
// { statusCode, body (string), parsed (JSON object or null) }
```

### Error Handling

Tests that throw an error are marked as failed with error details captured:

```javascript
module.exports = async function (env) {
  try {
    assert.equals(1, 2); // Will throw
  } catch (err) {
    // Error is automatically caught and logged
    // Test marked as failed
  }
};
```

## Environment Variables

The test harness requires these variables in `.env`:

- `HAWM_AUTOMATION_CLIENT_ID` — Service account client ID (mapped from `SP_CLIENT_ID`)
- `HAWM_AUTOMATION_CLIENT_SECRET` — Service account secret (mapped from `SP_CLIENT_SECRET`)
- `SP_SITE_ID` — SharePoint site ID
- `M365_TENANT_ID` — Microsoft Entra tenant ID

These are loaded and validated by `env-loader.js`.

## Token Caching

The `graph-token.js` module caches access tokens in memory with a 5-minute safety buffer. The cache is automatically refreshed when expired.

To manually clear the cache (for testing):

```javascript
const { clearTokenCache } = require('../graph-token');
clearTokenCache();
```

## Retry Logic

The HTTP client (`http-client.js`) implements exponential backoff retry for:

- HTTP 429 (Rate Limited)
- HTTP 503 (Service Unavailable)
- Network errors

Maximum 3 retries with backoff: 1s, 2s, 4s.

## GitHub Actions Integration

The test runner is designed to work in CI/CD pipelines:

```yaml
- name: Run daily tests
  run: node scripts/daily-tests/test-runner.js
```

Exit codes are reliable for pipeline decision making.

## Updating the Schema Fixture

The schema fixture (`fixtures/schema-fixture.json`) defines the expected SharePoint list fields and types for Group B schema parity tests. It must be kept in sync with live SharePoint when intentional schema changes are made.

### When to Update

- **Intentional schema changes**: After adding or modifying a column in SharePoint
- **After live SharePoint verification**: Only after confirming changes are live
- **Never** to silence drift — investigate drift first; don't mask it by updating the fixture

### How to Query the Current Schema

Use Microsoft Graph to fetch the current column schema for a list:

```bash
# Requires Bearer token with Sites.Read.All scope
curl -s -H "Authorization: Bearer <access_token>" \
  "https://graph.microsoft.com/v1.0/sites/{siteId}/lists/{listId}/columns?$select=displayName,name,fieldValueType,choice,text,number,dateTime,boolean" \
  | jq '.value[] | {displayName, fieldValueType, choice}' > current-schema.json
```

### Field Type Reference

| Type | OData Value | Graph Returns | Notes |
|------|------------|---------------|-------|
| Single-line text | `Edm.String` | `Edm.String` or `Choice` (single) | Choice columns with `allowMultipleSelection: false` are string-compatible |
| Multi-choice | `Collection(Edm.String)` | `Collection(Edm.String)` or `Choice` (multi) | Choice columns with `allowMultipleSelection: true` match this type |
| Date/Time | `Edm.DateTime` | `Edm.DateTime` | ISO 8601 format in JSON |
| Number | `Edm.Double` | `Edm.Double` | Decimal values |
| Integer | `Edm.Int32` | `Edm.Int32` | Whole numbers |
| Yes/No (Boolean) | `Edm.Boolean` | `Edm.Boolean` | true/false |

### Fixture Update Checklist

1. **Verify the change in SharePoint**: Confirm the new field exists and is correctly configured
2. **Query Graph API**: Fetch the current column list with the curl command above
3. **Update fixture.json**: Add the new field to the appropriate list entry
4. **Include all aliases**: If the field has multiple names (URL-encoded + display name), include all variants
5. **Infer the type**: Use the type reference table or the Graph `fieldValueType` value directly
6. **Test locally**: Run `node scripts/daily-tests/test-runner.js --group B` to verify the fixture matches
7. **Commit**: Use the convention `docs(BT-DAILY.04): fixture update for {ListName}.{FieldName}`

### Example: Adding a New Field to Incidents

**Step 1**: Confirmed in SharePoint that `IncidentCost` (Number field) was added.

**Step 2**: Query Graph:
```json
{
  "displayName": "IncidentCost",
  "name": "IncidentCost",
  "fieldValueType": "Edm.Double"
}
```

**Step 3**: Update `fixtures/schema-fixture.json`:
```json
{
  "name": "Incidents",
  "fields": [
    // ... existing fields ...
    { "name": "IncidentCost", "type": "Edm.Double" }
  ]
}
```

**Step 4**: Run tests and commit:
```bash
node scripts/daily-tests/test-runner.js --group B
git add scripts/daily-tests/fixtures/schema-fixture.json
git commit -m "docs(BT-DAILY.04): fixture update for Incidents.IncidentCost"
```

### Drift Detection & Metadata

When Group B tests detect a type mismatch (drift), the evidence includes the raw column metadata so investigators can see exactly what changed:

```json
{
  "driftedFields": {
    "FieldName": {
      "expected": "Edm.String",
      "actual": "Edm.Int32",
      "columnMetadata": {
        "displayName": "FieldName",
        "fieldValueType": "Edm.Int32",
        "choice": null,
        "text": null,
        "number": { "decimalPlaces": 0 },
        "dateTime": null,
        "boolean": null
      }
    }
  }
}
```

Use this metadata to update the fixture accurately, then verify with a re-run.
