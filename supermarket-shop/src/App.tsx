/**
 * Customer shop routes
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireLogin from './auth/RequireLogin';
import ShopLayout from './components/ShopLayout';
import Account from './pages/Account';
import Login from './pages/Login';
import StorePicker from './pages/StorePicker';

export default function App() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route index element={<StorePicker />} />
        <Route path="login" element={<Login />} />
        <Route path="account" element={<RequireLogin><Account /></RequireLogin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
