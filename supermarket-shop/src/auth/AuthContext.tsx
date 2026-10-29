/**
 * Logged-in customer (one login for all stores)
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { clearSession, getRefreshToken, onSessionChange, saveSession } from '../api/session';
import type { Account, CustomerToken, OtpRequestResponse } from '../api/types';
import { disablePush, resumePush } from '../utils/push';

interface AuthContextValue {
  account: Account | null;
  loading: boolean;
  requestCode: (mobile: string) => Promise<OtpRequestResponse>;
  verifyCode: (mobile: string, code: string) => Promise<CustomerToken>;
  updateName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(() => getRefreshToken() !== null);

  useEffect(() => {
    const loadAccount = () => api<Account>('/shop/auth/me', { auth: true })
      .then(setAccount)
      .catch(() => {
        if (!getRefreshToken()) setAccount(null);
      })
      .finally(() => setLoading(false));

    if (getRefreshToken()) loadAccount();
    return onSessionChange(() => {
      if (!getRefreshToken()) setAccount(null);
      else loadAccount();
    });
  }, []);

  const requestCode = (mobile: string) =>
    api<OtpRequestResponse>('/shop/auth/otp/request', { method: 'POST', body: { mobile } });

  const verifyCode = async (mobile: string, code: string) => {
    const token = await api<CustomerToken>('/shop/auth/otp/verify', {
      method: 'POST', body: { mobile, code },
    });
    setAccount(token.account);
    saveSession(token);
    void resumePush();
    return token;
  };

  const updateName = async (name: string) => {
    setAccount(await api<Account>('/shop/auth/me', {
      method: 'PUT', body: { customer_name: name }, auth: true,
    }));
  };

  const logout = async () => {
    const refreshToken = getRefreshToken();
    clearSession();
    setAccount(null);
    void disablePush();
    if (refreshToken) {
      await api('/shop/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } })
        .catch(() => undefined);
    }
  };

  return (
    <AuthContext.Provider value={{ account, loading, requestCode, verifyCode, updateName, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};
