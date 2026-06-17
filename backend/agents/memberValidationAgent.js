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
  return new Date(`${value}T00:00:00`);
}

function daysBetween(earlierIso, laterIso) {
  const earlier = parseIsoDate(earlierIso);
  const later = parseIsoDate(laterIso);

  if (!earlier || !later) {
    return null;
  }

  const ms = later.getTime() - earlier.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function normalizeRelationship(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function toMember(record, service) {
  return {
    memberId: record.member_id || record.id,
    name: record.name,
    relationship: normalizeRelationship(record.relationship),
    joinDate: service.getEffectiveJoinDate(record),
    primaryMemberId: record.primary_member_id || null,
    dateOfBirth: record.date_of_birth || null,
    gender: record.gender || null,
  };
}

function createValidationResult() {
  return {
    memberFound: false,
    relationshipValid: false,
    identityValid: false,
    treatmentDateValid: false,
    submissionDeadlineValid: false,
    policyActive: false,
  };
}

function normalizeMemberName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeGender(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'm' || normalized === 'male') {
    return 'M';
  }

  if (normalized === 'f' || normalized === 'female') {
    return 'F';
  }

  return normalized.toUpperCase();
}

function normalizeDob(value) {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();
  const parsed = parseIsoDate(trimmed);

  if (!parsed) {
    return trimmed;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSubmittedMemberFields(claim) {
  const metadata = claim?.metadata || {};

  return {
    memberName: metadata.memberName || claim?.member_name || claim?.memberName || '',
    dob: metadata.dob || claim?.date_of_birth || claim?.dob || '',
    gender: metadata.gender || claim?.gender || '',
  };
}

const IDENTITY_FIELD_MESSAGES = {
  memberName: 'Submitted member name does not match policy records.',
  dob: 'Submitted date of birth does not match policy records.',
  gender: 'Submitted gender does not match policy records.',
};

/**
 * Compare submitted applicant details against the policy member record.
 * @param {import('../types/claimIntake').NormalizedClaim} claim
 * @param {object} member
 * @param {import('../types/claimIntake').TraceEntry[]} trace
 */
function validateMemberIdentity(claim, member, trace) {
  const submitted = getSubmittedMemberFields(claim);
  const mismatches = [];

  const expectedName = normalizeMemberName(member.name);
  const submittedName = normalizeMemberName(submitted.memberName);

  if (!submittedName || submittedName !== expectedName) {
    mismatches.push({
      field: 'memberName',
      submitted: submitted.memberName || '',
      expected: member.name || '',
    });
    trace.push(
      createTraceEntry(
        'MEMBER_NAME_CHECK',
        'FAIL',
        `Submitted name "${submitted.memberName || 'missing'}" does not match policy record "${member.name}"`
      )
    );
  } else {
    trace.push(
      createTraceEntry(
        'MEMBER_NAME_CHECK',
        'PASS',
        `Member name matches policy record (${member.name})`
      )
    );
  }

  const expectedDob = normalizeDob(member.dateOfBirth);
  const submittedDob = normalizeDob(submitted.dob);

  if (!submittedDob || submittedDob !== expectedDob) {
    mismatches.push({
      field: 'dob',
      submitted: submitted.dob || '',
      expected: member.dateOfBirth || '',
    });
    trace.push(
      createTraceEntry(
        'DOB_CHECK',
        'FAIL',
        `Submitted DOB "${submitted.dob || 'missing'}" does not match policy record "${member.dateOfBirth}"`
      )
    );
  } else {
    trace.push(
      createTraceEntry(
        'DOB_CHECK',
        'PASS',
        `Date of birth matches policy record (${member.dateOfBirth})`
      )
    );
  }

  const expectedGender = normalizeGender(member.gender);
  const submittedGender = normalizeGender(submitted.gender);

  if (!submittedGender || submittedGender !== expectedGender) {
    mismatches.push({
      field: 'gender',
      submitted: submitted.gender || '',
      expected: member.gender || '',
    });
    trace.push(
      createTraceEntry(
        'GENDER_CHECK',
        'FAIL',
        `Submitted gender "${submitted.gender || 'missing'}" does not match policy record "${member.gender}"`
      )
    );
  } else {
    trace.push(
      createTraceEntry(
        'GENDER_CHECK',
        'PASS',
        `Gender matches policy record (${member.gender})`
      )
    );
  }

  if (mismatches.length === 0) {
    return { passed: true, mismatches: [], reasons: [] };
  }

  const reasons = mismatches.map((mismatch) => IDENTITY_FIELD_MESSAGES[mismatch.field]);

  return {
    passed: false,
    mismatches,
    reasons,
  };
}

/**
 * Member Validation Agent — validates member, relationship, dates, and policy status.
 * No AI. Uses policy_terms.json via policyService.
 *
 * @param {import('../types/claimIntake').NormalizedClaim} normalizedClaim
 * @param {TraceEntry[]} [existingTrace]
 * @param {typeof policyService} [service]
 * @returns {AgentResult<ValidatedClaim>}
 */
function validateMember(normalizedClaim, existingTrace = [], service = policyService) {
  const trace = [...existingTrace];
  const validation = createValidationResult();

  try {
    const memberRecord = service.getMemberById(normalizedClaim.memberId);

    if (!memberRecord) {
      trace.push(
        createTraceEntry(
          'MEMBER_LOOKUP',
          'FAIL',
          `Member ${normalizedClaim.memberId} not found`
        )
      );
      return {
        success: false,
        error: 'Member not found',
        trace,
        data: {
          claim: normalizedClaim,
          member: null,
          validation,
        },
      };
    }

    validation.memberFound = true;
    const member = toMember(memberRecord, service);

    trace.push(
      createTraceEntry(
        'MEMBER_LOOKUP',
        'PASS',
        `Member ${member.memberId} found`
      )
    );

    const claimRelationship = normalizeRelationship(normalizedClaim.relationship);
    if (claimRelationship !== member.relationship) {
      trace.push(
        createTraceEntry(
          'RELATIONSHIP_CHECK',
          'FAIL',
          `Claim relationship ${claimRelationship} does not match member relationship ${member.relationship}`
        )
      );
      return {
        success: false,
        error: 'Relationship does not match member record',
        trace,
        data: {
          claim: normalizedClaim,
          member,
          validation,
        },
      };
    }

    validation.relationshipValid = true;
    trace.push(
      createTraceEntry(
        'RELATIONSHIP_CHECK',
        'PASS',
        `Relationship ${member.relationship} verified`
      )
    );

    const identityCheck = validateMemberIdentity(normalizedClaim, member, trace);

    if (!identityCheck.passed) {
      return {
        success: false,
        blocked: true,
        identityMismatch: true,
        status: 'MEMBER_DETAILS_MISMATCH',
        error: identityCheck.reasons[0] || 'Submitted member details do not match policy records.',
        reasons: identityCheck.reasons,
        mismatches: identityCheck.mismatches,
        trace,
        data: {
          claim: normalizedClaim,
          member,
          validation,
        },
      };
    }

    validation.identityValid = true;

    if (member.joinDate) {
      const treatmentDate = parseIsoDate(normalizedClaim.treatmentDate);
      const joinDate = parseIsoDate(member.joinDate);

      if (!treatmentDate || treatmentDate < joinDate) {
        trace.push(
          createTraceEntry(
            'TREATMENT_DATE',
            'FAIL',
            `Treatment date ${normalizedClaim.treatmentDate} is before member join date ${member.joinDate}`
          )
        );
        return {
          success: false,
          error: 'Treatment date cannot be before member join date',
          trace,
          data: {
            claim: normalizedClaim,
            member,
            validation,
          },
        };
      }
    }

    validation.treatmentDateValid = true;
    trace.push(
      createTraceEntry(
        'TREATMENT_DATE',
        'PASS',
        `Treatment date ${normalizedClaim.treatmentDate} is on or after join date`
      )
    );

    const submissionRules = service.getSubmissionRules();
    const deadlineDays = submissionRules.deadlineDaysFromTreatment;

    if (typeof deadlineDays === 'number') {
      const elapsedDays = daysBetween(
        normalizedClaim.treatmentDate,
        normalizedClaim.submissionDate
      );

      if (elapsedDays === null || elapsedDays < 0) {
        trace.push(
          createTraceEntry(
            'SUBMISSION_DEADLINE',
            'FAIL',
            'Submission date cannot be before treatment date'
          )
        );
        return {
          success: false,
          error: 'Claim submission date cannot be before the treatment date',
          trace,
          data: {
            claim: normalizedClaim,
            member,
            validation,
          },
        };
      }

      if (elapsedDays > deadlineDays) {
        trace.push(
          createTraceEntry(
            'SUBMISSION_DEADLINE',
            'FAIL',
            `Claim submitted ${elapsedDays} days after treatment; policy limit is ${deadlineDays} days`
          )
        );
        return {
          success: false,
          error: 'Claim submitted after policy deadline',
          trace,
          data: {
            claim: normalizedClaim,
            member,
            validation,
          },
        };
      }

      validation.submissionDeadlineValid = true;
      trace.push(
        createTraceEntry(
          'SUBMISSION_DEADLINE',
          'PASS',
          `Claim submitted within ${deadlineDays} day limit`
        )
      );
    } else {
      validation.submissionDeadlineValid = true;
      trace.push(
        createTraceEntry(
          'SUBMISSION_DEADLINE',
          'WARNING',
          'Submission deadline rule not configured in policy'
        )
      );
    }

    const policyDates = service.getPolicyDates();
    const treatmentDate = parseIsoDate(normalizedClaim.treatmentDate);
    const policyStart = parseIsoDate(policyDates.policyStartDate);
    const policyEnd = parseIsoDate(policyDates.policyEndDate);
    const renewalStatus = String(policyDates.renewalStatus || '').toUpperCase();

    const withinPolicyPeriod =
      treatmentDate &&
      policyStart &&
      policyEnd &&
      treatmentDate >= policyStart &&
      treatmentDate <= policyEnd;

    const renewalActive = renewalStatus === 'ACTIVE';

    if (!withinPolicyPeriod || !renewalActive) {
      trace.push(
        createTraceEntry(
          'POLICY_ACTIVE',
          'FAIL',
          !renewalActive
            ? `Policy renewal status is ${policyDates.renewalStatus}`
            : `Treatment date ${normalizedClaim.treatmentDate} is outside policy period ${policyDates.policyStartDate} to ${policyDates.policyEndDate}`
        )
      );
      return {
        success: false,
        error: 'Policy is not active for the treatment date',
        trace,
        data: {
          claim: normalizedClaim,
          member,
          validation,
        },
      };
    }

    validation.policyActive = true;
    trace.push(
      createTraceEntry(
        'POLICY_ACTIVE',
        'PASS',
        'Policy active during treatment date'
      )
    );

    return {
      success: true,
      data: {
        claim: normalizedClaim,
        member,
        validation,
      },
      trace,
    };
  } catch (error) {
    trace.push(
      createTraceEntry(
        'MEMBER_VALIDATION',
        'FAIL',
        error.message || 'Unexpected member validation error'
      )
    );
    return {
      success: false,
      error: error.message || 'Member validation failed',
      trace,
      data: {
        claim: normalizedClaim,
        member: null,
        validation,
      },
    };
  }
}

module.exports = {
  validateMember,
  validateMemberIdentity,
  normalizeMemberName,
  normalizeGender,
  normalizeDob,
  createTraceEntry,
  daysBetween,
};
