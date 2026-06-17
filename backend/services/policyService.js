/**
 * @typedef {Object} PolicyDates
 * @property {string} policyStartDate
 * @property {string} policyEndDate
 * @property {string} renewalStatus
 */

/**
 * @typedef {Object} SubmissionRules
 * @property {number} deadlineDaysFromTreatment
 * @property {number} minimumClaimAmount
 * @property {string} currency
 */

/**
 * @typedef {Object} PolicyMember
 * @property {string} member_id
 * @property {string} name
 * @property {string} [relationship]
 * @property {string} [join_date]
 * @property {string} [primary_member_id]
 * @property {string} [date_of_birth]
 * @property {string} [gender]
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', '..', 'policy_terms.json');

let cachedPolicy = null;
let policyPath = DEFAULT_POLICY_PATH;

function setPolicyPath(nextPath) {
  policyPath = nextPath;
  cachedPolicy = null;
}

function clearPolicyCache() {
  cachedPolicy = null;
}

function loadPolicy() {
  if (cachedPolicy) {
    return cachedPolicy;
  }

  const raw = fs.readFileSync(policyPath, 'utf8');
  cachedPolicy = JSON.parse(raw);
  return cachedPolicy;
}

function getPolicy() {
  return loadPolicy();
}

function getMemberById(memberId) {
  const policy = loadPolicy();
  const members = policy.members || [];
  const normalizedId = String(memberId || '').trim();

  return (
    members.find(
      (member) =>
        member.member_id === normalizedId || member.id === normalizedId
    ) || null
  );
}

function getPolicyDates() {
  const policy = loadPolicy();
  const holder = policy.policy_holder || {};

  return {
    policyStartDate: holder.policy_start_date,
    policyEndDate: holder.policy_end_date,
    renewalStatus: holder.renewal_status,
  };
}

function getSubmissionRules() {
  const policy = loadPolicy();
  const rules = policy.submission_rules || {};

  return {
    deadlineDaysFromTreatment: rules.deadline_days_from_treatment,
    minimumClaimAmount: rules.minimum_claim_amount,
    currency: rules.currency,
  };
}

function getEffectiveJoinDate(member) {
  if (!member) {
    return null;
  }

  if (member.join_date) {
    return member.join_date;
  }

  if (member.primary_member_id) {
    const primary = getMemberById(member.primary_member_id);
    return primary?.join_date || null;
  }

  return null;
}

module.exports = {
  setPolicyPath,
  clearPolicyCache,
  getPolicy,
  getMemberById,
  getPolicyDates,
  getSubmissionRules,
  getEffectiveJoinDate,
};
