const LOCAL_API_URL = 'http://localhost:3001';
const DEPLOYED_API_URL = 'https://claims-system-31s9.onrender.com';

// Dev defaults to local backend. Override with VITE_API_URL in .env files.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? LOCAL_API_URL : DEPLOYED_API_URL);

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
