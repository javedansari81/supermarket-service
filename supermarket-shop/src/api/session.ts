/**
 * Customer session tokens kept in localStorage, shared by all open tabs.
 */
import type { CustomerToken } from './types';

const ACCESS_KEY = 'shop_access_token';
const ACCESS_EXPIRES_KEY = 'shop_access_expires';
const REFRESH_KEY = 'shop_refresh_token';
const CHANGE_EVENT = 'shop-session-change';

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
export const accessExpiresAt = () => Number(localStorage.getItem(ACCESS_EXPIRES_KEY)) || 0;

export const saveSession = (token: CustomerToken) => {
  localStorage.setItem(ACCESS_KEY, token.access_token);
  localStorage.setItem(ACCESS_EXPIRES_KEY, String(Date.now() + token.expires_in * 1000));
  localStorage.setItem(REFRESH_KEY, token.refresh_token);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const clearSession = () => {
  [ACCESS_KEY, ACCESS_EXPIRES_KEY, REFRESH_KEY].forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

/** Calls listener when this tab or another tab logs in, refreshes or logs out */
export const onSessionChange = (listener: () => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === REFRESH_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
};
