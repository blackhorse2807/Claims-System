// server.js
// This is the main entry point of our claims processing system.
// It receives a claim, runs it through 5 steps, and returns a decision.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { getPolicy } = require('./policyLoader');

// Import all agents
const { verifyDocuments } = require('./agents/docVerifier');
const { parseDocuments } = require('./agents/docParser');
const { checkEligibility } = require('./agents/eligibility');
const { adjudicateClaim } = require('./agents/adjudicator');
const { detectFraud } = require('./agents/fraudDetector');
const { makeDecision } = require('./agents/decisionMaker');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log every incoming request
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Safely parse a field that may arrive as a JSON string or already-parsed object/array
function parseJsonField(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}

app.post('/api/claims', upload.array('files'), async (req, res) => {
  try {
    // ----------------------------
    // STEP 0: Parse incoming data
    // ----------------------------
    const claim = {
      member_id: req.body.member_id,
      policy_id: req.body.policy_id,
      claim_category: req.body.claim_category,
      treatment_date: req.body.treatment_date,
      claimed_amount: parseFloat(req.body.claimed_amount),
      hospital_name: req.body.hospital_name || null,
      ytd_claims_amount: parseFloat(req.body.ytd_claims_amount || 0),
      claims_history: parseJsonField(req.body.claims_history, []),
      simulate_component_failure: req.body.simulate_component_failure === 'true',
      pre_auth_obtained: req.body.pre_auth_obtained === 'true',
    };

    // Documents can come from two sources:
    // 1. JSON body documents array (for test cases with pre-extracted content)
    // 2. Actual file uploads (req.files) with base64 data
    let documents = [];

    if (req.body.documents) {
      documents = parseJsonField(req.body.documents, []);
    }

    // If there are actual file uploads, add them to the documents list
    if (req.files && req.files.length > 0) {
      const uploadedDocs = req.files.map((file, index) => ({
        file_id: `upload_${index}`,
        file_name: file.originalname,
        actual_type: req.body[`doc_type_${index}`] || 'UNKNOWN',
        base64Data: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      }));
      documents = [...documents, ...uploadedDocs];
    }

    console.log('\n--- New Claim Received ---');
    console.log(`Member: ${claim.member_id}, Category: ${claim.claim_category}, Amount: ₹${claim.claimed_amount}`);
    console.log(`Documents: ${documents.map((doc) => doc.actual_type).join(', ')}`);

    if (documents.length === 0) {
      return res.status(400).json({
        decision: null,
        blocked: true,
        reason: 'NO_DOCUMENTS',
        message: 'Please upload at least one document to process your claim.',
      });
    }

    // Load the policy once for use across all agents
    const policy = getPolicy();

    // ----------------------------
    // STEP 1: Verify documents
    // ----------------------------
    console.log('Step 1: Verifying documents...');
    const verificationResult = await verifyDocuments(claim.claim_category, documents);

    if (verificationResult.blocked) {
      console.log('Documents failed verification:', verificationResult.reason);
      return res.status(400).json({
        decision: null,
        blocked: true,
        reason: verificationResult.reason,
        message: verificationResult.message,
      });
    }
    console.log('Step 1: Documents verified ✓');

    // ----------------------------
    // STEP 2: Parse documents.
    // ----------------------------
    console.log('Step 2: Parsing documents...');
    let parsedDocsResult = null;
    const componentFailures = [];

    if (claim.simulate_component_failure) {
      console.log('Step 2: Component failure simulated — skipping docParser');
      componentFailures.push({ agent: 'docParser', error: 'Simulated component failure' });
    } else {
      try {
        parsedDocsResult = await parseDocuments(documents);
        console.log('Step 2: Documents parsed ✓');
      } catch (parseError) {
        console.error('Step 2: docParser failed:', parseError.message);
        componentFailures.push({ agent: 'docParser', error: parseError.message });
      }
    }

    // Pull out useful fields from parsed documents for downstream agents
    let extractedDiagnosis = claim.diagnosis || null;
    let extractedTreatment = claim.treatment || null;
    let extractedLineItems = claim.line_items || null;
    let extractedHospitalName = claim.hospital_name || null;

    if (parsedDocsResult && parsedDocsResult.documents) {
      for (const doc of parsedDocsResult.documents) {
        if (doc.extracted) {
          if (doc.extracted.diagnosis) {
            extractedDiagnosis = doc.extracted.diagnosis;
          }
          if (doc.extracted.tests_ordered && doc.extracted.tests_ordered.length > 0) {
            extractedTreatment = doc.extracted.tests_ordered.join(', ');
          }
          if (doc.extracted.test_name) {
            extractedTreatment = doc.extracted.test_name;
          }
          if (doc.extracted.treatment) {
            extractedTreatment = doc.extracted.treatment;
          }
          if (doc.extracted.line_items) {
            extractedLineItems = doc.extracted.line_items;
          }
          if (doc.extracted.hospital_name) {
            extractedHospitalName = doc.extracted.hospital_name;
          }
          if (doc.extracted.total && !extractedLineItems) {
            extractedLineItems = [
              { description: claim.claim_category, amount: doc.extracted.total },
            ];
          }
        }
      }
    }

    claim.diagnosis = extractedDiagnosis;
    claim.line_items = extractedLineItems;
    claim.hospital_name = extractedHospitalName || claim.hospital_name;
    claim.treatment = extractedTreatment || extractedDiagnosis;

    // ----------------------------
    // STEP 3: Run eligibility, adjudication, and fraud checks IN PARALLEL
    // ----------------------------
    console.log('Step 3: Running eligibility, adjudication, fraud checks in parallel...');

    let eligibilityResult;
    let adjudicationResult;
    let fraudResult;

    const [eligRes, adjRes, fraudRes] = await Promise.allSettled([
      checkEligibility(claim, policy),
      adjudicateClaim(claim, policy),
      detectFraud(claim, policy),
    ]);

    if (eligRes.status === 'fulfilled') {
      eligibilityResult = eligRes.value;
    } else {
      console.error('Eligibility agent failed:', eligRes.reason.message);
      componentFailures.push({ agent: 'eligibility', error: eligRes.reason.message });
      eligibilityResult = { agent: 'eligibility', passed: true, checks: [], rejection_reason: null };
    }

    if (adjRes.status === 'fulfilled') {
      adjudicationResult = adjRes.value;
    } else {
      console.error('Adjudication agent failed:', adjRes.reason.message);
      componentFailures.push({ agent: 'adjudicator', error: adjRes.reason.message });
      adjudicationResult = {
        agent: 'adjudicator',
        passed: true,
        checks: [],
        approved_amount: claim.claimed_amount,
        line_items: [],
        rejection_reason: null,
      };
    }

    if (fraudRes.status === 'fulfilled') {
      fraudResult = fraudRes.value;
    } else {
      console.error('Fraud agent failed:', fraudRes.reason.message);
      componentFailures.push({ agent: 'fraudDetector', error: fraudRes.reason.message });
      fraudResult = {
        agent: 'fraudDetector',
        passed: true,
        fraud_score: 0,
        flags: [],
        requires_manual_review: false,
        checks: [],
      };
    }

    console.log('Step 3: Checks complete ✓');

    // ----------------------------
    // STEP 4: Make the final decision
    // ----------------------------
    console.log('Step 4: Making final decision...');
    const decision = await makeDecision(
      claim,
      eligibilityResult,
      adjudicationResult,
      fraudResult,
      componentFailures,
      policy
    );

    decision.parsed_documents = parsedDocsResult;

    console.log(`Step 4: Decision = ${decision.decision}, Approved = ₹${decision.approved_amount} ✓`);
    console.log('--- Claim Processing Complete ---\n');

    return res.status(200).json(decision);
  } catch (error) {
    console.error('Pipeline error:', error);
    return res.status(500).json({
      error: 'Claims processing failed',
      detail: error.message,
    });
  }
});

// Health check route — verify the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Claims processing server is running' });
});

// Global error handler
app.use((err, req, res, next) => {
  res.status(500).json({
    error: 'Internal server error',
    detail: err.message,
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Claims processing server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
