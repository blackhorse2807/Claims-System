import { NETWORK_HOSPITALS } from './consultationConfig';

export { NETWORK_HOSPITALS };

export const DIAGNOSTIC_TEST_TYPES = [
  'MRI',
  'CT Scan',
  'PET Scan',
  'X-Ray',
  'Blood Test',
  'CBC',
  'Thyroid Test',
  'Diabetes Test',
  'Ultrasound',
  'Other',
];

export const HIGH_VALUE_TESTS_REQUIRING_PRE_AUTH = ['MRI', 'CT Scan', 'PET Scan'];

export const PRE_AUTH_THRESHOLD = 10000;

export const DIAGNOSTIC_COVERAGE = {
  subLimit: 10000,
  copayPercent: 0,
  networkDiscountPercent: 10,
};

export const DIAGNOSTIC_DOCUMENT_SPECS = [
  {
    id: 'PRESCRIPTION',
    label: 'Prescription',
    formats: 'PDF, JPG, PNG',
    maxSizeMb: 5,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
  {
    id: 'LAB_REPORT',
    label: 'Lab Report',
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

export function requiresPreAuthWarning(testType, amount) {
  const numericAmount = Number(amount);
  return (
    HIGH_VALUE_TESTS_REQUIRING_PRE_AUTH.includes(testType) &&
    !Number.isNaN(numericAmount) &&
    numericAmount > PRE_AUTH_THRESHOLD
  );
}
