import { z } from 'zod';
import { evaluateDateHardStops, todayIsoDate } from '../utils/dateHardStops';

export { todayIsoDate };

export const CLAIM_TYPES = [
  'CONSULTATION',
  'DIAGNOSTIC',
  'PHARMACY',
  'DENTAL',
  'VISION',
  'ALTERNATIVE_MEDICINE',
];

export const RELATIONSHIPS = ['SELF', 'SPOUSE', 'CHILD', 'PARENT'];

export const GENDERS = ['Male', 'Female', 'Other'];

export const DOCUMENT_CATEGORIES = [
  'PRESCRIPTION',
  'HOSPITAL_BILL',
  'LAB_REPORT',
  'DIAGNOSTIC_REPORT',
  'PHARMACY_BILL',
  'DENTAL_REPORT',
  'DISCHARGE_SUMMARY',
  'OTHER',
];

const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

function isAcceptedFile(file) {
  const lowerName = file.name.toLowerCase();
  return (
    ACCEPTED_MIME_TYPES.includes(file.type) ||
    ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
  );
}

export const documentSchema = z.object({
  id: z.string(),
  file: z
    .instanceof(File, { message: 'File is required' })
    .refine(isAcceptedFile, 'Only PDF, JPG, JPEG, and PNG files are allowed'),
  category: z.enum(DOCUMENT_CATEGORIES),
  previewUrl: z.string().optional(),
});

export const claimSchema = z
  .object({
    memberId: z.string().min(1, 'Member ID is required'),
    memberName: z.string().optional(),
    relationship: z.enum(RELATIONSHIPS, { message: 'Relationship is required' }),
    treatmentDate: z.string().min(1, 'Date of treatment is required'),
    claimSubmissionDate: z.string().min(1, 'Date of claim submission is required'),
    claimType: z
      .string()
      .min(1, 'Claim type is required')
      .refine((val) => CLAIM_TYPES.includes(val), 'Claim type is required'),
    claimedAmount: z.coerce
      .number({ invalid_type_error: 'Claimed amount is required' })
      .positive('Claimed amount must be greater than 0'),
    hospitalName: z.string().optional(),
    doctorName: z.string().optional(),
    diagnosis: z.string().optional(),
    procedureName: z.string().optional(),
    isPreExisting: z.enum(['yes', 'no']),
    preAuthorizationObtained: z.enum(['yes', 'no']),
    preAuthorizationId: z.string().optional(),
    memberJoinDate: z.string().optional(),
    documents: z.array(documentSchema).min(1, 'At least one document is required'),
  })
  .refine(
    (data) =>
      data.preAuthorizationObtained !== 'yes' ||
      Boolean(data.preAuthorizationId && data.preAuthorizationId.trim().length > 0),
    {
      message: 'Pre-authorization ID is required when pre-authorization was obtained',
      path: ['preAuthorizationId'],
    }
  )
  .superRefine((data, ctx) => {
    const { checks } = evaluateDateHardStops({
      treatmentDate: data.treatmentDate,
      claimSubmissionDate: data.claimSubmissionDate,
    });

    for (const check of checks) {
      if (!check.pending && !check.passed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: check.message,
          path: [check.field],
        });
      }
    }
  });

export function buildClaimFormData(data) {
  const formData = new FormData();

  formData.append('memberId', data.memberId);
  formData.append('relationship', data.relationship);
  formData.append('treatmentDate', data.treatmentDate);
  formData.append('claimSubmissionDate', data.claimSubmissionDate);
  formData.append('claimType', data.claimType);
  formData.append('claimedAmount', String(data.claimedAmount));
  formData.append('policy_id', 'PLUM_GHI_2024');
  formData.append('ytd_claims_amount', '0');
  formData.append('claims_history', '[]');

  if (data.hospitalName) formData.append('hospitalName', data.hospitalName);
  if (data.doctorName) formData.append('doctorName', data.doctorName);
  if (data.diagnosis) formData.append('diagnosis', data.diagnosis);
  if (data.procedureName) formData.append('procedureName', data.procedureName);

  formData.append('isPreExisting', data.isPreExisting);
  formData.append('preAuthorizationObtained', data.preAuthorizationObtained);

  if (data.preAuthorizationObtained === 'yes' && data.preAuthorizationId) {
    formData.append('preAuthorizationId', data.preAuthorizationId);
  }

  data.documents.forEach((doc, index) => {
    formData.append('files', doc.file);
    formData.append(`doc_type_${index}`, doc.category);
  });

  return formData;
}

export function toClaimPayload(data) {
  return {
    memberId: data.memberId,
    relationship: data.relationship,
    treatmentDate: data.treatmentDate,
    claimSubmissionDate: data.claimSubmissionDate,
    claimType: data.claimType,
    claimedAmount: data.claimedAmount,
    hospitalName: data.hospitalName || '',
    doctorName: data.doctorName || '',
    diagnosis: data.diagnosis || '',
    procedureName: data.procedureName || '',
    isPreExisting: data.isPreExisting === 'yes',
    preAuthorizationObtained: data.preAuthorizationObtained === 'yes',
    preAuthorizationId: data.preAuthorizationId || '',
    documents: data.documents.map((doc) => ({
      fileName: doc.file.name,
      category: doc.category,
      size: doc.file.size,
      type: doc.file.type,
    })),
  };
}
