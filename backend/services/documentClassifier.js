const fs = require('fs');
const path = require('path');
const { analyzeDocument } = require('./anthropicService');

const VALID_DOCUMENT_TYPES = [
  'PRESCRIPTION',
  'HOSPITAL_BILL',
  'LAB_REPORT',
  'PHARMACY_BILL',
  'DENTAL_REPORT',
  'DISCHARGE_SUMMARY',
  'UNKNOWN',
];

const CLASSIFIER_PROMPT = `You are a medical document classifier for Indian health insurance claims.

Your task is ONLY to classify the document type. Do NOT extract fields. Do NOT summarize the document.

Supported document types:
- PRESCRIPTION
- HOSPITAL_BILL
- LAB_REPORT
- PHARMACY_BILL
- DENTAL_REPORT
- DISCHARGE_SUMMARY
- UNKNOWN

Indian medical document recognition hints:

PRESCRIPTION:
- Doctor details and registration
- Diagnosis
- Medicines prescribed
- Tests ordered

HOSPITAL_BILL:
- Invoice or bill format
- Bill number
- Itemized charges
- Total amount

LAB_REPORT:
- Test results
- Normal ranges
- Pathology or diagnostic report layout

PHARMACY_BILL:
- Medicines purchased
- Quantity and MRP
- Pharmacy store details

DENTAL_REPORT:
- Tooth information
- Dental findings
- Dentist notes

DISCHARGE_SUMMARY:
- Admission details
- Discharge details
- Hospitalization summary

Return ONLY valid JSON in this exact shape:
{
  "documentType": "PRESCRIPTION",
  "confidence": 0.95,
  "reasoning": [
    "Doctor registration detected",
    "Medicines listed"
  ],
  "detectedFeatures": []
}

Rules:
- documentType must be one of the supported types above
- confidence must be a number between 0 and 1
- reasoning must be a short array of strings
- detectedFeatures must be an array of strings
- Use UNKNOWN only when the document is not clearly one of the supported medical document types`;

function guessMimeType(filePathOrName, fallback = 'image/jpeg') {
  const ext = path.extname(filePathOrName || '').toLowerCase();

  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.webp') return 'image/webp';

  return fallback;
}

function resolveFileInput(file) {
  if (!file || typeof file !== 'object') {
    return { success: false, error: 'Invalid file input' };
  }

  const base64 = file.imageBase64 || file.base64Data || file.base64;
  if (base64) {
    return {
      success: true,
      imageBase64: base64,
      mimeType: file.mimeType || guessMimeType(file.originalName || file.fileName),
    };
  }

  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    return {
      success: true,
      imageBase64: file.buffer.toString('base64'),
      mimeType: file.mimeType || guessMimeType(file.originalName || file.fileName),
    };
  }

  const filePath = file.filePath || file.path;
  if (filePath && fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    return {
      success: true,
      imageBase64: buffer.toString('base64'),
      mimeType: file.mimeType || guessMimeType(filePath),
    };
  }

  return { success: false, error: 'No readable document content provided' };
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function normalizeDocumentType(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  if (VALID_DOCUMENT_TYPES.includes(normalized)) {
    return normalized;
  }

  return 'UNKNOWN';
}

function normalizeClassification(data) {
  return {
    documentType: normalizeDocumentType(data.documentType),
    confidence: clampConfidence(data.confidence),
    reasoning: normalizeStringArray(data.reasoning),
    detectedFeatures: normalizeStringArray(data.detectedFeatures),
  };
}

/**
 * Classify a medical document image using Claude.
 * @param {object} file
 * @param {{ analyzeFn?: Function }} [options]
 */
async function classifyDocument(file, options = {}) {
  const analyzeFn = options.analyzeFn || analyzeDocument;

  try {
    const resolved = resolveFileInput(file);
    if (!resolved.success) {
      return { success: false, error: resolved.error };
    }

    const analysis = await analyzeFn({
      imageBase64: resolved.imageBase64,
      mimeType: resolved.mimeType,
      prompt: CLASSIFIER_PROMPT,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
    });

    if (!analysis.success) {
      return {
        success: false,
        error: analysis.error || 'Document classification failed',
      };
    }

    const normalized = normalizeClassification(analysis.data);

    return {
      success: true,
      ...normalized,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Document classification failed',
    };
  }
}

module.exports = {
  CLASSIFIER_PROMPT,
  VALID_DOCUMENT_TYPES,
  classifyDocument,
  normalizeClassification,
  resolveFileInput,
  guessMimeType,
};
