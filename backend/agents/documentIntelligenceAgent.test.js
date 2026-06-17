const assert = require('assert');
const {
  processDocumentIntelligence,
  aggregateExtraction,
  averageConfidence,
  checkPatientConsistency,
} = require('./documentIntelligenceAgent');

const SAMPLE_BASE64 = Buffer.from('fake-image-bytes').toString('base64');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
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

function baseInput(documents) {
  return {
    claim: { claimId: 'CLM_test0001', claimType: 'CONSULTATION' },
    member: { memberId: 'EMP001', name: 'Rajesh Kumar' },
    uploadedDocuments: documents,
  };
}

function mockResolve() {
  return {
    success: true,
    imageBase64: SAMPLE_BASE64,
    mimeType: 'image/jpeg',
  };
}

function createMockServices(overrides = {}) {
  const defaults = {
    resolveFileInput: () => mockResolve(),
    classifyFn: async () => ({
      success: true,
      documentType: 'PRESCRIPTION',
      confidence: 0.95,
      reasoning: ['Doctor registration detected'],
      detectedFeatures: [],
    }),
    extractFn: async () => ({
      success: true,
      extractedData: {
        patientName: 'Ravi Kumar',
        diagnosis: 'Viral fever',
        medicines: [{ name: 'Paracetamol' }],
        doctorName: 'Dr. Sharma',
        consultationDate: '2026-03-10',
      },
      confidence: 0.91,
      warnings: [],
      missingFields: [],
    }),
    qualityFn: async () => ({
      confidence: 0.9,
      warnings: [],
      missingFields: [],
      fraudSignals: [],
    }),
  };

  return { ...defaults, ...overrides };
}

test('averageConfidence computes mean of finite values', () => {
  assert.strictEqual(averageConfidence([0.9, 0.8, 0.7]), 0.8);
  assert.strictEqual(averageConfidence([]), 0);
});

test('checkPatientConsistency passes when all documents name the same patient', () => {
  const result = checkPatientConsistency([
    {
      extractedData: { patientName: 'Rajesh Kumar' },
    },
    {
      extractedData: { patientName: 'rajesh kumar' },
    },
  ]);

  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.issue, null);
  assert.deepStrictEqual(result.details.detectedPatients, ['Rajesh Kumar']);
});

test('checkPatientConsistency fails when documents name different patients', () => {
  const result = checkPatientConsistency([
    {
      extractedData: { patientName: 'Rajesh Kumar' },
    },
    {
      extractedData: { patientName: 'Arjun Mehta' },
    },
  ]);

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.issue, 'PATIENT_MISMATCH');
  assert.deepStrictEqual(result.details.detectedPatients, ['Rajesh Kumar', 'Arjun Mehta']);
  assert.strictEqual(result.message, 'Uploaded documents belong to different patients.');
});

test('checkPatientConsistency passes when patient names are missing', () => {
  const result = checkPatientConsistency([
    { extractedData: { patientName: null } },
    { extractedData: { patientName: '' } },
    { extractedData: {} },
  ]);

  assert.strictEqual(result.passed, true);
  assert.deepStrictEqual(result.details.detectedPatients, []);
});

test('checkPatientConsistency passes with partial extraction across documents', () => {
  const result = checkPatientConsistency([
    {
      extractedData: { patientName: 'Rajesh Kumar' },
    },
    {
      extractedData: {},
    },
    {
      extractedData: { patientName: '  Rajesh Kumar  ' },
    },
  ]);

  assert.strictEqual(result.passed, true);
  assert.deepStrictEqual(result.details.detectedPatients, ['Rajesh Kumar']);
});

test('aggregateExtraction merges prescription, bill, and lab data', () => {
  const aggregated = aggregateExtraction([
    {
      documentType: 'PRESCRIPTION',
      extractedData: {
        patientName: 'Ravi Kumar',
        diagnosis: 'Viral fever',
        medicines: [{ name: 'Paracetamol' }],
        testsOrdered: ['CBC'],
        doctorName: 'Dr. Sharma',
        consultationDate: '2026-03-10',
      },
    },
    {
      documentType: 'HOSPITAL_BILL',
      extractedData: {
        hospitalName: 'City Hospital',
        totalAmount: 11800,
        billDate: '2026-03-12',
      },
    },
    {
      documentType: 'LAB_REPORT',
      extractedData: {
        tests: [{ testName: 'HbA1c', result: '6.1' }],
        pathologistName: 'Dr. Patel',
      },
    },
  ]);

  assert.strictEqual(aggregated.patientName, 'Ravi Kumar');
  assert.ok(aggregated.diagnosis.includes('Viral fever'));
  assert.strictEqual(aggregated.medicines.length, 1);
  assert.strictEqual(aggregated.tests.length, 2);
  assert.ok(aggregated.doctors.includes('Dr. Sharma'));
  assert.ok(aggregated.doctors.includes('Dr. Patel'));
  assert.ok(aggregated.hospitals.includes('City Hospital'));
  assert.strictEqual(aggregated.treatmentDate, '2026-03-10');
  assert.strictEqual(aggregated.totalClaimAmount, 11800);
});

(async function runAsyncTests() {
  await asyncTest('processes a single document end to end', async () => {
    const result = await processDocumentIntelligence(
      baseInput([
        {
          originalName: 'prescription.jpg',
          base64: SAMPLE_BASE64,
          mimeType: 'image/jpeg',
        },
      ]),
      [],
      createMockServices()
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documents.length, 1);
    assert.strictEqual(result.documents[0].fileName, 'prescription.jpg');
    assert.strictEqual(result.documents[0].documentType, 'PRESCRIPTION');
    assert.strictEqual(result.documents[0].overallDocumentConfidence, 0.92);
    assert.strictEqual(result.overallConfidence, 0.92);
    assert.ok(result.trace.some((entry) => entry.step === 'DOCUMENT_CLASSIFICATION'));
    assert.ok(result.trace.some((entry) => entry.step === 'DOCUMENT_EXTRACTION'));
    assert.ok(result.trace.some((entry) => entry.step === 'DOCUMENT_QUALITY_CHECK'));
    assert.ok(result.trace.some((entry) => entry.step === 'DOCUMENT_AGGREGATION'));
    assert.ok(result.trace.some((entry) => entry.step === 'PATIENT_CONSISTENCY_CHECK'));
    assert.strictEqual(result.patientConsistencyCheck.passed, true);
  });

  await asyncTest('processes multiple documents', async () => {
    let classifyCalls = 0;

    const services = createMockServices({
      classifyFn: async (file) => {
        classifyCalls += 1;
        if (file.originalName === 'bill.pdf') {
          return {
            success: true,
            documentType: 'HOSPITAL_BILL',
            confidence: 0.9,
            reasoning: [],
            detectedFeatures: [],
          };
        }

        return {
          success: true,
          documentType: 'PRESCRIPTION',
          confidence: 0.95,
          reasoning: [],
          detectedFeatures: [],
        };
      },
      extractFn: async ({ documentType }) => {
        if (documentType === 'HOSPITAL_BILL') {
          return {
            success: true,
            extractedData: {
              patientName: 'Ravi Kumar',
              hospitalName: 'Apollo Hospital',
              totalAmount: 5000,
              billDate: '2026-03-12',
            },
            confidence: 0.88,
            warnings: [],
            missingFields: [],
          };
        }

        return {
          success: true,
          extractedData: {
            patientName: 'Ravi Kumar',
            diagnosis: 'Fever',
            medicines: [{ name: 'Ibuprofen' }],
            doctorName: 'Dr. Mehta',
            consultationDate: '2026-03-10',
          },
          confidence: 0.91,
          warnings: [],
          missingFields: [],
        };
      },
    });

    const result = await processDocumentIntelligence(
      baseInput([
        { originalName: 'prescription.jpg', base64: SAMPLE_BASE64 },
        { originalName: 'bill.pdf', base64: SAMPLE_BASE64 },
      ]),
      [],
      services
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documents.length, 2);
    assert.strictEqual(classifyCalls, 2);
    assert.strictEqual(result.aggregatedExtraction.totalClaimAmount, 5000);
    assert.ok(result.aggregatedExtraction.diagnosis.includes('Fever'));
    assert.strictEqual(result.patientConsistencyCheck.passed, true);
  });

  await asyncTest('flags patient mismatch across documents', async () => {
    const services = createMockServices({
      classifyFn: async (file) => ({
        success: true,
        documentType: file.originalName === 'bill.pdf' ? 'HOSPITAL_BILL' : 'PRESCRIPTION',
        confidence: 0.9,
        reasoning: [],
        detectedFeatures: [],
      }),
      extractFn: async ({ documentType }) => {
        if (documentType === 'HOSPITAL_BILL') {
          return {
            success: true,
            extractedData: {
              patientName: 'Arjun Mehta',
              hospitalName: 'Apollo Hospital',
              totalAmount: 5000,
              billDate: '2026-03-12',
            },
            confidence: 0.88,
            warnings: [],
            missingFields: [],
          };
        }

        return {
          success: true,
          extractedData: {
            patientName: 'Rajesh Kumar',
            diagnosis: 'Fever',
            medicines: [{ name: 'Ibuprofen' }],
            doctorName: 'Dr. Mehta',
            consultationDate: '2026-03-10',
          },
          confidence: 0.91,
          warnings: [],
          missingFields: [],
        };
      },
    });

    const result = await processDocumentIntelligence(
      baseInput([
        { originalName: 'prescription.jpg', base64: SAMPLE_BASE64 },
        { originalName: 'bill.pdf', base64: SAMPLE_BASE64 },
      ]),
      [],
      services
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.patientConsistencyCheck.passed, false);
    assert.strictEqual(result.patientConsistencyCheck.issue, 'PATIENT_MISMATCH');
    assert.deepStrictEqual(result.patientConsistencyCheck.details.detectedPatients, [
      'Rajesh Kumar',
      'Arjun Mehta',
    ]);
    assert.ok(
      result.trace.some(
        (entry) =>
          entry.step === 'PATIENT_CONSISTENCY_CHECK' &&
          entry.status === 'FAIL' &&
          entry.message === 'Different patient names detected.'
      )
    );
  });

  await asyncTest('continues when classifier fails for one document', async () => {
    const services = createMockServices({
      classifyFn: async (file) => {
        if (file.originalName === 'bill.pdf') {
          return { success: false, error: 'Anthropic request timed out' };
        }

        return {
          success: true,
          documentType: 'PRESCRIPTION',
          confidence: 0.95,
          reasoning: [],
          detectedFeatures: [],
        };
      },
    });

    const result = await processDocumentIntelligence(
      baseInput([
        { originalName: 'bill.pdf', base64: SAMPLE_BASE64 },
        { originalName: 'prescription.jpg', base64: SAMPLE_BASE64 },
      ]),
      [],
      services
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documents.length, 2);
    assert.strictEqual(result.documents[0].documentType, 'UNKNOWN');
    assert.strictEqual(result.documents[0].classificationConfidence, 0);
    assert.strictEqual(result.documents[1].documentType, 'PRESCRIPTION');
    assert.ok(result.warnings.some((warning) => warning.includes('bill.pdf')));
  });

  await asyncTest('continues when extractor fails for one document', async () => {
    const services = createMockServices({
      extractFn: async ({ documentType }) => {
        if (documentType === 'HOSPITAL_BILL') {
          return { success: false, error: 'Extraction is not supported for document type: UNKNOWN' };
        }

        return {
          success: true,
          extractedData: { patientName: 'Ravi Kumar', diagnosis: 'Cold' },
          confidence: 0.9,
          warnings: [],
          missingFields: [],
        };
      },
      classifyFn: async (file) => ({
        success: true,
        documentType: file.originalName === 'bill.pdf' ? 'HOSPITAL_BILL' : 'PRESCRIPTION',
        confidence: 0.9,
        reasoning: [],
        detectedFeatures: [],
      }),
    });

    const result = await processDocumentIntelligence(
      baseInput([
        { originalName: 'bill.pdf', base64: SAMPLE_BASE64 },
        { originalName: 'prescription.jpg', base64: SAMPLE_BASE64 },
      ]),
      [],
      services
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documents[0].extractionConfidence, 0);
    assert.ok(result.documents[0].warnings.some((warning) => warning.includes('Extraction failed')));
    assert.strictEqual(result.documents[1].extractionConfidence, 0.9);
  });

  await asyncTest('handles quality analysis fallback without stopping pipeline', async () => {
    const services = createMockServices({
      qualityFn: async () => ({
        confidence: 0.5,
        warnings: ['QUALITY_ANALYSIS_FAILED'],
        missingFields: ['doctorRegistration'],
        fraudSignals: [],
      }),
    });

    const result = await processDocumentIntelligence(
      baseInput([{ originalName: 'prescription.jpg', base64: SAMPLE_BASE64 }]),
      [],
      services
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documents[0].qualityConfidence, 0.5);
    assert.ok(result.documents[0].warnings.includes('QUALITY_ANALYSIS_FAILED'));
    assert.ok(
      result.trace.some(
        (entry) =>
          entry.step === 'DOCUMENT_QUALITY_CHECK' && entry.status === 'WARNING'
      )
    );
  });

  await asyncTest('supports partial success across mixed document outcomes', async () => {
    const services = createMockServices({
      resolveFileInput: (file) => {
        if (file.originalName === 'missing.pdf') {
          return { success: false, error: 'No readable document content provided' };
        }

        return mockResolve();
      },
      classifyFn: async (file) => {
        if (file.originalName === 'lab_report.pdf') {
          return {
            success: true,
            documentType: 'LAB_REPORT',
            confidence: 0.88,
            reasoning: [],
            detectedFeatures: [],
          };
        }

        return {
          success: true,
          documentType: 'PRESCRIPTION',
          confidence: 0.94,
          reasoning: [],
          detectedFeatures: [],
        };
      },
      extractFn: async ({ documentType }) => {
        if (documentType === 'LAB_REPORT') {
          return {
            success: true,
            extractedData: {
              patientName: 'Ravi Kumar',
              tests: [{ testName: 'CBC', result: 'Normal' }],
            },
            confidence: 0.87,
            warnings: [],
            missingFields: [],
          };
        }

        return {
          success: true,
          extractedData: {
            patientName: 'Ravi Kumar',
            diagnosis: 'Allergy',
            medicines: [{ name: 'Cetirizine' }],
          },
          confidence: 0.9,
          warnings: [],
          missingFields: [],
        };
      },
    });

    const result = await processDocumentIntelligence(
      baseInput([
        { originalName: 'missing.pdf' },
        { originalName: 'prescription.jpg', base64: SAMPLE_BASE64 },
        { originalName: 'lab_report.pdf', base64: SAMPLE_BASE64 },
      ]),
      [],
      services
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documents.length, 3);
    assert.strictEqual(result.documents[0].overallDocumentConfidence, 0);
    assert.strictEqual(result.documents[1].documentType, 'PRESCRIPTION');
    assert.strictEqual(result.documents[2].documentType, 'LAB_REPORT');
    assert.strictEqual(result.aggregatedExtraction.tests.length, 1);
    assert.strictEqual(result.patientConsistencyCheck.passed, true);
    assert.ok(result.warnings.some((warning) => warning.includes('missing.pdf')));
  });

  console.log('\nAll documentIntelligenceAgent tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
