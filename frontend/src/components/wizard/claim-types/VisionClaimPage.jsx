import { useRef, useState } from 'react';
import {
  COVERED_VISION_TREATMENTS,
  EXCLUDED_VISION_TREATMENTS,
  VISION_COVERAGE,
  VISION_DOCUMENT_SPECS,
  VISION_TREATMENT_TYPES,
} from '../../../data/visionConfig';
import { validateDocumentFile } from '../../../utils/documentUpload';
import ClaimPageLayout from './shared/ClaimPageLayout';
import DocumentUploadTable from './shared/DocumentUploadTable';
import InfoCard from './shared/InfoCard';
import { FieldError, inputClass, labelClass } from './shared/claimFormStyles';

export default function VisionClaimPage({
  applicantSummary,
  onBack,
  onContinue,
  highlightMissingTypes = [],
  initialClaimDetails = null,
}) {
  const [clinicName, setClinicName] = useState(initialClaimDetails?.clinicName || '');
  const [treatmentAmount, setTreatmentAmount] = useState(
    initialClaimDetails?.treatmentAmount != null ? String(initialClaimDetails.treatmentAmount) : ''
  );
  const [treatmentType, setTreatmentType] = useState(initialClaimDetails?.treatmentType || '');
  const [uploads, setUploads] = useState({});
  const [errors, setErrors] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRefs = useRef({});

  function handleFileSelect(docId, file) {
    setUploads((prev) => ({ ...prev, [docId]: file || null }));
    if (showErrors) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`doc_${docId}`];
        return next;
      });
    }
  }

  function validate() {
    const nextErrors = {};
    if (!clinicName.trim()) {
      nextErrors.clinicName = 'Eye clinic or hospital name is required.';
    }
    const amount = Number(treatmentAmount);
    if (!treatmentAmount || Number.isNaN(amount) || amount <= 0) {
      nextErrors.treatmentAmount = 'Treatment amount must be greater than ₹0.';
    }
    if (!treatmentType) {
      nextErrors.treatmentType = 'Please select a vision treatment type.';
    }
    for (const spec of VISION_DOCUMENT_SPECS) {
      const fileError = validateDocumentFile(uploads[spec.id]);
      if (fileError) nextErrors[`doc_${spec.id}`] = fileError;
    }
    return nextErrors;
  }

  function handleContinue() {
    setShowErrors(true);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onContinue({
      claimType: 'VISION',
      clinicName: clinicName.trim(),
      treatmentAmount: Number(treatmentAmount),
      treatmentType,
      documents: VISION_DOCUMENT_SPECS.map((spec) => ({
        category: spec.id,
        file: uploads[spec.id],
        fileName: uploads[spec.id].name,
        fileSize: uploads[spec.id].size,
      })),
    });
  }

  const isCovered = COVERED_VISION_TREATMENTS.includes(treatmentType);
  const isExcluded = EXCLUDED_VISION_TREATMENTS.includes(treatmentType);

  const sidebar = (
    <>
      {treatmentType && isCovered && (
        <InfoCard variant="success" title="Covered Treatment" icon="✓">
          <p>
            This treatment is generally covered under the policy subject to document verification.
          </p>
        </InfoCard>
      )}
      {treatmentType && isExcluded && (
        <InfoCard variant="warning" title="Potentially Non-Covered" icon="⚠">
          <p>
            This treatment may not be eligible for reimbursement and will be reviewed during claim
            processing.
          </p>
        </InfoCard>
      )}
      <InfoCard variant="coverage" title="Coverage Information" icon="🛡️">
        <dl className="space-y-2 text-blue-800">
          <div className="flex justify-between">
            <dt>Sub Limit</dt>
            <dd className="font-semibold">₹{VISION_COVERAGE.subLimit.toLocaleString('en-IN')}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Copay</dt>
            <dd className="font-semibold">{VISION_COVERAGE.copayPercent}%</dd>
          </div>
        </dl>
        <div className="mt-3 border-t border-blue-200/60 pt-3 text-blue-800">
          <p className="font-medium">Covered Examples</p>
          <p className="mt-1 text-xs">Examination · Glasses · Lenses · Cataract Surgery</p>
        </div>
        <div className="mt-2 text-blue-800">
          <p className="font-medium">Not Covered</p>
          <p className="mt-1 text-xs">LASIK · Cosmetic Eye Surgery · Refractive Surgery</p>
        </div>
      </InfoCard>
      <InfoCard variant="documents" title="Required Documents" icon="📄">
        <ul className="space-y-1.5 text-violet-800">
          <li>✓ Prescription</li>
          <li>✓ Hospital Bill</li>
        </ul>
      </InfoCard>
    </>
  );

  return (
    <ClaimPageLayout
      icon="👓"
      title="Vision Claim"
      subtitle="Enter vision treatment details and upload required documents."
      applicantSummary={applicantSummary}
      sidebar={sidebar}
      onBack={onBack}
      onContinue={handleContinue}
    >
      <InfoCard variant="default" title="Vision Details" icon="📝">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="clinicName">
              Hospital / Eye Clinic Name <span className="text-red-500">*</span>
            </label>
            <input
              id="clinicName"
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="Enter eye clinic or hospital name"
              className={`${inputClass} ${showErrors && errors.clinicName ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            />
            <FieldError message={showErrors ? errors.clinicName : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="treatmentAmount">
              Treatment Amount (INR) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                ₹
              </span>
              <input
                id="treatmentAmount"
                type="number"
                min="0"
                step="0.01"
                value={treatmentAmount}
                onChange={(e) => setTreatmentAmount(e.target.value)}
                placeholder="Enter treatment amount"
                className={`${inputClass} pl-7 ${showErrors && errors.treatmentAmount ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              />
            </div>
            <FieldError message={showErrors ? errors.treatmentAmount : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="treatmentType">
              Vision Treatment Type <span className="text-red-500">*</span>
            </label>
            <select
              id="treatmentType"
              value={treatmentType}
              onChange={(e) => setTreatmentType(e.target.value)}
              className={`${inputClass} ${showErrors && errors.treatmentType ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            >
              <option value="">Select treatment type</option>
              {VISION_TREATMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <FieldError message={showErrors ? errors.treatmentType : null} />
          </div>
        </div>
      </InfoCard>

      <InfoCard variant="default" title="Upload Documents" icon="📎">
        <p className="mb-4 text-slate-500">All documents are mandatory for vision claims.</p>
        <DocumentUploadTable
          specs={VISION_DOCUMENT_SPECS}
          uploads={uploads}
          errors={errors}
          showErrors={showErrors}
          fileInputRefs={fileInputRefs}
          onFileSelect={handleFileSelect}
          highlightMissingIds={highlightMissingTypes}
        />
      </InfoCard>
    </ClaimPageLayout>
  );
}
