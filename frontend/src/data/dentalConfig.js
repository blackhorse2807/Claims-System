export const DENTAL_PROCEDURE_TYPES = [
  'Root Canal',
  'Tooth Extraction',
  'Dental Filling',
  'Scaling and Polishing',
  'Dental X-Ray',
  'Crown Placement',
  'Gum Treatment',
  'Teeth Whitening',
  'Veneers',
  'Braces',
  'Cosmetic Implants',
  'Other',
];

export const DENTAL_COVERAGE = {
  subLimit: 10000,
  copayPercent: 0,
};

export const COVERED_DENTAL_PROCEDURES = [
  'Root Canal',
  'Tooth Extraction',
  'Dental Filling',
  'Scaling and Polishing',
  'Crown Placement',
];

export const EXCLUDED_DENTAL_PROCEDURES = [
  'Teeth Whitening',
  'Veneers',
  'Braces',
  'Cosmetic Implants',
];

export const DENTAL_REQUIRED_DOCUMENT_SPECS = [
  {
    id: 'HOSPITAL_BILL',
    label: 'Hospital Bill',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
];

export const DENTAL_OPTIONAL_DOCUMENT_SPECS = [
  {
    id: 'PRESCRIPTION',
    label: 'Prescription',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
  {
    id: 'DENTAL_REPORT',
    label: 'Dental Report',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
];
