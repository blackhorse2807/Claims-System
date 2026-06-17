const path = require('path');
const policyService = require('../services/policyService');

function createTraceEntry(step, status, message) {
  return {
    step,
    status,
    message,
    timestamp: new Date().toISOString(),
  };
}

function parseIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function normalizeClaimType(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function partialMatch(textA, textB) {
  if (!textA || !textB) {
    return false;
  }

  const lowerA = String(textA).toLowerCase();
  const lowerB = String(textB).toLowerCase();
  return lowerA.includes(lowerB) || lowerB.includes(lowerA);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCoverageFailures(failures) {
  const normalized = [];
  const seen = new Set();

  for (const failure of failures || []) {
    if (!failure) {
      continue;
    }

    if (typeof failure === 'string') {
      if (!seen.has(failure)) {
        seen.add(failure);
        normalized.push(failure);
      }
      continue;
    }

    const key = JSON.stringify(failure);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(failure);
    }
  }

  return normalized;
}

/**
 * Calculate the first date coverage is available after a waiting period.
 * @param {string} joinDateString
 * @param {number} waitingDays
 */
function calculateEligibleFromDate(joinDateString, waitingDays) {
  const joinDate = parseIsoDate(joinDateString);

  if (!joinDate || !Number.isFinite(waitingDays)) {
    return null;
  }

  return formatIsoDate(addDays(joinDate, waitingDays));
}

function getDiagnosisLabelForCondition(diagnosisTexts, conditionKey) {
  for (const text of diagnosisTexts) {
    if (conditionKeyMatchesText(conditionKey, text)) {
      return text;
    }
  }

  return conditionKey.replace(/_/g, ' ');
}

function pushWaitingPeriodFailure(
  coverageFailures,
  { diagnosis, eligibleFromDate, waitingDays, joinDateString },
  trace
) {
  coverageFailures.push({
    code: 'WAITING_PERIOD',
    diagnosis,
    eligibleFromDate,
  });

  trace.push(
    createTraceEntry(
      'WAITING_PERIOD_CALCULATION',
      'FAIL',
      `${diagnosis}: coverage available from ${eligibleFromDate} (${waitingDays} days from join date ${joinDateString})`
    )
  );

  trace.push(
    createTraceEntry(
      'WAITING_PERIOD',
      'FAIL',
      `${diagnosis} waiting period not cleared. Eligible from ${eligibleFromDate}`
    )
  );
}

function collectTextValues(values) {
  return values
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value;
      }
      return [value];
    })
    .map((value) => {
      if (value && typeof value === 'object') {
        return Object.values(value).join(' ');
      }
      return String(value || '');
    })
    .filter(Boolean);
}

function getPolicyFromInput(input) {
  return input?.policy || policyService.getPolicy();
}

function getClaimType(claim) {
  return normalizeClaimType(claim?.claimType || claim?.claim_category);
}

function getTreatmentDate(claim) {
  return claim?.treatmentDate || claim?.treatment_date || null;
}

function getJoinDate(member, policy) {
  if (member?.joinDate) {
    return member.joinDate;
  }

  if (member?.primaryMemberId) {
    const primary = (policy.members || []).find(
      (record) =>
        record.member_id === member.primaryMemberId || record.id === member.primaryMemberId
    );
    return primary?.join_date || null;
  }

  return null;
}

function getCategoryRules(policy, claimType) {
  const categories = policy.opd_categories || {};
  return categories[claimType.toLowerCase()] || null;
}

function getDiagnosisTexts(claim, documentIntelligenceResult) {
  const aggregated = documentIntelligenceResult?.aggregatedExtraction || {};
  const metadata = claim?.metadata || {};

  return uniqueStrings(
    collectTextValues([
      metadata.diagnosis,
      claim?.diagnosis,
      ...(aggregated.diagnosis || []),
      aggregated.finalDiagnosis,
    ])
  );
}

function getProcedureTexts(claim, documentIntelligenceResult) {
  const aggregated = documentIntelligenceResult?.aggregatedExtraction || {};
  const metadata = claim?.metadata || {};

  return uniqueStrings(
    collectTextValues([
      metadata.procedureName,
      claim?.treatment,
      claim?.procedureName,
      ...(aggregated.procedures || []),
    ])
  );
}

function getClinicalTexts(claim, documentIntelligenceResult) {
  const aggregated = documentIntelligenceResult?.aggregatedExtraction || {};
  const tests = (aggregated.tests || []).map((test) =>
    typeof test === 'object' ? test.testName || JSON.stringify(test) : test
  );

  return uniqueStrings([
    ...getDiagnosisTexts(claim, documentIntelligenceResult),
    ...getProcedureTexts(claim, documentIntelligenceResult),
    ...collectTextValues(tests),
    ...collectTextValues(aggregated.medicines || []),
  ]);
}

function getPreAuthorizationId(claim) {
  return (
    claim?.preAuthorizationId ||
    claim?.pre_auth_id ||
    claim?.metadata?.preAuthorizationId ||
    null
  );
}

function getPresentDocumentTypes(documentIntelligenceResult) {
  const documents = documentIntelligenceResult?.documents || [];

  return uniqueStrings(
    documents
      .map((document) => String(document?.documentType || '').trim().toUpperCase())
      .filter((documentType) => documentType && documentType !== 'UNKNOWN')
  );
}

function getUploadedDocumentTypes(documentIntelligenceResult) {
  const documents = documentIntelligenceResult?.documents || [];

  return documents.map((document) =>
    String(document?.documentType || 'UNKNOWN').trim().toUpperCase()
  );
}

const DOCUMENT_TYPE_LABELS = {
  PRESCRIPTION: 'Prescription',
  HOSPITAL_BILL: 'Hospital Bill',
  LAB_REPORT: 'Lab Report',
  PHARMACY_BILL: 'Pharmacy Bill',
  DENTAL_REPORT: 'Dental Report',
  DISCHARGE_SUMMARY: 'Discharge Summary',
  DIAGNOSTIC_REPORT: 'Diagnostic Report',
};

const UNREADABLE_DOCUMENT_WARNING_CODES = new Set([
  'BLUR_DETECTED',
  'LOW_IMAGE_QUALITY',
  'PARTIAL_DOCUMENT',
]);

function formatDocumentTypeLabel(documentType) {
  const normalized = String(documentType || '')
    .trim()
    .toUpperCase();

  if (DOCUMENT_TYPE_LABELS[normalized]) {
    return DOCUMENT_TYPE_LABELS[normalized];
  }

  return normalized
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatMissingDocumentsMessage(missingDocumentTypes) {
  const labels = missingDocumentTypes.map(formatDocumentTypeLabel);

  if (labels.length === 0) {
    return 'Required documents are missing.';
  }

  if (labels.length === 1) {
    return `${labels[0]} is required.`;
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]} are required.`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]} are required.`;
}

function getDocumentFileName(document) {
  return (
    document?.fileName ||
    document?.originalName ||
    document?.name ||
    'unknown_document'
  );
}

/**
 * Check whether all required document types are present for the claim category.
 * @param {string} claimType
 * @param {object} policy
 * @param {object} documentIntelligenceResult
 */
function checkDocumentCompleteness(claimType, policy, documentIntelligenceResult) {
  const requirements = policy.document_requirements || {};
  const categoryRequirements = requirements[claimType] || {};
  const requiredDocuments = categoryRequirements.required || [];
  const uploadedDocumentTypes = getUploadedDocumentTypes(documentIntelligenceResult);
  const presentDocumentTypes = getPresentDocumentTypes(documentIntelligenceResult);
  const missingDocumentTypes = requiredDocuments.filter(
    (documentType) => !presentDocumentTypes.includes(documentType)
  );

  if (requiredDocuments.length === 0 || missingDocumentTypes.length === 0) {
    return {
      passed: true,
      uploadedDocumentTypes,
      missingDocumentTypes: [],
      message: 'All required documents are present.',
    };
  }

  return {
    passed: false,
    uploadedDocumentTypes,
    missingDocumentTypes,
    message: formatMissingDocumentsMessage(missingDocumentTypes),
  };
}

/**
 * Detect uploaded documents flagged as unreadable by quality analysis.
 * @param {object} documentIntelligenceResult
 */
function checkUnreadableDocuments(documentIntelligenceResult) {
  const documents = documentIntelligenceResult?.documents || [];
  const unreadableDocuments = [];

  for (const document of documents) {
    const warnings = document?.warnings || [];
    const hasUnreadableWarning = warnings.some((warning) =>
      UNREADABLE_DOCUMENT_WARNING_CODES.has(String(warning).trim().toUpperCase())
    );

    if (hasUnreadableWarning) {
      unreadableDocuments.push({
        fileName: getDocumentFileName(document),
        reason: 'Unreadable document',
      });
    }
  }

  if (unreadableDocuments.length === 0) {
    return {
      passed: true,
      documents: [],
      message: 'All uploaded documents are readable.',
    };
  }

  return {
    passed: false,
    documents: unreadableDocuments,
    message:
      unreadableDocuments.length === 1
        ? `${unreadableDocuments[0].fileName} is unreadable and must be re-uploaded.`
        : 'One or more uploaded documents are unreadable and must be re-uploaded.',
  };
}

/**
 * Evaluate whether the claimant must upload or re-upload documents before coverage checks.
 *
 * @param {{
 *   claim: object,
 *   policy?: object,
 *   documentIntelligenceResult: object
 * }} input
 * @param {import('../types/claimIntake').TraceEntry[]} [existingTrace]
 */
function evaluateDocumentRequirements(input, existingTrace = []) {
  const trace = [...existingTrace];
  const policy = getPolicyFromInput(input);
  const claim = input?.claim || {};
  const documentIntelligenceResult = input?.documentIntelligenceResult || {};
  const claimType = getClaimType(claim);

  const unreadableCheck = checkUnreadableDocuments(documentIntelligenceResult);

  if (!unreadableCheck.passed) {
    trace.push(
      createTraceEntry(
        'DOCUMENT_REUPLOAD_REQUIRED',
        'FAIL',
        `Unreadable documents: ${unreadableCheck.documents.map((document) => document.fileName).join(', ')}`
      )
    );

    return {
      actionRequired: true,
      status: 'PENDING_DOCUMENT_REUPLOAD',
      documents: unreadableCheck.documents,
      uploadedDocumentTypes: getUploadedDocumentTypes(documentIntelligenceResult),
      missingDocumentTypes: [],
      message: unreadableCheck.message,
      unreadableDocumentCheck: unreadableCheck,
      documentCompletenessCheck: null,
      trace,
    };
  }

  trace.push(
    createTraceEntry(
      'DOCUMENT_REUPLOAD_REQUIRED',
      'PASS',
      'All uploaded documents are readable.'
    )
  );

  if (!claimType) {
    trace.push(
      createTraceEntry(
        'DOCUMENT_COMPLETENESS_CHECK',
        'WARNING',
        'Claim category missing — document completeness check skipped'
      )
    );

    return {
      actionRequired: false,
      status: null,
      documents: [],
      uploadedDocumentTypes: getUploadedDocumentTypes(documentIntelligenceResult),
      missingDocumentTypes: [],
      message: null,
      unreadableDocumentCheck: unreadableCheck,
      documentCompletenessCheck: null,
      trace,
    };
  }

  const completenessCheck = checkDocumentCompleteness(
    claimType,
    policy,
    documentIntelligenceResult
  );

  if (!completenessCheck.passed) {
    trace.push(
      createTraceEntry(
        'DOCUMENT_COMPLETENESS_CHECK',
        'FAIL',
        completenessCheck.message
      )
    );

    return {
      actionRequired: true,
      status: 'PENDING_DOCUMENT_UPLOAD',
      documents: [],
      uploadedDocumentTypes: completenessCheck.uploadedDocumentTypes,
      missingDocumentTypes: completenessCheck.missingDocumentTypes,
      message: completenessCheck.message,
      unreadableDocumentCheck: unreadableCheck,
      documentCompletenessCheck: completenessCheck,
      trace,
    };
  }

  trace.push(
    createTraceEntry(
      'DOCUMENT_COMPLETENESS_CHECK',
      'PASS',
      'All required documents are present.'
    )
  );

  return {
    actionRequired: false,
    status: null,
    documents: [],
    uploadedDocumentTypes: completenessCheck.uploadedDocumentTypes,
    missingDocumentTypes: [],
    message: null,
    unreadableDocumentCheck: unreadableCheck,
    documentCompletenessCheck: completenessCheck,
    trace,
  };
}

function conditionKeyMatchesText(conditionKey, text) {
  const lower = String(text || '').toLowerCase();
  if (!lower) {
    return false;
  }

  const phrase = String(conditionKey).toLowerCase().replace(/_/g, ' ');
  if (lower.includes(phrase)) {
    return true;
  }

  if (conditionKey === 'hernia' && lower.includes('herniation') && !lower.includes('hernia')) {
    return false;
  }

  const words = phrase.split(' ').filter((word) => word.length > 2);
  if (words.length === 0) {
    return false;
  }

  return words.every((word) => lower.includes(word));
}

function findMatchingConditionKeys(texts, specificConditions) {
  const matches = [];

  for (const text of texts) {
    for (const conditionKey of Object.keys(specificConditions || {})) {
      if (conditionKeyMatchesText(conditionKey, text)) {
        matches.push(conditionKey);
      }
    }
  }

  return uniqueStrings(matches);
}

function findMatchingListItem(texts, items) {
  for (const text of texts) {
    for (const item of items || []) {
      if (partialMatch(text, item)) {
        return item;
      }
    }
  }

  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWholeWord(text, word) {
  if (!text || !word) {
    return false;
  }

  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
  return pattern.test(text);
}

const EXCLUSION_WORD_STOPWORDS = new Set([
  'treatment',
  'treatments',
  'procedure',
  'procedures',
  'surgery',
  'surgeries',
  'medical',
  'health',
  'programs',
  'necessary',
]);

function findMatchingExclusion(texts, exclusionList) {
  const combined = texts.join(' ').toLowerCase();

  for (const exclusion of exclusionList || []) {
    for (const text of texts) {
      if (partialMatch(text, exclusion)) {
        return exclusion;
      }
    }

    const exclusionWords = String(exclusion)
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 5 && !EXCLUSION_WORD_STOPWORDS.has(word));

    for (const word of exclusionWords) {
      if (texts.some((text) => containsWholeWord(text, word)) || containsWholeWord(combined, word)) {
        return exclusion;
      }
    }
  }

  return null;
}

function preAuthRuleApplies(rule, texts, claim, policy) {
  const combined = texts.join(' ').toLowerCase();
  const ruleLower = String(rule).toLowerCase();

  if (!combined && !ruleLower) {
    return false;
  }

  const diagnosticCategory = policy.opd_categories?.diagnostic || {};
  const threshold = diagnosticCategory.pre_auth_threshold;
  const claimedAmount = Number(claim?.claimedAmount ?? claim?.claimed_amount ?? 0);
  const amountQualifier = /amount\s*>\s*₹?\s*([\d,]+)/i.exec(ruleLower);
  const requiredAmount = amountQualifier
    ? Number(amountQualifier[1].replace(/,/g, ''))
    : threshold;

  const scanKeywords = [
    { token: 'mri', label: 'mri' },
    { token: 'ct scan', label: 'ct' },
    { token: 'ct', label: 'ct' },
    { token: 'pet scan', label: 'pet' },
    { token: 'pet', label: 'pet' },
  ];

  for (const scan of scanKeywords) {
    if (ruleLower.includes(scan.token) && combined.includes(scan.label)) {
      if (requiredAmount && claimedAmount > 0) {
        return claimedAmount > requiredAmount;
      }
      return true;
    }
  }

  if (
    (ruleLower.includes('surgery') || ruleLower.includes('surgical')) &&
    (combined.includes('surgery') || combined.includes('surgical'))
  ) {
    return true;
  }

  if (ruleLower.includes('hospitalization') && combined.includes('hospitalization')) {
    return true;
  }

  const ruleWords = ruleLower
    .replace(/[₹(),>-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4);

  return ruleWords.some((word) => combined.includes(word));
}

function checkCategoryCoverage(claimType, policy, trace, coverageWarnings, coverageFailures) {
  const categoryRules = getCategoryRules(policy, claimType);

  if (!categoryRules || categoryRules.covered === false) {
    const message = `Claim category ${claimType} is not covered under policy`;
    coverageFailures.push(message);
    trace.push(createTraceEntry('CATEGORY_COVERAGE', 'FAIL', message));
    return false;
  }

  trace.push(
    createTraceEntry('CATEGORY_COVERAGE', 'PASS', `Claim category ${claimType} is covered`)
  );
  return true;
}

function checkWaitingPeriods(
  claim,
  member,
  policy,
  diagnosisTexts,
  trace,
  coverageWarnings,
  coverageFailures
) {
  const waitingPeriods = policy.waiting_periods || {};
  const initialWaitingDays = waitingPeriods.initial_waiting_period_days;
  const specificConditions = waitingPeriods.specific_conditions || {};
  const treatmentDate = parseIsoDate(getTreatmentDate(claim));
  const joinDateString = getJoinDate(member, policy);
  const joinDate = parseIsoDate(joinDateString);

  if (!treatmentDate) {
    coverageWarnings.push('Treatment date missing — waiting period check skipped');
    trace.push(
      createTraceEntry(
        'WAITING_PERIOD',
        'WARNING',
        'Treatment date missing — waiting period check skipped'
      )
    );
    return true;
  }

  if (!joinDate) {
    coverageWarnings.push('Member join date missing — waiting period check skipped');
    trace.push(
      createTraceEntry(
        'WAITING_PERIOD',
        'WARNING',
        'Member join date missing — waiting period check skipped'
      )
    );
    return true;
  }

  if (Number.isFinite(initialWaitingDays)) {
    const eligibleFromDate = calculateEligibleFromDate(joinDateString, initialWaitingDays);
    const initialEligibleDate = parseIsoDate(eligibleFromDate);

    if (initialEligibleDate && treatmentDate < initialEligibleDate) {
      pushWaitingPeriodFailure(
        coverageFailures,
        {
          diagnosis: 'Initial waiting period',
          eligibleFromDate,
          waitingDays: initialWaitingDays,
          joinDateString,
        },
        trace
      );
      return false;
    }
  } else {
    coverageWarnings.push('Initial waiting period not configured in policy');
  }

  const matchedConditions = findMatchingConditionKeys(diagnosisTexts, specificConditions);
  for (const conditionKey of matchedConditions) {
    const waitingDays = specificConditions[conditionKey];
    if (!Number.isFinite(waitingDays)) {
      continue;
    }

    const eligibleFromDate = calculateEligibleFromDate(joinDateString, waitingDays);
    const eligibleDate = parseIsoDate(eligibleFromDate);

    if (eligibleDate && treatmentDate < eligibleDate) {
      pushWaitingPeriodFailure(
        coverageFailures,
        {
          diagnosis: getDiagnosisLabelForCondition(diagnosisTexts, conditionKey),
          eligibleFromDate,
          waitingDays,
          joinDateString,
        },
        trace
      );
      return false;
    }
  }

  const conditionMessage =
    matchedConditions.length > 0
      ? `Waiting periods cleared for: ${matchedConditions.join(', ')}`
      : `Initial waiting period of ${initialWaitingDays} days cleared`;

  trace.push(createTraceEntry('WAITING_PERIOD', 'PASS', conditionMessage));
  return true;
}

function checkProcedureCoverage(
  claimType,
  policy,
  procedureTexts,
  trace,
  coverageWarnings,
  coverageFailures
) {
  const categoryRules = getCategoryRules(policy, claimType) || {};

  if (claimType === 'DENTAL') {
    const coveredProcedures = categoryRules.covered_procedures || [];
    const excludedProcedures = [
      ...(policy.exclusions?.dental_exclusions || []),
      ...(categoryRules.excluded_procedures || []),
    ];

    if (procedureTexts.length === 0) {
      coverageWarnings.push('Dental procedure not specified — procedure coverage assumed');
      trace.push(
        createTraceEntry(
          'PROCEDURE_COVERAGE',
          'WARNING',
          'Dental procedure not specified — procedure coverage assumed'
        )
      );
      return true;
    }

    const excludedMatch = findMatchingListItem(procedureTexts, excludedProcedures);
    if (excludedMatch) {
      const message = `Dental procedure is not covered: ${excludedMatch}`;
      coverageFailures.push(message);
      trace.push(createTraceEntry('PROCEDURE_COVERAGE', 'FAIL', message));
      return false;
    }

    const coveredMatch = findMatchingListItem(procedureTexts, coveredProcedures);
    if (coveredMatch) {
      trace.push(
        createTraceEntry(
          'PROCEDURE_COVERAGE',
          'PASS',
          `Dental procedure covered: ${coveredMatch}`
        )
      );
      return true;
    }

    const message = `Dental procedure not found in covered procedures: ${procedureTexts.join(', ')}`;
    coverageWarnings.push(message);
    trace.push(createTraceEntry('PROCEDURE_COVERAGE', 'WARNING', message));
    return true;
  }

  if (claimType === 'VISION') {
    const coveredItems = categoryRules.covered_items || [];
    const excludedItems = [
      ...(policy.exclusions?.vision_exclusions || []),
      ...(categoryRules.excluded_items || []),
    ];

    if (procedureTexts.length === 0) {
      coverageWarnings.push('Vision item not specified — procedure coverage assumed');
      trace.push(
        createTraceEntry(
          'PROCEDURE_COVERAGE',
          'WARNING',
          'Vision item not specified — procedure coverage assumed'
        )
      );
      return true;
    }

    const excludedMatch = findMatchingListItem(procedureTexts, excludedItems);
    if (excludedMatch) {
      const message = `Vision item is not covered: ${excludedMatch}`;
      coverageFailures.push(message);
      trace.push(createTraceEntry('PROCEDURE_COVERAGE', 'FAIL', message));
      return false;
    }

    const coveredMatch = findMatchingListItem(procedureTexts, coveredItems);
    if (coveredMatch) {
      trace.push(
        createTraceEntry(
          'PROCEDURE_COVERAGE',
          'PASS',
          `Vision item covered: ${coveredMatch}`
        )
      );
      return true;
    }

    coverageWarnings.push(`Vision item not found in covered items: ${procedureTexts.join(', ')}`);
    trace.push(
      createTraceEntry(
        'PROCEDURE_COVERAGE',
        'WARNING',
        `Vision item not found in covered items: ${procedureTexts.join(', ')}`
      )
    );
    return true;
  }

  trace.push(
    createTraceEntry(
      'PROCEDURE_COVERAGE',
      'PASS',
      `Procedure coverage check not required for ${claimType}`
    )
  );
  return true;
}

function checkExclusions(
  claimType,
  policy,
  clinicalTexts,
  trace,
  coverageWarnings,
  coverageFailures
) {
  const exclusionLists = [policy.exclusions?.conditions || []];

  if (claimType === 'DENTAL') {
    exclusionLists.push(policy.exclusions?.dental_exclusions || []);
  }

  if (claimType === 'VISION') {
    exclusionLists.push(policy.exclusions?.vision_exclusions || []);
  }

  if (clinicalTexts.length === 0) {
    coverageWarnings.push('No diagnosis or procedure available for exclusion check');
    trace.push(
      createTraceEntry(
        'EXCLUSION_CHECK',
        'WARNING',
        'No diagnosis or procedure available for exclusion check'
      )
    );
    return false;
  }

  for (const exclusionList of exclusionLists) {
    const matchedExclusion = findMatchingExclusion(clinicalTexts, exclusionList);
    if (matchedExclusion) {
      const message = `Claim matches policy exclusion: ${matchedExclusion}`;
      coverageFailures.push(message);
      trace.push(createTraceEntry('EXCLUSION_CHECK', 'FAIL', message));
      return true;
    }
  }

  trace.push(createTraceEntry('EXCLUSION_CHECK', 'PASS', 'No policy exclusions matched'));
  return false;
}

function checkPreAuthorization(
  claim,
  policy,
  clinicalTexts,
  trace,
  coverageWarnings,
  coverageFailures
) {
  const requiredFor = policy.pre_authorization?.required_for || [];
  const diagnosticCategory = policy.opd_categories?.diagnostic || {};
  const highValueTests = diagnosticCategory.high_value_tests_requiring_pre_auth || [];
  const applicableRules = uniqueStrings([...requiredFor, ...highValueTests]);

  const matchedRules = applicableRules.filter((rule) =>
    preAuthRuleApplies(rule, clinicalTexts, claim, policy)
  );

  if (matchedRules.length === 0) {
    trace.push(
      createTraceEntry('PREAUTH_CHECK', 'PASS', 'Pre-authorization not required for this claim')
    );
    return true;
  }

  const preAuthorizationId = getPreAuthorizationId(claim);
  if (!preAuthorizationId) {
    const message = `Pre-authorization required for: ${matchedRules.join(', ')}`;
    coverageFailures.push(message);
    trace.push(createTraceEntry('PREAUTH_CHECK', 'FAIL', message));
    return false;
  }

  trace.push(
    createTraceEntry(
      'PREAUTH_CHECK',
      'PASS',
      `Pre-authorization satisfied: ${preAuthorizationId}`
    )
  );
  return true;
}

function buildCoverageChecks(values) {
  return {
    categoryCovered: values.categoryCovered,
    documentsValid: values.documentsValid,
    waitingPeriodPassed: values.waitingPeriodPassed,
    procedureCovered: values.procedureCovered,
    exclusionMatched: values.exclusionMatched,
    preAuthSatisfied: values.preAuthSatisfied,
  };
}

/**
 * Coverage & Policy Agent — deterministic eligibility checks using policy_terms.json.
 *
 * @param {{
 *   claim: object,
 *   member: object,
 *   validation: object,
 *   documentIntelligenceResult: object,
 *   policy?: object
 * }} input
 * @param {import('../types/claimIntake').TraceEntry[]} [existingTrace]
 */
function evaluateCoveragePolicy(input, existingTrace = []) {
  const trace = [...existingTrace];
  const coverageWarnings = [];
  const coverageFailures = [];

  try {
    const policy = getPolicyFromInput(input);
    const claim = input?.claim || {};
    const member = input?.member || {};
    const documentIntelligenceResult = input?.documentIntelligenceResult || {};
    const claimType = getClaimType(claim);

    if (!claimType) {
      coverageWarnings.push('Claim category missing — unable to evaluate category coverage');
      trace.push(
        createTraceEntry('CATEGORY_COVERAGE', 'WARNING', 'Claim category missing')
      );
      return {
        eligible: false,
        coverageChecks: buildCoverageChecks({
          categoryCovered: false,
          documentsValid: false,
          waitingPeriodPassed: false,
          procedureCovered: false,
          exclusionMatched: false,
          preAuthSatisfied: false,
        }),
        coverageWarnings,
        coverageFailures: ['Claim category is required for coverage evaluation'],
        trace,
      };
    }

    const diagnosisTexts = getDiagnosisTexts(claim, documentIntelligenceResult);
    const procedureTexts = getProcedureTexts(claim, documentIntelligenceResult);
    const clinicalTexts = getClinicalTexts(claim, documentIntelligenceResult);

    const categoryCovered = checkCategoryCoverage(
      claimType,
      policy,
      trace,
      coverageWarnings,
      coverageFailures
    );

    const completenessCheck = checkDocumentCompleteness(
      claimType,
      policy,
      documentIntelligenceResult
    );
    const documentsValid = completenessCheck.passed;

    if (!completenessCheck.passed) {
      coverageWarnings.push(completenessCheck.message);
      trace.push(
        createTraceEntry('DOCUMENT_REQUIREMENTS', 'WARNING', completenessCheck.message)
      );
    } else {
      const requirements = policy.document_requirements?.[claimType]?.required || [];
      if (requirements.length > 0) {
        trace.push(
          createTraceEntry(
            'DOCUMENT_REQUIREMENTS',
            'PASS',
            `Required documents present: ${requirements.join(', ')}`
          )
        );
      }
    }

    const waitingPeriodPassed = checkWaitingPeriods(
      claim,
      member,
      policy,
      diagnosisTexts,
      trace,
      coverageWarnings,
      coverageFailures
    );

    const procedureCovered = checkProcedureCoverage(
      claimType,
      policy,
      procedureTexts,
      trace,
      coverageWarnings,
      coverageFailures
    );

    const exclusionMatched = checkExclusions(
      claimType,
      policy,
      clinicalTexts,
      trace,
      coverageWarnings,
      coverageFailures
    );

    const preAuthSatisfied = checkPreAuthorization(
      claim,
      policy,
      clinicalTexts,
      trace,
      coverageWarnings,
      coverageFailures
    );

    const coverageChecks = buildCoverageChecks({
      categoryCovered,
      documentsValid,
      waitingPeriodPassed,
      procedureCovered,
      exclusionMatched,
      preAuthSatisfied,
    });

    const eligible =
      categoryCovered &&
      documentsValid &&
      waitingPeriodPassed &&
      procedureCovered &&
      !exclusionMatched &&
      preAuthSatisfied;

    return {
      eligible,
      coverageChecks,
      coverageWarnings: uniqueStrings(coverageWarnings),
      coverageFailures: normalizeCoverageFailures(coverageFailures),
      trace,
      claim,
      member,
      validation: input?.validation || null,
      documentIntelligenceResult,
    };
  } catch (error) {
    const message = error.message || 'Coverage evaluation failed';
    coverageWarnings.push(message);
    trace.push(createTraceEntry('CATEGORY_COVERAGE', 'FAIL', message));

    return {
      eligible: false,
      coverageChecks: buildCoverageChecks({
        categoryCovered: false,
        documentsValid: false,
        waitingPeriodPassed: false,
        procedureCovered: false,
        exclusionMatched: false,
        preAuthSatisfied: false,
      }),
      coverageWarnings: uniqueStrings(coverageWarnings),
      coverageFailures: normalizeCoverageFailures([...coverageFailures, message]),
      trace,
      claim: input?.claim || null,
      member: input?.member || null,
      validation: input?.validation || null,
      documentIntelligenceResult: input?.documentIntelligenceResult || null,
    };
  }
}

module.exports = {
  evaluateCoveragePolicy,
  evaluateDocumentRequirements,
  checkDocumentCompleteness,
  checkUnreadableDocuments,
  calculateEligibleFromDate,
  createTraceEntry,
  getPresentDocumentTypes,
  getUploadedDocumentTypes,
  formatDocumentTypeLabel,
  findMatchingConditionKeys,
  findMatchingExclusion,
  preAuthRuleApplies,
  conditionKeyMatchesText,
};
