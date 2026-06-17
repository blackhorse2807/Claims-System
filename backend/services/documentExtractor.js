const { analyzeDocument } = require('./anthropicService');

const EXTRACTABLE_DOCUMENT_TYPES = [
  'PRESCRIPTION',
  'HOSPITAL_BILL',
  'LAB_REPORT',
  'PHARMACY_BILL',
  'DENTAL_REPORT',
  'DISCHARGE_SUMMARY',
];

const BILL_DOCUMENT_TYPES = ['HOSPITAL_BILL'];

const PROMPTS = {
  PRESCRIPTION: `You are extracting structured data from an Indian medical PRESCRIPTION document for health insurance claims.

Extract ONLY the fields listed below from the document image. Use null for fields not visible or not present.

Return ONLY valid JSON in this exact shape with no markdown, no explanations, and no prose:
{
  "extractedData": {
    "doctorName": null,
    "doctorRegistration": null,
    "specialization": null,
    "clinicName": null,
    "clinicAddress": null,
    "patientName": null,
    "patientAge": null,
    "patientGender": null,
    "consultationDate": null,
    "diagnosis": null,
    "medicines": [],
    "testsOrdered": [],
    "followUpInstructions": null
  },
  "confidence": 0.92
}

Field rules:
- medicines: array of objects with name, dosage, frequency, duration (use null for missing sub-fields)
- testsOrdered: array of strings
- consultationDate: ISO date string YYYY-MM-DD when possible
- confidence: number between 0 and 1 reflecting extraction certainty`,

  HOSPITAL_BILL: `You are extracting structured data from an Indian HOSPITAL BILL or invoice for health insurance claims.

Extract ONLY the fields listed below from the document image. Use null for fields not visible or not present.

Return ONLY valid JSON in this exact shape with no markdown, no explanations, and no prose:
{
  "extractedData": {
    "hospitalName": null,
    "hospitalAddress": null,
    "gstin": null,
    "billNumber": null,
    "billDate": null,
    "patientName": null,
    "lineItems": [],
    "subtotal": null,
    "gstAmount": null,
    "totalAmount": null,
    "paymentMode": null
  },
  "confidence": 0.92
}

Field rules:
- lineItems: array of objects with description, quantity, rate, amount (use null for missing sub-fields)
- billDate: ISO date string YYYY-MM-DD when possible
- subtotal, gstAmount, totalAmount: numeric values without currency symbols when possible
- confidence: number between 0 and 1 reflecting extraction certainty`,

  LAB_REPORT: `You are extracting structured data from an Indian LAB REPORT or pathology report for health insurance claims.

Extract ONLY the fields listed below from the document image. Use null for fields not visible or not present.

Return ONLY valid JSON in this exact shape with no markdown, no explanations, and no prose:
{
  "extractedData": {
    "labName": null,
    "sampleDate": null,
    "reportDate": null,
    "patientName": null,
    "tests": [],
    "remarks": null,
    "pathologistName": null,
    "pathologistRegistration": null
  },
  "confidence": 0.92
}

Field rules:
- tests: array of objects with testName, result, unit, normalRange (use null for missing sub-fields)
- sampleDate and reportDate: ISO date string YYYY-MM-DD when possible
- confidence: number between 0 and 1 reflecting extraction certainty`,

  PHARMACY_BILL: `You are extracting structured data from an Indian PHARMACY BILL or medicine purchase receipt for health insurance claims.

Extract ONLY the fields listed below from the document image. Use null for fields not visible or not present.

Return ONLY valid JSON in this exact shape with no markdown, no explanations, and no prose:
{
  "extractedData": {
    "pharmacyName": null,
    "drugLicenseNumber": null,
    "billNumber": null,
    "patientName": null,
    "medicines": [],
    "discount": null,
    "netAmount": null
  },
  "confidence": 0.92
}

Field rules:
- medicines: array of objects with name, quantity, mrp, amount (use null for missing sub-fields)
- discount and netAmount: numeric values without currency symbols when possible
- confidence: number between 0 and 1 reflecting extraction certainty`,

  DENTAL_REPORT: `You are extracting structured data from an Indian DENTAL REPORT or dentist clinical note for health insurance claims.

Extract ONLY the fields listed below from the document image. Use null for fields not visible or not present.

Return ONLY valid JSON in this exact shape with no markdown, no explanations, and no prose:
{
  "extractedData": {
    "dentistName": null,
    "diagnosis": null,
    "procedure": null,
    "toothNumber": null,
    "recommendations": null
  },
  "confidence": 0.92
}

Field rules:
- toothNumber: tooth identifier or notation as shown on the document
- confidence: number between 0 and 1 reflecting extraction certainty`,

  DISCHARGE_SUMMARY: `You are extracting structured data from an Indian hospital DISCHARGE SUMMARY for health insurance claims.

Extract ONLY the fields listed below from the document image. Use null for fields not visible or not present.

Return ONLY valid JSON in this exact shape with no markdown, no explanations, and no prose:
{
  "extractedData": {
    "hospitalName": null,
    "patientName": null,
    "admissionDate": null,
    "dischargeDate": null,
    "finalDiagnosis": null,
    "treatmentSummary": null
  },
  "confidence": 0.92
}

Field rules:
- admissionDate and dischargeDate: ISO date string YYYY-MM-DD when possible
- confidence: number between 0 and 1 reflecting extraction certainty`,
};

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

function normalizeExtractionResponse(data) {
  const payload = data && typeof data === 'object' ? data : {};
  const extractedData = normalizeExtractedData(
    payload.extractedData !== undefined ? payload.extractedData : payload
  );

  return {
    extractedData,
    confidence: clampConfidence(payload.confidence),
  };
}

/**
 * Validate extracted fields and produce warnings for commonly required data.
 * @param {string} documentType
 * @param {object} extractedData
 */
function validateExtractedData(documentType, extractedData) {
  const warnings = [];
  const missingFields = [];

  try {
    const data = normalizeExtractedData(extractedData);

    if (!hasValue(data.patientName)) {
      missingFields.push('patientName');
      warnings.push('patientName is missing from extracted data');
    }

    if (BILL_DOCUMENT_TYPES.includes(documentType) && !hasValue(data.totalAmount)) {
      missingFields.push('totalAmount');
      warnings.push('totalAmount is missing from extracted data');
    }

    return { warnings, missingFields };
  } catch {
    return {
      warnings: ['Validation could not be completed'],
      missingFields: [],
    };
  }
}

/**
 * Extract structured data from a classified medical document.
 * @param {{
 *   documentType: string,
 *   imageBase64: string,
 *   mimeType?: string,
 *   timeoutMs?: number,
 *   maxRetries?: number
 * }} params
 * @param {{ analyzeFn?: Function }} [options]
 */
async function extractDocumentData(
  { documentType, imageBase64, mimeType = 'image/jpeg', timeoutMs, maxRetries },
  options = {}
) {
  const analyzeFn = options.analyzeFn || analyzeDocument;

  try {
    const normalizedType = normalizeDocumentType(documentType);

    if (!imageBase64) {
      return { success: false, error: 'imageBase64 is required' };
    }

    if (!normalizedType) {
      return { success: false, error: 'documentType is required' };
    }

    if (!EXTRACTABLE_DOCUMENT_TYPES.includes(normalizedType)) {
      return {
        success: false,
        error: `Extraction is not supported for document type: ${normalizedType}`,
      };
    }

    const prompt = PROMPTS[normalizedType];
    const analysis = await analyzeFn({
      imageBase64,
      mimeType,
      prompt,
      timeoutMs,
      maxRetries,
    });

    if (!analysis.success) {
      return {
        success: false,
        error: analysis.error || 'Document extraction failed',
      };
    }

    const { extractedData, confidence } = normalizeExtractionResponse(analysis.data);
    const { warnings, missingFields } = validateExtractedData(normalizedType, extractedData);

    return {
      success: true,
      extractedData,
      confidence,
      warnings,
      missingFields,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Document extraction failed',
    };
  }
}

module.exports = {
  PROMPTS,
  EXTRACTABLE_DOCUMENT_TYPES,
  extractDocumentData,
  validateExtractedData,
  normalizeExtractionResponse,
  hasValue,
};
