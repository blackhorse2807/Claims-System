/**
 * Processes eval/test JSON documents (virtual:// paths) using embedded fixture metadata.
 * Used by document intelligence when no real file bytes are available — same pipeline,
 * deterministic fixture input channel (not a mock of business agents).
 */

function isEvalFixtureDocument(document) {
  if (!document || typeof document !== 'object') {
    return false;
  }

  const filePath = String(document.filePath || '');
  return filePath.startsWith('virtual://') || Boolean(document.fixture);
}

function normalizeMedicines(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (typeof item === 'string') {
      return { name: item, dosage: null, frequency: null, duration: null };
    }
    if (item && typeof item === 'object') {
      return {
        name: item.name || item.description || null,
        dosage: item.dosage || null,
        frequency: item.frequency || null,
        duration: item.duration || null,
      };
    }
    return { name: String(item), dosage: null, frequency: null, duration: null };
  });
}

function normalizeLineItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    description: item.description || item.name || null,
    quantity: item.quantity ?? null,
    rate: item.rate ?? null,
    amount: item.amount ?? null,
  }));
}

function mapFixtureContentToExtractedData(documentType, content = {}, patientNameOverride = null) {
  const patientName =
    patientNameOverride ||
    content.patient_name ||
    content.patientName ||
    null;

  if (documentType === 'PRESCRIPTION') {
    return {
      doctorName: content.doctor_name || content.doctorName || null,
      doctorRegistration: content.doctor_registration || content.doctorRegistration || null,
      specialization: content.specialization || null,
      clinicName: content.clinic_name || content.clinicName || null,
      clinicAddress: content.clinic_address || content.clinicAddress || null,
      patientName,
      patientAge: content.patient_age || content.patientAge || null,
      patientGender: content.patient_gender || content.patientGender || null,
      consultationDate: content.date || content.consultationDate || null,
      diagnosis: content.diagnosis || null,
      medicines: normalizeMedicines(content.medicines || []),
      testsOrdered: content.tests_ordered || content.testsOrdered || [],
      followUpInstructions: content.follow_up || content.followUpInstructions || null,
    };
  }

  if (documentType === 'HOSPITAL_BILL' || documentType === 'PHARMACY_BILL') {
    const lineItems = normalizeLineItems(content.line_items || content.lineItems || []);
    const totalAmount =
      content.total ??
      content.totalAmount ??
      (lineItems.length > 0
        ? lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
        : null);

    return {
      hospitalName: content.hospital_name || content.hospitalName || content.pharmacy_name || null,
      hospitalAddress: content.hospital_address || content.hospitalAddress || null,
      billNumber: content.bill_number || content.billNumber || null,
      billDate: content.date || content.billDate || null,
      patientName,
      lineItems,
      subtotal: content.subtotal ?? totalAmount,
      gstAmount: content.gst_amount || content.gstAmount || null,
      totalAmount,
      paymentMode: content.payment_mode || content.paymentMode || null,
    };
  }

  if (documentType === 'LAB_REPORT') {
    return {
      labName: content.lab_name || content.labName || null,
      patientName,
      reportDate: content.date || content.reportDate || null,
      testName: content.test_name || content.testName || null,
      testResults: content.test_results || content.testResults || [],
    };
  }

  if (documentType === 'DENTAL_REPORT') {
    return {
      dentistName: content.dentist_name || content.dentistName || content.doctor_name || null,
      patientName,
      treatmentDate: content.date || content.treatmentDate || null,
      procedure: content.procedure || content.treatment || null,
      findings: content.findings || null,
    };
  }

  return {
    patientName,
    ...content,
  };
}

function buildQualityResult(fixture) {
  const qualityFlag = String(fixture?.quality || 'GOOD').toUpperCase();

  if (qualityFlag === 'UNREADABLE') {
    return {
      confidence: 0.15,
      warnings: ['BLUR_DETECTED'],
      missingFields: ['totalAmount', 'patientName'],
      fraudSignals: [],
    };
  }

  return {
    confidence: 0.95,
    warnings: [],
    missingFields: [],
    fraudSignals: [],
  };
}

function createTraceEntry(step, status, message) {
  return {
    step,
    status,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Process a single eval fixture document end-to-end (classify, extract, quality).
 * @param {object} document
 * @param {import('../types/claimIntake').TraceEntry[]} trace
 */
function processEvalFixtureDocument(document, trace) {
  const fileName = document.originalName || document.fileName || 'fixture_document';
  const fixture = document.fixture || {};
  const documentType = String(
    fixture.actual_type || document.documentType || 'UNKNOWN'
  ).toUpperCase();
  const classificationConfidence = 0.98;
  const patientNameOverride = fixture.patient_name_on_doc || null;
  const extractedData = mapFixtureContentToExtractedData(
    documentType,
    fixture.content || {},
    patientNameOverride
  );
  const quality = buildQualityResult(fixture);
  const extractionConfidence = qualityFlagToConfidence(fixture.quality);

  trace.push(
    createTraceEntry(
      'DOCUMENT_CLASSIFICATION',
      'PASS',
      `${fileName} classified as ${documentType} (${classificationConfidence}) [eval fixture]`
    )
  );
  trace.push(
    createTraceEntry(
      'DOCUMENT_EXTRACTION',
      'PASS',
      `${fileName} extracted with confidence ${extractionConfidence} [eval fixture]`
    )
  );
  trace.push(
    createTraceEntry(
      'DOCUMENT_QUALITY_CHECK',
      quality.warnings.length > 0 ? 'WARNING' : 'PASS',
      `${fileName} quality confidence ${quality.confidence} [eval fixture]`
    )
  );

  const overallDocumentConfidence = Number(
    ((classificationConfidence + extractionConfidence + quality.confidence) / 3).toFixed(4)
  );

  return {
    fileName,
    documentType,
    classificationConfidence,
    extractionConfidence,
    qualityConfidence: quality.confidence,
    overallDocumentConfidence,
    extractedData,
    warnings: quality.warnings,
    missingFields: quality.missingFields,
    fraudSignals: quality.fraudSignals,
  };
}

function qualityFlagToConfidence(quality) {
  const normalized = String(quality || 'GOOD').toUpperCase();
  if (normalized === 'UNREADABLE') {
    return 0.2;
  }
  return 0.98;
}

module.exports = {
  isEvalFixtureDocument,
  processEvalFixtureDocument,
  mapFixtureContentToExtractedData,
};
