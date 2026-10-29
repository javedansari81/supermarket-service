/**
 * Cart per store, kept on this device (quantity per product id) so it survives a page reload
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

type Carts = Record<string, Record<number, number>>;

interface CartContextValue {
  /** Number of different products in the store's cart */
  count: (store: string) => number;
  setQuantity: (store: string, productId: number, quantity: number) => void;
}

const CART_KEY = 'shop_carts';

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

  const count = (store: string) => Object.keys(carts[store] ?? {}).length;

  const setQuantity = (store: string, productId: number, quantity: number) => {
    setCarts((prev) => {
      const cart = { ...prev[store] };
      if (quantity > 0) cart[productId] = quantity;
      else delete cart[productId];
      const next = { ...prev, [store]: cart };
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  };

  return <CartContext.Provider value={{ count, setQuantity }}>{children}</CartContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export const useCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
};
