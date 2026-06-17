const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assessFraudRisk } = require('./fraudRiskAgent');

const POLICY_PATH = path.join(__dirname, '..', '..', 'policy_terms.json');
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

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
      relationship: 'SELF',
      joinDate: '2024-04-01',
      ...overrides.member,
    },
    documentIntelligenceResult: {
      overallConfidence: 0.9,
      documents: [],
      aggregatedExtraction: { patientName: 'Rajesh Kumar' },
      ...overrides.documentIntelligenceResult,
    },
    coverageResult: { eligible: true },
    financialResult: { claimedAmount: overrides.financialClaimedAmount ?? 1500 },
    policy,
  };
}

function assess(overrides = {}) {
  return assessFraudRisk(baseInput(overrides), [], overrides.options || {});
}

test('flags high value claims', () => {
  const result = assess({
    claim: { claimedAmount: 30000 },
    financialClaimedAmount: 30000,
  });

  assert.ok(result.riskFlags.includes('HIGH_VALUE_CLAIM'));
  assert.strictEqual(result.riskScore, 20);
  assert.strictEqual(result.riskLevel, 'LOW');
  assert.ok(result.trace.some((entry) => entry.step === 'HIGH_VALUE_CHECK'));
});

test('flags document alteration fraud signals', () => {
  const result = assess({
    documentIntelligenceResult: {
      overallConfidence: 0.9,
      documents: [
        {
          documentType: 'HOSPITAL_BILL',
          overallDocumentConfidence: 0.9,
          fraudSignals: ['DOCUMENT_ALTERATION'],
          extractedData: {
            patientName: 'Rajesh Kumar',
            billNumber: 'INV-1',
            totalAmount: 1500,
          },
          missingFields: [],
        },
      ],
    },
  });

  assert.ok(result.riskFlags.includes('DOCUMENT_ALTERATION'));
  assert.strictEqual(result.riskScore, 40);
  assert.strictEqual(result.riskLevel, 'MEDIUM');
});

test('flags duplicate stamp fraud signals', () => {
  const result = assess({
    documentIntelligenceResult: {
      overallConfidence: 0.9,
      documents: [
        {
          documentType: 'PRESCRIPTION',
          overallDocumentConfidence: 0.9,
          fraudSignals: ['DUPLICATE_STAMP'],
          extractedData: {
            patientName: 'Rajesh Kumar',
            doctorRegistration: 'MCI-123',
          },
          missingFields: [],
        },
      ],
    },
  });

  assert.ok(result.riskFlags.includes('DUPLICATE_STAMP'));
  assert.strictEqual(result.riskScore, 20);
  assert.strictEqual(result.riskLevel, 'LOW');
});

test('flags low confidence documents', () => {
  const result = assess({
    documentIntelligenceResult: {
      overallConfidence: 0.55,
      documents: [
        {
          documentType: 'PRESCRIPTION',
          overallDocumentConfidence: 0.55,
          fraudSignals: [],
          extractedData: {
            patientName: 'Rajesh Kumar',
            doctorRegistration: 'MCI-123',
          },
          missingFields: [],
        },
      ],
    },
  });

  assert.ok(result.riskFlags.includes('LOW_CONFIDENCE_DOCUMENTS'));
  assert.strictEqual(result.riskScore, 20);
});

test('flags same-day claim limit breaches', () => {
  const result = assess({
    options: {
      claimHistoryService: {
        getSameDayClaimCount: () => 3,
        getMonthlyClaimCount: () => 1,
      },
    },
  });

  assert.ok(result.riskFlags.includes('SAME_DAY_LIMIT_EXCEEDED'));
  assert.strictEqual(result.riskScore, 30);
  assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
});

test('forces manual review when same-day limit is exceeded', () => {
  const result = assess({
    options: {
      claimHistoryService: {
        getSameDayClaimCount: () => 3,
        getMonthlyClaimCount: () => 0,
      },
    },
  });

  assert.strictEqual(result.requiresManualReview, true);
  assert.strictEqual(result.manualReviewTriggeredByRule, true);
  assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
  assert.ok(
    result.manualReviewReasons.some((reason) => reason.includes('Same-day claim count'))
  );
  assert.ok(
    result.trace.some(
      (entry) => entry.step === 'MANUAL_REVIEW_OVERRIDE' && entry.status === 'WARNING'
    )
  );
});

test('flags monthly claim limit breaches', () => {
  const result = assess({
    options: {
      claimHistoryService: {
        getSameDayClaimCount: () => 0,
        getMonthlyClaimCount: () => 7,
      },
    },
  });

  assert.ok(result.riskFlags.includes('MONTHLY_LIMIT_EXCEEDED'));
  assert.strictEqual(result.riskScore, 30);
  assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
});

test('forces manual review when monthly limit is exceeded', () => {
  const result = assess({
    options: {
      claimHistoryService: {
        getSameDayClaimCount: () => 0,
        getMonthlyClaimCount: () => 7,
      },
    },
  });

  assert.strictEqual(result.requiresManualReview, true);
  assert.strictEqual(result.manualReviewTriggeredByRule, true);
  assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
  assert.ok(
    result.manualReviewReasons.some((reason) => reason.includes('Monthly claim count'))
  );
});

test('forces manual review when alteration and amount mismatch coexist', () => {
  const result = assess({
    documentIntelligenceResult: {
      overallConfidence: 0.9,
      documents: [
        {
          documentType: 'HOSPITAL_BILL',
          overallDocumentConfidence: 0.9,
          fraudSignals: ['DOCUMENT_ALTERATION', 'AMOUNT_MISMATCH'],
          extractedData: {
            patientName: 'Rajesh Kumar',
            billNumber: 'INV-1',
            totalAmount: 1500,
          },
          missingFields: [],
        },
      ],
    },
  });

  assert.strictEqual(result.riskScore, 80);
  assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
  assert.strictEqual(result.requiresManualReview, true);
  assert.strictEqual(result.manualReviewTriggeredByRule, true);
  assert.ok(
    result.manualReviewReasons.some((reason) => reason.includes('Document alteration'))
  );
});

test('normal risk scoring still works without hard-rule override', () => {
  const result = assess({
    claim: { claimedAmount: 30000 },
    financialClaimedAmount: 30000,
  });

  assert.strictEqual(result.riskScore, 20);
  assert.strictEqual(result.riskLevel, 'LOW');
  assert.strictEqual(result.requiresManualReview, false);
  assert.strictEqual(result.manualReviewTriggeredByRule, false);
  assert.deepStrictEqual(result.manualReviewReasons, []);
  assert.ok(
    result.trace.some(
      (entry) => entry.step === 'MANUAL_REVIEW_OVERRIDE' && entry.status === 'PASS'
    )
  );
});

test('routes to manual review when score exceeds threshold', () => {
  const result = assess({
    claim: { claimedAmount: 30000 },
    financialClaimedAmount: 30000,
    documentIntelligenceResult: {
      overallConfidence: 0.55,
      documents: [
        {
          documentType: 'HOSPITAL_BILL',
          overallDocumentConfidence: 0.55,
          fraudSignals: ['DOCUMENT_ALTERATION', 'AMOUNT_MISMATCH', 'OVERWRITTEN_VALUES'],
          extractedData: {
            patientName: 'Rajesh Kumar',
            billNumber: 'INV-1',
            totalAmount: 30000,
          },
          missingFields: [],
        },
      ],
    },
    options: {
      claimHistoryService: {
        getSameDayClaimCount: () => 3,
        getMonthlyClaimCount: () => 0,
      },
    },
  });

  assert.strictEqual(result.riskScore, 190);
  assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
  assert.strictEqual(result.requiresManualReview, true);
  assert.ok(result.trace.some((entry) => entry.step === 'RISK_SCORING'));
});

test('flags critical missing fields', () => {
  const result = assess({
    documentIntelligenceResult: {
      overallConfidence: 0.9,
      documents: [
        {
          documentType: 'HOSPITAL_BILL',
          overallDocumentConfidence: 0.9,
          fraudSignals: [],
          extractedData: {
            hospitalName: 'City Hospital',
          },
          missingFields: ['patientName', 'totalAmount', 'billNumber'],
        },
      ],
      aggregatedExtraction: {},
    },
  });

  assert.ok(result.riskFlags.includes('CRITICAL_FIELDS_MISSING'));
  assert.strictEqual(result.riskScore, 20);
});

console.log('\nAll fraudRiskAgent tests passed.');
