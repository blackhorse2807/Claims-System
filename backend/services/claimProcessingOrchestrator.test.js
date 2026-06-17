const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  processClaim,
  persistClaimResult,
} = require('./claimProcessingOrchestrator');

const SAMPLE_BASE64 = Buffer.from('fake-image-bytes').toString('base64');

function createTempClaimsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claims-test-'));
}

function cleanupDir(dirPath) {
  if (dirPath && fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function mockIntakeSuccess(overrides = {}) {
  return () => ({
    success: true,
    trace: [{ step: 'CLAIM_RECEIVED', status: 'PASS', message: 'ok', timestamp: new Date().toISOString() }],
    data: {
      claimId: 'CLM_test0001',
      memberId: 'EMP001',
      relationship: 'SELF',
      claimType: 'CONSULTATION',
      claimedAmount: 1500,
      treatmentDate: '2024-11-01',
      submissionDate: '2024-11-02',
      uploadedDocuments: [
        {
          id: 'doc-1',
          originalName: 'prescription.jpg',
          base64: SAMPLE_BASE64,
          mimeType: 'image/jpeg',
        },
        {
          id: 'doc-2',
          originalName: 'bill.pdf',
          base64: SAMPLE_BASE64,
          mimeType: 'application/pdf',
        },
      ],
      metadata: {},
      ...overrides,
    },
  });
}

function mockMemberSuccess() {
  return () => ({
    success: true,
    trace: [{ step: 'MEMBER_LOOKUP', status: 'PASS', message: 'ok', timestamp: new Date().toISOString() }],
    data: {
      claim: {},
      member: {
        memberId: 'EMP001',
        name: 'Rajesh Kumar',
        relationship: 'SELF',
        joinDate: '2024-04-01',
      },
      validation: { policyActive: true },
    },
  });
}

function mockDocumentIntelligence(overrides = {}) {
  return async () => ({
    success: true,
    documents: [
      {
        fileName: 'prescription.jpg',
        documentType: 'PRESCRIPTION',
        overallDocumentConfidence: 0.9,
        extractedData: { patientName: 'Rajesh Kumar', doctorRegistration: 'MCI-1' },
        warnings: [],
        missingFields: [],
        fraudSignals: [],
      },
      {
        fileName: 'bill.pdf',
        documentType: 'HOSPITAL_BILL',
        overallDocumentConfidence: 0.9,
        extractedData: { patientName: 'Rajesh Kumar', billNumber: 'INV-1', totalAmount: 1500 },
        warnings: [],
        missingFields: [],
        fraudSignals: [],
      },
    ],
    aggregatedExtraction: {
      patientName: 'Rajesh Kumar',
      diagnosis: [],
      procedures: [],
      medicines: [],
      tests: [],
    },
    overallConfidence: 0.9,
    warnings: [],
    patientConsistencyCheck: {
      passed: true,
      issue: null,
      details: { detectedPatients: ['Rajesh Kumar'] },
      message: 'All documents belong to same patient.',
    },
    trace: [{ step: 'DOCUMENT_AGGREGATION', status: 'PASS', message: 'ok', timestamp: new Date().toISOString() }],
    ...overrides,
  });
}

function mockCoverage(eligible = true) {
  return () => ({
    eligible,
    coverageChecks: {
      categoryCovered: eligible,
      documentsValid: eligible,
      waitingPeriodPassed: true,
      procedureCovered: true,
      exclusionMatched: false,
      preAuthSatisfied: true,
    },
    coverageWarnings: [],
    coverageFailures: eligible ? [] : ['Missing required documents: HOSPITAL_BILL'],
    trace: [{ step: 'CATEGORY_COVERAGE', status: eligible ? 'PASS' : 'FAIL', message: 'ok', timestamp: new Date().toISOString() }],
  });
}

function mockFinancial(overrides = {}) {
  return () => ({
    claimedAmount: 1500,
    approvedAmount: overrides.approvedAmount ?? 1500,
    patientPayable: overrides.patientPayable ?? 0,
    adjustments: overrides.adjustments || [],
    trace: [{ step: 'BASE_AMOUNT', status: 'PASS', message: 'ok', timestamp: new Date().toISOString() }],
    ...overrides,
  });
}

function mockFraud(overrides = {}) {
  return () => ({
    riskScore: overrides.riskScore ?? 10,
    riskLevel: overrides.riskLevel ?? 'LOW',
    riskFlags: overrides.riskFlags || [],
    requiresManualReview: overrides.requiresManualReview ?? false,
    warnings: [],
    trace: [{ step: 'RISK_SCORING', status: 'PASS', message: 'ok', timestamp: new Date().toISOString() }],
    ...overrides,
  });
}

function mockDecision(overrides = {}) {
  return () => ({
    decision: overrides.decision ?? 'APPROVED',
    claimedAmount: overrides.claimedAmount ?? 1500,
    approvedAmount: overrides.approvedAmount ?? 1500,
    patientPayable: overrides.patientPayable ?? 0,
    reasons: overrides.reasons || ['Claim approved for the full adjudicated amount'],
    warnings: [],
    riskLevel: overrides.riskLevel ?? 'LOW',
    confidence: overrides.confidence ?? 0.9,
    trace: [{ step: 'FINAL_DECISION', status: 'PASS', message: 'ok', timestamp: new Date().toISOString() }],
    ...overrides,
  });
}

function baseAgents(overrides = {}) {
  return {
    processClaimIntake: mockIntakeSuccess(overrides.claim),
    validateMember: mockMemberSuccess(),
    processDocumentIntelligence: mockDocumentIntelligence(overrides.documentIntelligence),
    evaluateCoveragePolicy: mockCoverage(overrides.eligible !== false),
    adjudicateFinancialClaim: mockFinancial(overrides.financial),
    assessFraudRisk: mockFraud(overrides.fraud),
    makeClaimDecision: mockDecision(overrides.decisionResult),
    ...overrides.agents,
  };
}

async function runOrchestrator(overrides = {}) {
  const claimsDataDir = overrides.claimsDataDir || createTempClaimsDir();

  const result = await processClaim(
    {
      claimPayload: {
        memberId: 'EMP001',
        relationship: 'SELF',
        claimType: 'CONSULTATION',
        claimedAmount: 1500,
        treatmentDate: '2024-11-01',
        claimSubmissionDate: '2024-11-02',
      },
      uploadedDocuments: { files: [], jsonDocuments: [] },
    },
    {
      agents: baseAgents(overrides),
      skipPersistence: overrides.skipPersistence ?? false,
      claimsDataDir,
    }
  );

  return { result, claimsDataDir };
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

(async function runTests() {
  await asyncTest('happy path orchestrates all agents and persists claim result', async () => {
    const { result, claimsDataDir } = await runOrchestrator();

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.claimId, 'CLM_test0001');
    assert.strictEqual(result.decision, 'APPROVED');
    assert.strictEqual(result.approvedAmount, 1500);
    assert.ok(result.trace.some((entry) => entry.step === 'FINAL_DECISION'));
    assert.ok(fs.existsSync(path.join(claimsDataDir, 'CLM_test0001.json')));

    cleanupDir(claimsDataDir);
  });

  await asyncTest('returns coverage rejection through decision stage', async () => {
    const { result, claimsDataDir } = await runOrchestrator({
      eligible: false,
      decisionResult: {
        decision: 'REJECTED',
        approvedAmount: 0,
        patientPayable: 1500,
        reasons: ['Missing required documents: HOSPITAL_BILL'],
      },
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.decision, 'REJECTED');
    assert.strictEqual(result.approvedAmount, 0);
    assert.strictEqual(result.coverageChecks.documentsValid, false);

    cleanupDir(claimsDataDir);
  });

  await asyncTest('routes manual review claims through the pipeline', async () => {
    const { result, claimsDataDir } = await runOrchestrator({
      fraud: { requiresManualReview: true, riskLevel: 'MANUAL_REVIEW', riskFlags: ['DOCUMENT_ALTERATION'] },
      decisionResult: {
        decision: 'MANUAL_REVIEW',
        approvedAmount: 1500,
        riskLevel: 'MANUAL_REVIEW',
        reasons: ['Manual review required due to fraud risk assessment'],
      },
    });

    assert.strictEqual(result.decision, 'MANUAL_REVIEW');
    assert.strictEqual(result.riskLevel, 'MANUAL_REVIEW');
    assert.ok(result.fraudFlags.includes('DOCUMENT_ALTERATION'));

    cleanupDir(claimsDataDir);
  });

  await asyncTest('supports partial approval outcomes', async () => {
    const { result, claimsDataDir } = await runOrchestrator({
      financial: {
        claimedAmount: 2500,
        approvedAmount: 1800,
        patientPayable: 700,
        adjustments: [
          {
            type: 'SUB_LIMIT',
            description: 'Consultation sub-limit reduced payable amount',
            amountReduced: 500,
          },
        ],
      },
      decisionResult: {
        decision: 'PARTIAL_APPROVED',
        claimedAmount: 2500,
        approvedAmount: 1800,
        patientPayable: 700,
        reasons: ['Approved amount is lower than the claimed amount'],
      },
    });

    assert.strictEqual(result.decision, 'PARTIAL_APPROVED');
    assert.strictEqual(result.approvedAmount, 1800);
    assert.strictEqual(result.adjustments.length, 1);

    cleanupDir(claimsDataDir);
  });

  await asyncTest('continues pipeline when document intelligence reports warnings', async () => {
    const { result, claimsDataDir } = await runOrchestrator({
      documentIntelligence: {
        warnings: ['Extraction failed for bill.pdf: Anthropic request timed out'],
        documents: [
          {
            fileName: 'prescription.jpg',
            documentType: 'PRESCRIPTION',
            overallDocumentConfidence: 0.9,
            extractedData: { patientName: 'Rajesh Kumar' },
            warnings: [],
            missingFields: [],
            fraudSignals: [],
          },
          {
            fileName: 'bill.pdf',
            documentType: 'HOSPITAL_BILL',
            overallDocumentConfidence: 0.45,
            extractedData: {},
            warnings: ['Extraction failed for bill.pdf: Anthropic request timed out'],
            missingFields: ['patientName', 'totalAmount'],
            fraudSignals: [],
          },
        ],
        overallConfidence: 0.45,
      },
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.warnings.some((warning) => warning.includes('bill.pdf')));
    assert.strictEqual(result.decision, 'APPROVED');

    cleanupDir(claimsDataDir);
  });

  await asyncTest('stops pipeline when patient names mismatch across documents', async () => {
    let coverageCalled = false;
    let decisionCalled = false;

    const { result, claimsDataDir } = await runOrchestrator({
      agents: {
        ...baseAgents(),
        evaluateCoveragePolicy: () => {
          coverageCalled = true;
          return mockCoverage()();
        },
        makeClaimDecision: () => {
          decisionCalled = true;
          return mockDecision()();
        },
        processDocumentIntelligence: mockDocumentIntelligence({
          patientConsistencyCheck: {
            passed: false,
            issue: 'PATIENT_MISMATCH',
            details: { detectedPatients: ['Rajesh Kumar', 'Arjun Mehta'] },
            message: 'Uploaded documents belong to different patients.',
          },
          trace: [
            {
              step: 'PATIENT_CONSISTENCY_CHECK',
              status: 'FAIL',
              message: 'Different patient names detected.',
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      },
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.blocked, true);
    assert.strictEqual(result.stage, 'DOCUMENT_INTELLIGENCE');
    assert.strictEqual(result.status, 'DOCUMENT_MISMATCH');
    assert.strictEqual(result.decision, null);
    assert.strictEqual(result.error, 'Uploaded documents belong to different patients.');
    assert.strictEqual(result.patientConsistencyCheck.issue, 'PATIENT_MISMATCH');
    assert.deepStrictEqual(result.patientConsistencyCheck.details.detectedPatients, [
      'Rajesh Kumar',
      'Arjun Mehta',
    ]);
    assert.strictEqual(coverageCalled, false);
    assert.strictEqual(decisionCalled, false);
    assert.ok(
      result.trace.some(
        (entry) => entry.step === 'PATIENT_CONSISTENCY_CHECK' && entry.status === 'FAIL'
      )
    );

    cleanupDir(claimsDataDir);
  });

  await asyncTest('stops pipeline when hospital bill is missing', async () => {
    let coverageCalled = false;

    const { result, claimsDataDir } = await runOrchestrator({
      agents: {
        ...baseAgents(),
        evaluateCoveragePolicy: () => {
          coverageCalled = true;
          return mockCoverage()();
        },
        processDocumentIntelligence: mockDocumentIntelligence({
          documents: [
            {
              fileName: 'prescription_1.jpg',
              documentType: 'PRESCRIPTION',
              overallDocumentConfidence: 0.9,
              extractedData: { patientName: 'Rajesh Kumar' },
              warnings: [],
              missingFields: [],
              fraudSignals: [],
            },
            {
              fileName: 'prescription_2.jpg',
              documentType: 'PRESCRIPTION',
              overallDocumentConfidence: 0.9,
              extractedData: { patientName: 'Rajesh Kumar' },
              warnings: [],
              missingFields: [],
              fraudSignals: [],
            },
          ],
          patientConsistencyCheck: {
            passed: true,
            issue: null,
            details: { detectedPatients: ['Rajesh Kumar'] },
            message: 'All documents belong to same patient.',
          },
        }),
      },
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'PENDING_DOCUMENT_UPLOAD');
    assert.strictEqual(result.decision, null);
    assert.deepStrictEqual(result.uploadedDocumentTypes, ['PRESCRIPTION', 'PRESCRIPTION']);
    assert.deepStrictEqual(result.missingDocumentTypes, ['HOSPITAL_BILL']);
    assert.strictEqual(result.error, 'Hospital Bill is required.');
    assert.strictEqual(coverageCalled, false);

    cleanupDir(claimsDataDir);
  });

  await asyncTest('stops pipeline when prescription is missing', async () => {
    const { result, claimsDataDir } = await runOrchestrator({
      agents: {
        ...baseAgents(),
        processDocumentIntelligence: mockDocumentIntelligence({
          documents: [
            {
              fileName: 'bill.pdf',
              documentType: 'HOSPITAL_BILL',
              overallDocumentConfidence: 0.9,
              extractedData: { patientName: 'Rajesh Kumar', totalAmount: 1500 },
              warnings: [],
              missingFields: [],
              fraudSignals: [],
            },
          ],
          patientConsistencyCheck: {
            passed: true,
            issue: null,
            details: { detectedPatients: ['Rajesh Kumar'] },
            message: 'All documents belong to same patient.',
          },
        }),
      },
    });

    assert.strictEqual(result.status, 'PENDING_DOCUMENT_UPLOAD');
    assert.deepStrictEqual(result.missingDocumentTypes, ['PRESCRIPTION']);
    assert.strictEqual(result.error, 'Prescription is required.');

    cleanupDir(claimsDataDir);
  });

  await asyncTest('stops pipeline when hospital bill is unreadable', async () => {
    let coverageCalled = false;

    const { result, claimsDataDir } = await runOrchestrator({
      agents: {
        ...baseAgents(),
        evaluateCoveragePolicy: () => {
          coverageCalled = true;
          return mockCoverage()();
        },
        processDocumentIntelligence: mockDocumentIntelligence({
          documents: [
            {
              fileName: 'prescription.jpg',
              documentType: 'PRESCRIPTION',
              overallDocumentConfidence: 0.9,
              extractedData: { patientName: 'Rajesh Kumar' },
              warnings: [],
              missingFields: [],
              fraudSignals: [],
            },
            {
              fileName: 'blurry_bill.jpg',
              documentType: 'HOSPITAL_BILL',
              overallDocumentConfidence: 0.4,
              extractedData: { patientName: 'Rajesh Kumar' },
              warnings: ['BLUR_DETECTED', 'LOW_IMAGE_QUALITY'],
              missingFields: [],
              fraudSignals: [],
            },
          ],
          patientConsistencyCheck: {
            passed: true,
            issue: null,
            details: { detectedPatients: ['Rajesh Kumar'] },
            message: 'All documents belong to same patient.',
          },
        }),
      },
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'PENDING_DOCUMENT_REUPLOAD');
    assert.strictEqual(result.decision, null);
    assert.deepStrictEqual(result.documents, [
      { fileName: 'blurry_bill.jpg', reason: 'Unreadable document' },
    ]);
    assert.strictEqual(coverageCalled, false);
    assert.ok(
      result.trace.some(
        (entry) => entry.step === 'DOCUMENT_REUPLOAD_REQUIRED' && entry.status === 'FAIL'
      )
    );

    cleanupDir(claimsDataDir);
  });

  await asyncTest('stops pipeline when multiple documents are unreadable', async () => {
    const { result, claimsDataDir } = await runOrchestrator({
      agents: {
        ...baseAgents(),
        processDocumentIntelligence: mockDocumentIntelligence({
          documents: [
            {
              fileName: 'blurry_rx.jpg',
              documentType: 'PRESCRIPTION',
              overallDocumentConfidence: 0.4,
              extractedData: { patientName: 'Rajesh Kumar' },
              warnings: ['LOW_IMAGE_QUALITY'],
              missingFields: [],
              fraudSignals: [],
            },
            {
              fileName: 'partial_bill.jpg',
              documentType: 'HOSPITAL_BILL',
              overallDocumentConfidence: 0.3,
              extractedData: { patientName: 'Rajesh Kumar' },
              warnings: ['PARTIAL_DOCUMENT'],
              missingFields: [],
              fraudSignals: [],
            },
          ],
          patientConsistencyCheck: {
            passed: true,
            issue: null,
            details: { detectedPatients: ['Rajesh Kumar'] },
            message: 'All documents belong to same patient.',
          },
        }),
      },
    });

    assert.strictEqual(result.status, 'PENDING_DOCUMENT_REUPLOAD');
    assert.strictEqual(result.documents.length, 2);

    cleanupDir(claimsDataDir);
  });

  await asyncTest('stops immediately when claim intake fails', async () => {
    const claimsDataDir = createTempClaimsDir();

    const result = await processClaim(
      {
        claimPayload: { memberId: 'EMP001' },
        uploadedDocuments: { files: [], jsonDocuments: [] },
      },
      {
        agents: {
          ...baseAgents(),
          processClaimIntake: () => ({
            success: false,
            error: 'Treatment date missing',
            trace: [{ step: 'SCHEMA_VALIDATION', status: 'FAIL', message: 'Treatment date missing', timestamp: new Date().toISOString() }],
          }),
        },
        claimsDataDir,
      }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.stage, 'CLAIM_INTAKE');
    assert.strictEqual(result.claimId, null);

    cleanupDir(claimsDataDir);
  });

  await asyncTest('stops immediately when member validation fails', async () => {
    const claimsDataDir = createTempClaimsDir();

    const result = await processClaim(
      {
        claimPayload: {},
        uploadedDocuments: { files: [], jsonDocuments: [] },
      },
      {
        agents: {
          ...baseAgents(),
          validateMember: () => ({
            success: false,
            error: 'Member not found',
            trace: [{ step: 'MEMBER_LOOKUP', status: 'FAIL', message: 'Member not found', timestamp: new Date().toISOString() }],
          }),
        },
        claimsDataDir,
      }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.stage, 'MEMBER_VALIDATION');
    assert.strictEqual(result.claimId, 'CLM_test0001');
    assert.ok(fs.existsSync(path.join(claimsDataDir, 'CLM_test0001.json')));

    cleanupDir(claimsDataDir);
  });

  await asyncTest('persistClaimResult writes JSON to disk', () => {
    const claimsDataDir = createTempClaimsDir();
    const filePath = persistClaimResult(
      'CLM_persist01',
      { decision: 'APPROVED', claimId: 'CLM_persist01' },
      claimsDataDir
    );

    assert.ok(filePath.endsWith('CLM_persist01.json'));
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(saved.decision, 'APPROVED');

    cleanupDir(claimsDataDir);
  });

  console.log('\nAll claimProcessingOrchestrator tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
