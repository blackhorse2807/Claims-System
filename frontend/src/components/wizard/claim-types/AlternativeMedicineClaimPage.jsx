import { useRef, useState } from 'react';
import {
  ALTERNATIVE_MEDICINE_COVERAGE,
  ALTERNATIVE_MEDICINE_DOCUMENT_SPECS,
  ALTERNATIVE_MEDICINE_SYSTEMS,
  COVERED_ALTERNATIVE_MEDICINE_SYSTEMS,
} from '../../../data/alternativeMedicineConfig';
import { validateDocumentFile } from '../../../utils/documentUpload';
import ClaimPageLayout from './shared/ClaimPageLayout';
import DocumentUploadTable from './shared/DocumentUploadTable';
import InfoCard from './shared/InfoCard';
import { FieldError, inputClass, labelClass } from './shared/claimFormStyles';

export default function AlternativeMedicineClaimPage({
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
  const [medicineSystem, setMedicineSystem] = useState(initialClaimDetails?.medicineSystem || '');
  const [practitionerName, setPractitionerName] = useState(
    initialClaimDetails?.practitionerName || ''
  );
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
      nextErrors.clinicName = 'Clinic or treatment center name is required.';
    }
    const amount = Number(treatmentAmount);
    if (!treatmentAmount || Number.isNaN(amount) || amount <= 0) {
      nextErrors.treatmentAmount = 'Treatment amount must be greater than ₹0.';
    }
    if (!medicineSystem) {
      nextErrors.medicineSystem = 'Please select an alternative medicine system.';
    }
    if (!practitionerName.trim()) {
      nextErrors.practitionerName = 'Practitioner name is required.';
    }
    for (const spec of ALTERNATIVE_MEDICINE_DOCUMENT_SPECS) {
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
      claimType: 'ALTERNATIVE_MEDICINE',
      clinicName: clinicName.trim(),
      treatmentAmount: Number(treatmentAmount),
      medicineSystem,
      practitionerName: practitionerName.trim(),
      documents: ALTERNATIVE_MEDICINE_DOCUMENT_SPECS.map((spec) => ({
        category: spec.id,
        file: uploads[spec.id],
        fileName: uploads[spec.id].name,
        fileSize: uploads[spec.id].size,
      })),
    });
  }

  const isCovered = COVERED_ALTERNATIVE_MEDICINE_SYSTEMS.includes(medicineSystem);

  const sidebar = (
    <>
      {medicineSystem && isCovered && (
        <InfoCard variant="success" title="Covered Treatment System" icon="✓">
          <p>
            This treatment system is generally covered subject to practitioner verification and
            document review.
          </p>
        </InfoCard>
      )}
      {medicineSystem === 'Other' && (
        <InfoCard variant="warning" title="Coverage Requires Review" icon="⚠">
          <p>
            This treatment system is not explicitly listed in the policy and may require manual
            review during claim processing.
          </p>
        </InfoCard>
      )}
      <InfoCard variant="coverage" title="Coverage Information" icon="🛡️">
        <dl className="space-y-2 text-blue-800">
          <div className="flex justify-between">
            <dt>Sub Limit</dt>
            <dd className="font-semibold">
              ₹{ALTERNATIVE_MEDICINE_COVERAGE.subLimit.toLocaleString('en-IN')}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Copay</dt>
            <dd className="font-semibold">{ALTERNATIVE_MEDICINE_COVERAGE.copayPercent}%</dd>
          </div>
        </dl>
        <div className="mt-3 border-t border-blue-200/60 pt-3 text-blue-800">
          <p className="font-medium">Covered Systems</p>
          <p className="mt-1 text-xs">
            Ayurveda · Homeopathy · Unani · Siddha · Naturopathy
          </p>
        </div>
        <p className="mt-3 border-t border-blue-200/60 pt-3 text-xs text-blue-700">
          Treatment must be provided by a registered practitioner.
        </p>
      </InfoCard>
      <InfoCard variant="documents" title="Required Documents" icon="📄">
        <ul className="space-y-1.5 text-violet-800">
          <li>✓ Prescription</li>
          <li>✓ Hospital Bill</li>
        </ul>
      </InfoCard>
      <InfoCard variant="notice" title="Practitioner Verification" icon="ℹ️">
        <p>
          The practitioner&apos;s registration details will be verified during claim processing
          based on the uploaded documents.
        </p>
      </InfoCard>
    </>
  );

  return (
    <ClaimPageLayout
      icon="🌿"
      title="Alternative Medicine Claim"
      subtitle="Enter treatment details and upload required documents."
      applicantSummary={applicantSummary}
      sidebar={sidebar}
      onBack={onBack}
      onContinue={handleContinue}
    >
      <InfoCard variant="default" title="Treatment Details" icon="📝">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="clinicName">
              Clinic / Treatment Center Name <span className="text-red-500">*</span>
            </label>
            <input
              id="clinicName"
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="Enter clinic or treatment center name"
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
            <label className={labelClass} htmlFor="medicineSystem">
              Alternative Medicine System <span className="text-red-500">*</span>
            </label>
            <select
              id="medicineSystem"
              value={medicineSystem}
              onChange={(e) => setMedicineSystem(e.target.value)}
              className={`${inputClass} ${showErrors && errors.medicineSystem ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            >
              <option value="">Select medicine system</option>
              {ALTERNATIVE_MEDICINE_SYSTEMS.map((system) => (
                <option key={system} value={system}>
                  {system}
                </option>
              ))}
            </select>
            <FieldError message={showErrors ? errors.medicineSystem : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="practitionerName">
              Practitioner Name <span className="text-red-500">*</span>
            </label>
            <input
              id="practitionerName"
              type="text"
              value={practitionerName}
              onChange={(e) => setPractitionerName(e.target.value)}
              placeholder="Enter practitioner name"
              className={`${inputClass} ${showErrors && errors.practitionerName ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            />
            <FieldError message={showErrors ? errors.practitionerName : null} />
          </div>
        </div>
      </InfoCard>

      <InfoCard variant="default" title="Upload Documents" icon="📎">
        <p className="mb-4 text-slate-500">
          All documents are mandatory for alternative medicine claims.
        </p>
        <DocumentUploadTable
          specs={ALTERNATIVE_MEDICINE_DOCUMENT_SPECS}
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
