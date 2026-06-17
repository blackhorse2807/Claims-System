import { useMemo, useRef, useState } from 'react';
import {
  NETWORK_HOSPITALS,
  DIAGNOSTIC_TEST_TYPES,
  DIAGNOSTIC_COVERAGE,
  DIAGNOSTIC_DOCUMENT_SPECS,
  PRE_AUTH_THRESHOLD,
  requiresPreAuthWarning,
} from '../../../data/diagnosticConfig';
import { validateDocumentFile } from '../../../utils/documentUpload';
import { isNetworkHospital } from '../../../utils/networkHospital';
import ClaimPageLayout from './shared/ClaimPageLayout';
import DocumentUploadTable from './shared/DocumentUploadTable';
import InfoCard from './shared/InfoCard';
import { FieldError, inputClass, labelClass } from './shared/claimFormStyles';

export default function DiagnosticClaimPage({ applicantSummary, onBack, onContinue }) {
  const [hospitalName, setHospitalName] = useState('');
  const [diagnosticAmount, setDiagnosticAmount] = useState('');
  const [diagnosticTestType, setDiagnosticTestType] = useState('');
  const [preAuthorizationId, setPreAuthorizationId] = useState('');
  const [uploads, setUploads] = useState({});
  const [errors, setErrors] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRefs = useRef({});

  const isNetwork = useMemo(
    () => isNetworkHospital(hospitalName, NETWORK_HOSPITALS),
    [hospitalName]
  );
  const showPreAuthWarning = useMemo(
    () => requiresPreAuthWarning(diagnosticTestType, diagnosticAmount),
    [diagnosticTestType, diagnosticAmount]
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
      nextErrors.hospitalName = 'Hospital or diagnostic center name is required.';
    }
    const amount = Number(diagnosticAmount);
    if (!diagnosticAmount || Number.isNaN(amount) || amount <= 0) {
      nextErrors.diagnosticAmount = 'Diagnostic amount must be greater than ₹0.';
    }
    if (!diagnosticTestType) {
      nextErrors.diagnosticTestType = 'Please select a diagnostic test type.';
    }
    if (showPreAuthWarning && !preAuthorizationId.trim()) {
      nextErrors.preAuthorizationId =
        'Pre-authorization ID is required for this test and amount.';
    }
    for (const spec of DIAGNOSTIC_DOCUMENT_SPECS) {
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
      claimType: 'DIAGNOSTIC',
      hospitalName: hospitalName.trim(),
      diagnosticAmount: Number(diagnosticAmount),
      diagnosticTestType,
      preAuthorizationId: preAuthorizationId.trim(),
      preAuthorizationObtained: showPreAuthWarning,
      documents: DIAGNOSTIC_DOCUMENT_SPECS.map((spec) => ({
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
            Eligible for {DIAGNOSTIC_COVERAGE.networkDiscountPercent}% network discount on this
            claim.
          </p>
        </InfoCard>
      )}
      {showPreAuthWarning && (
        <InfoCard variant="warning" title="Pre-Authorization Required" icon="⚠">
          <p>
            MRI, CT Scan and PET Scan above ₹{PRE_AUTH_THRESHOLD.toLocaleString('en-IN')} require
            pre-authorization.
          </p>
        </InfoCard>
      )}
      <InfoCard variant="coverage" title="Coverage Information" icon="🛡️">
        <dl className="space-y-2 text-blue-800">
          <div className="flex justify-between">
            <dt>Sub Limit</dt>
            <dd className="font-semibold">₹{DIAGNOSTIC_COVERAGE.subLimit.toLocaleString('en-IN')}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Copay</dt>
            <dd className="font-semibold">{DIAGNOSTIC_COVERAGE.copayPercent}%</dd>
          </div>
          <div className="flex justify-between">
            <dt>Network Discount</dt>
            <dd className="font-semibold">
              {DIAGNOSTIC_COVERAGE.networkDiscountPercent}%
              {isNetwork ? ' (applies)' : ''}
            </dd>
          </div>
        </dl>
      </InfoCard>
      <InfoCard variant="documents" title="Required Documents" icon="📄">
        <ul className="space-y-1.5 text-violet-800">
          <li>✓ Prescription</li>
          <li>✓ Lab Report</li>
          <li>✓ Hospital Bill</li>
        </ul>
      </InfoCard>
    </>
  );

  return (
    <ClaimPageLayout
      icon="🔬"
      title="Diagnostic Claim"
      subtitle="Enter diagnostic test details and upload required documents."
      applicantSummary={applicantSummary}
      sidebar={sidebar}
      onBack={onBack}
      onContinue={handleContinue}
    >
      <InfoCard variant="default" title="Diagnostic Details" icon="📝">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="hospitalName">
              Hospital / Diagnostic Center Name <span className="text-red-500">*</span>
            </label>
            <input
              id="hospitalName"
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              placeholder="Enter hospital or diagnostic center name"
              className={`${inputClass} ${showErrors && errors.hospitalName ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            />
            <FieldError message={showErrors ? errors.hospitalName : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="diagnosticAmount">
              Diagnostic Amount (INR) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                ₹
              </span>
              <input
                id="diagnosticAmount"
                type="number"
                min="0"
                step="0.01"
                value={diagnosticAmount}
                onChange={(e) => setDiagnosticAmount(e.target.value)}
                placeholder="Enter diagnostic amount"
                className={`${inputClass} pl-7 ${showErrors && errors.diagnosticAmount ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              />
            </div>
            <FieldError message={showErrors ? errors.diagnosticAmount : null} />
          </div>
          <div>
            <label className={labelClass} htmlFor="diagnosticTestType">
              Diagnostic Test Type <span className="text-red-500">*</span>
            </label>
            <select
              id="diagnosticTestType"
              value={diagnosticTestType}
              onChange={(e) => setDiagnosticTestType(e.target.value)}
              className={`${inputClass} ${showErrors && errors.diagnosticTestType ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            >
              <option value="">Select diagnostic test type</option>
              {DIAGNOSTIC_TEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <FieldError message={showErrors ? errors.diagnosticTestType : null} />
          </div>
          {showPreAuthWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
              <label className={labelClass} htmlFor="preAuthorizationId">
                Pre-Authorization ID <span className="text-red-500">*</span>
              </label>
              <input
                id="preAuthorizationId"
                type="text"
                value={preAuthorizationId}
                onChange={(e) => setPreAuthorizationId(e.target.value)}
                placeholder="Enter Pre-Authorization Reference Number"
                className={`${inputClass} ${showErrors && errors.preAuthorizationId ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              />
              <FieldError message={showErrors ? errors.preAuthorizationId : null} />
            </div>
          )}
        </div>
      </InfoCard>

      <InfoCard variant="default" title="Upload Documents" icon="📎">
        <p className="mb-4 text-slate-500">All documents are mandatory for diagnostic claims.</p>
        <DocumentUploadTable
          specs={DIAGNOSTIC_DOCUMENT_SPECS}
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
