const assert = require('assert');
const {
  processClaimIntake,
  normalizeClaimType,
  normalizeRelationship,
} = require('./claimIntake');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('normalizes claim type aliases', () => {
  assert.strictEqual(normalizeClaimType('consultation'), 'CONSULTATION');
  assert.strictEqual(normalizeClaimType('Consultation'), 'CONSULTATION');
  assert.strictEqual(normalizeClaimType('CONSULTATION'), 'CONSULTATION');
  assert.strictEqual(normalizeClaimType('alternative medicine'), 'ALTERNATIVE_MEDICINE');
});

test('normalizes relationship aliases', () => {
  assert.strictEqual(normalizeRelationship('self'), 'SELF');
  assert.strictEqual(normalizeRelationship('Spouse'), 'SPOUSE');
});

test('fails when treatment date is missing', () => {
  const result = processClaimIntake({
    body: {
      memberId: 'EMP001',
      relationship: 'SELF',
      claimType: 'CONSULTATION',
      claimedAmount: '1500',
      claimSubmissionDate: '2024-11-02',
    },
    files: [{ originalname: 'bill.pdf', path: 'uploads/bill.pdf', mimetype: 'application/pdf' }],
    jsonDocuments: [],
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Treatment date missing');
  assert.ok(result.trace.some((entry) => entry.step === 'SCHEMA_VALIDATION'));
});

test('passes with normalized claim and trace', () => {
  const result = processClaimIntake({
    body: {
      memberId: ' EMP001 ',
      relationship: 'spouse',
      claimType: 'consultation',
      claimedAmount: '1500',
      treatmentDate: '2024-11-01',
      claimSubmissionDate: '2024-11-02',
      memberName: 'Jane Doe',
    },
    files: [
      {
        originalname: 'prescription.pdf',
        path: 'uploads/prescription.pdf',
        mimetype: 'application/pdf',
      },
    ],
    jsonDocuments: [],
  });

  assert.strictEqual(result.success, true);
  assert.ok(result.data.claimId.startsWith('CLM_'));
  assert.strictEqual(result.data.memberId, 'EMP001');
  assert.strictEqual(result.data.relationship, 'SPOUSE');
  assert.strictEqual(result.data.claimType, 'CONSULTATION');
  assert.strictEqual(result.data.claimedAmount, 1500);
  assert.strictEqual(result.data.uploadedDocuments.length, 1);
  assert.deepStrictEqual(
    result.trace.map((entry) => entry.step),
    ['CLAIM_RECEIVED', 'SCHEMA_VALIDATION', 'NORMALIZATION']
  );
});

test('accepts json documents for test mode', () => {
  const result = processClaimIntake({
    body: {
      member_id: 'EMP001',
      claim_category: 'PHARMACY',
      relationship: 'SELF',
      claimed_amount: 800,
      treatment_date: '2024-10-25',
      submission_date: '2024-10-26',
    },
    files: [],
    jsonDocuments: [
      { file_id: 'F003', file_name: 'prescription.jpg', actual_type: 'PRESCRIPTION' },
    ],
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.uploadedDocuments[0].documentType, 'PRESCRIPTION');
  assert.ok(result.data.uploadedDocuments[0].filePath.startsWith('virtual://'));
});

console.log('\nAll claim intake tests passed.');
