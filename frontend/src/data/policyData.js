// Mirrors policy_terms.json — used when /api/members is unavailable (e.g. older deploy)

export const POLICY_PERIOD = {
  start: '2024-04-01',
  end: '2027-03-31',
  renewalStatus: 'ACTIVE',
};

export const SUBMISSION_DEADLINE_DAYS = 30;

export const FALLBACK_MEMBERS = [
  { memberId: 'EMP001', name: 'Rajesh Kumar', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP002', name: 'Priya Singh', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP003', name: 'Amit Verma', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP004', name: 'Sneha Reddy', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP005', name: 'Vikram Joshi', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-09-01' },
  { memberId: 'EMP006', name: 'Kavita Nair', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP007', name: 'Suresh Patil', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP008', name: 'Ravi Menon', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP009', name: 'Anita Desai', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'EMP010', name: 'Deepak Shah', relationship: 'SELF', primaryMemberId: null, joinDate: '2024-04-01' },
  { memberId: 'DEP001', name: 'Sunita Kumar', relationship: 'SPOUSE', primaryMemberId: 'EMP001', joinDate: null },
  { memberId: 'DEP002', name: 'Arjun Kumar', relationship: 'CHILD', primaryMemberId: 'EMP001', joinDate: null },
];

export const DOCUMENT_REQUIREMENTS = {
  CONSULTATION: {
    required: ['PRESCRIPTION', 'HOSPITAL_BILL'],
    optional: ['LAB_REPORT', 'DIAGNOSTIC_REPORT'],
  },
  DIAGNOSTIC: {
    required: ['PRESCRIPTION', 'LAB_REPORT', 'HOSPITAL_BILL'],
    optional: ['DISCHARGE_SUMMARY'],
  },
  PHARMACY: {
    required: ['PRESCRIPTION', 'PHARMACY_BILL'],
    optional: [],
  },
  DENTAL: {
    required: ['HOSPITAL_BILL'],
    optional: ['PRESCRIPTION', 'DENTAL_REPORT'],
  },
  VISION: {
    required: ['PRESCRIPTION', 'HOSPITAL_BILL'],
    optional: [],
  },
  ALTERNATIVE_MEDICINE: {
    required: ['PRESCRIPTION', 'HOSPITAL_BILL'],
    optional: [],
  },
};

export function formatDocLabel(type) {
  return type.replace(/_/g, ' ');
}

export function getDocumentRequirements(claimType) {
  return DOCUMENT_REQUIREMENTS[claimType] || null;
}
