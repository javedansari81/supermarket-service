/**
 * Customer shop routes. On a store's own site (see utils/storeSite) the store pages have no store prefix
 * and there is no store list; on the all-stores site they are under /<store>.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireLogin from './auth/RequireLogin';
import ShopLayout from './components/ShopLayout';
import Account from './pages/Account';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import Home from './pages/Home';
import Login from './pages/Login';
import OrderPage from './pages/OrderPage';
import OrdersPage from './pages/OrdersPage';
import ProductPage from './pages/ProductPage';
import StorePage from './pages/StorePage';
import StorePicker from './pages/StorePicker';
import { SITE_STORE } from './utils/storeSite';

/** Store pages: at the site root on a store's own site, else under /<store> */
function storeRoutes() {
  const at = (path: string) => (SITE_STORE ? path : `:store/${path}`);
  return [
    SITE_STORE
      ? <Route key="home" index element={<StorePage />} />
      : <Route key="home" path=":store" element={<StorePage />} />,
    <Route key="product" path={at('p/:productId')} element={<ProductPage />} />,
    <Route key="cart" path={at('cart')} element={<CartPage />} />,
    <Route key="checkout" path={at('checkout')} element={<RequireLogin><CheckoutPage /></RequireLogin>} />,
  ];
}

export default function App() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        {!SITE_STORE && <Route index element={<Home />} />}
        {!SITE_STORE && <Route path="stores" element={<StorePicker />} />}
        <Route path="login" element={<Login />} />
        <Route path="account" element={<RequireLogin><Account /></RequireLogin>} />
        <Route path="orders" element={<RequireLogin><OrdersPage /></RequireLogin>} />
        <Route path="orders/:orderId" element={<RequireLogin><OrderPage /></RequireLogin>} />
        {storeRoutes()}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
