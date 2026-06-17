const assert = require('assert');
const {
  classifyDocument,
  normalizeClassification,
  resolveFileInput,
} = require('./documentClassifier');

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

test('normalizeClassification coerces invalid type to UNKNOWN', () => {
  const result = normalizeClassification({
    documentType: 'RANDOM_DOC',
    confidence: 1.4,
    reasoning: '  one  ',
    detectedFeatures: ['feature'],
  });

  assert.strictEqual(result.documentType, 'UNKNOWN');
  assert.strictEqual(result.confidence, 1);
  assert.deepStrictEqual(result.reasoning, ['one']);
});

test('resolveFileInput accepts base64 payloads', () => {
  const result = resolveFileInput({
    base64: SAMPLE_BASE64,
    mimeType: 'image/png',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.mimeType, 'image/png');
});

(async function runAsyncTests() {
  await asyncTest('classifies prescription documents', async () => {
    const result = await classifyDocument(
      { base64: SAMPLE_BASE64, mimeType: 'image/jpeg' },
      {
        analyzeFn: mockAnalyze({
          documentType: 'PRESCRIPTION',
          confidence: 0.95,
          reasoning: ['Doctor registration detected', 'Medicines listed'],
          detectedFeatures: ['Rx symbol'],
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documentType, 'PRESCRIPTION');
    assert.strictEqual(result.confidence, 0.95);
    assert.ok(result.reasoning.length >= 2);
  });

  await asyncTest('classifies hospital bill documents', async () => {
    const result = await classifyDocument(
      { base64: SAMPLE_BASE64, mimeType: 'image/jpeg' },
      {
        analyzeFn: mockAnalyze({
          documentType: 'HOSPITAL_BILL',
          confidence: 0.91,
          reasoning: ['Invoice layout detected'],
          detectedFeatures: ['Bill number'],
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documentType, 'HOSPITAL_BILL');
  });

  await asyncTest('classifies lab report documents', async () => {
    const result = await classifyDocument(
      { base64: SAMPLE_BASE64, mimeType: 'image/jpeg' },
      {
        analyzeFn: mockAnalyze({
          documentType: 'LAB_REPORT',
          confidence: 0.89,
          reasoning: ['Test results table detected'],
          detectedFeatures: ['Normal range column'],
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documentType, 'LAB_REPORT');
  });

  await asyncTest('classifies unknown documents', async () => {
    const result = await classifyDocument(
      { base64: SAMPLE_BASE64, mimeType: 'image/jpeg' },
      {
        analyzeFn: mockAnalyze({
          documentType: 'UNKNOWN',
          confidence: 0.42,
          reasoning: ['No medical document pattern detected'],
          detectedFeatures: [],
        }),
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.documentType, 'UNKNOWN');
  });

  await asyncTest('handles Anthropic failure gracefully', async () => {
    const result = await classifyDocument(
      { base64: SAMPLE_BASE64, mimeType: 'image/jpeg' },
      {
        analyzeFn: async () => ({ success: false, error: 'Anthropic request timed out' }),
      }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Anthropic request timed out');
  });

  await asyncTest('handles invalid JSON response gracefully', async () => {
    const result = await classifyDocument(
      { base64: SAMPLE_BASE64, mimeType: 'image/jpeg' },
      {
        analyzeFn: async () => ({ success: false, error: 'Could not parse JSON from response' }),
      }
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('JSON'));
  });

  await asyncTest('fails when no document content is provided', async () => {
    const result = await classifyDocument({});
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  console.log('\nAll documentClassifier tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
