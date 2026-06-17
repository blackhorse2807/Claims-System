// DecisionView.jsx
// Shows the final claim decision with all details
// Color coded: green = approved, blue = partial, red = rejected, amber = manual review

import { useState } from 'react';
import TraceView from './TraceView';

const DECISION_COLORS = {
  APPROVED: { bg: '#f0fdf4', border: '#86efac', text: '#166534', badge: '#22c55e' },
  PARTIAL: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: '#3b82f6' },
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

export default function DecisionView({ result, onReset }) {
  const [showTrace, setShowTrace] = useState(false);

  // If claim was blocked at document verification stage
  if (result.blocked) {
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
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <h2 style={{ color: '#9a3412', marginTop: 0, fontSize: '16px' }}>
                Document Issue — Action Required
              </h2>
              <p style={{ color: '#7c2d12', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
                {result.message}
              </p>
            </div>
          </div>
        </div>
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
          <strong>What to do:</strong> Click &quot;Try Again&quot; below, use the &quot;+ Add
          Document&quot; button to upload the missing document, then resubmit.
        </div>
        <button
          onClick={onReset}
          style={{
            background: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          Try Again →
        </button>
      </div>
    );
  }

  const colors = DECISION_COLORS[result.decision] || DECISION_COLORS.MANUAL_REVIEW;

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
              {result.decision}
            </span>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              Claim ID: {result.claim_id}
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
              {Math.round(result.confidence_score * 100)}%
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
              ₹{result.approved_amount?.toLocaleString('en-IN') || 0}
            </p>
          </div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '16px' }}>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Claimed Amount</p>
            <p style={{ fontSize: '26px', fontWeight: '700', color: '#374151', margin: 0 }}>
              ₹{result.claimed_amount?.toLocaleString('en-IN') || 0}
            </p>
          </div>
        </div>

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
