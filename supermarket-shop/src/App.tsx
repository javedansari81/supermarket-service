/**
 * Customer shop routes
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireLogin from './auth/RequireLogin';
import ShopLayout from './components/ShopLayout';
import Account from './pages/Account';
import Home from './pages/Home';
import Login from './pages/Login';
import ProductPage from './pages/ProductPage';
import StorePage from './pages/StorePage';
import StorePicker from './pages/StorePicker';

export default function App() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route index element={<Home />} />
        <Route path="stores" element={<StorePicker />} />
        <Route path="login" element={<Login />} />
        <Route path="account" element={<RequireLogin><Account /></RequireLogin>} />
        <Route path=":store" element={<StorePage />} />
        <Route path=":store/p/:productId" element={<ProductPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
