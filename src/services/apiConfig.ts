/**
 * SecureCam API & WebSocket Configuration
 * 
 * Provides centralized resolution for backend HTTP and WebSocket endpoints,
 * supporting production cloud deployments (Vercel, Render, Railway) as well as
 * local development.
 */

const rawEnvBackendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string | undefined)?.trim();
const rawEnvStorageUrl = ((import.meta as any).env?.VITE_SAMPLE_VIDEOS_STORAGE_URL as string | undefined)?.trim();

export const isProduction = Boolean((import.meta as any).env?.PROD);

/**
 * Optional external cloud object storage or CDN base URL for hosting large sample video files (>50MB).
 * Example: 'https://pub-abcdef123456.r2.dev/samples' or 'https://my-bucket.s3.amazonaws.com/samples'
 */
export const SAMPLE_VIDEOS_STORAGE_URL = rawEnvStorageUrl ? rawEnvStorageUrl.replace(/\/+$/, '') : '';

/**
 * Converts an HTTP/HTTPS URL into the corresponding WS/WSS WebSocket URL.
 */
export function getWebSocketUrl(httpUrl: string): string {
  if (!httpUrl) return '';
  const trimmed = httpUrl.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('https://')) {
    return trimmed.replace(/^https:\/\//, 'wss://');
  }
  if (trimmed.startsWith('http://')) {
    return trimmed.replace(/^http:\/\//, 'ws://');
  }
  if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) {
    return trimmed;
  }
  return trimmed.replace(/^http/, 'ws');
}

/**
 * Optional user-configured backend URL stored in localStorage for hybrid/local testing
 * on the deployed Vercel static demo.
 */
export function getCustomBackendUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('securecam_custom_backend_url');
      if (stored) return stored.trim().replace(/\/+$/, '');
    } catch {}
  }
  return '';
}

export function setCustomBackendUrl(url: string): void {
  if (typeof window !== 'undefined') {
    try {
      const trimmed = (url || '').trim().replace(/\/+$/, '');
      if (!trimmed) {
        localStorage.removeItem('securecam_custom_backend_url');
      } else {
        localStorage.setItem('securecam_custom_backend_url', trimmed);
      }
    } catch {}
  }
  BACKEND_URL = resolveBackendUrl();
  WS_BASE_URL = BACKEND_URL ? getWebSocketUrl(BACKEND_URL) : '';
}

/**
 * Resolves the backend base URL according to current environment:
 * 1. User-configured custom backend URL (from localStorage).
 * 2. Explicit VITE_BACKEND_URL (set in environment).
 * 3. Local development fallback (localhost:8000 or LAN hostname).
 * 4. Production deployment fallback: returns empty string (Demo Mode).
 */
export function resolveBackendUrl(): string {
  const custom = getCustomBackendUrl();
  if (custom) {
    return custom;
  }

  if (rawEnvBackendUrl) {
    return rawEnvBackendUrl.replace(/\/+$/, '');
  }

  const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  // Preserve local development and LAN behavior
  if (!isProduction || isLocalhost) {
    if (typeof window !== 'undefined' && window.location.hostname && !isLocalhost) {
      // Cross-device LAN testing (e.g. mobile phone on Wi-Fi)
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return 'http://localhost:8000';
  }

  // Production deployment with missing VITE_BACKEND_URL: Fall back to Demo Mode
  return '';
}

export function getActiveBackendUrl(): string {
  return resolveBackendUrl();
}

export function getActiveWebSocketUrl(): string {
  const b = resolveBackendUrl();
  return b ? getWebSocketUrl(b) : '';
}

export let BACKEND_URL = resolveBackendUrl();
export let WS_BASE_URL = BACKEND_URL ? getWebSocketUrl(BACKEND_URL) : '';
export const isBackendConfigured = Boolean(BACKEND_URL);

/**
 * Asserts that the backend URL is configured before executing backend-dependent operations.
 */
export function assertBackendConfigured(): void {
  if (!BACKEND_URL) {
    throw new Error(
      'This feature requires the running SecureCam FastAPI backend. ' +
      'In Demo Mode, precomputed benchmark sample videos and offline controls are available. ' +
      'To enable live inference, run the backend server locally or configure VITE_BACKEND_URL.'
    );
  }
}
