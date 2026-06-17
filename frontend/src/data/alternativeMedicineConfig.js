export const ALTERNATIVE_MEDICINE_SYSTEMS = [
  'Ayurveda',
  'Homeopathy',
  'Unani',
  'Siddha',
  'Naturopathy',
  'Other',
];

export const COVERED_ALTERNATIVE_MEDICINE_SYSTEMS = [
  'Ayurveda',
  'Homeopathy',
  'Unani',
  'Siddha',
  'Naturopathy',
];

export const ALTERNATIVE_MEDICINE_COVERAGE = {
  subLimit: 8000,
  copayPercent: 0,
};

export const ALTERNATIVE_MEDICINE_DOCUMENT_SPECS = [
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
