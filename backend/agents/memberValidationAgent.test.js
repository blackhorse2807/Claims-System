const assert = require('assert');
const { validateMember, daysBetween } = require('./memberValidationAgent');

function baseClaim(overrides = {}) {
  return {
    claimId: 'CLM_test0001',
    memberId: 'EMP001',
    relationship: 'SELF',
    claimType: 'CONSULTATION',
    claimedAmount: 1500,
    treatmentDate: '2024-11-01',
    submissionDate: '2024-11-10',
    uploadedDocuments: [{ id: '1', originalName: 'bill.pdf', filePath: 'uploads/bill.pdf', mimeType: 'application/pdf' }],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockPolicyService(overrides = {}) {
  const defaultMember = {
    member_id: 'EMP001',
    name: 'Rajesh Kumar',
    relationship: 'SELF',
    join_date: '2024-04-01',
  };

  return {
    getMemberById(memberId) {
      if (overrides.members && Object.prototype.hasOwnProperty.call(overrides.members, memberId)) {
        return overrides.members[memberId];
      }
      if (memberId === 'EMP001') return defaultMember;
      if (memberId === 'DEP001') {
        return {
          member_id: 'DEP001',
          name: 'Sunita Kumar',
          relationship: 'SPOUSE',
          primary_member_id: 'EMP001',
        };
      }
      return null;
    },
    getEffectiveJoinDate(member) {
      if (!member) return null;
      if (member.join_date) return member.join_date;
      if (member.primary_member_id === 'EMP001') return '2024-04-01';
      return null;
    },
    getSubmissionRules() {
      return (
        overrides.submissionRules || {
          deadlineDaysFromTreatment: 30,
          minimumClaimAmount: 500,
          currency: 'INR',
        }
      );
    },
    getPolicyDates() {
      return (
        overrides.policyDates || {
          policyStartDate: '2024-04-01',
          policyEndDate: '2025-03-31',
          renewalStatus: 'ACTIVE',
        }
      );
    },
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('daysBetween calculates inclusive day gap', () => {
  assert.strictEqual(daysBetween('2024-11-01', '2024-11-10'), 9);
});

test('valid member passes all checks', () => {
  const result = validateMember(baseClaim(), [], createMockPolicyService());

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.validation.memberFound, true);
  assert.strictEqual(result.data.validation.relationshipValid, true);
  assert.strictEqual(result.data.validation.treatmentDateValid, true);
  assert.strictEqual(result.data.validation.submissionDeadlineValid, true);
  assert.strictEqual(result.data.validation.policyActive, true);
  assert.ok(result.trace.some((entry) => entry.step === 'MEMBER_LOOKUP' && entry.status === 'PASS'));
});

test('valid dependent with matching relationship passes', () => {
  const result = validateMember(
    baseClaim({ memberId: 'DEP001', relationship: 'SPOUSE' }),
    [],
    createMockPolicyService()
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.member.memberId, 'DEP001');
});

test('invalid member fails lookup', () => {
  const result = validateMember(
    baseClaim({ memberId: 'UNKNOWN999' }),
    [],
    createMockPolicyService()
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Member not found');
});

test('relationship mismatch fails', () => {
  const result = validateMember(
    baseClaim({ memberId: 'DEP001', relationship: 'CHILD' }),
    [],
    createMockPolicyService()
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Relationship does not match member record');
});

test('treatment before join date fails', () => {
  const result = validateMember(
    baseClaim({ treatmentDate: '2024-03-15' }),
    [],
    createMockPolicyService()
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Treatment date cannot be before member join date');
});

test('submission before treatment fails', () => {
  const result = validateMember(
    baseClaim({ treatmentDate: '2024-10-15', submissionDate: '2024-10-01' }),
    [],
    createMockPolicyService()
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(
    result.error,
    'Claim submission date cannot be before the treatment date'
  );
});

test('late submission fails', () => {
  const result = validateMember(
    baseClaim({ treatmentDate: '2024-10-01', submissionDate: '2024-11-15' }),
    [],
    createMockPolicyService()
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Claim submitted after policy deadline');
});

test('expired policy fails', () => {
  const result = validateMember(
    baseClaim({ treatmentDate: '2027-04-15', submissionDate: '2027-04-20' }),
    [],
    createMockPolicyService()
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Policy is not active for the treatment date');
});

test('inactive renewal status fails', () => {
  const result = validateMember(
    baseClaim(),
    [],
    createMockPolicyService({
      policyDates: {
        policyStartDate: '2024-04-01',
        policyEndDate: '2025-03-31',
        renewalStatus: 'LAPSED',
      },
    })
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Policy is not active for the treatment date');
});

console.log('\nAll member validation tests passed.');
