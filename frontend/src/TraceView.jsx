// TraceView.jsx — displays the pipeline trace from each processing step.

function isPipelineTraceEntry(entry) {
  return Boolean(entry?.step && entry?.status);
}

function statusColor(status) {
  if (status === 'PASS') return { bg: '#dcfce7', text: '#166534' };
  if (status === 'WARNING') return { bg: '#fef3c7', text: '#92400e' };
  return { bg: '#fee2e2', text: '#991b1b' };
}

export default function TraceView({ trace }) {
  if (!trace || trace.length === 0) {
    return <p style={{ color: '#888', fontSize: '14px' }}>No trace data available.</p>;
  }

  if (isPipelineTraceEntry(trace[0])) {
    return (
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ fontSize: '15px', marginTop: 0, marginBottom: '16px' }}>Pipeline Trace Log</h3>

        {trace.map((entry, index) => {
          const colors = statusColor(entry.status);
          return (
            <div
              key={`${entry.step}-${index}`}
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: index < trace.length - 1 ? '1px solid #f3f4f6' : 'none',
                fontSize: '13px',
              }}
            >
              <span
                style={{
                  background: colors.bg,
                  color: colors.text,
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  flexShrink: 0,
                  height: 'fit-content',
                }}
              >
                {entry.status}
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: '600', color: '#111827' }}>{entry.step}</p>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{entry.message}</p>
                {entry.timestamp && (
                  <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: '12px' }}>
                    {entry.timestamp}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
      }}
    >
      <h3 style={{ fontSize: '15px', marginTop: 0, marginBottom: '16px' }}>Agent Trace Log</h3>

      {trace.map((agentResult, index) => (
        <div
          key={index}
          style={{
            marginBottom: '20px',
            paddingBottom: '20px',
            borderBottom: index < trace.length - 1 ? '1px solid #f3f4f6' : 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                background: agentResult.passed ? '#dcfce7' : '#fee2e2',
                color: agentResult.passed ? '#166534' : '#991b1b',
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '500',
              }}
            >
              {agentResult.passed ? 'PASSED' : 'FAILED'}
            </span>
            <span style={{ fontWeight: '500', fontSize: '14px' }}>{agentResult.agent}</span>
          </div>

          {agentResult.checks &&
            agentResult.checks.map((check, checkIndex) => (
              <div
                key={checkIndex}
                style={{
                  display: 'flex',
                  gap: '10px',
                  marginBottom: '6px',
                  fontSize: '13px',
                }}
              >
                <span
                  style={{
                    color: check.passed ? '#22c55e' : '#ef4444',
                    flexShrink: 0,
                    fontWeight: '500',
                  }}
                >
                  {check.passed ? '✓' : '✗'}
                </span>
                <span style={{ color: '#374151' }}>
                  <span style={{ fontWeight: '500' }}>{check.rule}</span>
                  {check.detail && (
                    <span style={{ color: '#6b7280' }}> — {check.detail}</span>
                  )}
                </span>
              </div>
            ))}

          {agentResult.flags && agentResult.flags.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {agentResult.flags.map((flag, flagIndex) => (
                <div
                  key={flagIndex}
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    marginBottom: '4px',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ fontWeight: '500', color: '#92400e' }}>{flag.flag}</span>
                  <span style={{ color: '#92400e' }}>
                    {' '}
                    ({flag.severity}) — {flag.detail}
                  </span>
                </div>
              ))}
            </div>
          )}

          {agentResult.rejection_detail && (
            <div
              style={{
                marginTop: '8px',
                background: '#fff1f2',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                color: '#991b1b',
              }}
            >
              {agentResult.rejection_detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
