// App.jsx
// Controls what the user sees: claim form, decision result, or test runner

import { useState } from 'react';
import ClaimForm from './ClaimForm';
import DecisionView from './DecisionView';
import TestRunner from './TestRunner';

export default function App() {
  const [view, setView] = useState('form');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(formData) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/claims', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
      setView('result');
    } catch (err) {
      setError('Could not connect to the server. Is it running on port 3001?');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setView('form');
    setResult(null);
    setError(null);
  }

  const navButtonStyle = (active) => ({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    background: active ? '#2563eb' : 'none',
    color: active ? 'white' : '#374151',
    border: active ? 'none' : '1px solid #d1d5db',
  });

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
      <div
        style={{
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '20px',
          marginBottom: '28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: '20px', margin: 0, fontWeight: '600' }}>
            Claims Processing Portal
          </h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: '13px' }}>
            Plum Group Health Insurance — PLUM_GHI_2024
          </p>
        </div>
        
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
        <button onClick={() => setView('form')} style={navButtonStyle(view === 'form')}>
          Submit Claim
        </button>
        <button onClick={() => setView('tests')} style={navButtonStyle(view === 'tests')}>
          Run Test Cases
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#fff0f0',
            border: '1px solid #ffcccc',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#cc0000',
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 40px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid #e5e7eb',
              borderTop: '3px solid #2563eb',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
            Processing your claim...
          </p>
          <p style={{ color: '#9ca3af', fontSize: '12px', margin: '4px 0 0' }}>
            Verifying documents and checking policy rules
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && view === 'form' && <ClaimForm onSubmit={handleSubmit} />}

      {!loading && view === 'result' && result && (
        <DecisionView result={result} onReset={handleReset} />
      )}

      {!loading && view === 'tests' && <TestRunner onBack={() => setView('form')} />}
    </div>
  );
}
