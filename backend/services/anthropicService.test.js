const assert = require('assert');
const { safeJsonParse } = require('./anthropicService');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('safeJsonParse handles markdown code blocks', () => {
  const result = safeJsonParse('```json\n{"documentType":"PRESCRIPTION","confidence":0.9}\n```');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.documentType, 'PRESCRIPTION');
});

test('safeJsonParse handles extra text before and after JSON', () => {
  const result = safeJsonParse(
    'Here is the result:\n{"documentType":"HOSPITAL_BILL","confidence":0.88}\nThanks.'
  );
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.documentType, 'HOSPITAL_BILL');
});

test('safeJsonParse rejects invalid JSON', () => {
  const result = safeJsonParse('not json at all');
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('safeJsonParse handles empty response', () => {
  const result = safeJsonParse('');
  assert.strictEqual(result.success, false);
});

console.log('\nAll anthropicService tests passed.');
