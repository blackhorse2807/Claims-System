// TestRunner.jsx
// Lets you run all test cases from the UI and see pass/fail results
// Useful for the demo — shows the eval report visually

import { useState } from 'react';

export default function TestRunner({ onBack }) {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);
  const [summary, setSummary] = useState(null);

  const TEST_CASES = [
    {
      id: 'TC001',
      description: 'Wrong document type — two prescriptions for a consultation claim',
      expected: { blocked: true, reason: 'WRONG_DOCUMENT_TYPE' },
      input: {
        member_id: 'EMP001',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-11-01',
        claimed_amount: '1500',
        documents: JSON.stringify([
          {
            file_id: 'F001',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
          },
          {
            file_id: 'F002',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
          },
        ]),
      },
    },
    {
      id: 'TC002',
      description: 'Unreadable pharmacy bill — ask for re-upload',
      expected: { blocked: true, reason: 'UNREADABLE_DOCUMENT' },
      input: {
        member_id: 'EMP001',
        claim_category: 'PHARMACY',
        treatment_date: '2024-11-01',
        claimed_amount: '500',
        documents: JSON.stringify([
          {
            file_id: 'F003',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
          },
          {
            file_id: 'F004',
            actual_type: 'PHARMACY_BILL',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'UNREADABLE',
          },
        ]),
      },
    },
    {
      id: 'TC003',
      description: 'Patient name mismatch across documents',
      expected: { blocked: true, reason: 'PATIENT_MISMATCH' },
      input: {
        member_id: 'EMP001',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-11-01',
        claimed_amount: '1500',
        documents: JSON.stringify([
          {
            file_id: 'F005',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
          },
          {
            file_id: 'F006',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Arjun Mehta',
            quality: 'READABLE',
          },
        ]),
      },
    },
    {
      id: 'TC004',
      description: 'Clean consultation claim — should approve with 10% copay',
      expected: { decision: 'APPROVED', approved_amount: 1350 },
      input: {
        member_id: 'EMP001',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-11-01',
        claimed_amount: '1500',
        hospital_name: 'City Clinic, Bengaluru',
        documents: JSON.stringify([
          {
            file_id: 'F007',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
            content: {
              patient_name: 'Rajesh Kumar',
              doctor_name: 'Dr. Arun Sharma',
              diagnosis: 'Viral Fever',
            },
          },
          {
            file_id: 'F008',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
            content: {
              hospital_name: 'City Clinic',
              patient_name: 'Rajesh Kumar',
              line_items: [{ description: 'Consultation Fee', amount: 1500 }],
              total: 1500,
            },
          },
        ]),
      },
    },
    {
      id: 'TC005',
      description: 'Diabetes claim within 90-day waiting period — reject',
      expected: { decision: 'REJECTED', rejection_reason: 'WAITING_PERIOD' },
      input: {
        member_id: 'EMP005',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-10-01',
        claimed_amount: '1500',
        diagnosis: 'Type 2 Diabetes Mellitus',
        documents: JSON.stringify([
          {
            file_id: 'F009',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Vikram Joshi',
            quality: 'READABLE',
            content: {
              patient_name: 'Vikram Joshi',
              diagnosis: 'Type 2 Diabetes Mellitus',
            },
          },
          {
            file_id: 'F010',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Vikram Joshi',
            quality: 'READABLE',
            content: {
              hospital_name: 'City Clinic',
              total: 1500,
              line_items: [{ description: 'Consultation', amount: 1500 }],
            },
          },
        ]),
      },
    },
    {
      id: 'TC006',
      description: 'Dental — root canal approved, teeth whitening excluded',
      expected: { decision: 'PARTIAL' },
      input: {
        member_id: 'EMP002',
        claim_category: 'DENTAL',
        treatment_date: '2024-11-01',
        claimed_amount: '12000',
        documents: JSON.stringify([
          {
            file_id: 'F011',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Priya Singh',
            quality: 'READABLE',
            content: {
              hospital_name: 'Smile Dental',
              patient_name: 'Priya Singh',
              line_items: [
                { description: 'Root Canal Treatment', amount: 8000 },
                { description: 'Teeth Whitening', amount: 4000 },
              ],
              total: 12000,
            },
          },
        ]),
      },
    },
    {
      id: 'TC007',
      description: 'MRI diagnostic claim above ₹10000 without pre-authorization',
      expected: { decision: 'REJECTED', rejection_reason: 'PRE_AUTH_REQUIRED' },
      input: {
        member_id: 'EMP003',
        claim_category: 'DIAGNOSTIC',
        treatment_date: '2024-11-01',
        claimed_amount: '15000',
        pre_auth_obtained: 'false',
        diagnosis: 'MRI Brain',
        documents: JSON.stringify([
          {
            file_id: 'F013',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Amit Verma',
            quality: 'READABLE',
            content: { patient_name: 'Amit Verma', diagnosis: 'MRI Brain' },
          },
          {
            file_id: 'F014',
            actual_type: 'LAB_REPORT',
            patient_name_on_doc: 'Amit Verma',
            quality: 'READABLE',
            content: { patient_name: 'Amit Verma', tests: [{ name: 'MRI Brain', result: 'Normal' }] },
          },
          {
            file_id: 'F015',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Amit Verma',
            quality: 'READABLE',
            content: {
              hospital_name: 'Scan Centre',
              total: 15000,
              line_items: [{ description: 'MRI Brain', amount: 15000 }],
            },
          },
        ]),
      },
    },
    {
      id: 'TC008',
      description: 'Claimed amount exceeds per-claim limit of ₹5000',
      expected: { decision: 'REJECTED', rejection_reason: 'PER_CLAIM_EXCEEDED' },
      input: {
        member_id: 'EMP004',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-11-01',
        claimed_amount: '7500',
        documents: JSON.stringify([
          {
            file_id: 'F016',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Sneha Reddy',
            quality: 'READABLE',
            content: { patient_name: 'Sneha Reddy', diagnosis: 'Fever' },
          },
          {
            file_id: 'F017',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Sneha Reddy',
            quality: 'READABLE',
            content: {
              hospital_name: 'City Hospital',
              total: 7500,
              line_items: [{ description: 'Consultation', amount: 7500 }],
            },
          },
        ]),
      },
    },
    {
      id: 'TC009',
      description: '4th claim same day — route to manual review',
      expected: { decision: 'MANUAL_REVIEW' },
      input: {
        member_id: 'EMP008',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-11-01',
        claimed_amount: '1000',
        claims_history: JSON.stringify([
          { claim_id: 'C001', date: '2024-11-01', amount: 500 },
          { claim_id: 'C002', date: '2024-11-01', amount: 600 },
          { claim_id: 'C003', date: '2024-11-01', amount: 700 },
        ]),
        documents: JSON.stringify([
          {
            file_id: 'F018',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Ravi Menon',
            quality: 'READABLE',
            content: { patient_name: 'Ravi Menon', diagnosis: 'Headache' },
          },
          {
            file_id: 'F019',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Ravi Menon',
            quality: 'READABLE',
            content: {
              hospital_name: 'City Clinic',
              total: 1000,
              line_items: [{ description: 'Consultation', amount: 1000 }],
            },
          },
        ]),
      },
    },
    {
      id: 'TC010',
      description: 'Network hospital — 20% discount then 10% copay = ₹3240 approved',
      expected: { decision: 'APPROVED', approved_amount: 3240 },
      input: {
        member_id: 'EMP006',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-11-01',
        claimed_amount: '4500',
        hospital_name: 'Apollo Hospitals',
        documents: JSON.stringify([
          {
            file_id: 'F020',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Kavita Nair',
            quality: 'READABLE',
            content: { patient_name: 'Kavita Nair', diagnosis: 'Migraine' },
          },
          {
            file_id: 'F021',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Kavita Nair',
            quality: 'READABLE',
            content: {
              hospital_name: 'Apollo Hospitals',
              total: 4500,
              line_items: [{ description: 'Consultation', amount: 4500 }],
            },
          },
        ]),
      },
    },
    {
      id: 'TC011',
      description: 'Component failure — pipeline continues with reduced confidence',
      expected: { decision: 'APPROVED' },
      input: {
        member_id: 'EMP007',
        claim_category: 'CONSULTATION',
        treatment_date: '2024-11-01',
        claimed_amount: '1500',
        simulate_component_failure: 'true',
        documents: JSON.stringify([
          {
            file_id: 'F022',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Suresh Patil',
            quality: 'READABLE',
            content: { patient_name: 'Suresh Patil', diagnosis: 'Cold' },
          },
          {
            file_id: 'F023',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Suresh Patil',
            quality: 'READABLE',
            content: {
              hospital_name: 'City Clinic',
              total: 1500,
              line_items: [{ description: 'Consultation', amount: 1500 }],
            },
          },
        ]),
      },
    },
    {
      id: 'TC012',
      description: 'Bariatric consultation — explicitly excluded condition',
      expected: { decision: 'REJECTED', rejection_reason: 'EXCLUDED_CONDITION' },
      input: {
        member_id: 'EMP001',
        claim_category: 'CONSULTATION',
        treatment_date: '2025-02-01',
        claimed_amount: '2000',
        diagnosis: 'Morbid Obesity — Bariatric Surgery Consultation',
        documents: JSON.stringify([
          {
            file_id: 'F024',
            actual_type: 'PRESCRIPTION',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
            content: {
              patient_name: 'Rajesh Kumar',
              diagnosis: 'Morbid Obesity — Bariatric Surgery Consultation',
            },
          },
          {
            file_id: 'F025',
            actual_type: 'HOSPITAL_BILL',
            patient_name_on_doc: 'Rajesh Kumar',
            quality: 'READABLE',
            content: {
              hospital_name: 'City Clinic',
              total: 2000,
              line_items: [{ description: 'Bariatric Consultation', amount: 2000 }],
            },
          },
        ]),
      },
    },
  ];

  async function runSingleTest(testCase) {
    const formData = new URLSearchParams();
    Object.entries(testCase.input).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append('policy_id', 'PLUM_GHI_2024');

    const response = await fetch('/api/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    return response.json();
  }

  function checkResult(actual, expected) {
    if (!actual) {
      return { passed: false, issues: ['No response'] };
    }

    const issues = [];

    if (expected.blocked !== undefined && Boolean(actual.blocked) !== Boolean(expected.blocked)) {
      issues.push(`Expected blocked=${expected.blocked}, got ${actual.blocked}`);
    }
    if (expected.decision && actual.decision !== expected.decision) {
      issues.push(`Expected ${expected.decision}, got ${actual.decision}`);
    }
    if (expected.approved_amount !== undefined && actual.approved_amount !== undefined) {
      if (Math.abs(actual.approved_amount - expected.approved_amount) > 5) {
        issues.push(`Expected ₹${expected.approved_amount}, got ₹${actual.approved_amount}`);
      }
    }
    if (expected.rejection_reason) {
      const found =
        actual.rejection_reasons?.includes(expected.rejection_reason) ||
        actual.reason === expected.rejection_reason;
      if (!found) {
        issues.push(`Expected rejection reason: ${expected.rejection_reason}`);
      }
    }

    return { passed: issues.length === 0, issues };
  }

  async function runAllTests() {
    setRunning(true);
    setResults([]);
    setSummary(null);

    const allResults = [];

    for (const testCase of TEST_CASES) {
      setCurrentTest(testCase.id);
      try {
        const actual = await runSingleTest(testCase);
        const comparison = checkResult(actual, testCase.expected);
        allResults.push({ ...testCase, actual, ...comparison });
      } catch (err) {
        allResults.push({ ...testCase, actual: null, passed: false, issues: [err.message] });
      }
      setResults([...allResults]);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const passedCount = allResults.filter((row) => row.passed).length;
    setSummary({
      passed: passedCount,
      failed: allResults.length - passedCount,
      total: allResults.length,
    });
    setCurrentTest(null);
    setRunning(false);
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px' }}>Test Case Runner</h2>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid #d1d5db',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          ← Back to Form
        </button>
      </div>

      {summary && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '8px',
              padding: '12px 20px',
              flex: 1,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#166534' }}>{summary.passed}</div>
            <div style={{ fontSize: '13px', color: '#166534' }}>Passed</div>
          </div>
          <div
            style={{
              background: '#fff1f2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '12px 20px',
              flex: 1,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#991b1b' }}>{summary.failed}</div>
            <div style={{ fontSize: '13px', color: '#991b1b' }}>Failed</div>
          </div>
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px 20px',
              flex: 1,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#374151' }}>{summary.total}</div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>Total</div>
          </div>
        </div>
      )}

      <button
        onClick={runAllTests}
        disabled={running}
        style={{
          background: running ? '#9ca3af' : '#2563eb',
          color: 'white',
          border: 'none',
          padding: '10px 24px',
          borderRadius: '8px',
          cursor: running ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          marginBottom: '24px',
        }}
      >
        {running ? `Running ${currentTest}...` : 'Run All 12 Test Cases'}
      </button>

      {results.map((row) => (
        <div
          key={row.id}
          style={{
            border: `1px solid ${row.passed ? '#86efac' : '#fca5a5'}`,
            borderRadius: '8px',
            padding: '14px 16px',
            marginBottom: '10px',
            background: row.passed ? '#f0fdf4' : '#fff1f2',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <span style={{ fontWeight: '600', fontSize: '13px', marginRight: '10px' }}>{row.id}</span>
              <span style={{ fontSize: '13px', color: '#374151' }}>{row.description}</span>
            </div>
            <span
              style={{
                background: row.passed ? '#22c55e' : '#ef4444',
                color: 'white',
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '500',
                flexShrink: 0,
              }}
            >
              {row.passed ? 'PASS' : 'FAIL'}
            </span>
          </div>

          {row.actual && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
              Got:{' '}
              <strong>
                {row.actual.decision || (row.actual.blocked ? `BLOCKED (${row.actual.reason})` : 'ERROR')}
              </strong>
              {row.actual.approved_amount !== undefined && ` — ₹${row.actual.approved_amount}`}
              {row.actual.confidence_score !== undefined &&
                ` — ${Math.round(row.actual.confidence_score * 100)}% confidence`}
            </div>
          )}

          {!row.passed && row.issues.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {row.issues.map((issue, index) => (
                <div key={index} style={{ fontSize: '12px', color: '#991b1b' }}>
                  → {issue}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
