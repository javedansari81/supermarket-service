/**
 * Main Application Component
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Toaster } from 'react-hot-toast';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

import theme from './theme/theme';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Suppliers from './pages/Suppliers';
import Purchases from './pages/Purchases';
import Inventory from './pages/Inventory';
import Barcode from './pages/Barcode';
import Invoices from './pages/Invoices';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Toaster position="top-right" />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route path="/" element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="billing" element={<Billing />} />
                <Route path="products" element={<ProtectedRoute requireAdmin><Products /></ProtectedRoute>} />
                <Route path="categories" element={<ProtectedRoute requireAdmin><Categories /></ProtectedRoute>} />
                <Route path="suppliers" element={<ProtectedRoute requireAdmin><Suppliers /></ProtectedRoute>} />
                <Route path="purchases" element={<ProtectedRoute requireAdmin><Purchases /></ProtectedRoute>} />
                <Route path="inventory" element={<ProtectedRoute requireAdmin><Inventory /></ProtectedRoute>} />
                <Route path="barcode" element={<ProtectedRoute requireAdmin><Barcode /></ProtectedRoute>} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="customers" element={<Customers />} />
                <Route path="reports" element={<ProtectedRoute requireAdmin><Reports /></ProtectedRoute>} />
                <Route path="users" element={<ProtectedRoute requireAdmin><Users /></ProtectedRoute>} />
                <Route path="audit" element={<ProtectedRoute requireAdmin><AuditLogs /></ProtectedRoute>} />
                <Route path="settings" element={<ProtectedRoute requireAdmin><Settings /></ProtectedRoute>} />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
