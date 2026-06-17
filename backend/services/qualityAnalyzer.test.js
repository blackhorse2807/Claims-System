const assert = require('assert');
const {
  analyzeDocumentQuality,
  detectMissingFieldsFromExtractedData,
  normalizeQualityResponse,
  buildQualityPrompt,
} = require('./qualityAnalyzer');

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

test('buildQualityPrompt includes document type and extracted data', () => {
  const prompt = buildQualityPrompt('PRESCRIPTION', { patientName: 'Ravi Kumar' });
  assert.ok(prompt.includes('PRESCRIPTION'));
  assert.ok(prompt.includes('Ravi Kumar'));
  assert.ok(prompt.includes('Do NOT classify'));
  assert.ok(prompt.includes('Do NOT extract'));
});

test('detectMissingFieldsFromExtractedData flags absent hospital bill fields', () => {
  const missing = detectMissingFieldsFromExtractedData('HOSPITAL_BILL', {
    patientName: 'Meera Singh',
  });

  assert.ok(missing.includes('totalAmount'));
  assert.ok(missing.includes('billNumber'));
  assert.ok(!missing.includes('patientName'));
});

test('normalizeQualityResponse coerces warning and fraud codes', () => {
  const result = normalizeQualityResponse({
    confidence: 1.2,
    warnings: ['blur_detected', 'Doctor registration obscured by stamp'],
    missingFields: ['doctorRegistration'],
    fraudSignals: ['document_alteration', 'INVALID_CODE'],
  });

  assert.strictEqual(result.confidence, 1);
  assert.ok(result.warnings.includes('BLUR_DETECTED'));
  assert.ok(result.warnings.includes('Doctor registration obscured by stamp'));
  assert.deepStrictEqual(result.fraudSignals, ['DOCUMENT_ALTERATION']);
});

(async function runAsyncTests() {
  await asyncTest('analyzes clean documents with high confidence', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'PRESCRIPTION',
        imageBase64: SAMPLE_BASE64,
        extractedData: {
          doctorRegistration: 'MCI-12345',
          patientName: 'Ravi Kumar',
        },
      },
      {
        analyzeFn: mockAnalyze({
          confidence: 0.95,
          warnings: [],
          missingFields: [],
          fraudSignals: [],
        }),
      }
    );

    assert.strictEqual(result.confidence, 0.95);
    assert.deepStrictEqual(result.warnings, []);
    assert.deepStrictEqual(result.fraudSignals, []);
    assert.deepStrictEqual(result.missingFields, []);
  });

  await asyncTest('detects blurry documents', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'LAB_REPORT',
        imageBase64: SAMPLE_BASE64,
        extractedData: { patientName: 'Amit Verma' },
      },
      {
        analyzeFn: mockAnalyze({
          confidence: 0.8,
          warnings: ['BLUR_DETECTED', 'LOW_TEXT_VISIBILITY'],
          missingFields: [],
          fraudSignals: [],
        }),
      }
    );

    assert.strictEqual(result.confidence, 0.8);
    assert.ok(result.warnings.includes('BLUR_DETECTED'));
    assert.ok(result.warnings.includes('LOW_TEXT_VISIBILITY'));
  });

  await asyncTest('detects cropped documents', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'DISCHARGE_SUMMARY',
        imageBase64: SAMPLE_BASE64,
        extractedData: { patientName: 'Sita Rao' },
      },
      {
        analyzeFn: mockAnalyze({
          confidence: 0.4,
          warnings: ['CROPPED_DOCUMENT', 'PARTIAL_DOCUMENT'],
          missingFields: ['hospitalName'],
          fraudSignals: [],
        }),
      }
    );

    assert.strictEqual(result.confidence, 0.4);
    assert.ok(result.warnings.includes('CROPPED_DOCUMENT'));
    assert.ok(result.warnings.includes('PARTIAL_DOCUMENT'));
    assert.ok(result.missingFields.includes('hospitalName'));
  });

  await asyncTest('detects altered bills', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'HOSPITAL_BILL',
        imageBase64: SAMPLE_BASE64,
        extractedData: {
          patientName: 'Meera Singh',
          billNumber: 'INV-7788',
          totalAmount: 11800,
        },
      },
      {
        analyzeFn: mockAnalyze({
          confidence: 0.55,
          warnings: ['LOW_TEXT_VISIBILITY'],
          missingFields: [],
          fraudSignals: ['DOCUMENT_ALTERATION', 'SUSPICIOUS_EDIT', 'AMOUNT_MISMATCH'],
        }),
      }
    );

    assert.ok(result.fraudSignals.includes('DOCUMENT_ALTERATION'));
    assert.ok(result.fraudSignals.includes('SUSPICIOUS_EDIT'));
    assert.ok(result.fraudSignals.includes('AMOUNT_MISMATCH'));
  });

  await asyncTest('detects duplicate stamps', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'PRESCRIPTION',
        imageBase64: SAMPLE_BASE64,
        extractedData: { patientName: 'Ravi Kumar' },
      },
      {
        analyzeFn: mockAnalyze({
          confidence: 0.62,
          warnings: ['STAMP_OVERLAP'],
          missingFields: ['doctorRegistration'],
          fraudSignals: ['DUPLICATE_STAMP'],
        }),
      }
    );

    assert.ok(result.warnings.includes('STAMP_OVERLAP'));
    assert.ok(result.fraudSignals.includes('DUPLICATE_STAMP'));
    assert.ok(result.missingFields.includes('doctorRegistration'));
  });

  await asyncTest('merges programmatic missing fields with Claude results', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'HOSPITAL_BILL',
        imageBase64: SAMPLE_BASE64,
        extractedData: { patientName: 'Meera Singh' },
      },
      {
        analyzeFn: mockAnalyze({
          confidence: 0.7,
          warnings: [],
          missingFields: [],
          fraudSignals: [],
        }),
      }
    );

    assert.ok(result.missingFields.includes('totalAmount'));
    assert.ok(result.missingFields.includes('billNumber'));
  });

  await asyncTest('handles malformed Claude response with fallback', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'PRESCRIPTION',
        imageBase64: SAMPLE_BASE64,
        extractedData: { patientName: 'Ravi Kumar' },
      },
      {
        analyzeFn: async () => ({
          success: false,
          error: 'Could not parse JSON from response',
        }),
      }
    );

    assert.strictEqual(result.confidence, 0.5);
    assert.deepStrictEqual(result.warnings, ['QUALITY_ANALYSIS_FAILED']);
    assert.ok(result.missingFields.includes('doctorRegistration'));
    assert.deepStrictEqual(result.fraudSignals, []);
  });

  await asyncTest('handles Anthropic failure with fallback', async () => {
    const result = await analyzeDocumentQuality(
      {
        documentType: 'LAB_REPORT',
        imageBase64: SAMPLE_BASE64,
        extractedData: {},
      },
      {
        analyzeFn: async () => ({
          success: false,
          error: 'Anthropic request timed out',
        }),
      }
    );

    assert.strictEqual(result.confidence, 0.5);
    assert.deepStrictEqual(result.warnings, ['QUALITY_ANALYSIS_FAILED']);
    assert.ok(result.missingFields.includes('patientName'));
    assert.ok(result.missingFields.includes('pathologistRegistration'));
  });

  console.log('\nAll qualityAnalyzer tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
