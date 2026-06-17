import { useState } from 'react';
import TraceView from './TraceView';
import { formatDocLabel } from './data/policyData';

const DECISION_COLORS = {
  APPROVED: { bg: '#f0fdf4', border: '#86efac', text: '#166534', badge: '#22c55e' },
  PARTIAL: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: '#3b82f6' },
  PARTIAL_APPROVED: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: '#3b82f6' },
  REJECTED: { bg: '#fff1f2', border: '#fca5a5', text: '#991b1b', badge: '#ef4444' },
  MANUAL_REVIEW: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', badge: '#f59e0b' },
};

const resetButtonStyle = {
  background: '#f3f4f6',
  border: '1px solid #d1d5db',
  padding: '10px 24px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
};

const primaryButtonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  padding: '10px 24px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500',
};

function BlockedActionPanel({ result, onReset, onResumeDocuments, onCorrectMemberDetails }) {
  const status = result.status;
  const isMissingUpload = status === 'PENDING_DOCUMENT_UPLOAD';
  const isReupload = status === 'PENDING_DOCUMENT_REUPLOAD';
  const isMemberMismatch = status === 'MEMBER_DETAILS_MISMATCH';
  const missingTypes = result.missingDocumentTypes || [];
  const mismatches = result.mismatches || [];

  let guidance = 'Review the issue below and try again.';

  if (isMissingUpload) {
    guidance =
      missingTypes.length > 0
        ? `Upload the missing document(s): ${missingTypes.map(formatDocLabel).join(', ')}. Your other claim details will be kept.`
        : 'Upload the missing required document(s), then resubmit.';
  } else if (isReupload) {
    guidance = 'One or more documents could not be read. Please re-upload clearer copies.';
  } else if (isMemberMismatch) {
    guidance =
      'The member details you entered do not match our policy records. Update your name, date of birth, and gender to match the enrolled member.';
  }

  return (
    <div>
      <div
        style={{
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '24px' }}>{isMemberMismatch ? '🪪' : '⚠️'}</span>
          <div>
            <h2 style={{ color: '#9a3412', marginTop: 0, fontSize: '16px' }}>
              {result.stage
                ? `${result.stage.replace(/_/g, ' ')} — Action Required`
                : 'Claim Could Not Be Processed'}
            </h2>
            <p style={{ color: '#7c2d12', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
              {result.message || result.error || 'Claim could not be processed.'}
            </p>
          </div>
        </div>
      </div>

      {isMemberMismatch && mismatches.length > 0 && (
        <div
          style={{
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            background: '#fff1f2',
          }}
        >
          <p style={{ fontWeight: '600', fontSize: '14px', color: '#991b1b', marginTop: 0 }}>
            Details mismatch
          </p>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #fecaca', textAlign: 'left' }}>
                <th style={{ padding: '6px 0' }}>Field</th>
                <th style={{ padding: '6px 0' }}>You submitted</th>
                <th style={{ padding: '6px 0' }}>Policy record</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((row) => (
                <tr key={row.field} style={{ borderBottom: '1px solid #fee2e2' }}>
                  <td style={{ padding: '8px 0', textTransform: 'capitalize' }}>{row.field}</td>
                  <td style={{ padding: '8px 8px 8px 0', color: '#991b1b' }}>{row.submitted || '—'}</td>
                  <td style={{ padding: '8px 0', color: '#166534' }}>{row.expected || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isMissingUpload && missingTypes.length > 0 && (
        <div
          style={{
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            padding: '14px 16px',
            marginBottom: '16px',
            background: '#fffbeb',
            fontSize: '13px',
            color: '#92400e',
          }}
        >
          <strong>Missing:</strong>{' '}
          {missingTypes.map((type) => formatDocLabel(type)).join(', ')}
        </div>
      )}

      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '8px',
          padding: '14px 16px',
          fontSize: '13px',
          color: '#166534',
          marginBottom: '16px',
        }}
      >
        <strong>What to do:</strong> {guidance}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        {isMissingUpload && onResumeDocuments && (
          <button type="button" onClick={onResumeDocuments} style={primaryButtonStyle}>
            Upload Missing Document →
          </button>
        )}
        {isReupload && onResumeDocuments && (
          <button type="button" onClick={onResumeDocuments} style={primaryButtonStyle}>
            Re-upload Documents →
          </button>
        )}
        {isMemberMismatch && onCorrectMemberDetails && (
          <button type="button" onClick={onCorrectMemberDetails} style={primaryButtonStyle}>
            Correct Member Details →
          </button>
        )}
        {!isMissingUpload && !isReupload && !isMemberMismatch && (
          <button type="button" onClick={onReset} style={primaryButtonStyle}>
            Try Again →
          </button>
        )}
        {(isMissingUpload || isReupload || isMemberMismatch) && (
          <button type="button" onClick={onReset} style={resetButtonStyle}>
            Start Over
          </button>
        )}
      </div>
    </div>
  );
}

export default function DecisionView({
  result,
  onReset,
  onResumeDocuments,
  onCorrectMemberDetails,
}) {
  const [showTrace, setShowTrace] = useState(false);

  const decisionKey =
    result.decision === 'PARTIAL_APPROVED' ? 'PARTIAL' : result.decision;
  const claimId = result.claim_id || result.claimId;
  const confidence = result.confidence_score ?? result.confidence ?? 0;
  const approvedAmount = result.approved_amount ?? result.approvedAmount ?? 0;
  const claimedAmount = result.claimed_amount ?? result.claimedAmount ?? 0;
  const patientPayable = result.patient_payable ?? result.patientPayable;

  const isActionRequired =
    result.blocked ||
    result.status === 'PENDING_DOCUMENT_UPLOAD' ||
    result.status === 'PENDING_DOCUMENT_REUPLOAD' ||
    result.status === 'MEMBER_DETAILS_MISMATCH';

  if (isActionRequired && !result.decision) {
    return (
      <BlockedActionPanel
        result={result}
        onReset={onReset}
        onResumeDocuments={onResumeDocuments}
        onCorrectMemberDetails={onCorrectMemberDetails}
      />
    );
  }

  const colors = DECISION_COLORS[decisionKey] || DECISION_COLORS.MANUAL_REVIEW;

  return (
    <div>
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '20px',
          }}
        >
          <div>
            <span
              style={{
                background: colors.badge,
                color: 'white',
                padding: '4px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              {decisionKey}
            </span>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              Claim ID: {claimId}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Confidence</p>
            <p
              style={{
                fontSize: '22px',
                fontWeight: '600',
                color: colors.text,
                margin: 0,
              }}
            >
              {Math.round(confidence * 100)}%
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ background: 'white', borderRadius: '8px', padding: '16px' }}>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Approved Amount</p>
            <p
              style={{
                fontSize: '26px',
                fontWeight: '700',
                color: colors.text,
                margin: 0,
              }}
            >
              ₹{approvedAmount.toLocaleString('en-IN')}
            </p>
          </div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '16px' }}>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Claimed Amount</p>
            <p style={{ fontSize: '26px', fontWeight: '700', color: '#374151', margin: 0 }}>
              ₹{claimedAmount.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {patientPayable > 0 && (
          <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Patient Payable</p>
            <p style={{ fontSize: '20px', fontWeight: '600', color: '#374151', margin: 0 }}>
              ₹{patientPayable.toLocaleString('en-IN')}
            </p>
          </div>
        )}

        {result.risk_level && (
          <p style={{ fontSize: '13px', color: colors.text, marginBottom: '16px' }}>
            Risk level: <strong>{result.risk_level || result.riskLevel}</strong>
          </p>
        )}

        {result.reasons && result.reasons.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontWeight: '500', marginBottom: '8px', fontSize: '14px' }}>Reasons</p>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {[...new Set(result.reasons)].map((reason, index) => (
                <li
                  key={index}
                  style={{ fontSize: '14px', color: colors.text, marginBottom: '4px' }}
                >
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.rejection_reasons && result.rejection_reasons.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p
              style={{
                fontWeight: '500',
                marginBottom: '8px',
                fontSize: '14px',
                color: '#991b1b',
              }}
            >
              Rejection Reasons
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {result.rejection_reasons.map((reason, index) => (
                <li
                  key={index}
                  style={{ fontSize: '14px', color: '#991b1b', marginBottom: '4px' }}
                >
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.recommendation && (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: '8px',
              padding: '12px 16px',
            }}
          >
            <p style={{ fontSize: '14px', color: '#92400e', margin: 0 }}>
              Note: {result.recommendation}
            </p>
          </div>
        )}
      </div>

      {result.line_items && result.line_items.length > 0 && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ fontSize: '15px', marginTop: 0, marginBottom: '16px' }}>
            Line Item Breakdown
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: '500' }}>
                  Description
                </th>
                <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: '500' }}>
                  Claimed
                </th>
                <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: '500' }}>
                  Approved
                </th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: '500' }}>
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {result.line_items.map((item, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 0' }}>{item.description}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0' }}>₹{item.claimed}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      padding: '10px 0',
                      color: item.status === 'rejected' ? '#dc2626' : '#16a34a',
                      fontWeight: '500',
                    }}
                  >
                    ₹{item.approved}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: '13px' }}>
                    {item.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.component_failures && result.component_failures.length > 0 && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
          }}
        >
          <p style={{ fontWeight: '500', margin: '0 0 4px', fontSize: '14px' }}>
            Components that failed during processing:
          </p>
          {result.component_failures.map((failure, index) => (
            <p key={index} style={{ margin: '2px 0', fontSize: '13px', color: '#92400e' }}>
              {failure.agent}: {failure.error}
            </p>
          ))}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => setShowTrace(!showTrace)}
          style={{
            background: 'none',
            border: '1px solid #d1d5db',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {showTrace ? 'Hide' : 'Show'} Full Agent Trace
        </button>
      </div>

      {showTrace && result.trace && <TraceView trace={result.trace} />}

      <button onClick={onReset} style={resetButtonStyle}>
        Submit Another Claim
      </button>
    </div>
  );
}
