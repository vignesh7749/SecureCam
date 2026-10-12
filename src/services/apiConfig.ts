/**
 * SecureCam API & WebSocket Configuration
 * 
 * Provides centralized resolution for backend HTTP and WebSocket endpoints,
 * supporting production cloud deployments (Vercel, Render, Railway) as well as
 * local development.
 */

const rawEnvBackendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string | undefined)?.trim();
export const isProduction = Boolean((import.meta as any).env?.PROD);

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

  // Production deployment with missing VITE_BACKEND_URL
  if (typeof console !== 'undefined') {
    console.error(
      '[SecureCam] MISSING VITE_BACKEND_URL: The application is running in production without a configured backend URL. ' +
      'Please set VITE_BACKEND_URL in your hosting provider\'s environment variables (e.g. Vercel Project Settings) ' +
      'to your deployed backend HTTPS URL (e.g. https://securecam-api.railway.app) and redeploy.'
    );
  }
  return '';
}

export const BACKEND_URL = resolveBackendUrl();
export const WS_BASE_URL = BACKEND_URL ? getWebSocketUrl(BACKEND_URL) : '';

/**
 * Asserts that the backend URL is configured before executing network operations.
 */
export function assertBackendConfigured(): void {
  if (!BACKEND_URL && isProduction) {
    throw new Error(
      'SecureCam Backend URL is not configured. Please set the VITE_BACKEND_URL environment variable in your hosting provider (e.g. Vercel) to point to your live backend.'
    );
  }
}
