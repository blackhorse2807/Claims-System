import { useRef, useState } from 'react';
import {
  COVERED_DENTAL_PROCEDURES,
  DENTAL_COVERAGE,
  DENTAL_OPTIONAL_DOCUMENT_SPECS,
  DENTAL_PROCEDURE_TYPES,
  DENTAL_REQUIRED_DOCUMENT_SPECS,
  EXCLUDED_DENTAL_PROCEDURES,
} from '../../../data/dentalConfig';
import { isAcceptedDocumentFile, validateDocumentFile } from '../../../utils/documentUpload';
import ClaimPageLayout from './shared/ClaimPageLayout';
import DocumentUploadTable from './shared/DocumentUploadTable';
import InfoCard from './shared/InfoCard';
import { FieldError, inputClass, labelClass } from './shared/claimFormStyles';

const ALL_DENTAL_SPECS = [...DENTAL_REQUIRED_DOCUMENT_SPECS, ...DENTAL_OPTIONAL_DOCUMENT_SPECS];
const REQUIRED_DOC_IDS = DENTAL_REQUIRED_DOCUMENT_SPECS.map((s) => s.id);

export default function DentalClaimPage({
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
  const [procedureType, setProcedureType] = useState(initialClaimDetails?.procedureType || '');
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
      nextErrors.clinicName = 'Dental clinic or hospital name is required.';
    }
    const amount = Number(treatmentAmount);
    if (!treatmentAmount || Number.isNaN(amount) || amount <= 0) {
      nextErrors.treatmentAmount = 'Treatment amount must be greater than ₹0.';
    }
    if (!procedureType) {
      nextErrors.procedureType = 'Please select a dental procedure type.';
    }
    for (const spec of DENTAL_REQUIRED_DOCUMENT_SPECS) {
      const fileError = validateDocumentFile(uploads[spec.id]);
      if (fileError) nextErrors[`doc_${spec.id}`] = fileError;
    }
    for (const spec of DENTAL_OPTIONAL_DOCUMENT_SPECS) {
      const file = uploads[spec.id];
      if (file) {
        if (!isAcceptedDocumentFile(file)) {
          nextErrors[`doc_${spec.id}`] = 'Only PDF, JPG, or PNG files are allowed.';
        } else if (file.size > spec.maxSizeMb * 1024 * 1024) {
          nextErrors[`doc_${spec.id}`] = `File must be under ${spec.maxSizeMb} MB.`;
        }
      }
    }
    return nextErrors;
  }

  function handleContinue() {
    setShowErrors(true);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const documents = ALL_DENTAL_SPECS.map((spec) => {
      const file = uploads[spec.id];
      if (!file) return null;
      return {
        category: spec.id,
        file,
        fileName: file.name,
        fileSize: file.size,
      };
    }).filter(Boolean);

    onContinue({
      claimType: 'DENTAL',
      clinicName: clinicName.trim(),
      treatmentAmount: Number(treatmentAmount),
      procedureType,
      documents,
    });
  }

  const isCovered = COVERED_DENTAL_PROCEDURES.includes(procedureType);
  const isExcluded = EXCLUDED_DENTAL_PROCEDURES.includes(procedureType);

  const sidebar = (
    <>
      {procedureType && isCovered && (
        <InfoCard variant="success" title="Covered Procedure" icon="✓">
          <p>
            This procedure is generally covered under the policy subject to document verification.
          </p>
        </InfoCard>
      )}
      {procedureType && isExcluded && (
        <InfoCard variant="warning" title="Potentially Non-Covered" icon="⚠">
          <p>
            This procedure may not be eligible for reimbursement and will be reviewed during claim
            processing.
          </p>
        </InfoCard>
      )}
      <InfoCard variant="coverage" title="Coverage Information" icon="🛡️">
        <dl className="space-y-2 text-blue-800">
          <div className="flex justify-between">
            <dt>Sub Limit</dt>
            <dd className="font-semibold">₹{DENTAL_COVERAGE.subLimit.toLocaleString('en-IN')}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Copay</dt>
            <dd className="font-semibold">{DENTAL_COVERAGE.copayPercent}%</dd>
          </div>
        </dl>
        <div className="mt-3 border-t border-blue-200/60 pt-3 text-blue-800">
          <p className="font-medium">Covered Examples</p>
          <p className="mt-1 text-xs">Root Canal · Extraction · Filling · Scaling · Crown</p>
        </div>
        <div className="mt-2 text-blue-800">
          <p className="font-medium">Not Covered</p>
          <p className="mt-1 text-xs">Whitening · Veneers · Braces · Cosmetic Implants</p>
        </div>
      </InfoCard>
      <InfoCard variant="documents" title="Required Documents" icon="📄">
        <p className="text-violet-800">✓ Hospital Bill</p>
        <p className="mt-2 font-medium text-violet-900">Optional Supporting</p>
        <ul className="mt-1 space-y-1 text-violet-800">
          <li>• Prescription</li>
          <li>• Dental Report</li>
        </ul>
      </InfoCard>
      <InfoCard variant="notice" title="Eligibility Notice" icon="ℹ️">
        <p>
          Final eligibility will be determined after document verification and policy rule
          evaluation.
        </p>
      </InfoCard>
    </>
  );

  return (
    <ClaimPageLayout
      icon="🦷"
      title="Dental Claim"
      subtitle="Enter treatment details and upload required documents."
      applicantSummary={applicantSummary}
      sidebar={sidebar}
      onBack={onBack}
      onContinue={handleContinue}
    >
      <InfoCard variant="default" title="Dental Details" icon="📝">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="clinicName">
              Dental Clinic / Hospital Name <span className="text-red-500">*</span>
            </label>
            <input
              id="clinicName"
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="Enter dental clinic or hospital name"
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
            <label className={labelClass} htmlFor="procedureType">
              Dental Procedure Type <span className="text-red-500">*</span>
            </label>
            <select
              id="procedureType"
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value)}
              className={`${inputClass} ${showErrors && errors.procedureType ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            >
              <option value="">Select procedure type</option>
              {DENTAL_PROCEDURE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <FieldError message={showErrors ? errors.procedureType : null} />
          </div>
        </div>
      </InfoCard>

      <InfoCard variant="default" title="Upload Documents" icon="📎">
        <p className="mb-4 text-slate-500">
          Hospital Bill is required. Supporting documents may help during claim review.
        </p>
        <DocumentUploadTable
          specs={ALL_DENTAL_SPECS}
          uploads={uploads}
          errors={errors}
          showErrors={showErrors}
          fileInputRefs={fileInputRefs}
          onFileSelect={handleFileSelect}
          requiredIds={REQUIRED_DOC_IDS}
          highlightMissingIds={highlightMissingTypes}
        />
      </InfoCard>
    </ClaimPageLayout>
  );
}
