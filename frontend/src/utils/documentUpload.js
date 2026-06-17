import { CONSULTATION_DOCUMENT_SPECS, MAX_DOCUMENT_BYTES } from '../data/consultationConfig';

const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

export function isAcceptedDocumentFile(file) {
  if (!file) return false;
  const lowerName = file.name.toLowerCase();
  return (
    file.type === 'application/pdf' ||
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
  );
}

export function validateDocumentFile(file, maxBytes = MAX_DOCUMENT_BYTES) {
  if (!file) {
    return 'This document is required.';
  }
  if (!isAcceptedDocumentFile(file)) {
    return 'Only PDF, JPG, or PNG files are allowed.';
  }
  if (file.size > maxBytes) {
    return `File must be under ${maxBytes / (1024 * 1024)} MB.`;
  }
  return null;
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { CONSULTATION_DOCUMENT_SPECS };
