const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { adjudicateFinancialClaim } = require('./financialAdjudicationAgent');

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

function baseMember() {
  return {
    memberId: 'EMP001',
    name: 'Rajesh Kumar',
    relationship: 'SELF',
    joinDate: '2024-04-01',
  };
}

function baseClaim(overrides = {}) {
  return {
    claimId: 'CLM_test0001',
    claimType: 'CONSULTATION',
    memberId: 'EMP001',
    treatmentDate: '2024-11-01',
    claimedAmount: 1500,
    metadata: {},
    ...overrides,
  };
}

function adjudicate(overrides = {}) {
  return adjudicateFinancialClaim(
    {
      claim: baseClaim(overrides.claim),
      member: baseMember(),
      coverageResult: overrides.coverageResult || { eligible: true },
      documentIntelligenceResult: overrides.documentIntelligenceResult || { documents: [] },
      policy,
    },
    [],
    overrides.options || {}
  );
}

function adjustmentAmount(result, type) {
  return result.adjustments
    .filter((adjustment) => adjustment.type === type)
    .reduce((sum, adjustment) => sum + adjustment.amountReduced, 0);
}

function dentalBillWithLineItems(lineItems) {
  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    documents: [
      {
        documentType: 'HOSPITAL_BILL',
        extractedData: {
          totalAmount,
          lineItems,
        },
      },
    ],
  };
}

test('adjudicates mixed approved and rejected dental line items', () => {
  const result = adjudicate({
    claim: { claimType: 'DENTAL', claimedAmount: 5000 },
    documentIntelligenceResult: dentalBillWithLineItems([
      { description: 'Root Canal Treatment', amount: 3000 },
      { description: 'Teeth Whitening', amount: 2000 },
    ]),
  });

  assert.strictEqual(result.lineItemDecisions.length, 2);
  assert.deepStrictEqual(result.lineItemDecisions[0], {
    description: 'Root Canal Treatment',
    amount: 3000,
    decision: 'APPROVED',
    reason: 'Covered dental procedure',
  });
  assert.deepStrictEqual(result.lineItemDecisions[1], {
    description: 'Teeth Whitening',
    amount: 2000,
    decision: 'REJECTED',
    reason: 'Cosmetic procedure excluded',
  });
  assert.strictEqual(result.claimedAmount, 5000);
  assert.strictEqual(result.approvedAmount, 3000);
  assert.strictEqual(result.patientPayable, 2000);
  assert.ok(result.trace.some((entry) => entry.step === 'LINE_ITEM_EVALUATION'));
});

test('adjudicates all approved dental line items', () => {
  const result = adjudicate({
    claim: { claimType: 'DENTAL', claimedAmount: 4000 },
    documentIntelligenceResult: dentalBillWithLineItems([
      { description: 'Root Canal Treatment', amount: 2000 },
      { description: 'Dental Filling', amount: 2000 },
    ]),
  });

  assert.strictEqual(result.lineItemDecisions.every((item) => item.decision === 'APPROVED'), true);
  assert.strictEqual(result.approvedAmount, 4000);
  assert.strictEqual(result.patientPayable, 0);
});

test('adjudicates all rejected dental line items', () => {
  const result = adjudicate({
    claim: { claimType: 'DENTAL', claimedAmount: 9000 },
    documentIntelligenceResult: dentalBillWithLineItems([
      { description: 'Teeth Whitening', amount: 4000 },
      { description: 'Veneers', amount: 5000 },
    ]),
  });

  assert.strictEqual(result.lineItemDecisions.every((item) => item.decision === 'REJECTED'), true);
  assert.strictEqual(result.approvedAmount, 0);
  assert.strictEqual(result.patientPayable, 9000);
});

test('rejects dental exclusions at line-item level', () => {
  const result = adjudicate({
    claim: { claimType: 'DENTAL', claimedAmount: 15000 },
    documentIntelligenceResult: dentalBillWithLineItems([
      { description: 'Orthodontic Treatment (Braces)', amount: 15000 },
    ]),
  });

  assert.strictEqual(result.lineItemDecisions[0].decision, 'REJECTED');
  assert.strictEqual(result.lineItemDecisions[0].reason, 'Cosmetic procedure excluded');
  assert.strictEqual(result.approvedAmount, 0);
});

test('adjudicates mixed approved and rejected vision line items', () => {
  const result = adjudicate({
    claim: { claimType: 'VISION', claimedAmount: 7000 },
    documentIntelligenceResult: dentalBillWithLineItems([
      { description: 'Glasses', amount: 3000 },
      { description: 'LASIK Surgery', amount: 4000 },
    ]),
  });

  assert.deepStrictEqual(result.lineItemDecisions[0], {
    description: 'Glasses',
    amount: 3000,
    decision: 'APPROVED',
    reason: 'Covered vision item',
  });
  assert.deepStrictEqual(result.lineItemDecisions[1], {
    description: 'LASIK Surgery',
    amount: 4000,
    decision: 'REJECTED',
    reason: 'Excluded vision item',
  });
  assert.strictEqual(result.approvedAmount, 3000);
  assert.strictEqual(result.patientPayable, 4000);
});

test('rejects vision exclusions at line-item level', () => {
  const result = adjudicate({
    claim: { claimType: 'VISION', claimedAmount: 5000 },
    documentIntelligenceResult: dentalBillWithLineItems([
      { description: 'Refractive Surgery', amount: 5000 },
    ]),
  });

  assert.strictEqual(result.lineItemDecisions[0].decision, 'REJECTED');
  assert.strictEqual(result.lineItemDecisions[0].reason, 'Excluded vision item');
  assert.strictEqual(result.approvedAmount, 0);
});

test('applies consultation sub-limit', () => {
  const result = adjudicate({
    claim: { claimType: 'CONSULTATION', claimedAmount: 2500 },
  });

  assert.strictEqual(result.claimedAmount, 2500);
  assert.strictEqual(result.eligibleAmount, 2000);
  assert.strictEqual(adjustmentAmount(result, 'SUB_LIMIT'), 500);
  assert.ok(result.trace.some((entry) => entry.step === 'SUB_LIMIT'));
});

test('applies per-claim limit after sub-limit', () => {
  const result = adjudicate({
    claim: { claimType: 'DIAGNOSTIC', claimedAmount: 12000 },
  });

  assert.strictEqual(result.eligibleAmount, 5000);
  assert.strictEqual(adjustmentAmount(result, 'SUB_LIMIT'), 2000);
  assert.strictEqual(adjustmentAmount(result, 'PER_CLAIM_LIMIT'), 5000);
});

test('applies network discount before copay', () => {
  const result = adjudicate({
    claim: {
      claimType: 'CONSULTATION',
      claimedAmount: 2000,
      metadata: { hospitalName: 'Apollo Hospitals' },
    },
  });

  assert.strictEqual(result.eligibleAmount, 2000);
  assert.strictEqual(adjustmentAmount(result, 'NETWORK_DISCOUNT'), 400);
  assert.strictEqual(adjustmentAmount(result, 'COPAY'), 160);
  assert.strictEqual(result.approvedAmount, 1440);
  assert.strictEqual(result.isNetworkHospital, true);
});

test('applies consultation copay', () => {
  const result = adjudicate({
    claim: { claimType: 'CONSULTATION', claimedAmount: 2000 },
  });

  assert.strictEqual(result.eligibleAmount, 2000);
  assert.strictEqual(adjustmentAmount(result, 'COPAY'), 200);
  assert.strictEqual(result.approvedAmount, 1800);
  assert.strictEqual(result.patientPayable, 200);
});

test('applies annual limit using injected claim history', () => {
  const result = adjudicate({
    claim: { claimType: 'CONSULTATION', claimedAmount: 2000 },
    options: {
      claimHistoryService: {
        getAnnualUsedAmount: () => 49000,
        getFamilyFloaterUsedAmount: () => 0,
      },
    },
  });

  assert.strictEqual(result.eligibleAmount, 1000);
  assert.strictEqual(adjustmentAmount(result, 'ANNUAL_LIMIT'), 1000);
});

test('applies family floater limit using injected claim history', () => {
  const result = adjudicate({
    claim: { claimType: 'CONSULTATION', claimedAmount: 2000 },
    options: {
      claimHistoryService: {
        getAnnualUsedAmount: () => 0,
        getFamilyFloaterUsedAmount: () => 149500,
      },
    },
  });

  assert.strictEqual(result.eligibleAmount, 500);
  assert.strictEqual(adjustmentAmount(result, 'FAMILY_FLOATER'), 1500);
});

test('applies multiple adjustments in sequence', () => {
  const result = adjudicate({
    claim: {
      claimType: 'CONSULTATION',
      claimedAmount: 7000,
      metadata: { hospitalName: 'Apollo Hospitals' },
    },
    options: {
      claimHistoryService: {
        getAnnualUsedAmount: () => 0,
        getFamilyFloaterUsedAmount: () => 0,
      },
    },
  });

  assert.strictEqual(result.claimedAmount, 7000);
  assert.strictEqual(result.eligibleAmount, 2000);
  assert.strictEqual(adjustmentAmount(result, 'SUB_LIMIT'), 5000);
  assert.strictEqual(adjustmentAmount(result, 'PER_CLAIM_LIMIT'), 0);
  assert.strictEqual(adjustmentAmount(result, 'NETWORK_DISCOUNT'), 400);
  assert.strictEqual(adjustmentAmount(result, 'COPAY'), 160);
  assert.ok(result.adjustments.length >= 3);
  assert.strictEqual(result.approvedAmount, 1440);
  assert.strictEqual(result.patientPayable, 5560);
});

test('uses extracted hospital bill total as base amount', () => {
  const result = adjudicate({
    claim: { claimType: 'CONSULTATION', claimedAmount: 1500 },
    documentIntelligenceResult: {
      documents: [
        {
          documentType: 'HOSPITAL_BILL',
          extractedData: { totalAmount: 2200, hospitalName: 'Apollo Hospitals' },
        },
      ],
    },
  });

  assert.strictEqual(result.claimedAmount, 2200);
  assert.ok(result.trace.some((entry) => entry.step === 'BASE_AMOUNT' && entry.message.includes('HOSPITAL_BILL')));
});

test('returns zero approved amount when coverage is ineligible', () => {
  const result = adjudicate({
    claim: { claimType: 'CONSULTATION', claimedAmount: 2000 },
    coverageResult: { eligible: false },
  });

  assert.strictEqual(result.approvedAmount, 0);
  assert.strictEqual(result.patientPayable, 2000);
});

console.log('\nAll financialAdjudicationAgent tests passed.');
