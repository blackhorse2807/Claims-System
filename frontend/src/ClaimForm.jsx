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

export default function ClaimForm({ onSubmit }) {
  const [memberId, setMemberId] = useState('EMP001');
  const [category, setCategory] = useState('CONSULTATION');
  const [treatmentDate, setTreatmentDate] = useState('2024-11-01');
  const [claimedAmount, setClaimedAmount] = useState('1500');
  const [hospitalName, setHospitalName] = useState('');
  const [ytdAmount, setYtdAmount] = useState('0');
  const [files, setFiles] = useState([]);
  const [docTypes, setDocTypes] = useState([]);

  // When user selects files, set up a doc type entry for each
  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files);
    setFiles(selectedFiles);
    setDocTypes(selectedFiles.map(() => 'PRESCRIPTION'));
  }

  // Update the doc type for a specific file
  function handleDocTypeChange(index, value) {
    const updated = [...docTypes];
    updated[index] = value;
    setDocTypes(updated);
  }

  function handleSubmit(event) {
    event.preventDefault();

    // Build FormData — this can hold both text fields and files
    const formData = new FormData();
    formData.append('member_id', memberId);
    formData.append('policy_id', 'PLUM_GHI_2024');
    formData.append('claim_category', category);
    formData.append('treatment_date', treatmentDate);
    formData.append('claimed_amount', claimedAmount);
    formData.append('hospital_name', hospitalName);
    formData.append('ytd_claims_amount', ytdAmount);
    formData.append('claims_history', '[]');

    // Append each file and its type
    files.forEach((file, index) => {
      formData.append('files', file);
      formData.append(`doc_type_${index}`, docTypes[index]);
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
          background: '#f9f9f9',
          border: '1px solid #eee',
          borderRadius: '12px',
          padding: '24px',
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

        <div style={fieldStyle}>
          <label style={labelStyle}>Upload Documents</label>
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileChange}
            style={{ fontSize: '14px' }}
          />
          <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
            Accept images (JPG, PNG) or PDF. Upload prescription, bill, lab reports etc.
          </p>
        </div>

        {files.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Document Types</label>
            {files.map((file, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '13px', color: '#555', flex: 1 }}>{file.name}</span>
                <select
                  value={docTypes[index]}
                  onChange={(event) => handleDocTypeChange(index, event.target.value)}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                >
                  {DOC_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          style={{
            background: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '12px 32px',
            borderRadius: '8px',
            fontSize: '15px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          Submit Claim
        </button>
      </div>
    </form>
  );
}
