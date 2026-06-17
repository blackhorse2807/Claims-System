const assert = require('assert');
const {
  extractDocumentData,
  validateExtractedData,
  normalizeExtractionResponse,
  PROMPTS,
} = require('./documentExtractor');

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

function mockAnalyze(responseData) {
  return async () => ({ success: true, data: responseData });
}

test('PROMPTS define a unique extraction prompt per document type', () => {
  const types = [
    'PRESCRIPTION',
    'HOSPITAL_BILL',
    'LAB_REPORT',
    'PHARMACY_BILL',
    'DENTAL_REPORT',
    'DISCHARGE_SUMMARY',
  ];

  const promptTexts = types.map((type) => PROMPTS[type]);
  assert.strictEqual(new Set(promptTexts).size, types.length);
  promptTexts.forEach((prompt) => {
    assert.ok(prompt.includes('extractedData'));
    assert.ok(prompt.includes('confidence'));
  });
});

test('normalizeExtractionResponse unwraps extractedData', () => {
  const result = normalizeExtractionResponse({
    extractedData: { patientName: 'Ravi Kumar' },
    confidence: 0.88,
  });

  assert.deepStrictEqual(result.extractedData, { patientName: 'Ravi Kumar' });
  assert.strictEqual(result.confidence, 0.88);
});

test('validateExtractedData flags missing patientName', () => {
  const result = validateExtractedData('PRESCRIPTION', {
    doctorName: 'Dr. Sharma',
  });

  assert.ok(result.missingFields.includes('patientName'));
  assert.ok(result.warnings.some((warning) => warning.includes('patientName')));
});

test('validateExtractedData flags missing totalAmount on hospital bills', () => {
  const result = validateExtractedData('HOSPITAL_BILL', {
    patientName: 'Ravi Kumar',
    billNumber: 'HB-1001',
  });

  assert.ok(result.missingFields.includes('totalAmount'));
  assert.ok(result.warnings.some((warning) => warning.includes('totalAmount')));
});

(async function runAsyncTests() {
  await asyncTest('extracts prescription documents', async () => {
    const result = await extractDocumentData(
      {
        documentType: 'PRESCRIPTION',
        imageBase64: SAMPLE_BASE64,
        mimeType: 'image/jpeg',
      },
      {
        analyzeFn: mockAnalyze({
          extractedData: {
            doctorName: 'Dr. Ananya Sharma',
            doctorRegistration: 'MCI-12345',
            specialization: 'General Physician',
            clinicName: 'City Care Clinic',
            clinicAddress: 'MG Road, Bengaluru',
            patientName: 'Ravi Kumar',
            patientAge: 34,
            patientGender: 'Male',
            consultationDate: '2026-03-10',
            diagnosis: 'Viral fever',
            medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'TDS', duration: '3 days' }],
            testsOrdered: ['CBC'],
            followUpInstructions: 'Review after 3 days',
          },
          confidence: 0.91,
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.extractedData.patientName, 'Ravi Kumar');
    assert.strictEqual(result.confidence, 0.91);
    assert.deepStrictEqual(result.missingFields, []);
  });

  await asyncTest('extracts hospital bill documents', async () => {
    const result = await extractDocumentData(
      {
        documentType: 'HOSPITAL_BILL',
        imageBase64: SAMPLE_BASE64,
      },
      {
        analyzeFn: mockAnalyze({
          extractedData: {
            hospitalName: 'Apollo Hospital',
            hospitalAddress: 'Bannerghatta Road',
            gstin: '29AAAAA0000A1Z5',
            billNumber: 'INV-7788',
            billDate: '2026-03-12',
            patientName: 'Meera Singh',
            lineItems: [{ description: 'Room rent', quantity: 2, rate: 5000, amount: 10000 }],
            subtotal: 10000,
            gstAmount: 1800,
            totalAmount: 11800,
            paymentMode: 'UPI',
          },
          confidence: 0.93,
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documentType, undefined);
    assert.strictEqual(result.extractedData.totalAmount, 11800);
    assert.deepStrictEqual(result.missingFields, []);
  });

  await asyncTest('extracts lab report documents', async () => {
    const result = await extractDocumentData(
      {
        documentType: 'LAB_REPORT',
        imageBase64: SAMPLE_BASE64,
      },
      {
        analyzeFn: mockAnalyze({
          extractedData: {
            labName: 'SRL Diagnostics',
            sampleDate: '2026-03-08',
            reportDate: '2026-03-09',
            patientName: 'Amit Verma',
            tests: [
              {
                testName: 'HbA1c',
                result: '6.1',
                unit: '%',
                normalRange: '4.0-5.6',
              },
            ],
            remarks: 'Borderline value',
            pathologistName: 'Dr. Patel',
            pathologistRegistration: 'PATH-9087',
          },
          confidence: 0.9,
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.extractedData.labName, 'SRL Diagnostics');
    assert.strictEqual(result.extractedData.tests.length, 1);
  });

  await asyncTest('returns warnings for missing required fields', async () => {
    const result = await extractDocumentData(
      {
        documentType: 'HOSPITAL_BILL',
        imageBase64: SAMPLE_BASE64,
      },
      {
        analyzeFn: mockAnalyze({
          extractedData: {
            hospitalName: 'City Hospital',
            billNumber: 'B-22',
          },
          confidence: 0.75,
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.missingFields.includes('patientName'));
    assert.ok(result.missingFields.includes('totalAmount'));
    assert.strictEqual(result.warnings.length, 2);
  });

  await asyncTest('handles malformed Claude response gracefully', async () => {
    const result = await extractDocumentData(
      {
        documentType: 'PRESCRIPTION',
        imageBase64: SAMPLE_BASE64,
      },
      {
        analyzeFn: async () => ({
          success: false,
          error: 'Could not parse JSON from response',
        }),
      }
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('JSON'));
  });

  await asyncTest('handles Anthropic failure gracefully', async () => {
    const result = await extractDocumentData(
      {
        documentType: 'LAB_REPORT',
        imageBase64: SAMPLE_BASE64,
      },
      {
        analyzeFn: async () => ({
          success: false,
          error: 'Anthropic request timed out',
        }),
      }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Anthropic request timed out');
  });

  await asyncTest('rejects unsupported document types', async () => {
    const result = await extractDocumentData({
      documentType: 'UNKNOWN',
      imageBase64: SAMPLE_BASE64,
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not supported'));
  });

  await asyncTest('fails when imageBase64 is missing', async () => {
    const result = await extractDocumentData({
      documentType: 'PRESCRIPTION',
      imageBase64: '',
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'imageBase64 is required');
  });

  console.log('\nAll documentExtractor tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
