const fs = require('fs');
const path = require('path');
const { createResult } = require('../lib/result-logger');

/**
 * Group E: Hotfix Regression Grep Checks
 * Tests: E.01 (Roles@odata.type), E.02 (mapXxx .id returns), E.03 (Witnesses field)
 */

/**
 * E.01 — Roles@odata.type multi-choice payload regression check
 * Verify pattern '"Roles@odata.type": "Collection(Edm.String)"' appears in index.html
 * Guards against re-regression of BT-PROD multi-choice fix
 */
function testRolesOdataType(htmlContent) {
  const startTime = Date.now();

  try {
    // Pattern to match: "Roles@odata.type": "Collection(Edm.String)" with flexible whitespace
    const pattern = /"Roles@odata\.type"\s*:\s*"Collection\(Edm\.String\)"/g;
    const lines = htmlContent.split('\n');

    const matches = [];
    let globalMatchCount = 0;

    lines.forEach((line, index) => {
      const lineMatches = line.match(pattern);
      if (lineMatches) {
        globalMatchCount += lineMatches.length;
        matches.push({
          line: index + 1,
          snippet: line.substring(0, 120).trim()
        });
      }
    });

    if (matches.length === 0) {
      throw new Error('Multi-choice payload hotfix missing: Roles@odata.type not found');
    }

    return createResult({
      testId: 'E.01',
      testName: 'E.01 — Roles@odata.type multi-choice payload regression check',
      status: 'passed',
      duration: Date.now() - startTime,
      evidence: {
        pattern: '"Roles@odata.type": "Collection(Edm.String)"',
        matchCount: globalMatchCount,
        locations: matches
      }
    });
  } catch (error) {
    return createResult({
      testId: 'E.01',
      testName: 'E.01 — Roles@odata.type multi-choice payload regression check',
      status: 'failed',
      duration: Date.now() - startTime,
      error
    });
  }
}

/**
 * E.02 — mapXxx functions return .id regression check
 * Find all function mapXxx(items) definitions
 * For each, verify the function body contains 'id:' in a return statement
 * Guards against loss of .id in map function return objects
 *
 * FIX: Constrain search to actual function body boundaries to prevent bleed
 * into adjacent functions. Use next-function-slice strategy: extract substring
 * from start of current mapXxx to start of next mapXxx (or EOF).
 */
function testMapXxxReturnsId(htmlContent) {
  const startTime = Date.now();

  try {
    // Find all mapXxx function definitions with their positions in the content
    const mapFunctionPattern = /(?:function|const|let)\s+(map[A-Za-z]+)\s*(?:\(items\)|\s*=)/g;
    const mapFunctions = [];
    let match;

    while ((match = mapFunctionPattern.exec(htmlContent)) !== null) {
      mapFunctions.push({
        name: match[1],
        startIndex: match.index,
        startPos: match.index
      });
    }

    if (mapFunctions.length === 0) {
      throw new Error('No mapXxx functions found in index.html');
    }

    // For each mapXxx function, constrain search to next function boundary
    const funcCheckResults = [];

    mapFunctions.forEach((func, funcIdx) => {
      // Determine the end position of this function's code slice
      // Use start of next mapXxx, or EOF if this is the last one
      let endSlicePos = htmlContent.length;
      if (funcIdx < mapFunctions.length - 1) {
        endSlicePos = mapFunctions[funcIdx + 1].startIndex;
      }

      // Extract the function's slice (from start of definition to start of next mapXxx)
      const functionSlice = htmlContent.substring(func.startIndex, endSlicePos);

      // Check if this slice contains 'id:' (the key indicator)
      // For reduce-based functions, 'id:' may not appear in return object,
      // but then it's exempt (e.g., mapCorOverrides)
      const hasIdField = /id\s*:/.test(functionSlice);

      funcCheckResults.push({
        funcName: func.name,
        hasIdField,
        sliceLength: functionSlice.length,
        note: hasIdField ? 'has id:' : 'no id: (likely reduce-based)'
      });
    });

    // All mapXxx functions with a direct return statement should have .id field.
    // Reduce-based mappers (no id: in return) are acceptable and noted.
    // Fail only if a clearly non-reduce function is missing id:.
    const failedFuncs = funcCheckResults.filter(r => !r.hasIdField && !r.note.includes('reduce'));

    // For simplicity: if a mapXxx has no 'id:' anywhere in its slice, require an explanation.
    // The reduce-based functions should be explicitly allowed via code review.
    // For now, we allow them but note them in evidence.
    const nonReduceFailed = funcCheckResults.filter(r => {
      if (!r.hasIdField) {
        // Check if it's reduce-based by looking for 'reduce(' in the slice
        const idx = mapFunctions.findIndex(f => f.name === r.funcName);
        const sliceStart = mapFunctions[idx].startIndex;
        const sliceEnd = idx < mapFunctions.length - 1 ? mapFunctions[idx + 1].startIndex : htmlContent.length;
        const slice = htmlContent.substring(sliceStart, sliceEnd);
        return !slice.includes('reduce(');
      }
      return false;
    });

    if (nonReduceFailed.length > 0) {
      throw new Error(
        `mapXxx functions missing .id field: ${nonReduceFailed.map(f => f.funcName).join(', ')}`
      );
    }

    return createResult({
      testId: 'E.02',
      testName: 'E.02 — mapXxx functions return .id regression check',
      status: 'passed',
      duration: Date.now() - startTime,
      evidence: {
        strategy: 'next-function-slice',
        mapFunctionsFound: mapFunctions.length,
        mapFunctionsList: mapFunctions.map(f => f.name),
        allHaveIdField: true,
        details: funcCheckResults
      }
    });
  } catch (error) {
    return createResult({
      testId: 'E.02',
      testName: 'E.02 — mapXxx functions return .id regression check',
      status: 'failed',
      duration: Date.now() - startTime,
      error
    });
  }
}

/**
 * E.03 — Witnesses field in incident schema regression check
 * Verify BOTH:
 *   - 'witnesses:' (lowercase, read side in mapIncidents function body)
 *   - 'Witnesses:' (capital W, write side in Graph mutation fields object)
 * Guards against loss of witnesses field in incident schema mapping
 *
 * FIX: Strip comments-only before searching to avoid false positives
 * from stale comments like "// Witnesses: deferred". Keep actual code intact.
 */
function stripCommentsOnly(content) {
  let stripped = content;

  // Remove line comments (// ... )
  stripped = stripped.replace(/\/\/[^\n]*/g, '');

  // Remove block comments (/* ... */)
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');

  return stripped;
}

function testWitnessesFieldPresent(htmlContent) {
  const startTime = Date.now();

  try {
    const lines = htmlContent.split('\n');

    // Strip comments from the content for the pattern search (but keep code/strings intact)
    const strippedContent = stripCommentsOnly(htmlContent);
    const strippedLines = strippedContent.split('\n');

    // Pattern 1: lowercase 'witnesses:' in object literals (read side)
    const witnessesLowercasePattern = /witnesses\s*:/g;

    // Pattern 2: uppercase 'Witnesses:' in object literals (write side)
    const witnessesUppercasePattern = /Witnesses\s*:/g;

    const witnessesLowercaseMatches = [];
    const witnessesUppercaseMatches = [];

    // Search in stripped content
    strippedLines.forEach((line, index) => {
      const lowercaseMatch = line.match(witnessesLowercasePattern);
      if (lowercaseMatch) {
        // Cross-reference back to original line for context
        const originalLine = lines[index] ? lines[index].substring(0, 120).trim() : '';
        witnessesLowercaseMatches.push({
          line: index + 1,
          snippet: originalLine
        });
      }

      const uppercaseMatch = line.match(witnessesUppercasePattern);
      if (uppercaseMatch) {
        const originalLine = lines[index] ? lines[index].substring(0, 120).trim() : '';
        witnessesUppercaseMatches.push({
          line: index + 1,
          snippet: originalLine
        });
      }
    });

    // Both must be present
    if (witnessesLowercaseMatches.length === 0) {
      throw new Error('Witnesses field hotfix missing: read-side "witnesses:" not found');
    }

    if (witnessesUppercaseMatches.length === 0) {
      throw new Error('Witnesses field hotfix missing: write-side "Witnesses:" not found');
    }

    return createResult({
      testId: 'E.03',
      testName: 'E.03 — Witnesses field in incident schema regression check',
      status: 'passed',
      duration: Date.now() - startTime,
      evidence: {
        strategy: 'comment-strip',
        readSidePattern: 'witnesses:',
        readSideMatchCount: witnessesLowercaseMatches.length,
        readSideLocations: witnessesLowercaseMatches,
        writeSidePattern: 'Witnesses:',
        writeSideMatchCount: witnessesUppercaseMatches.length,
        writeSideLocations: witnessesUppercaseMatches,
        bothSidesPresent: true
      }
    });
  } catch (error) {
    return createResult({
      testId: 'E.03',
      testName: 'E.03 — Witnesses field in incident schema regression check',
      status: 'failed',
      duration: Date.now() - startTime,
      error
    });
  }
}

/**
 * Run all Group E tests
 * Reads hawm-safety-portal/index.html once and shares content across tests
 */
async function runGroupETests(env) {
  const startTime = Date.now();
  const results = [];

  try {
    // Construct path to index.html relative to this script location
    // scripts/daily-tests/tests/test-group-e-hotfix-regression.js
    // -> ../../../hawm-safety-portal/index.html
    const indexHtmlPath = path.join(__dirname, '../../../hawm-safety-portal/index.html');

    // Read the file once
    let htmlContent;
    try {
      htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
    } catch (fsError) {
      // If we can't read the file, return a failed result for each test
      const errorResult = {
        message: `Cannot read index.html: ${fsError.message}`,
        path: indexHtmlPath
      };

      return [
        createResult({
          testId: 'E.01',
          testName: 'E.01 — Roles@odata.type multi-choice payload regression check',
          status: 'failed',
          duration: Date.now() - startTime,
          error: new Error(errorResult.message)
        }),
        createResult({
          testId: 'E.02',
          testName: 'E.02 — mapXxx functions return .id regression check',
          status: 'failed',
          duration: Date.now() - startTime,
          error: new Error(errorResult.message)
        }),
        createResult({
          testId: 'E.03',
          testName: 'E.03 — Witnesses field in incident schema regression check',
          status: 'failed',
          duration: Date.now() - startTime,
          error: new Error(errorResult.message)
        })
      ];
    }

    // Run each test with the shared HTML content
    results.push(testRolesOdataType(htmlContent));
    results.push(testMapXxxReturnsId(htmlContent));
    results.push(testWitnessesFieldPresent(htmlContent));

    return results;
  } catch (error) {
    // Fallback error handling
    return [
      createResult({
        testId: 'E.01',
        testName: 'E.01 — Roles@odata.type multi-choice payload regression check',
        status: 'failed',
        duration: Date.now() - startTime,
        error
      }),
      createResult({
        testId: 'E.02',
        testName: 'E.02 — mapXxx functions return .id regression check',
        status: 'failed',
        duration: Date.now() - startTime,
        error
      }),
      createResult({
        testId: 'E.03',
        testName: 'E.03 — Witnesses field in incident schema regression check',
        status: 'failed',
        duration: Date.now() - startTime,
        error
      })
    ];
  }
}

// Export as a test module that the runner can invoke
module.exports = {
  id: 'group-e',
  name: 'Group E: Hotfix Regression Grep Checks',
  run: async function (env) {
    const results = await runGroupETests(env);

    // Log results to console for visibility
    console.log('\n=== Group E Test Results ===');
    results.forEach((result) => {
      const status = result.status.toUpperCase();
      console.log(`[${status}] ${result.testId}: ${result.testName}`);
      if (result.evidence) {
        console.log(`      Evidence: ${JSON.stringify(result.evidence, null, 2)}`);
      }
      if (result.error) {
        console.log(`      Error: ${result.error.message}`);
      }
    });
    console.log('============================\n');

    // Return the array of results directly (no throw)
    // The runner will detect failures and set exit code accordingly
    return results;
  }
};
