const crypto = require('crypto');
const path = require('path');

const VALID_CLAIM_TYPES = [
  'CONSULTATION',
  'DIAGNOSTIC',
  'PHARMACY',
  'DENTAL',
  'VISION',
  'ALTERNATIVE_MEDICINE',
];

const CLAIM_TYPE_ALIASES = {
  consultation: 'CONSULTATION',
  diagnostic: 'DIAGNOSTIC',
  pharmacy: 'PHARMACY',
  dental: 'DENTAL',
  vision: 'VISION',
  alternative_medicine: 'ALTERNATIVE_MEDICINE',
  'alternative medicine': 'ALTERNATIVE_MEDICINE',
};

const RELATIONSHIP_ALIASES = {
  self: 'SELF',
  spouse: 'SPOUSE',
  child: 'CHILD',
  parent: 'PARENT',
};

const METADATA_FIELDS = [
  'memberName',
  'dob',
  'gender',
  'primaryMemberId',
  'hospitalName',
  'doctorName',
  'diagnosis',
  'procedureName',
  'preAuthorizationId',
];

function createTraceEntry(step, status, message) {
  return {
    step,
    status,
    message,
    timestamp: new Date().toISOString(),
  };
}

function trimString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toIsoDate(value) {
  const trimmed = trimString(value);
  if (!trimmed) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().split('T')[0];
}

function normalizeClaimType(value) {
  const trimmed = trimString(value);
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (CLAIM_TYPE_ALIASES[lower]) {
    return CLAIM_TYPE_ALIASES[lower];
  }

  const underscored = lower.replace(/\s+/g, '_');
  if (CLAIM_TYPE_ALIASES[underscored]) {
    return CLAIM_TYPE_ALIASES[underscored];
  }

  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  if (VALID_CLAIM_TYPES.includes(upper)) {
    return upper;
  }

  return upper;
}

function normalizeRelationship(value) {
  const trimmed = trimString(value);
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (RELATIONSHIP_ALIASES[lower]) {
    return RELATIONSHIP_ALIASES[lower];
  }

  return trimmed.toUpperCase();
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function generateClaimId() {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `CLM_${suffix}`;
}

function buildUploadedDocumentsFromFiles(files = [], body = {}) {
  return files.map((file, index) => {
    const documentType =
      trimString(body[`doc_type_${index}`]) ||
      trimString(body[`docType_${index}`]) ||
      'UNKNOWN';

    return {
      id: crypto.randomUUID(),
      originalName: trimString(file.originalname) || `upload_${index}`,
      filePath: file.path || path.join('uploads', file.filename || `upload_${index}`),
      mimeType: trimString(file.mimetype) || 'application/octet-stream',
      documentType,
    };
  });
}

function buildUploadedDocumentsFromJson(documents = []) {
  return documents.map((doc, index) => ({
    id: trimString(doc.file_id) || crypto.randomUUID(),
    originalName: trimString(doc.file_name) || `document_${index + 1}`,
    filePath: `virtual://${trimString(doc.file_id) || index}`,
    mimeType: trimString(doc.mime_type) || 'application/octet-stream',
    documentType: trimString(doc.actual_type) || 'UNKNOWN',
  }));
}

function collectMetadata(body) {
  const metadata = {};

  for (const field of METADATA_FIELDS) {
    const snake = field.replace(/([A-Z])/g, '_$1').toLowerCase();
    const value = trimString(body[field] ?? body[snake]);
    if (value) {
      metadata[field] = value;
    }
  }

  return metadata;
}

function validateIntakePayload(payload) {
  const errors = [];

  if (!trimString(payload.memberId)) {
    errors.push('Member ID cannot be empty');
  }

  if (!trimString(payload.relationship)) {
    errors.push('Relationship is required');
  }

  if (!trimString(payload.claimType)) {
    errors.push('Claim type cannot be empty');
  } else if (!VALID_CLAIM_TYPES.includes(normalizeClaimType(payload.claimType))) {
    errors.push(`Unsupported claim type: ${payload.claimType}`);
  }

  const amount = toNumber(payload.claimedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('Claimed amount must be greater than 0');
  }

  if (!trimString(payload.treatmentDate)) {
    errors.push('Treatment date missing');
  }

  if (!trimString(payload.submissionDate)) {
    errors.push('Submission date missing');
  }

  const documentCount =
    (payload.uploadedFiles?.length || 0) + (payload.jsonDocuments?.length || 0);

  if (documentCount === 0) {
    errors.push('At least one uploaded document is required');
  }

  return errors;
}

/**
 * Claim Intake Agent — validates, normalizes, and prepares claim data.
 * No AI. Pure schema validation and normalization.
 *
 * @param {{ body: Record<string, unknown>, files?: Array<object>, jsonDocuments?: Array<object> }} input
 * @returns {import('../types/claimIntake').AgentResult<import('../types/claimIntake').NormalizedClaim>}
 */
function processClaimIntake({ body = {}, files = [], jsonDocuments = [] }) {
  const trace = [];

  try {
    trace.push(
      createTraceEntry('CLAIM_RECEIVED', 'PASS', 'Claim received successfully')
    );

    const rawPayload = {
      memberId: body.memberId ?? body.member_id,
      relationship: body.relationship,
      claimType: body.claimType ?? body.claim_category,
      claimedAmount: body.claimedAmount ?? body.claimed_amount,
      treatmentDate: body.treatmentDate ?? body.treatment_date,
      submissionDate: body.claimSubmissionDate ?? body.submission_date ?? body.submissionDate,
      uploadedFiles: files,
      jsonDocuments,
    };

    const validationErrors = validateIntakePayload(rawPayload);

    if (validationErrors.length > 0) {
      trace.push(
        createTraceEntry('SCHEMA_VALIDATION', 'FAIL', validationErrors.join('; '))
      );
      return {
        success: false,
        error: validationErrors[0],
        trace,
      };
    }

    trace.push(
      createTraceEntry('SCHEMA_VALIDATION', 'PASS', 'Required fields validated')
    );

    const uploadedFromFiles = buildUploadedDocumentsFromFiles(files, body);
    const uploadedFromJson = buildUploadedDocumentsFromJson(jsonDocuments);
    const uploadedDocuments = [...uploadedFromFiles, ...uploadedFromJson];

    const normalizedClaim = {
      claimId: generateClaimId(),
      memberId: trimString(rawPayload.memberId),
      relationship: normalizeRelationship(rawPayload.relationship),
      claimType: normalizeClaimType(rawPayload.claimType),
      claimedAmount: toNumber(rawPayload.claimedAmount),
      treatmentDate: toIsoDate(rawPayload.treatmentDate),
      submissionDate: toIsoDate(rawPayload.submissionDate),
      uploadedDocuments,
      createdAt: new Date().toISOString(),
      metadata: collectMetadata(body),
    };

    if (!normalizedClaim.treatmentDate) {
      trace.push(
        createTraceEntry('NORMALIZATION', 'FAIL', 'Treatment date could not be normalized to ISO format')
      );
      return {
        success: false,
        error: 'Treatment date could not be normalized to ISO format',
        trace,
      };
    }

    if (!normalizedClaim.submissionDate) {
      trace.push(
        createTraceEntry('NORMALIZATION', 'FAIL', 'Submission date could not be normalized to ISO format')
      );
      return {
        success: false,
        error: 'Submission date could not be normalized to ISO format',
        trace,
      };
    }

    trace.push(
      createTraceEntry('NORMALIZATION', 'PASS', 'Claim data normalized')
    );

    return {
      success: true,
      data: normalizedClaim,
      trace,
    };
  } catch (error) {
    trace.push(
      createTraceEntry('CLAIM_INTAKE', 'FAIL', error.message || 'Unexpected intake error')
    );
    return {
      success: false,
      error: error.message || 'Claim intake failed',
      trace,
    };
  }
}

/**
 * Map normalized claim to the legacy pipeline claim shape.
 */
function toPipelineClaim(normalized, body = {}) {
  return {
    claim_id: normalized.claimId,
    member_id: normalized.memberId,
    policy_id: body.policy_id || 'PLUM_GHI_2024',
    claim_category: normalized.claimType,
    relationship: normalized.relationship,
    treatment_date: normalized.treatmentDate,
    submission_date: normalized.submissionDate,
    claimed_amount: normalized.claimedAmount,
    hospital_name: normalized.metadata?.hospitalName || body.hospitalName || body.hospital_name || null,
    doctor_name: normalized.metadata?.doctorName || body.doctorName || body.doctor_name || null,
    diagnosis: normalized.metadata?.diagnosis || body.diagnosis || null,
    treatment: normalized.metadata?.procedureName || body.procedureName || body.treatment || null,
    date_of_birth: normalized.metadata?.dob || body.dob || body.date_of_birth || null,
    gender: normalized.metadata?.gender || body.gender || null,
    member_name: normalized.metadata?.memberName || body.memberName || body.member_name || null,
    primary_member_id:
      normalized.metadata?.primaryMemberId || body.primaryMemberId || body.primary_member_id || null,
    pre_auth_id:
      normalized.metadata?.preAuthorizationId || body.preAuthorizationId || body.pre_auth_id || null,
    is_pre_existing: body.isPreExisting === true || body.isPreExisting === 'yes' || body.is_pre_existing === true,
    ytd_claims_amount: parseFloat(body.ytd_claims_amount || 0),
    claims_history: (() => {
      try {
        if (typeof body.claims_history === 'string') {
          return JSON.parse(body.claims_history || '[]');
        }
        return body.claims_history || [];
      } catch {
        return [];
      }
    })(),
    simulate_component_failure:
      body.simulate_component_failure === true || body.simulate_component_failure === 'true',
    pre_auth_obtained:
      body.preAuthorizationObtained === true ||
      body.preAuthorizationObtained === 'yes' ||
      body.pre_auth_obtained === true,
  };
}

module.exports = {
  processClaimIntake,
  toPipelineClaim,
  normalizeClaimType,
  normalizeRelationship,
  VALID_CLAIM_TYPES,
};
