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
 * Resolves the backend base URL according to current environment:
 * 1. Explicit VITE_BACKEND_URL (required for production cloud deployments).
 * 2. Local development fallback (localhost:8000 or LAN hostname).
 * 3. In production with missing VITE_BACKEND_URL: returns empty string and logs an
 *    actionable error to prevent silent requests to localhost or port 8000.
 */
export function resolveBackendUrl(): string {
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
  if (typeof console !== 'undefined') {
    console.info(
      '[SecureCam] Running in Demo Mode: VITE_BACKEND_URL is not set. ' +
      'Precomputed benchmark sessions and static sample videos are active. ' +
      'To enable live AI inference and streaming, set VITE_BACKEND_URL to your backend API URL.'
    );
  }
  return '';
}

export const BACKEND_URL = resolveBackendUrl();
export const WS_BASE_URL = BACKEND_URL ? getWebSocketUrl(BACKEND_URL) : '';
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
