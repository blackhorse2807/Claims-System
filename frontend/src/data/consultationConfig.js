export const NETWORK_HOSPITALS = [
  'Apollo Hospitals',
  'Fortis Healthcare',
  'Max Healthcare',
  'Manipal Hospitals',
  'Narayana Health',
  'Medanta',
  'Kokilaben Dhirubhai Ambani Hospital',
  'Aster CMI Hospital',
  'Columbia Asia',
  'Sakra World Hospital',
];

export const CONSULTATION_TYPES = [
  'General Physician',
  'Specialist Consultation',
  'Follow-up Consultation',
  'Teleconsultation',
  'Other',
];

export const CONSULTATION_COVERAGE = {
  subLimit: 2000,
  copayPercent: 10,
  networkDiscountPercent: 20,
};

export const CONSULTATION_DOCUMENT_SPECS = [
  {
    id: 'PRESCRIPTION',
    label: 'Prescription',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
  {
    id: 'HOSPITAL_BILL',
    label: 'Hospital Bill',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
];

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
