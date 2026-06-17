const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  evaluateCoveragePolicy,
  evaluateDocumentRequirements,
  calculateEligibleFromDate,
} = require('./coveragePolicyAgent');

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

function baseMember(overrides = {}) {
  return {
    memberId: 'EMP001',
    name: 'Rajesh Kumar',
    relationship: 'SELF',
    joinDate: '2024-04-01',
    ...overrides,
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

function documentsWithTypes(types, options = {}) {
  return {
    success: true,
    documents: types.map((documentType, index) => ({
      fileName: options.fileNames?.[index] || `document_${index + 1}.pdf`,
      documentType,
      classificationConfidence: 0.9,
      extractionConfidence: 0.9,
      qualityConfidence: 0.9,
      overallDocumentConfidence: 0.9,
      extractedData: {},
      warnings: options.warnings?.[index] || [],
      missingFields: [],
      fraudSignals: [],
    })),
    aggregatedExtraction: {
      patientName: 'Rajesh Kumar',
      diagnosis: [],
      procedures: [],
      medicines: [],
      tests: [],
      doctors: [],
      hospitals: [],
      treatmentDate: null,
      totalClaimAmount: null,
    },
  };
}

function evaluateRequirements(overrides = {}) {
  return evaluateDocumentRequirements({
    claim: baseClaim(overrides.claim),
    policy,
    documentIntelligenceResult:
      overrides.documentIntelligenceResult || documentsWithTypes(['PRESCRIPTION', 'HOSPITAL_BILL']),
  });
}

function evaluate(overrides = {}) {
  return evaluateCoveragePolicy({
    claim: baseClaim(overrides.claim),
    member: baseMember(overrides.member),
    validation: overrides.validation || { policyActive: true },
    documentIntelligenceResult:
      overrides.documentIntelligenceResult || documentsWithTypes(['PRESCRIPTION', 'HOSPITAL_BILL']),
    policy,
  });
}

test('approves covered consultation with required documents', () => {
  const result = evaluate();

  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.coverageChecks.categoryCovered, true);
  assert.strictEqual(result.coverageChecks.documentsValid, true);
  assert.strictEqual(result.coverageChecks.waitingPeriodPassed, true);
  assert.strictEqual(result.coverageChecks.exclusionMatched, false);
  assert.ok(result.trace.some((entry) => entry.step === 'CATEGORY_COVERAGE' && entry.status === 'PASS'));
});

test('flags missing hospital bill for upload', () => {
  const result = evaluateRequirements({
    documentIntelligenceResult: documentsWithTypes(['PRESCRIPTION', 'PRESCRIPTION']),
  });

  assert.strictEqual(result.actionRequired, true);
  assert.strictEqual(result.status, 'PENDING_DOCUMENT_UPLOAD');
  assert.deepStrictEqual(result.uploadedDocumentTypes, ['PRESCRIPTION', 'PRESCRIPTION']);
  assert.deepStrictEqual(result.missingDocumentTypes, ['HOSPITAL_BILL']);
  assert.strictEqual(result.message, 'Hospital Bill is required.');
  assert.ok(
    result.trace.some(
      (entry) => entry.step === 'DOCUMENT_COMPLETENESS_CHECK' && entry.status === 'FAIL'
    )
  );
});

test('flags missing prescription for upload', () => {
  const result = evaluateRequirements({
    documentIntelligenceResult: documentsWithTypes(['HOSPITAL_BILL']),
  });

  assert.strictEqual(result.actionRequired, true);
  assert.strictEqual(result.status, 'PENDING_DOCUMENT_UPLOAD');
  assert.deepStrictEqual(result.missingDocumentTypes, ['PRESCRIPTION']);
  assert.strictEqual(result.message, 'Prescription is required.');
});

test('flags unreadable hospital bill for re-upload', () => {
  const result = evaluateRequirements({
    documentIntelligenceResult: documentsWithTypes(['PRESCRIPTION', 'HOSPITAL_BILL'], {
      fileNames: ['prescription.jpg', 'blurry_bill.jpg'],
      warnings: [[], ['BLUR_DETECTED']],
    }),
  });

  assert.strictEqual(result.actionRequired, true);
  assert.strictEqual(result.status, 'PENDING_DOCUMENT_REUPLOAD');
  assert.deepStrictEqual(result.documents, [
    { fileName: 'blurry_bill.jpg', reason: 'Unreadable document' },
  ]);
  assert.ok(
    result.trace.some(
      (entry) => entry.step === 'DOCUMENT_REUPLOAD_REQUIRED' && entry.status === 'FAIL'
    )
  );
});

test('flags multiple unreadable documents for re-upload', () => {
  const result = evaluateRequirements({
    documentIntelligenceResult: documentsWithTypes(
      ['PRESCRIPTION', 'HOSPITAL_BILL', 'LAB_REPORT'],
      {
        fileNames: ['blurry_rx.jpg', 'blurry_bill.jpg', 'partial_lab.jpg'],
        warnings: [['LOW_IMAGE_QUALITY'], ['BLUR_DETECTED'], ['PARTIAL_DOCUMENT']],
      }
    ),
    claim: baseClaim({ claimType: 'DIAGNOSTIC' }),
  });

  assert.strictEqual(result.actionRequired, true);
  assert.strictEqual(result.status, 'PENDING_DOCUMENT_REUPLOAD');
  assert.strictEqual(result.documents.length, 3);
  assert.strictEqual(result.documents[0].fileName, 'blurry_rx.jpg');
  assert.strictEqual(result.documents[1].fileName, 'blurry_bill.jpg');
  assert.strictEqual(result.documents[2].fileName, 'partial_lab.jpg');
});

test('passes when required documents are present and readable', () => {
  const result = evaluateRequirements();

  assert.strictEqual(result.actionRequired, false);
  assert.strictEqual(result.status, null);
  assert.ok(
    result.trace.some(
      (entry) => entry.step === 'DOCUMENT_COMPLETENESS_CHECK' && entry.status === 'PASS'
    )
  );
  assert.ok(
    result.trace.some(
      (entry) => entry.step === 'DOCUMENT_REUPLOAD_REQUIRED' && entry.status === 'PASS'
    )
  );
});

test('coverage evaluation warns when required document is missing', () => {
  const result = evaluate({
    documentIntelligenceResult: documentsWithTypes(['PRESCRIPTION']),
  });

  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.coverageChecks.documentsValid, false);
  assert.ok(result.coverageWarnings.some((warning) => warning.includes('Hospital Bill is required')));
  assert.strictEqual(result.coverageFailures.length, 0);
});

function evaluateWithDiagnosis(diagnosis, overrides = {}) {
  return evaluate({
    ...overrides,
    member: baseMember({ joinDate: '2024-09-01', ...(overrides.member || {}) }),
    claim: baseClaim({
      treatmentDate: '2024-10-01',
      metadata: { diagnosis },
      ...(overrides.claim || {}),
    }),
    documentIntelligenceResult: {
      ...documentsWithTypes(['PRESCRIPTION', 'HOSPITAL_BILL']),
      aggregatedExtraction: {
        diagnosis: [diagnosis],
        procedures: [],
        medicines: [],
        tests: [],
        doctors: [],
        hospitals: [],
        treatmentDate: null,
        totalClaimAmount: null,
      },
      ...(overrides.documentIntelligenceResult || {}),
    },
  });
}

function getWaitingPeriodFailure(result) {
  return result.coverageFailures.find(
    (failure) => typeof failure === 'object' && failure.code === 'WAITING_PERIOD'
  );
}

test('calculateEligibleFromDate adds waiting days from join date', () => {
  assert.strictEqual(calculateEligibleFromDate('2024-09-01', 90), '2024-11-30');
  assert.strictEqual(calculateEligibleFromDate('2024-09-01', 30), '2024-10-01');
});

test('rejects claim inside initial waiting period with eligible date', () => {
  const result = evaluate({
    member: baseMember({ joinDate: '2024-09-01' }),
    claim: baseClaim({ treatmentDate: '2024-09-15' }),
  });

  const failure = getWaitingPeriodFailure(result);

  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.coverageChecks.waitingPeriodPassed, false);
  assert.deepStrictEqual(failure, {
    code: 'WAITING_PERIOD',
    diagnosis: 'Initial waiting period',
    eligibleFromDate: '2024-10-01',
  });
  assert.ok(
    result.trace.some(
      (entry) => entry.step === 'WAITING_PERIOD_CALCULATION' && entry.status === 'FAIL'
    )
  );
});

test('rejects diabetes claim inside condition waiting period with eligible date', () => {
  const result = evaluateWithDiagnosis('Type 2 Diabetes Mellitus', {
    claim: { treatmentDate: '2024-10-15' },
  });

  const failure = getWaitingPeriodFailure(result);

  assert.strictEqual(result.eligible, false);
  assert.deepStrictEqual(failure, {
    code: 'WAITING_PERIOD',
    diagnosis: 'Type 2 Diabetes Mellitus',
    eligibleFromDate: '2024-11-30',
  });
});

test('rejects hypertension claim inside condition waiting period with eligible date', () => {
  const result = evaluateWithDiagnosis('Essential Hypertension', {
    claim: { treatmentDate: '2024-11-01' },
  });

  const failure = getWaitingPeriodFailure(result);

  assert.strictEqual(result.eligible, false);
  assert.strictEqual(failure.diagnosis, 'Essential Hypertension');
  assert.strictEqual(failure.eligibleFromDate, '2024-11-30');
});

test('rejects maternity claim inside condition waiting period with eligible date', () => {
  const result = evaluateWithDiagnosis('Maternity care', {
    claim: { treatmentDate: '2025-01-15' },
  });

  const failure = getWaitingPeriodFailure(result);

  assert.strictEqual(result.eligible, false);
  assert.strictEqual(failure.diagnosis, 'Maternity care');
  assert.strictEqual(failure.eligibleFromDate, calculateEligibleFromDate('2024-09-01', 270));
});

test('rejects excluded diagnosis', () => {
  const result = evaluate({
    claim: baseClaim({
      metadata: { diagnosis: 'Cosmetic or aesthetic procedures' },
    }),
    documentIntelligenceResult: {
      ...documentsWithTypes(['PRESCRIPTION', 'HOSPITAL_BILL']),
      aggregatedExtraction: {
        diagnosis: ['Cosmetic or aesthetic procedures'],
        procedures: [],
        medicines: [],
        tests: [],
      },
    },
  });

  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.coverageChecks.exclusionMatched, true);
  assert.ok(result.coverageFailures.some((failure) => failure.includes('exclusion')));
});

test('rejects diagnostic claim when pre-authorization is missing', () => {
  const result = evaluate({
    claim: baseClaim({
      claimType: 'DIAGNOSTIC',
      claimedAmount: 15000,
      metadata: { procedureName: 'MRI scan' },
    }),
    documentIntelligenceResult: {
      ...documentsWithTypes(['PRESCRIPTION', 'LAB_REPORT', 'HOSPITAL_BILL']),
      aggregatedExtraction: {
        diagnosis: [],
        procedures: ['MRI scan'],
        tests: [{ testName: 'MRI scan' }],
        medicines: [],
      },
    },
  });

  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.coverageChecks.preAuthSatisfied, false);
  assert.ok(result.coverageFailures.some((failure) => failure.includes('Pre-authorization required')));
});

test('approves covered dental procedure', () => {
  const result = evaluate({
    claim: baseClaim({
      claimType: 'DENTAL',
      metadata: { procedureName: 'Root Canal Treatment' },
    }),
    documentIntelligenceResult: {
      ...documentsWithTypes(['HOSPITAL_BILL']),
      aggregatedExtraction: {
        diagnosis: [],
        procedures: ['Root Canal Treatment'],
        medicines: [],
        tests: [],
      },
    },
  });

  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.coverageChecks.procedureCovered, true);
  assert.ok(result.trace.some((entry) => entry.step === 'PROCEDURE_COVERAGE' && entry.status === 'PASS'));
});

test('rejects non-covered dental procedure', () => {
  const result = evaluate({
    claim: baseClaim({
      claimType: 'DENTAL',
      metadata: { procedureName: 'Teeth Whitening' },
    }),
    documentIntelligenceResult: {
      ...documentsWithTypes(['HOSPITAL_BILL']),
      aggregatedExtraction: {
        diagnosis: [],
        procedures: ['Teeth Whitening'],
        medicines: [],
        tests: [],
      },
    },
  });

  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.coverageChecks.procedureCovered, false);
  assert.ok(result.coverageFailures.some((failure) => failure.includes('not covered')));
});

console.log('\nAll coveragePolicyAgent tests passed.');
