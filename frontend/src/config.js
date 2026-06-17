const DEPLOYED_API_URL = 'https://claims-system-31s9.onrender.com';

// Dev uses Vite proxy (/api → localhost). Production uses Render.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : DEPLOYED_API_URL);

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
