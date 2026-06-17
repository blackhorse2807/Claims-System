const { getRequiredDocs } = require('../policyLoader');

async function verifyDocuments(claimCategory, documents) {
  const { required } = getRequiredDocs(claimCategory);
  const uploadedTypes = documents.map((doc) => doc.actual_type);

  const missingTypes = required.filter((type) => !uploadedTypes.includes(type));

  if (missingTypes.length > 0) {
    const missingType = missingTypes[0];
    const uploadedList = uploadedTypes.length > 0 ? uploadedTypes.join(', ') : 'nothing';
    return {
      blocked: true,
      reason: 'WRONG_DOCUMENT_TYPE',
      message: `For a ${claimCategory} claim, you must upload a ${missingType}. You uploaded: ${uploadedList}. Please upload a ${missingType} to proceed.`,
    };
  }

  const unreadableDoc = documents.find((doc) => doc.quality === 'UNREADABLE');
  if (unreadableDoc) {
    return {
      blocked: true,
      reason: 'UNREADABLE_DOCUMENT',
      message: `The file '${unreadableDoc.file_name}' (${unreadableDoc.actual_type}) could not be read. Please re-upload a clear photo of this document.`,
    };
  }

  const namesByDoc = documents
    .filter((doc) => doc.patient_name_on_doc)
    .map((doc) => ({ type: doc.actual_type, name: doc.patient_name_on_doc.trim() }));

  if (namesByDoc.length >= 2) {
    const uniqueNames = [...new Set(namesByDoc.map((entry) => entry.name.toLowerCase()))];
    if (uniqueNames.length > 1) {
      const mismatchParts = namesByDoc.map((entry) => `${entry.type} is for '${entry.name}'`);
      const mismatchDetail =
        mismatchParts.length === 2
          ? `${mismatchParts[0]} but ${mismatchParts[1]}`
          : mismatchParts.join(', ');
      return {
        blocked: true,
        reason: 'PATIENT_MISMATCH',
        message: `The documents appear to belong to different patients. ${mismatchDetail}. Please ensure all documents belong to the same patient.`,
      };
    }
  }

  return { blocked: false };
}

module.exports = { verifyDocuments };
