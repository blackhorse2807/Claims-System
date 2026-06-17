import { useMemo, useRef, useState } from 'react';
import {
  NETWORK_HOSPITALS,
  CONSULTATION_TYPES,
  CONSULTATION_COVERAGE,
} from '../../../data/consultationConfig';
import { CONSULTATION_DOCUMENT_SPECS, validateDocumentFile } from '../../../utils/documentUpload';
import { isNetworkHospital } from '../../../utils/networkHospital';
import ClaimPageLayout from './shared/ClaimPageLayout';
import DocumentUploadTable from './shared/DocumentUploadTable';
import InfoCard from './shared/InfoCard';
import { FieldError, inputClass, labelClass } from './shared/claimFormStyles';

export default function ConsultationClaimPage({ applicantSummary, onBack, onContinue }) {
  const [hospitalName, setHospitalName] = useState('');
  const [consultationAmount, setConsultationAmount] = useState('');
  const [consultationType, setConsultationType] = useState('');
  const [uploads, setUploads] = useState({});
  const [errors, setErrors] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRefs = useRef({});

  const isNetwork = useMemo(
    () => isNetworkHospital(hospitalName, NETWORK_HOSPITALS),
    [hospitalName]
  );

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
    if (!hospitalName.trim()) {
      nextErrors.hospitalName = 'Hospital or clinic name is required.';
    }
    const amount = Number(consultationAmount);
    if (!consultationAmount || Number.isNaN(amount) || amount <= 0) {
      nextErrors.consultationAmount = 'Consultation amount must be greater than ₹0.';
    }
    for (const spec of CONSULTATION_DOCUMENT_SPECS) {
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
      claimType: 'CONSULTATION',
      hospitalName: hospitalName.trim(),
      consultationAmount: Number(consultationAmount),
      consultationType: consultationType || undefined,
      documents: CONSULTATION_DOCUMENT_SPECS.map((spec) => ({
        category: spec.id,
        file: uploads[spec.id],
        fileName: uploads[spec.id].name,
        fileSize: uploads[spec.id].size,
      })),
    });
  }

  const sidebar = (
    <>
      {isNetwork && (
        <InfoCard variant="success" title="Network Hospital" icon="✓">
          <p>
            Eligible for {CONSULTATION_COVERAGE.networkDiscountPercent}% network discount on this
            claim.
          </p>
        </InfoCard>
      )}
      <InfoCard variant="coverage" title="Coverage Information" icon="🛡️">
        <dl className="space-y-2 text-blue-800">
          <div className="flex justify-between">
            <dt>Sub Limit</dt>
            <dd className="font-semibold">₹{CONSULTATION_COVERAGE.subLimit.toLocaleString('en-IN')}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Copay</dt>
            <dd className="font-semibold">{CONSULTATION_COVERAGE.copayPercent}%</dd>
          </div>
          <div className="flex justify-between">
            <dt>Network Discount</dt>
            <dd className="font-semibold">
              {CONSULTATION_COVERAGE.networkDiscountPercent}%
              {isNetwork ? ' (applies)' : ''}
            </dd>
          </div>
        </dl>
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
      icon="🩺"
      title="Consultation Claim"
      subtitle="Enter consultation details and upload required documents."
      applicantSummary={applicantSummary}
      sidebar={sidebar}
      onBack={onBack}
      onContinue={handleContinue}
    >
      <InfoCard variant="default" title="Consultation Details" icon="📝">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="hospitalName">
              Hospital / Clinic Name <span className="text-red-500">*</span>
            </label>
            <input
              id="hospitalName"
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              placeholder="Enter hospital or clinic name"
              className={`${inputClass} ${showErrors && errors.hospitalName ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            />
            <FieldError message={showErrors ? errors.hospitalName : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="consultationAmount">
              Consultation Amount (INR) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                ₹
              </span>
              <input
                id="consultationAmount"
                type="number"
                min="0"
                step="0.01"
                value={consultationAmount}
                onChange={(e) => setConsultationAmount(e.target.value)}
                placeholder="Enter consultation amount"
                className={`${inputClass} pl-7 ${showErrors && errors.consultationAmount ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              />
            </div>
            <FieldError message={showErrors ? errors.consultationAmount : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="consultationType">
              Consultation Type <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <select
              id="consultationType"
              value={consultationType}
              onChange={(e) => setConsultationType(e.target.value)}
              className={inputClass}
            >
              <option value="">Select consultation type</option>
              {CONSULTATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </InfoCard>

      <InfoCard variant="default" title="Upload Documents" icon="📎">
        <p className="mb-4 text-slate-500">All documents are mandatory for consultation claims.</p>
        <DocumentUploadTable
          specs={CONSULTATION_DOCUMENT_SPECS}
          uploads={uploads}
          errors={errors}
          showErrors={showErrors}
          fileInputRefs={fileInputRefs}
          onFileSelect={handleFileSelect}
        />
      </InfoCard>
    </ClaimPageLayout>
  );
}
