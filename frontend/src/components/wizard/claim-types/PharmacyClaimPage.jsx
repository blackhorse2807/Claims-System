import { useRef, useState } from 'react';
import {
  MEDICINE_TYPES,
  PHARMACY_COVERAGE,
  PHARMACY_DOCUMENT_SPECS,
} from '../../../data/pharmacyConfig';
import { validateDocumentFile } from '../../../utils/documentUpload';
import ClaimPageLayout from './shared/ClaimPageLayout';
import DocumentUploadTable from './shared/DocumentUploadTable';
import InfoCard from './shared/InfoCard';
import { FieldError, inputClass, labelClass } from './shared/claimFormStyles';

export default function PharmacyClaimPage({
  applicantSummary,
  onBack,
  onContinue,
  highlightMissingTypes = [],
  initialClaimDetails = null,
}) {
  const [pharmacyName, setPharmacyName] = useState(initialClaimDetails?.pharmacyName || '');
  const [medicineAmount, setMedicineAmount] = useState(
    initialClaimDetails?.medicineAmount != null ? String(initialClaimDetails.medicineAmount) : ''
  );
  const [medicineType, setMedicineType] = useState(initialClaimDetails?.medicineType || '');
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
    if (!pharmacyName.trim()) {
      nextErrors.pharmacyName = 'Pharmacy or medical store name is required.';
    }
    const amount = Number(medicineAmount);
    if (!medicineAmount || Number.isNaN(amount) || amount <= 0) {
      nextErrors.medicineAmount = 'Medicine purchase amount must be greater than ₹0.';
    }
    for (const spec of PHARMACY_DOCUMENT_SPECS) {
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
      claimType: 'PHARMACY',
      pharmacyName: pharmacyName.trim(),
      medicineAmount: Number(medicineAmount),
      medicineType: medicineType || undefined,
      documents: PHARMACY_DOCUMENT_SPECS.map((spec) => ({
        category: spec.id,
        file: uploads[spec.id],
        fileName: uploads[spec.id].name,
        fileSize: uploads[spec.id].size,
      })),
    });
  }

  const sidebar = (
    <>
      <InfoCard variant="coverage" title="Coverage Information" icon="🛡️">
        <dl className="space-y-2 text-blue-800">
          <div className="flex justify-between">
            <dt>Sub Limit</dt>
            <dd className="font-semibold">₹{PHARMACY_COVERAGE.subLimit.toLocaleString('en-IN')}</dd>
          </div>
        </dl>
        <ul className="mt-4 space-y-1.5 border-t border-blue-200/60 pt-3 text-blue-800">
          <li>• Generic medicines preferred</li>
          <li>• Branded medicines: {PHARMACY_COVERAGE.brandedCopayPercent}% copay</li>
        </ul>
        <p className="mt-3 border-t border-blue-200/60 pt-3 text-xs text-blue-700">
          Final coverage determined after document verification.
        </p>
      </InfoCard>
      <InfoCard variant="documents" title="Required Documents" icon="📄">
        <ul className="space-y-1.5 text-violet-800">
          <li>✓ Prescription</li>
          <li>✓ Pharmacy Bill</li>
        </ul>
      </InfoCard>
      <InfoCard variant="notice" title="Verification Note" icon="ℹ️">
        <p>
          Medicine type is for guidance only. Final verification uses your prescription and
          pharmacy bill.
        </p>
      </InfoCard>
    </>
  );

  return (
    <ClaimPageLayout
      icon="💊"
      title="Pharmacy Claim"
      subtitle="Enter pharmacy details and upload required documents."
      applicantSummary={applicantSummary}
      sidebar={sidebar}
      onBack={onBack}
      onContinue={handleContinue}
    >
      <InfoCard variant="default" title="Pharmacy Details" icon="📝">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="pharmacyName">
              Pharmacy / Medical Store Name <span className="text-red-500">*</span>
            </label>
            <input
              id="pharmacyName"
              type="text"
              value={pharmacyName}
              onChange={(e) => setPharmacyName(e.target.value)}
              placeholder="Enter pharmacy or medical store name"
              className={`${inputClass} ${showErrors && errors.pharmacyName ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            />
            <FieldError message={showErrors ? errors.pharmacyName : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="medicineAmount">
              Medicine Purchase Amount (INR) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                ₹
              </span>
              <input
                id="medicineAmount"
                type="number"
                min="0"
                step="0.01"
                value={medicineAmount}
                onChange={(e) => setMedicineAmount(e.target.value)}
                placeholder="Enter medicine purchase amount"
                className={`${inputClass} pl-7 ${showErrors && errors.medicineAmount ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              />
            </div>
            <FieldError message={showErrors ? errors.medicineAmount : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="medicineType">
              Medicine Type <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <select
              id="medicineType"
              value={medicineType}
              onChange={(e) => setMedicineType(e.target.value)}
              className={inputClass}
            >
              <option value="">Select medicine type</option>
              {MEDICINE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </InfoCard>

      <InfoCard variant="default" title="Upload Documents" icon="📎">
        <p className="mb-4 text-slate-500">All documents are mandatory for pharmacy claims.</p>
        <DocumentUploadTable
          specs={PHARMACY_DOCUMENT_SPECS}
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
