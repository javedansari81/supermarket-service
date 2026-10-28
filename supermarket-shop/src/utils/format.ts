/**
 * Display helpers for prices and pack sizes
 */
import type { ShopProduct } from '../api/types';

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export const formatPrice = (value: string | number) => rupees.format(Number(value));

/** "1 kg", "500 g"; loose items are sold by weight; nothing for a single piece */
export const packSize = (product: ShopProduct): string => {
  if (product.is_loose) return 'Loose, sold by weight';
  if (!product.net_quantity || !product.net_unit) return '';
  const quantity = Number(product.net_quantity);
  if (product.net_unit === 'pcs' && quantity === 1) return '';
  return `${quantity} ${product.net_unit}`;
};

export const hasDiscount = (product: ShopProduct) =>
  Number(product.offer_price) < Number(product.price);

/** MRP struck through when the customer pays less than it */
export const showMrp = (product: ShopProduct) =>
  product.mrp !== null && Number(product.mrp) > Number(product.offer_price);

/** Rupees below MRP (or below the normal price when there is no MRP) */
export const savings = (product: ShopProduct): number => {
  const reference = Number(product.mrp ?? product.price);
  return Math.max(0, Math.round((reference - Number(product.offer_price)) * 100) / 100);
};

export const discountLabel = (product: ShopProduct): string => {
  if (!hasDiscount(product)) return '';
  if (product.discount_source === 'offer') {
    return product.offer_name || `${Number(product.discount_percent)}% off`;
  }
  return `${Number(product.discount_percent)}% off`;
};
