/**
 * @typedef {'PASS' | 'FAIL' | 'WARNING'} TraceStatus
 */

/**
 * @typedef {Object} UploadedDocument
 * @property {string} id
 * @property {string} originalName
 * @property {string} filePath
 * @property {string} mimeType
 * @property {string} [documentType] - Document category (e.g. PRESCRIPTION)
 */

/**
 * @typedef {Object} NormalizedClaim
 * @property {string} claimId
 * @property {string} memberId
 * @property {string} relationship
 * @property {string} claimType
 * @property {number} claimedAmount
 * @property {string} treatmentDate
 * @property {string} submissionDate
 * @property {UploadedDocument[]} uploadedDocuments
 * @property {string} createdAt
 * @property {Record<string, string>} [metadata] - Additional trimmed string fields
 */

/**
 * @typedef {Object} TraceEntry
 * @property {string} step
 * @property {TraceStatus} status
 * @property {string} message
 * @property {string} timestamp
 */

/**
 * @template T
 * @typedef {Object} AgentResult
 * @property {boolean} success
 * @property {T} [data]
 * @property {string} [error]
 * @property {TraceEntry[]} trace
 */

module.exports = {};
