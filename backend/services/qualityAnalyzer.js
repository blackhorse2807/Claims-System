const { analyzeDocument } = require('./anthropicService');

const VALID_WARNINGS = [
  'LOW_IMAGE_QUALITY',
  'BLUR_DETECTED',
  'CROPPED_DOCUMENT',
  'PARTIAL_DOCUMENT',
  'STAMP_OVERLAP',
  'HANDWRITING_DIFFICULT',
  'MULTILINGUAL_CONTENT',
  'LOW_TEXT_VISIBILITY',
  'QUALITY_ANALYSIS_FAILED',
];

const VALID_FRAUD_SIGNALS = [
  'DOCUMENT_ALTERATION',
  'MULTIPLE_CORRECTIONS',
  'AMOUNT_MISMATCH',
  'DUPLICATE_STAMP',
  'OVERWRITTEN_VALUES',
  'SUSPICIOUS_EDIT',
];

const IMPORTANT_FIELDS_BY_TYPE = {
  PRESCRIPTION: ['doctorRegistration', 'patientName'],
  HOSPITAL_BILL: ['patientName', 'totalAmount', 'billNumber'],
  LAB_REPORT: ['patientName', 'pathologistRegistration'],
  PHARMACY_BILL: ['patientName', 'billNumber'],
  DENTAL_REPORT: ['patientName', 'dentistName'],
  DISCHARGE_SUMMARY: ['patientName', 'hospitalName'],
};

const FAILURE_FALLBACK = {
  confidence: 0.5,
  warnings: ['QUALITY_ANALYSIS_FAILED'],
  fraudSignals: [],
};

function buildQualityPrompt(documentType, extractedData) {
  const serializedExtractedData = JSON.stringify(extractedData || {}, null, 2);

  return `You are a medical document quality analyst for Indian health insurance claims.

Your task is ONLY to analyze document image quality and integrity. Do NOT classify the document type. Do NOT extract or change field values.

Document type context: ${documentType || 'UNKNOWN'}

Previously extracted data for cross-checking visibility and completeness:
${serializedExtractedData}

Analyze the document image for:
- OCR difficulty and text visibility
- Blurry or low-quality image
- Skewed photo angle
- Cropped or cut-off pages
- Stamp overlap on important fields
- Handwriting difficulty
- Multilingual content
- Duplicate stamps
- Crossed-out values
- Altered amounts or suspicious edits
- Multiple corrections

Quality warning codes (use these exact codes in warnings when applicable):
- LOW_IMAGE_QUALITY
- BLUR_DETECTED
- CROPPED_DOCUMENT
- PARTIAL_DOCUMENT
- STAMP_OVERLAP
- HANDWRITING_DIFFICULT
- MULTILINGUAL_CONTENT
- LOW_TEXT_VISIBILITY

Fraud signal codes (use these exact codes in fraudSignals when applicable):
- DOCUMENT_ALTERATION
- MULTIPLE_CORRECTIONS
- AMOUNT_MISMATCH
- DUPLICATE_STAMP
- OVERWRITTEN_VALUES
- SUSPICIOUS_EDIT

Confidence guidance (extraction reliability estimate):
- 0.95: clean printed document
- 0.80: minor blur
- 0.60: handwritten with obscured fields
- 0.40: severely cropped image

Use extractedData and the image to list important fields that appear absent or unreadable in missingFields.
Examples: doctorRegistration, patientName, totalAmount, billNumber, pathologistRegistration

Return ONLY valid JSON in this exact shape with no markdown, no explanations, and no prose:
{
  "confidence": 0.82,
  "warnings": [],
  "missingFields": [],
  "fraudSignals": []
}`;
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

function hasValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function normalizeDocumentType(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function normalizeExtractedData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
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

function normalizeWarningCode(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  const asCode = trimmed.toUpperCase().replace(/\s+/g, '_');
  if (VALID_WARNINGS.includes(asCode)) {
    return asCode;
  }

  return trimmed;
}

function normalizeFraudSignal(value) {
  const asCode = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  if (VALID_FRAUD_SIGNALS.includes(asCode)) {
    return asCode;
  }

  return null;
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

/**
 * Detect important fields missing from extracted data by document type.
 * @param {string} documentType
 * @param {object} extractedData
 */
function detectMissingFieldsFromExtractedData(documentType, extractedData) {
  const normalizedType = normalizeDocumentType(documentType);
  const fields = IMPORTANT_FIELDS_BY_TYPE[normalizedType] || ['patientName'];
  const data = normalizeExtractedData(extractedData);

  return fields.filter((field) => !hasValue(data[field]));
}

function normalizeQualityResponse(data) {
  const payload = data && typeof data === 'object' ? data : {};

  const warnings = uniqueStrings(
    normalizeStringArray(payload.warnings)
      .map(normalizeWarningCode)
      .filter(Boolean)
  );

  const fraudSignals = uniqueStrings(
    normalizeStringArray(payload.fraudSignals)
      .map(normalizeFraudSignal)
      .filter(Boolean)
  );

  const missingFields = uniqueStrings(normalizeStringArray(payload.missingFields));

  return {
    confidence: clampConfidence(payload.confidence),
    warnings,
    missingFields,
    fraudSignals,
  };
}

function mergeMissingFields(...fieldLists) {
  return uniqueStrings(fieldLists.flat());
}

function buildFailureResult(documentType, extractedData) {
  const programmaticMissing = detectMissingFieldsFromExtractedData(documentType, extractedData);

  return {
    confidence: FAILURE_FALLBACK.confidence,
    warnings: [...FAILURE_FALLBACK.warnings],
    missingFields: programmaticMissing,
    fraudSignals: [...FAILURE_FALLBACK.fraudSignals],
  };
}

/**
 * Analyze document image quality and integrity using Claude.
 * @param {{
 *   documentType: string,
 *   imageBase64: string,
 *   mimeType?: string,
 *   extractedData?: object,
 *   timeoutMs?: number,
 *   maxRetries?: number
 * }} params
 * @param {{ analyzeFn?: Function }} [options]
 */
async function analyzeDocumentQuality(
  {
    documentType,
    imageBase64,
    mimeType = 'image/jpeg',
    extractedData = {},
    timeoutMs,
    maxRetries,
  },
  options = {}
) {
  const analyzeFn = options.analyzeFn || analyzeDocument;

  try {
    const normalizedType = normalizeDocumentType(documentType);
    const normalizedExtractedData = normalizeExtractedData(extractedData);
    const programmaticMissing = detectMissingFieldsFromExtractedData(
      normalizedType,
      normalizedExtractedData
    );

    if (!imageBase64) {
      return {
        ...buildFailureResult(normalizedType, normalizedExtractedData),
        warnings: uniqueStrings([...FAILURE_FALLBACK.warnings, 'LOW_IMAGE_QUALITY']),
      };
    }

    const prompt = buildQualityPrompt(normalizedType, normalizedExtractedData);
    const analysis = await analyzeFn({
      imageBase64,
      mimeType,
      prompt,
      timeoutMs,
      maxRetries,
    });

    if (!analysis.success) {
      return buildFailureResult(normalizedType, normalizedExtractedData);
    }

    const normalized = normalizeQualityResponse(analysis.data);

    return {
      confidence: normalized.confidence,
      warnings: normalized.warnings,
      missingFields: mergeMissingFields(programmaticMissing, normalized.missingFields),
      fraudSignals: normalized.fraudSignals,
    };
  } catch {
    return buildFailureResult(documentType, extractedData);
  }
}

module.exports = {
  VALID_WARNINGS,
  VALID_FRAUD_SIGNALS,
  IMPORTANT_FIELDS_BY_TYPE,
  buildQualityPrompt,
  detectMissingFieldsFromExtractedData,
  normalizeQualityResponse,
  analyzeDocumentQuality,
};
