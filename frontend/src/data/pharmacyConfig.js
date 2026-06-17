export const MEDICINE_TYPES = [
  'Generic Medicine',
  'Branded Medicine',
  'Mixed',
  'Not Sure',
];

export const PHARMACY_COVERAGE = {
  subLimit: 15000,
  brandedCopayPercent: 30,
};

export const PHARMACY_DOCUMENT_SPECS = [
  {
    id: 'PRESCRIPTION',
    label: 'Prescription',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
  {
    id: 'PHARMACY_BILL',
    label: 'Pharmacy Bill',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
];
