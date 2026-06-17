export const VISION_TREATMENT_TYPES = [
  'Eye Examination',
  'Prescription Glasses',
  'Contact Lenses',
  'Cataract Surgery',
  'LASIK',
  'Cosmetic Eye Surgery',
  'Refractive Surgery',
  'Other',
];

export const VISION_COVERAGE = {
  subLimit: 5000,
  copayPercent: 0,
};

export const COVERED_VISION_TREATMENTS = [
  'Eye Examination',
  'Prescription Glasses',
  'Contact Lenses',
  'Cataract Surgery',
];

export const EXCLUDED_VISION_TREATMENTS = [
  'LASIK',
  'Cosmetic Eye Surgery',
  'Refractive Surgery',
];

export const VISION_DOCUMENT_SPECS = [
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
