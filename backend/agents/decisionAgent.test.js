const assert = require('assert');
const { makeClaimDecision } = require('./decisionAgent');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function baseInput(overrides = {}) {
  return {
    claim: {
      claimId: 'CLM_test0001',
      claimType: 'CONSULTATION',
      memberId: 'EMP001',
      treatmentDate: '2024-11-01',
      claimedAmount: 1500,
      ...overrides.claim,
    },
    member: {
      memberId: 'EMP001',
      name: 'Rajesh Kumar',
    },
    coverageResult: {
      eligible: true,
      coverageFailures: [],
      coverageWarnings: [],
      ...overrides.coverageResult,
    },
    financialResult: {
      claimedAmount: overrides.financialClaimedAmount ?? 1500,
      approvedAmount: overrides.approvedAmount ?? 1500,
      patientPayable: overrides.patientPayable ?? 0,
      adjustments: overrides.adjustments || [],
      ...overrides.financialResult,
    },
    fraudResult: {
      riskLevel: 'LOW',
      requiresManualReview: false,
      riskFlags: [],
      warnings: [],
      ...overrides.fraudResult,
    },
    documentIntelligenceResult: {
      overallConfidence: 0.91,
      ...overrides.documentIntelligenceResult,
    },
  };
}

test('approves fully payable claims', () => {
  const result = makeClaimDecision(baseInput());

  assert.strictEqual(result.decision, 'APPROVED');
  assert.strictEqual(result.claimedAmount, 1500);
  assert.strictEqual(result.approvedAmount, 1500);
  assert.strictEqual(result.patientPayable, 0);
  assert.strictEqual(result.confidence, 0.91);
  assert.ok(result.reasons.some((reason) => reason.includes('approved')));
  assert.ok(result.trace.some((entry) => entry.step === 'FINAL_DECISION'));
});

test('returns partial approval when approved amount is lower than claimed amount', () => {
  const result = makeClaimDecision(
    baseInput({
      claim: { claimedAmount: 2500 },
      financialClaimedAmount: 2500,
      approvedAmount: 1800,
      patientPayable: 700,
      adjustments: [
        {
          type: 'SUB_LIMIT',
          description: 'Consultation sub-limit reduced payable amount',
          amountReduced: 500,
        },
        {
          type: 'COPAY',
          description: '10% copay applied',
          amountReduced: 200,
        },
      ],
    })
  );

  assert.strictEqual(result.decision, 'PARTIAL_APPROVED');
  assert.strictEqual(result.approvedAmount, 1800);
  assert.ok(result.reasons.some((reason) => reason.includes('sub-limit')));
  assert.ok(result.reasons.some((reason) => reason.includes('lower than the claimed amount')));
});

test('rejects claims when coverage is ineligible', () => {
  const result = makeClaimDecision(
    baseInput({
      coverageResult: {
        eligible: false,
        coverageFailures: ['Missing required documents: HOSPITAL_BILL'],
      },
      approvedAmount: 0,
      patientPayable: 1500,
    })
  );

  assert.strictEqual(result.decision, 'REJECTED');
  assert.strictEqual(result.approvedAmount, 0);
  assert.ok(result.reasons.some((reason) => reason.includes('HOSPITAL_BILL')));
});

test('routes high-risk claims to manual review', () => {
  const result = makeClaimDecision(
    baseInput({
      fraudResult: {
        riskLevel: 'MANUAL_REVIEW',
        requiresManualReview: true,
        riskFlags: ['DOCUMENT_ALTERATION'],
      },
      approvedAmount: 1500,
    })
  );

  assert.strictEqual(result.decision, 'MANUAL_REVIEW');
  assert.strictEqual(result.approvedAmount, 1500);
  assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
  assert.ok(result.reasons.some((reason) => reason.includes('Document alteration detected')));
});

test('rejects claims with zero payable amount', () => {
  const result = makeClaimDecision(
    baseInput({
      approvedAmount: 0,
      patientPayable: 1500,
      adjustments: [
        {
          type: 'SUB_LIMIT',
          description: 'Consultation sub-limit reduced payable amount',
          amountReduced: 1500,
        },
      ],
    })
  );

  assert.strictEqual(result.decision, 'REJECTED');
  assert.strictEqual(result.approvedAmount, 0);
  assert.ok(result.reasons.some((reason) => reason.includes('No payable amount')));
});

test('defaults confidence when document intelligence confidence is unavailable', () => {
  const input = baseInput();
  delete input.documentIntelligenceResult;

  const result = makeClaimDecision(input);

  assert.strictEqual(result.confidence, 0.8);
});

console.log('\nAll decisionAgent tests passed.');
