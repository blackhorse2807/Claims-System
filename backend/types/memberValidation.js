/**
 * @typedef {import('./claimIntake').NormalizedClaim} NormalizedClaim
 * @typedef {import('./claimIntake').TraceEntry} TraceEntry
 * @typedef {import('./claimIntake').AgentResult} AgentResult
 */

/**
 * @typedef {Object} Member
 * @property {string} memberId
 * @property {string} name
 * @property {string} relationship
 * @property {string|null} joinDate
 * @property {string|null} primaryMemberId
 * @property {string|null} dateOfBirth
 * @property {string|null} gender
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} memberFound
 * @property {boolean} relationshipValid
 * @property {boolean} treatmentDateValid
 * @property {boolean} submissionDeadlineValid
 * @property {boolean} policyActive
 */

/**
 * @typedef {Object} ValidatedClaim
 * @property {NormalizedClaim} claim
 * @property {Member} member
 * @property {ValidationResult} validation
 */

module.exports = {};
