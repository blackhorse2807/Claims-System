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
      <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>Health Insurance Claims Portal</h1>
      <p style={{ color: '#666', marginBottom: '16px' }}>Plum — Group Health Insurance Claims Processing</p>

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
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Processing your claim... This may take a few seconds.
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
