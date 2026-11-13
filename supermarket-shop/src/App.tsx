/**
 * Customer shop routes for this website's store (see utils/storeSite)
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { Alert, Box } from '@mui/material';
import RequireLogin from './auth/RequireLogin';
import ShopLayout from './components/ShopLayout';
import Account from './pages/Account';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import Login from './pages/Login';
import OrderPage from './pages/OrderPage';
import OrdersPage from './pages/OrdersPage';
import ProductPage from './pages/ProductPage';
import StorePage from './pages/StorePage';
import { STORE } from './utils/storeSite';

export default function App() {
  if (!STORE) {
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', mt: 8, px: 2 }}>
        <Alert severity="warning">This address is not set up for a store.</Alert>
      </Box>
    );
  }
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route index element={<StorePage />} />
        <Route path="p/:productId" element={<ProductPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<RequireLogin><CheckoutPage /></RequireLogin>} />
        <Route path="login" element={<Login />} />
        <Route path="account" element={<RequireLogin><Account /></RequireLogin>} />
        <Route path="orders" element={<RequireLogin><OrdersPage /></RequireLogin>} />
        <Route path="orders/:orderId" element={<RequireLogin><OrderPage /></RequireLogin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
