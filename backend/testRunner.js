// testRunner.js
// Runs all 12 test cases from test_cases.json against the live server
// Compares actual results to expected outcomes
// Prints a summary table and saves a markdown eval report

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3001/api/claims';
const TEST_CASES_PATH = path.join(__dirname, '..', 'test_cases.json');
const REPORT_PATH = path.join(__dirname, '..', 'eval_report.md');

const testCasesData = JSON.parse(fs.readFileSync(TEST_CASES_PATH, 'utf8'));

const testCases = Array.isArray(testCasesData)
  ? testCasesData
  : testCasesData.test_cases || testCasesData.cases || Object.values(testCasesData)[0];

// Map test_cases.json expected format to what compareResult checks
function normalizeExpected(expected, testId) {
  const normalized = { ...expected };

  // TC001–TC003 block before a decision is made
  if (expected.decision === null && expected.system_must && expected.blocked === undefined) {
    normalized.blocked = true;
  }

  const blockedReasonMap = {
    TC001: 'WRONG_DOCUMENT_TYPE',
    TC002: 'UNREADABLE_DOCUMENT',
    TC003: 'PATIENT_MISMATCH',
  };

  if (blockedReasonMap[testId]) {
    normalized.rejection_reason = blockedReasonMap[testId];
  }

  // test_cases.json uses rejection_reasons array; our pipeline uses singular codes
  if (expected.rejection_reasons && expected.rejection_reasons.length > 0) {
    const reasonMap = {
      PRE_AUTH_MISSING: 'PRE_AUTH_REQUIRED',
      PER_CLAIM_EXCEEDED: 'PER_CLAIM_EXCEEDED',
    };
    normalized.rejection_reason = reasonMap[expected.rejection_reasons[0]] || expected.rejection_reasons[0];
  }

  return normalized;
}

async function runTestCase(testCase) {
  const input = testCase.input || testCase;

  const body = {
    member_id: input.member_id,
    policy_id: input.policy_id || 'PLUM_GHI_2024',
    claim_category: input.claim_category,
    relationship: input.relationship || 'SELF',
    treatment_date: input.treatment_date,
    submission_date: input.submission_date || input.treatment_date,
    claimed_amount: String(input.claimed_amount),
    hospital_name: input.hospital_name || '',
    ytd_claims_amount: String(input.ytd_claims_amount || 0),
    claims_history: JSON.stringify(input.claims_history || []),
    simulate_component_failure: String(input.simulate_component_failure || false),
    pre_auth_obtained: String(input.pre_auth_obtained || false),
    documents: JSON.stringify(input.documents || []),
  };

  if (input.diagnosis) {
    body.diagnosis = input.diagnosis;
  }
  if (input.treatment) {
    body.treatment = input.treatment;
  }

  const startTime = Date.now();

  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    return { result, duration, error: null };
  } catch (err) {
    return { result: null, duration: Date.now() - startTime, error: err.message };
  }
}

function compareResult(actual, expected) {
  const issues = [];

  if (!actual) {
    return { matched: false, issues: ['No response received'] };
  }

  if (expected.decision && actual.decision !== expected.decision) {
    issues.push(`Decision: expected "${expected.decision}", got "${actual.decision}"`);
  }

  if (expected.blocked !== undefined && Boolean(actual.blocked) !== Boolean(expected.blocked)) {
    issues.push(`Blocked: expected ${expected.blocked}, got ${actual.blocked}`);
  }

  if (expected.approved_amount !== undefined && actual.approved_amount !== undefined) {
    const diff = Math.abs(actual.approved_amount - expected.approved_amount);
    if (diff > 5) {
      issues.push(`Amount: expected ₹${expected.approved_amount}, got ₹${actual.approved_amount}`);
    }
  }

  if (expected.rejection_reason) {
    const hasReason =
      actual.rejection_reasons?.includes(expected.rejection_reason) ||
      actual.reason === expected.rejection_reason;
    if (!hasReason) {
      issues.push(`Rejection reason: expected "${expected.rejection_reason}"`);
    }
  }

  return {
    matched: issues.length === 0,
    issues,
  };
}

async function runAllTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('CLAIMS PIPELINE — EVAL REPORT');
  console.log(`Running ${testCases.length} test cases against ${SERVER_URL}`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const testId = testCase.case_id || testCase.id || testCase.test_id || `TC${String(results.length + 1).padStart(3, '0')}`;
    const description = testCase.description || testCase.case_name || testCase.name || 'No description';
    const expected = normalizeExpected(testCase.expected || testCase.expected_output || {}, testId);

    process.stdout.write(`Running ${testId}: ${description.substring(0, 50)}... `);

    const { result, duration, error } = await runTestCase(testCase);

    if (error) {
      console.log(`ERROR (${duration}ms)`);
      console.log(`  Error: ${error}`);
      results.push({ testId, description, expected, actual: null, matched: false, issues: [error], duration });
      failed++;
      continue;
    }

    const comparison = compareResult(result, expected);

    if (comparison.matched) {
      console.log(`✓ PASS (${duration}ms)`);
      passed++;
    } else {
      console.log(`✗ FAIL (${duration}ms)`);
      comparison.issues.forEach((issue) => console.log(`  → ${issue}`));
      failed++;
    }

    results.push({
      testId,
      description,
      expected,
      actual: result,
      matched: comparison.matched,
      issues: comparison.issues,
      duration,
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS: ${passed}/${testCases.length} passed, ${failed} failed`);
  console.log(`${'='.repeat(60)}\n`);

  generateMarkdownReport(results, passed, failed);

  return results;
}

function generateMarkdownReport(results, passed, failed) {
  const lines = [];
  const timestamp = new Date().toISOString();

  lines.push('# Eval Report — Health Insurance Claims Pipeline');
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push(`**Total Tests:** ${results.length}`);
  lines.push(`**Passed:** ${passed} | **Failed:** ${failed}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Summary Table');
  lines.push('');
  lines.push('| Test ID | Description | Expected | Actual | Result |');
  lines.push('|---------|-------------|----------|--------|--------|');

  for (const resultRow of results) {
    const expectedStr = resultRow.expected.decision || (resultRow.expected.blocked ? 'BLOCKED' : '?');
    const actualStr = resultRow.actual
      ? resultRow.actual.blocked
        ? 'BLOCKED'
        : resultRow.actual.decision
      : 'ERROR';
    const resultStr = resultRow.matched ? '✅ PASS' : '❌ FAIL';
    lines.push(
      `| ${resultRow.testId} | ${resultRow.description.substring(0, 50)} | ${expectedStr} | ${actualStr} | ${resultStr} |`
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Detailed Results');
  lines.push('');

  for (const resultRow of results) {
    lines.push(`### ${resultRow.testId} — ${resultRow.description}`);
    lines.push('');
    lines.push(`**Result:** ${resultRow.matched ? '✅ PASS' : '❌ FAIL'} (${resultRow.duration}ms)`);
    lines.push('');

    lines.push('**Expected:**');
    lines.push('```json');
    lines.push(JSON.stringify(resultRow.expected, null, 2));
    lines.push('```');
    lines.push('');

    lines.push('**Actual decision:** ' + (resultRow.actual?.decision || resultRow.actual?.reason || 'ERROR'));
    if (resultRow.actual?.approved_amount !== undefined) {
      lines.push(`**Actual amount:** ₹${resultRow.actual.approved_amount}`);
    }
    if (resultRow.actual?.confidence_score !== undefined) {
      lines.push(`**Confidence:** ${Math.round(resultRow.actual.confidence_score * 100)}%`);
    }
    lines.push('');

    if (!resultRow.matched && resultRow.issues.length > 0) {
      lines.push('**Why it failed:**');
      resultRow.issues.forEach((issue) => lines.push(`- ${issue}`));
      lines.push('');
    }

    if (resultRow.actual?.trace) {
      lines.push('**Agent trace summary:**');
      resultRow.actual.trace.forEach((agent) => {
        const status = agent.passed ? '✓' : '✗';
        lines.push(`- ${status} ${agent.agent}`);
        if (agent.rejection_detail) {
          lines.push(`  - ${agent.rejection_detail}`);
        }
      });
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`Markdown eval report saved to: ${REPORT_PATH}`);
}

runAllTests().catch(console.error);
