/**
 * Shop API client. Logged-in calls renew the access token shortly before it expires, and once
 * more on a 401. Refresh tokens are single use (the server ends every session when a used one
 * comes back), so tabs take turns refreshing and reuse a token another tab already renewed.
 */
import {
  accessExpiresAt, clearSession, getAccessToken, getRefreshToken, saveSession,
} from './session';
import type { CustomerToken } from './types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const REFRESH_BEFORE_MS = 60_000;

/** Product picture address: absolute URLs as they are, API paths joined to the API base */
export const imageSrc = (url: string | null | undefined) =>
  !url ? undefined : /^https?:\/\//.test(url) ? url : `${API_BASE_URL}${url}`;

export class ApiError extends Error {
  status: number;
  retryAfter: number | null;

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

const errorFrom = async (res: Response): Promise<ApiError> => {
  let message = 'Something went wrong. Please try again.';
  try {
    const data = await res.json();
    if (typeof data.detail === 'string') message = data.detail;
    else if (Array.isArray(data.detail)) message = 'Please check the details you entered.';
  } catch {
    // Not JSON (e.g. proxy error page)
  }
  const retryAfter = Number(res.headers.get('Retry-After')) || null;
  return new ApiError(res.status, message, retryAfter);
};

const send = (path: string, { method = 'GET', body }: RequestOptions, token?: string | null) =>
  fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const withRefreshLock = <T>(task: () => Promise<T>): Promise<T> =>
  navigator.locks ? navigator.locks.request('shop-refresh', task) : task();

/** Renews the session; false when the customer has to log in again */
const refreshSession = (staleRefreshToken: string | null): Promise<boolean> =>
  withRefreshLock(async () => {
    const current = getRefreshToken();
    if (!current) return false;
    if (current !== staleRefreshToken) return true; // another tab already renewed it
    const res = await send('/shop/auth/refresh', { method: 'POST', body: { refresh_token: current } });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) clearSession();
      return false;
    }
    saveSession((await res.json()) as CustomerToken);
    return true;
  });

const freshAccessToken = async (): Promise<string | null> => {
  if (!getRefreshToken()) return null;
  if (accessExpiresAt() - Date.now() < REFRESH_BEFORE_MS) await refreshSession(getRefreshToken());
  return getAccessToken();
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    if (options.auth) {
      const token = await freshAccessToken();
      const usedRefresh = getRefreshToken();
      res = await send(path, options, token);
      if (res.status === 401 && (await refreshSession(usedRefresh))) {
        res = await send(path, options, getAccessToken());
      }
      if (res.status === 401) clearSession();
    } else {
      res = await send(path, options);
    }
  } catch {
    throw new ApiError(0, 'Cannot reach the shop. Check your internet connection.');
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}
