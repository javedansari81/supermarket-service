/**
 * Authentication Context
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { User, AuthToken } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

const TOKEN_EXPIRES_KEY = 'token_expires_at';
const LAST_ACTIVITY_KEY = 'last_activity';

const clearStoredSession = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  localStorage.removeItem(TOKEN_EXPIRES_KEY);
  localStorage.removeItem(LAST_ACTIVITY_KEY);
};

const storeToken = (authData: AuthToken) => {
  localStorage.setItem('access_token', authData.access_token);
  localStorage.setItem(TOKEN_EXPIRES_KEY, String(Date.now() + authData.expires_in * 1000));
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('access_token');
      const storedUser = localStorage.getItem('user');
      
      const now = Date.now();
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
      const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRES_KEY)) || 0;

      if (storedToken && storedUser && now - lastActivity < IDLE_TIMEOUT_MS && expiresAt > now) {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        clearStoredSession();
        setToken(null);
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Log out after inactivity; keep the token fresh while the user is active
  useEffect(() => {
    if (!token) return;

    let lastWrite = 0;
    const markActivity = () => {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_THROTTLE_MS) return;
      lastWrite = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    };

    let refreshing = false;
    const checkSession = async () => {
      const now = Date.now();
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
      if (now - lastActivity >= IDLE_TIMEOUT_MS) {
        clearStoredSession();
        setToken(null);
        setUser(null);
        return;
      }

      const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRES_KEY)) || 0;
      if (!refreshing && expiresAt - now <= REFRESH_BEFORE_EXPIRY_MS) {
        refreshing = true;
        try {
          const response = await api.post<AuthToken>(API_ENDPOINTS.REFRESH);
          storeToken(response.data);
          setToken(response.data.access_token);
        } catch {
          // 401 is handled by the API interceptor
        } finally {
          refreshing = false;
        }
      }
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    const intervalId = window.setInterval(checkSession, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkSession);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActivity));
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkSession);
    };
  }, [token]);

  const login = async (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await api.post<AuthToken>(API_ENDPOINTS.LOGIN, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    const authData = response.data;
    
    const userData: User = {
      id: authData.user_id,
      username: authData.username,
      email: '',
      full_name: authData.username,
      role: authData.role,
      tenant_id: authData.tenant_id,
      tenant_name: authData.tenant_name,
      status: 'active',
    };
    
    storeToken(authData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    setToken(authData.access_token);
    setUser(userData);
  };

  const logout = () => {
    clearStoredSession();
    setToken(null);
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

