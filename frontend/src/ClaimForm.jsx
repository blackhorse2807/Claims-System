// ClaimForm.jsx
// The claim submission form
// Collects all fields needed by the backend pipeline

import { useState } from 'react';

// These are all the members from policy_terms.json
const MEMBERS = [
  { id: 'EMP001', name: 'Rajesh Kumar' },
  { id: 'EMP002', name: 'Priya Singh' },
  { id: 'EMP003', name: 'Amit Verma' },
  { id: 'EMP004', name: 'Sneha Reddy' },
  { id: 'EMP005', name: 'Vikram Joshi' },
  { id: 'EMP006', name: 'Kavita Nair' },
  { id: 'EMP007', name: 'Suresh Patil' },
  { id: 'EMP008', name: 'Ravi Menon' },
  { id: 'EMP009', name: 'Anita Desai' },
  { id: 'EMP010', name: 'Deepak Shah' },
];

const CATEGORIES = [
  'CONSULTATION',
  'DIAGNOSTIC',
  'PHARMACY',
  'DENTAL',
  'VISION',
  'ALTERNATIVE_MEDICINE',
];

// Document types that can be uploaded
const DOC_TYPES = [
  'PRESCRIPTION',
  'HOSPITAL_BILL',
  'LAB_REPORT',
  'PHARMACY_BILL',
  'DENTAL_REPORT',
  'DIAGNOSTIC_REPORT',
];

function getRequiredDocsHint(category) {
  const hints = {
    CONSULTATION: 'Prescription + Hospital Bill',
    DIAGNOSTIC: 'Prescription + Lab Report + Hospital Bill',
    PHARMACY: 'Prescription + Pharmacy Bill',
    DENTAL: 'Hospital Bill (Prescription optional)',
    VISION: 'Prescription + Hospital Bill',
    ALTERNATIVE_MEDICINE: 'Prescription + Hospital Bill',
  };
  return hints[category] || 'Check policy for required documents';
}

export default function ClaimForm({ onSubmit }) {
  const [memberId, setMemberId] = useState('EMP001');
  const [category, setCategory] = useState('CONSULTATION');
  const [treatmentDate, setTreatmentDate] = useState('2024-11-01');
  const [claimedAmount, setClaimedAmount] = useState('1500');
  const [hospitalName, setHospitalName] = useState('');
  const [ytdAmount, setYtdAmount] = useState('0');
  const [documents, setDocuments] = useState([]);

  function addDocumentSlot() {
    setDocuments((prev) => [...prev, { file: null, docType: 'PRESCRIPTION' }]);
  }

  function handleFileChange(index, file) {
    setDocuments((prev) => prev.map((doc, i) => (i === index ? { ...doc, file } : doc)));
  }

  function handleDocTypeChange(index, docType) {
    setDocuments((prev) => prev.map((doc, i) => (i === index ? { ...doc, docType } : doc)));
  }

  function removeDocument(index) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const uploadedDocs = documents.filter((doc) => doc.file !== null);
    if (uploadedDocs.length === 0) {
      alert('Please upload at least one document.');
      return;
    }

    const formData = new FormData();
    formData.append('member_id', memberId);
    formData.append('policy_id', 'PLUM_GHI_2024');
    formData.append('claim_category', category);
    formData.append('treatment_date', treatmentDate);
    formData.append('claimed_amount', claimedAmount);
    formData.append('hospital_name', hospitalName);
    formData.append('ytd_claims_amount', ytdAmount);
    formData.append('claims_history', '[]');

    uploadedDocs.forEach((doc, index) => {
      formData.append('files', doc.file);
      formData.append(`doc_type_${index}`, doc.docType);
    });

    onSubmit(formData);
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '500',
    fontSize: '14px',
  };

  const fieldStyle = {
    marginBottom: '20px',
  };

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '28px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <h2 style={{ fontSize: '18px', marginBottom: '24px', marginTop: 0 }}>Submit a Claim</h2>

        <div style={fieldStyle}>
          <label style={labelStyle}>Member</label>
          <select
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            style={inputStyle}
          >
            {MEMBERS.map((member) => (
              <option key={member.id} value={member.id}>
                {member.id} — {member.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Claim Category</label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            style={inputStyle}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div>
            <label style={labelStyle}>Treatment Date</label>
            <input
              type="date"
              value={treatmentDate}
              onChange={(event) => setTreatmentDate(event.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Claimed Amount (₹)</label>
            <input
              type="number"
              value={claimedAmount}
              onChange={(event) => setClaimedAmount(event.target.value)}
              style={inputStyle}
            />
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
          <div>
            <label style={labelStyle}>Hospital Name</label>
            <input
              type="text"
              value={hospitalName}
              onChange={(event) => setHospitalName(event.target.value)}
              placeholder="e.g. Apollo Hospitals"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Amount Used This Year (₹)</label>
            <input
              type="number"
              value={ytdAmount}
              onChange={(event) => setYtdAmount(event.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Document upload section */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <label style={{ ...labelStyle, marginBottom: 0 }}>Documents</label>
            <button
              type="button"
              onClick={addDocumentSlot}
              style={{
                background: '#eff6ff',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              + Add Document
            </button>
          </div>

          <div
            style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              padding: '8px 12px',
              marginBottom: '12px',
              fontSize: '12px',
              color: '#0369a1',
            }}
          >
            <strong>Required for {category}:</strong> {getRequiredDocsHint(category)}
          </div>

          {documents.length === 0 && (
            <div
              style={{
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                padding: '24px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '14px',
              }}
            >
              Click &quot;+ Add Document&quot; to upload your first document
            </div>
          )}

          {documents.map((doc, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '8px',
                background: doc.file ? '#f0fdf4' : '#fafafa',
                border: `1px solid ${doc.file ? '#86efac' : '#e5e7eb'}`,
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <select
                value={doc.docType}
                onChange={(event) => handleDocTypeChange(index, event.target.value)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  background: 'white',
                  flexShrink: 0,
                }}
              >
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <div style={{ flex: 1, minWidth: 0 }}>
                {doc.file ? (
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>✓</span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {doc.file.name}
                    </span>
                  </div>
                ) : (
                  <label style={{ cursor: 'pointer', fontSize: '13px', color: '#6b7280' }}>
                    <span
                      style={{
                        background: 'white',
                        border: '1px solid #d1d5db',
                        padding: '4px 10px',
                        borderRadius: '5px',
                        marginRight: '8px',
                      }}
                    >
                      Choose file
                    </span>
                    Click to select a file
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        if (event.target.files[0]) {
                          handleFileChange(index, event.target.files[0]);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {doc.file && (
                <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#2563eb',
                      textDecoration: 'underline',
                    }}
                  >
                    Change
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      if (event.target.files[0]) {
                        handleFileChange(index, event.target.files[0]);
                      }
                    }}
                  />
                </label>
              )}

              <button
                type="button"
                onClick={() => removeDocument(index)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '0 2px',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="submit"
          style={{
            width: '100%',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '14px',
            borderRadius: '8px',
            fontSize: '15px',
            cursor: 'pointer',
            fontWeight: '600',
            marginTop: '8px',
            letterSpacing: '0.01em',
          }}
        >
          Submit Claim →
        </button>
      </div>
    </form>
  );
}
