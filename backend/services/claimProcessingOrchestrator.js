const fs = require('fs');
const path = require('path');
const { getPolicy } = require('../policyLoader');
const { processClaimIntake } = require('../agents/claimIntake');
const { validateMember } = require('../agents/memberValidationAgent');
const { processDocumentIntelligence } = require('../agents/documentIntelligenceAgent');
const { evaluateCoveragePolicy, evaluateDocumentRequirements } = require('../agents/coveragePolicyAgent');
const { adjudicateFinancialClaim } = require('../agents/financialAdjudicationAgent');
const { assessFraudRisk } = require('../agents/fraudRiskAgent');
const { makeClaimDecision } = require('../agents/decisionAgent');

const DEFAULT_CLAIMS_DATA_DIR = path.join(__dirname, '..', 'data', 'claims');

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function mergeWarnings(...warningLists) {
  return uniqueStrings(warningLists.flat());
}

function getDefaultAgents() {
  return {
    processClaimIntake,
    validateMember,
    processDocumentIntelligence,
    evaluateCoveragePolicy,
    adjudicateFinancialClaim,
    assessFraudRisk,
    makeClaimDecision,
  };
}

function ensureClaimsDirectory(claimsDataDir = DEFAULT_CLAIMS_DATA_DIR) {
  if (!fs.existsSync(claimsDataDir)) {
    fs.mkdirSync(claimsDataDir, { recursive: true });
  }
}

function persistClaimResult(claimId, payload, claimsDataDir = DEFAULT_CLAIMS_DATA_DIR) {
  if (!claimId) {
    return null;
  }

  try {
    ensureClaimsDirectory(claimsDataDir);
    const filePath = path.join(claimsDataDir, `${claimId}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return filePath;
  } catch (error) {
    return {
      error: error.message || 'Failed to persist claim result',
    };
  }
}

function buildBlockedResponse({
  claimId,
  stage,
  error,
  trace,
  warnings = [],
  extra = {},
}) {
  return {
    success: false,
    blocked: true,
    stage,
    claimId: claimId || null,
    decision: null,
    claimedAmount: null,
    approvedAmount: null,
    patientPayable: null,
    riskLevel: null,
    confidence: null,
    reasons: error ? [error] : [],
    warnings,
    trace,
    coverageChecks: {},
    adjustments: [],
    fraudFlags: [],
    error,
    ...extra,
  };
}

function buildFinalResponse({
  claimId,
  decisionResult,
  coverageResult,
  financialResult,
  fraudResult,
  documentIntelligenceResult,
  trace,
  warnings,
}) {
  return {
    success: true,
    blocked: false,
    claimId,
    decision: decisionResult.decision,
    claimedAmount: decisionResult.claimedAmount,
    approvedAmount: decisionResult.approvedAmount,
    patientPayable: decisionResult.patientPayable,
    riskLevel: decisionResult.riskLevel,
    confidence: decisionResult.confidence,
    reasons: decisionResult.reasons || [],
    warnings,
    trace,
    coverageChecks: coverageResult?.coverageChecks || {},
    adjustments: financialResult?.adjustments || [],
    fraudFlags: fraudResult?.riskFlags || [],
    documentIntelligenceResult,
    coverageResult,
    financialResult,
    fraudResult,
    decisionResult,
  };
}

/**
 * Execute the full claim processing pipeline by orchestrating existing agents.
 *
 * @param {{
 *   claimPayload?: object,
 *   uploadedDocuments?: { files?: object[], jsonDocuments?: object[] }
 * }} input
 * @param {{
 *   agents?: object,
 *   policy?: object,
 *   claimHistoryService?: object,
 *   documentIntelligenceServices?: object,
 *   claimsDataDir?: string,
 *   skipPersistence?: boolean
 * }} [options]
 */
async function processClaim(
  { claimPayload = {}, uploadedDocuments = {} },
  options = {}
) {
  const agents = { ...getDefaultAgents(), ...(options.agents || {}) };
  const policy = options.policy || getPolicy();
  const files = uploadedDocuments.files || [];
  const jsonDocuments = uploadedDocuments.jsonDocuments || [];
  let fullTrace = [];
  const warnings = [];
  let claimId = null;

  try {
    const intakeResult = agents.processClaimIntake({
      body: claimPayload,
      files,
      jsonDocuments,
    });

    fullTrace = [...(intakeResult.trace || [])];

    if (!intakeResult.success) {
      const response = buildBlockedResponse({
        stage: 'CLAIM_INTAKE',
        error: intakeResult.error || 'Claim intake failed',
        trace: fullTrace,
      });
      return response;
    }

    const claim = intakeResult.data;
    claimId = claim.claimId;

    const memberValidationResult = agents.validateMember(claim, fullTrace);
    fullTrace = [...(memberValidationResult.trace || fullTrace)];

    if (!memberValidationResult.success) {
      const isIdentityMismatch = memberValidationResult.identityMismatch === true;
      const response = buildBlockedResponse({
        claimId,
        stage: isIdentityMismatch ? 'MEMBER_IDENTITY_VALIDATION' : 'MEMBER_VALIDATION',
        error: memberValidationResult.error || 'Member validation failed',
        trace: fullTrace,
        extra: {
          validation: memberValidationResult.data?.validation || null,
          ...(isIdentityMismatch
            ? {
                status: 'MEMBER_DETAILS_MISMATCH',
                mismatches: memberValidationResult.mismatches || [],
                reasons: memberValidationResult.reasons || [],
              }
            : {}),
        },
      });

      if (!options.skipPersistence) {
        response.persistencePath = persistClaimResult(claimId, response, options.claimsDataDir);
      }

      return response;
    }

    const member = memberValidationResult.data.member;
    const validation = memberValidationResult.data.validation;

    const documentIntelligenceResult = await agents.processDocumentIntelligence(
      {
        claim,
        member,
        uploadedDocuments: claim.uploadedDocuments,
      },
      fullTrace,
      options.documentIntelligenceServices || {}
    );

    fullTrace = [...(documentIntelligenceResult.trace || fullTrace)];
    warnings.push(...(documentIntelligenceResult.warnings || []));

    if (documentIntelligenceResult.patientConsistencyCheck?.passed === false) {
      const consistencyCheck = documentIntelligenceResult.patientConsistencyCheck;
      const response = buildBlockedResponse({
        claimId,
        stage: 'DOCUMENT_INTELLIGENCE',
        error: consistencyCheck.message,
        trace: fullTrace,
        warnings: mergeWarnings(warnings),
        extra: {
          status: 'DOCUMENT_MISMATCH',
          patientConsistencyCheck: consistencyCheck,
          documentIntelligenceResult,
        },
      });

      if (!options.skipPersistence) {
        response.persistencePath = persistClaimResult(claimId, response, options.claimsDataDir);
      }

      return response;
    }

    const documentRequirementsResult = evaluateDocumentRequirements(
      {
        claim,
        policy,
        documentIntelligenceResult,
      },
      fullTrace
    );

    fullTrace = [...(documentRequirementsResult.trace || fullTrace)];

    if (documentRequirementsResult.actionRequired) {
      const response = buildBlockedResponse({
        claimId,
        stage: 'DOCUMENT_REQUIREMENTS',
        error: documentRequirementsResult.message,
        trace: fullTrace,
        warnings: mergeWarnings(warnings),
        extra: {
          status: documentRequirementsResult.status,
          uploadedDocumentTypes: documentRequirementsResult.uploadedDocumentTypes,
          missingDocumentTypes: documentRequirementsResult.missingDocumentTypes,
          documents: documentRequirementsResult.documents,
          documentRequirementsResult,
          documentIntelligenceResult,
        },
      });

      if (!options.skipPersistence) {
        response.persistencePath = persistClaimResult(claimId, response, options.claimsDataDir);
      }

      return response;
    }

    const coverageResult = agents.evaluateCoveragePolicy(
      {
        claim,
        member,
        validation,
        documentIntelligenceResult,
        policy,
      },
      fullTrace
    );

    fullTrace = [...(coverageResult.trace || fullTrace)];
    warnings.push(...(coverageResult.coverageWarnings || []));

    const financialResult = agents.adjudicateFinancialClaim(
      {
        claim,
        member,
        coverageResult,
        documentIntelligenceResult,
        policy,
      },
      fullTrace,
      {
        claimHistoryService: options.claimHistoryService,
      }
    );

    fullTrace = [...(financialResult.trace || fullTrace)];
    if (financialResult.warnings) {
      warnings.push(...financialResult.warnings);
    }

    const fraudResult = agents.assessFraudRisk(
      {
        claim,
        member,
        documentIntelligenceResult,
        coverageResult,
        financialResult,
        policy,
      },
      fullTrace,
      {
        claimHistoryService: options.claimHistoryService,
      }
    );

    fullTrace = [...(fraudResult.trace || fullTrace)];
    warnings.push(...(fraudResult.warnings || []));

    const decisionResult = agents.makeClaimDecision(
      {
        claim,
        member,
        coverageResult,
        financialResult,
        fraudResult,
        documentIntelligenceResult,
      },
      fullTrace
    );

    fullTrace = [...(decisionResult.trace || fullTrace)];
    warnings.push(...(decisionResult.warnings || []));

    const response = buildFinalResponse({
      claimId,
      decisionResult,
      coverageResult,
      financialResult,
      fraudResult,
      documentIntelligenceResult,
      trace: fullTrace,
      warnings: mergeWarnings(warnings),
    });

    if (!options.skipPersistence) {
      response.persistencePath = persistClaimResult(claimId, response, options.claimsDataDir);
    }

    return response;
  } catch (error) {
    const response = buildBlockedResponse({
      claimId,
      stage: 'ORCHESTRATOR',
      error: error.message || 'Claim processing failed',
      trace: fullTrace,
      warnings: mergeWarnings(warnings),
    });

    if (claimId && !options.skipPersistence) {
      response.persistencePath = persistClaimResult(claimId, response, options.claimsDataDir);
    }

    return response;
  }
}

module.exports = {
  processClaim,
  persistClaimResult,
  buildFinalResponse,
  buildBlockedResponse,
  DEFAULT_CLAIMS_DATA_DIR,
  getDefaultAgents,
};
