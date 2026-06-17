#!/usr/bin/env node
/**
 * Automated evaluation runner — executes all test_cases.json scenarios through
 * claimProcessingOrchestrator (same pipeline as production, no HTTP, no frontend).
 */

const fs = require('fs');
const path = require('path');
const { processClaim } = require('../backend/services/claimProcessingOrchestrator');
const { getPolicy } = require('../backend/policyLoader');

const ROOT_DIR = path.join(__dirname, '..');
const TEST_CASES_PATH = path.join(ROOT_DIR, 'test_cases.json');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const JSON_REPORT_PATH = path.join(REPORTS_DIR, 'eval-report.json');
const MD_REPORT_PATH = path.join(REPORTS_DIR, 'eval-report.md');

const BLOCKED_STATUS_EXPECTATIONS = {
  TC001: ['PENDING_DOCUMENT_UPLOAD'],
  TC002: ['PENDING_DOCUMENT_REUPLOAD'],
  TC003: ['DOCUMENT_MISMATCH'],
};

const REJECTION_REASON_ALIASES = {
  PRE_AUTH_MISSING: ['PRE_AUTH_MISSING', 'PRE_AUTH_REQUIRED', 'pre-authorization'],
  PRE_AUTH_REQUIRED: ['PRE_AUTH_MISSING', 'PRE_AUTH_REQUIRED', 'pre-authorization'],
  WAITING_PERIOD: ['WAITING_PERIOD', 'waiting period'],
  PER_CLAIM_EXCEEDED: ['PER_CLAIM_EXCEEDED', 'per-claim limit', 'PER_CLAIM_LIMIT'],
  EXCLUDED_CONDITION: ['EXCLUDED_CONDITION', 'exclusion', 'excluded'],
};

function loadTestCases() {
  const raw = JSON.parse(fs.readFileSync(TEST_CASES_PATH, 'utf8'));
  return raw.test_cases || raw.cases || raw;
}

function lookupMember(memberId) {
  const policy = getPolicy();
  const member = (policy.members || []).find((record) => record.member_id === memberId);
  if (!member) {
    return null;
  }

  return {
    memberName: member.name,
    dob: member.date_of_birth,
    gender: member.gender === 'M' ? 'Male' : member.gender === 'F' ? 'Female' : member.gender,
    relationship: member.relationship || 'SELF',
  };
}

function buildClaimPayload(testInput) {
  const memberDefaults = lookupMember(testInput.member_id) || {};
  const submissionDate = testInput.submission_date || testInput.treatment_date;

  return {
    member_id: testInput.member_id,
    memberName: testInput.memberName || memberDefaults.memberName,
    dob: testInput.dob || memberDefaults.dob,
    gender: testInput.gender || memberDefaults.gender,
    relationship: testInput.relationship || memberDefaults.relationship || 'SELF',
    policy_id: testInput.policy_id || 'PLUM_GHI_2024',
    claim_category: testInput.claim_category,
    treatment_date: testInput.treatment_date,
    submission_date: submissionDate,
    claimSubmissionDate: submissionDate,
    claimed_amount: testInput.claimed_amount,
    hospital_name: testInput.hospital_name || '',
    ytd_claims_amount: testInput.ytd_claims_amount ?? 0,
    claims_history: testInput.claims_history || [],
    simulate_component_failure: Boolean(testInput.simulate_component_failure),
    pre_auth_obtained: Boolean(testInput.pre_auth_obtained),
    diagnosis: testInput.diagnosis,
    treatment: testInput.treatment,
  };
}

function buildClaimHistoryService(testInput) {
  const history = testInput.claims_history || [];
  const treatmentDate = testInput.treatment_date;

  return {
    getSameDayClaimCount() {
      return history.filter((entry) => entry.date === treatmentDate).length;
    },
    getMonthlyClaimCount() {
      const month = String(treatmentDate || '').slice(0, 7);
      return history.filter((entry) => String(entry.date || '').startsWith(month)).length;
    },
    getAnnualUsedAmount() {
      return Number(testInput.ytd_claims_amount || 0);
    },
    getFamilyFloaterUsedAmount() {
      return 0;
    },
  };
}

function summarizeActual(pipelineResult) {
  const decisionResult = pipelineResult.decisionResult || pipelineResult.stageResults?.decisionResult;
  const decision =
    pipelineResult.decision ||
    decisionResult?.decision ||
    (pipelineResult.blocked ? 'BLOCKED' : null);

  return {
    blocked: Boolean(pipelineResult.blocked),
    stage: pipelineResult.stage || null,
    status: pipelineResult.status || null,
    decision: decision === 'PARTIAL_APPROVED' ? 'PARTIAL' : decision,
    approvedAmount: pipelineResult.approvedAmount ?? decisionResult?.approvedAmount ?? null,
    claimedAmount: pipelineResult.claimedAmount ?? decisionResult?.claimedAmount ?? null,
    confidence: pipelineResult.confidence ?? decisionResult?.confidence ?? null,
    reasons: pipelineResult.reasons || decisionResult?.reasons || [],
    missingDocumentTypes: pipelineResult.missingDocumentTypes || [],
    message: pipelineResult.error || pipelineResult.message || null,
  };
}

function normalizeExpected(expected, testId) {
  const normalized = JSON.parse(JSON.stringify(expected || {}));

  if (expected?.decision === null && expected?.system_must) {
    normalized.blocked = true;
    normalized.expectedStatuses = BLOCKED_STATUS_EXPECTATIONS[testId] || [];
  }

  if (normalized.decision === 'PARTIAL') {
    normalized.decision = 'PARTIAL';
  }

  return normalized;
}

function collectReasonText(actual, stages) {
  const chunks = [
    ...(actual.reasons || []),
    ...(stages?.coverageResult?.coverageFailures || []).map((item) =>
      typeof item === 'string' ? item : JSON.stringify(item)
    ),
    ...(stages?.fraudResult?.riskFlags || []),
    actual.message,
  ];

  return chunks.filter(Boolean).join(' | ').toLowerCase();
}

function reasonMatches(expectedCode, actualText) {
  const aliases = REJECTION_REASON_ALIASES[expectedCode] || [expectedCode];
  return aliases.some((alias) => actualText.includes(String(alias).toLowerCase()));
}

function assertTestCase(testCase, pipelineResult, stages) {
  const testId = testCase.case_id;
  const expected = normalizeExpected(testCase.expected, testId);
  const actual = summarizeActual(pipelineResult);
  const failedAssertions = [];

  if (expected.blocked) {
    if (!actual.blocked) {
      failedAssertions.push(`Expected blocked pipeline stop, got decision "${actual.decision}"`);
    }

    if (expected.expectedStatuses?.length > 0 && !expected.expectedStatuses.includes(actual.status)) {
      failedAssertions.push(
        `Expected status one of [${expected.expectedStatuses.join(', ')}], got "${actual.status}"`
      );
    }
  }

  if (expected.decision && expected.decision !== null) {
    const actualDecision = actual.blocked ? 'BLOCKED' : actual.decision;
    const expectedDecision = expected.decision === 'PARTIAL' ? 'PARTIAL' : expected.decision;

    if (expectedDecision === 'PARTIAL' && actualDecision !== 'PARTIAL' && actualDecision !== 'PARTIAL_APPROVED') {
      failedAssertions.push(`Decision: expected "${expectedDecision}", got "${actualDecision}"`);
    } else if (expectedDecision !== 'PARTIAL' && actualDecision !== expectedDecision) {
      failedAssertions.push(`Decision: expected "${expectedDecision}", got "${actualDecision}"`);
    }
  }

  if (expected.approved_amount !== undefined && actual.approvedAmount !== null) {
    const diff = Math.abs(Number(actual.approvedAmount) - Number(expected.approved_amount));
    if (diff > 5) {
      failedAssertions.push(
        `Approved amount: expected ₹${expected.approved_amount}, got ₹${actual.approvedAmount}`
      );
    }
  }

  if (expected.rejection_reasons?.length) {
    const actualText = collectReasonText(actual, stages);
    for (const code of expected.rejection_reasons) {
      if (!reasonMatches(code, actualText)) {
        failedAssertions.push(`Rejection reason: expected "${code}" in pipeline output`);
      }
    }
  }

  if (expected.confidence_score === 'above 0.85' && Number(actual.confidence) < 0.85) {
    failedAssertions.push(`Confidence: expected above 0.85, got ${actual.confidence}`);
  }

  if (testId === 'TC011' && expected.decision === 'APPROVED') {
    if (Number(actual.confidence) >= 0.85) {
      failedAssertions.push('TC011: expected reduced confidence after simulated component failure');
    }
    const warningText = (pipelineResult.warnings || []).join(' ').toLowerCase();
    if (!warningText.includes('component_failure')) {
      failedAssertions.push('TC011: expected visible component failure warning in output');
    }
  }

  return {
    passed: failedAssertions.length === 0,
    failedAssertions,
    actual,
    expected,
  };
}

const AGENT_STAGE_MAP = [
  { key: 'intakeResult', name: 'Claim Intake Agent', check: (s) => s.intakeResult?.success === false },
  {
    key: 'memberValidationResult',
    name: 'Member Validation Agent',
    check: (s) => s.memberValidationResult?.success === false,
  },
  {
    key: 'documentIntelligenceResult',
    name: 'Document Intelligence Agent',
    check: (s) =>
      s.documentIntelligenceResult?.patientConsistencyCheck?.passed === false ||
      (s.documentIntelligenceResult?.success === false && !s.documentRequirementsResult),
  },
  {
    key: 'documentRequirementsResult',
    name: 'Document Requirements (Coverage Agent)',
    check: (s) => s.documentRequirementsResult?.actionRequired === true,
  },
  {
    key: 'coverageResult',
    name: 'Coverage Policy Agent',
    check: (s) => s.coverageResult?.eligible === false,
  },
  {
    key: 'financialResult',
    name: 'Financial Adjudication Agent',
    check: (s) => s.financialResult?.success === false,
  },
  {
    key: 'fraudResult',
    name: 'Fraud Risk Agent',
    check: (s) => s.fraudResult?.requiresManualReview === true || s.fraudResult?.riskLevel === 'MANUAL_REVIEW',
  },
  {
    key: 'decisionResult',
    name: 'Decision Agent',
    check: (s, actual) =>
      s.decisionResult &&
      actual.decision &&
      actual.decision !== 'BLOCKED' &&
      s.decisionResult.decision !== actual.decision,
  },
];

function findFirstDivergence(stages, pipelineResult, assertion) {
  if (!assertion.passed) {
    for (const stage of AGENT_STAGE_MAP) {
      if (stage.check(stages, assertion.actual)) {
        return {
          agent: stage.name,
          reason: extractStageReason(stage.key, stages, pipelineResult),
        };
      }
    }

    if (pipelineResult.blocked) {
      return {
        agent: stageLabel(pipelineResult.stage),
        reason: pipelineResult.error || pipelineResult.message || 'Pipeline blocked',
      };
    }

    return {
      agent: 'Decision Agent',
      reason: assertion.failedAssertions[0] || 'Assertion mismatch',
    };
  }

  return null;
}

function stageLabel(stage) {
  const map = {
    CLAIM_INTAKE: 'Claim Intake Agent',
    MEMBER_VALIDATION: 'Member Validation Agent',
    MEMBER_IDENTITY_VALIDATION: 'Member Validation Agent',
    DOCUMENT_INTELLIGENCE: 'Document Intelligence Agent',
    DOCUMENT_REQUIREMENTS: 'Document Requirements (Coverage Agent)',
    ORCHESTRATOR: 'Orchestrator',
  };
  return map[stage] || stage || 'Unknown Agent';
}

function extractStageReason(stageKey, stages, pipelineResult) {
  const stage = stages[stageKey];
  if (!stage) {
    return pipelineResult.error || 'Stage failed';
  }

  if (stageKey === 'memberValidationResult') {
    return stage.error || stage.reasons?.[0] || 'Member validation failed';
  }
  if (stageKey === 'documentRequirementsResult') {
    return stage.message || 'Document requirements not met';
  }
  if (stageKey === 'documentIntelligenceResult') {
    return stage.patientConsistencyCheck?.message || stage.warnings?.[0] || 'Document intelligence issue';
  }
  if (stageKey === 'coverageResult') {
    const failure = stage.coverageFailures?.[0];
    if (typeof failure === 'string') return failure;
    if (failure?.message) return failure.message;
    return stage.coverageFailures?.[0]?.code || 'Coverage check failed';
  }
  if (stageKey === 'fraudResult') {
    return stage.riskFlags?.join(', ') || 'Fraud/manual review triggered';
  }
  if (stageKey === 'decisionResult') {
    return stage.reasons?.[0] || `Decision: ${stage.decision}`;
  }
  return stage.error || pipelineResult.error || 'Assertion mismatch';
}

async function runSingleTestCase(testCase) {
  const input = testCase.input || {};
  const claimPayload = buildClaimPayload(input);
  const startedAt = Date.now();

  const pipelineResult = await processClaim(
    {
      claimPayload,
      uploadedDocuments: {
        files: [],
        jsonDocuments: input.documents || [],
      },
    },
    {
      captureStages: true,
      skipPersistence: true,
      claimHistoryService: buildClaimHistoryService(input),
    }
  );

  const stages = pipelineResult.stageResults || {};
  const assertion = assertTestCase(testCase, pipelineResult, stages);
  const firstDivergence = findFirstDivergence(stages, pipelineResult, assertion);

  return {
    testCaseId: testCase.case_id,
    caseName: testCase.case_name || testCase.name || testCase.case_id,
    description: testCase.description || '',
    expected: testCase.expected,
    actual: assertion.actual,
    passed: assertion.passed,
    failedAssertions: assertion.failedAssertions,
    firstDivergence,
    durationMs: Date.now() - startedAt,
    intakeResult: stages.intakeResult || null,
    memberValidationResult: stages.memberValidationResult || null,
    documentIntelligenceResult: stages.documentIntelligenceResult || null,
    documentRequirementsResult: stages.documentRequirementsResult || null,
    coverageResult: stages.coverageResult || null,
    financialResult: stages.financialResult || null,
    fraudResult: stages.fraudResult || null,
    decisionResult: stages.decisionResult || pipelineResult.decisionResult || null,
    trace: pipelineResult.trace || [],
    pipelineResult: {
      blocked: pipelineResult.blocked,
      stage: pipelineResult.stage,
      status: pipelineResult.status,
      decision: pipelineResult.decision,
      approvedAmount: pipelineResult.approvedAmount,
      confidence: pipelineResult.confidence,
      reasons: pipelineResult.reasons,
      warnings: pipelineResult.warnings,
    },
  };
}

function buildMarkdownReport(summary) {
  const lines = [];
  lines.push('# Claims Pipeline — Automated Eval Report');
  lines.push('');
  lines.push(`**Generated:** ${summary.generatedAt}`);
  lines.push(`**Runner:** \`scripts/runAllEvaluations.js\` → \`claimProcessingOrchestrator()\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Passed:** ${summary.passed}/${summary.total}`);
  lines.push(`- **Failed:** ${summary.failed}/${summary.total}`);
  lines.push('');
  lines.push('| Test ID | Case | Expected | Actual | Result |');
  lines.push('|---------|------|----------|--------|--------|');
  for (const result of summary.results) {
    const expectedLabel =
      result.expected?.decision === null
        ? 'BLOCKED'
        : result.expected?.decision || (result.expected?.blocked ? 'BLOCKED' : '?');
    const actualLabel = result.actual.blocked
      ? `BLOCKED (${result.actual.status || result.actual.stage || '—'})`
      : result.actual.decision || '—';
    lines.push(
      `| ${result.testCaseId} | ${result.caseName} | ${expectedLabel} | ${actualLabel} | ${result.passed ? '✅ PASS' : '❌ FAIL'} |`
    );
  }
  lines.push('');

  const failed = summary.results.filter((result) => !result.passed);
  if (failed.length > 0) {
    lines.push('## Failed Test Cases');
    lines.push('');
    for (const result of failed) {
      lines.push(`### ${result.testCaseId} — ${result.caseName}`);
      lines.push('');
      lines.push('**1. Expected**');
      lines.push('```json');
      lines.push(JSON.stringify(result.expected, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('**2. Actual**');
      lines.push('```json');
      lines.push(JSON.stringify(result.actual, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('**3. Failed assertions**');
      for (const issue of result.failedAssertions) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
      if (result.firstDivergence) {
        lines.push('**4. First divergence**');
        lines.push(`- **Agent:** ${result.firstDivergence.agent}`);
        lines.push(`- **Reason:** ${result.firstDivergence.reason}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  if (summary.rootCauses?.length) {
    lines.push('## Top Root Causes');
    lines.push('');
    for (const item of summary.rootCauses) {
      lines.push(`- **${item.cause}** (${item.count} case(s)) — ${item.fix}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function analyzeRootCauses(results) {
  const counts = new Map();

  for (const result of results) {
    if (result.passed) continue;
    const key =
      result.firstDivergence?.agent && result.firstDivergence?.reason
        ? `${result.firstDivergence.agent} :: ${result.firstDivergence.reason}`
        : result.failedAssertions[0] || 'Unknown failure';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const fixes = {
    'Document Requirements (Coverage Agent)':
      'Ensure required document types are present and readable before coverage.',
    'Coverage Policy Agent': 'Review waiting period, exclusions, and pre-auth rules in coveragePolicyAgent.',
    'Decision Agent': 'Align decision mapping and rejection reason codes with test expectations.',
    'Member Validation Agent': 'Verify member identity fields match policy_terms.json records.',
    'Document Intelligence Agent': 'Check fixture extraction and patient consistency handling.',
  };

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cause, count]) => {
      const agent = cause.split(' :: ')[0];
      return {
        cause,
        count,
        fix: fixes[agent] || 'Review agent output and test case expectations for alignment.',
      };
    });
}

async function main() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const testCases = loadTestCases();
  const results = [];

  console.log(`\nRunning ${testCases.length} evaluation cases through claimProcessingOrchestrator...\n`);

  for (const testCase of testCases) {
    process.stdout.write(`${testCase.case_id}: ${testCase.case_name || testCase.description?.slice(0, 40)}... `);
    const result = await runSingleTestCase(testCase);
    results.push(result);
    console.log(result.passed ? 'PASS' : 'FAIL');
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    results,
    rootCauses: analyzeRootCauses(results),
  };

  fs.writeFileSync(JSON_REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(MD_REPORT_PATH, buildMarkdownReport(summary), 'utf8');

  console.log('\n============================================================');
  console.log(`RESULTS: ${passed}/${results.length} passed, ${failed} failed`);
  console.log(`JSON report: ${JSON_REPORT_PATH}`);
  console.log(`Markdown report: ${MD_REPORT_PATH}`);
  console.log('============================================================\n');

  if (summary.rootCauses.length) {
    console.log('Top root causes:');
    for (const item of summary.rootCauses) {
      console.log(`  - (${item.count}) ${item.cause}`);
    }
    console.log('');
  }

  return summary;
}

main().catch((error) => {
  console.error('Eval runner failed:', error);
  process.exit(1);
});
