/**
 * Cart per store, kept on this device (quantity per product id) so it survives a page reload
 * and stays the same in every tab
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CartLines = Record<number, number>;
type Carts = Record<string, CartLines>;

interface CartContextValue {
  /** Number of different products in the store's cart */
  count: (store: string) => number;
  quantity: (store: string, productId: number) => number;
  lines: (store: string) => CartLines;
  /** False when the cart is full and the product is not in it yet */
  canAdd: (store: string, productId: number) => boolean;
  setQuantity: (store: string, productId: number, quantity: number) => void;
  clear: (store: string) => void;
}

const CART_KEY = 'shop_carts';
const EMPTY: CartLines = {};

/** Products per cart; the shop API prices up to 50 products in one call */
export const MAX_CART_PRODUCTS = 50;

const loadCarts = (): Carts => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  } catch {
    return {};
  }
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [carts, setCarts] = useState<Carts>(loadCarts);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) setCarts(loadCarts());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const lines = (store: string) => carts[store] ?? EMPTY;
  const count = (store: string) => Object.keys(lines(store)).length;
  const quantity = (store: string, productId: number) => lines(store)[productId] ?? 0;
  const canAdd = (store: string, productId: number) =>
    productId in lines(store) || count(store) < MAX_CART_PRODUCTS;

  const update = (store: string, change: (cart: CartLines) => CartLines) => {
    setCarts((prev) => {
      const next = { ...prev, [store]: change({ ...prev[store] }) };
      if (Object.keys(next[store]).length === 0) delete next[store];
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  };

  const setQuantity = (store: string, productId: number, quantity: number) => {
    update(store, (cart) => {
      if (quantity <= 0) delete cart[productId];
      else if (productId in cart || Object.keys(cart).length < MAX_CART_PRODUCTS) cart[productId] = quantity;
      return cart;
    });
  };

  const clear = (store: string) => update(store, () => ({}));

  return (
    <CartContext.Provider value={{ count, quantity, lines, canAdd, setQuantity, clear }}>
      {children}
    </CartContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export const useCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
};
