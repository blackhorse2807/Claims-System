// server.js — receives claims and runs them through the orchestrated processing pipeline.

require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { getAllMembers, clearPolicyCache } = require('./policyLoader');
const policyService = require('./services/policyService');
const { processClaim } = require('./services/claimProcessingOrchestrator');

clearPolicyCache();
policyService.clearPolicyCache();

const app = express();
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
      cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`);
    },
  }),
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

function parseJsonField(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}

function formatClaimResponse(result) {
  if (result.blocked) {
    return {
      success: false,
      blocked: true,
      stage: result.stage,
      claim_id: result.claimId,
      claimId: result.claimId,
      decision: null,
      error: result.error,
      message: result.error || result.reasons?.[0] || 'Claim could not be processed',
      reasons: result.reasons || [],
      warnings: result.warnings || [],
      trace: result.trace || [],
      validation: result.validation || null,
      status: result.status || null,
      patientConsistencyCheck: result.patientConsistencyCheck || null,
      documentIntelligenceResult: result.documentIntelligenceResult || null,
      uploadedDocumentTypes: result.uploadedDocumentTypes || null,
      missingDocumentTypes: result.missingDocumentTypes || null,
      documents: result.documents || null,
      documentRequirementsResult: result.documentRequirementsResult || null,
    };
  }

  const decision =
    result.decision === 'PARTIAL_APPROVED' ? 'PARTIAL' : result.decision;

  return {
    success: result.success !== false,
    blocked: false,
    claim_id: result.claimId,
    claimId: result.claimId,
    decision,
    claimed_amount: result.claimedAmount,
    claimedAmount: result.claimedAmount,
    approved_amount: result.approvedAmount,
    approvedAmount: result.approvedAmount,
    patient_payable: result.patientPayable,
    patientPayable: result.patientPayable,
    confidence_score: result.confidence,
    confidence: result.confidence,
    risk_level: result.riskLevel,
    riskLevel: result.riskLevel,
    reasons: result.reasons || [],
    warnings: result.warnings || [],
    rejection_reasons: decision === 'REJECTED' ? result.reasons || [] : [],
    trace: result.trace || [],
    coverage_checks: result.coverageChecks || {},
    coverageChecks: result.coverageChecks || {},
    adjustments: result.adjustments || [],
    fraud_flags: result.fraudFlags || [],
    fraudFlags: result.fraudFlags || [],
    persistence_path: result.persistencePath || null,
  };
}

app.get('/api/members', (req, res) => {
  res.json({ members: getAllMembers() });
});

app.post('/api/claims', upload.array('files'), async (req, res) => {
  try {
    const jsonDocuments = req.body.documents ? parseJsonField(req.body.documents, []) : [];

    console.log('\n--- New Claim Received ---');

    const result = await processClaim({
      claimPayload: req.body,
      uploadedDocuments: {
        files: req.files || [],
        jsonDocuments,
      },
    });

    const response = formatClaimResponse(result);

    if (result.blocked) {
      console.log(`Pipeline blocked at ${result.stage}: ${result.error}`);
      return res.status(400).json(response);
    }

    console.log(
      `Decision = ${response.decision}, Approved = ₹${response.approved_amount}, Claim ID = ${response.claim_id}`
    );
    console.log('--- Claim Processing Complete ---\n');

    return res.status(200).json(response);
  } catch (error) {
    console.error('Pipeline error:', error);
    return res.status(500).json({
      success: false,
      blocked: true,
      error: 'Claims processing failed',
      message: error.message,
      detail: error.message,
      trace: [
        {
          step: 'PIPELINE',
          status: 'FAIL',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Claims processing server is running' });
});

app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    detail: err.message,
    trace: [
      {
        step: 'SERVER',
        status: 'FAIL',
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    ],
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Claims processing server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
