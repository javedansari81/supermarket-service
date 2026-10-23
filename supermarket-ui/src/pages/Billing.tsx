/**
 * Billing / POS Page
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Popper,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Delete, Add, Remove, Print, Search, PauseCircleOutline, ReceiptLong } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { API_ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';
import { printReceipt } from '../services/receipt';
import { stateNameFromCode } from '../config/gst';
import { Customer, LoyaltySettings } from '../types';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MOBILE_REGEX = /^[6-9][0-9]{9}$/;

interface CartItem {
  product_id: number;
  batch_id?: number;
  product_name: string;
  barcode: string;
  quantity: number;
  unit_price: number;
  mrp?: number;
  unit_type: string;
  is_loose: boolean;
  tax_percent: number;
  // Near-expiry % (preview; the server decides at checkout) and whether the cashier removed it
  clearance_percent: number;
  skip_clearance: boolean;
  // Running festival offer (preview); the cashier cannot remove it
  offer_name?: string;
  offer_type?: OfferType;
  offer_value?: number;
  // Rupees off from the bill's coupon (preview from the server); 0 where the line's own discount is higher
  coupon_amount?: number;
  tax_amount: number;
  line_total: number;
  stock_quantity: number;
}

interface CouponPreview {
  code: string;
  description?: string | null;
  coupon_discount: number;
  saving: number;
  notes: string[];
}

interface HeldBill {
  id: number;
  label?: string;
  customer_name?: string;
  customer_phone?: string;
  coupon_code?: string | null;
  items: any[];
  item_count: number;
  total_amount: number;
  cashier_name?: string;
  created_at: string;
}

interface SearchProduct {
  id: number;
  product_no?: string;
  product_name: string;
  barcode?: string;
  selling_price: number;
  mrp?: number;
  tax_percent: number;
  stock_quantity: number;
  unit_type: string;
  is_loose: boolean;
  batch_id?: number;
  batches?: BillingBatch[];
  // Weight read from a weighing-scale label (21 + PLU + weight), in the product's unit
  scanned_quantity?: number;
  scanned_label?: string;
  // Today's markdown of a loose item
  clearance_percent?: number;
  offer_name?: string;
  offer_type?: OfferType;
  offer_value?: number;
}

type OfferType = 'percent' | 'amount';

interface BillingBatch {
  id: number;
  batch_no?: string;
  mrp?: number;
  selling_price: number;
  expiry_date?: string;
  quantity_left: number;
  clearance_percent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

type PayMode = 'cash' | 'card' | 'upi' | 'points';
const PAY_MODES: { mode: PayMode; label: string }[] = [
  { mode: 'cash', label: 'Cash' }, { mode: 'card', label: 'Card' }, { mode: 'upi', label: 'UPI' },
];
const POINTS_MODE: { mode: PayMode; label: string } = { mode: 'points', label: 'Points' };
const EMPTY_BY_MODE: Record<PayMode, string> = { cash: '', card: '', upi: '', points: '' };
const toAmount = (s: string) => round2(Number(s) || 0);

const QUICK_WEIGHTS: Record<string, number[]> = {
  kg: [0.25, 0.5, 1, 2, 5],
  L: [0.25, 0.5, 1, 2, 5],
  g: [100, 250, 500],
  ml: [100, 250, 500],
};

const formatQty = (qty: number, unit: string, isLoose: boolean) =>
  isLoose ? `${round3(qty)} ${unit}` : `${qty}`;

const BARCODE_SCAN = /^[0-9]{8,}$/;

const normalize = (p: any): SearchProduct => ({
  id: p.id,
  product_no: p.product_no,
  product_name: p.product_name,
  barcode: p.barcode,
  selling_price: Number(p.selling_price ?? p.mrp ?? 0),
  mrp: p.mrp != null ? Number(p.mrp) : undefined,
  tax_percent: Number(p.tax_percent ?? 0),
  stock_quantity: Number(p.stock_quantity ?? 0),
  unit_type: p.unit_type || 'pcs',
  is_loose: !!p.is_loose,
  batch_id: p.batch_id ?? undefined,
  scanned_quantity: p.scanned_quantity != null ? Number(p.scanned_quantity) : undefined,
  clearance_percent: p.clearance_percent != null ? Number(p.clearance_percent) : undefined,
  offer_name: p.offer_name ?? undefined,
  offer_type: p.offer_type ?? undefined,
  offer_value: p.offer_value != null ? Number(p.offer_value) : undefined,
  batches: Array.isArray(p.batches) && !p.is_loose ? p.batches.map((b: any) => ({
    id: b.id,
    batch_no: b.batch_no,
    mrp: b.mrp != null ? Number(b.mrp) : undefined,
    selling_price: Number(b.selling_price ?? b.mrp ?? p.selling_price ?? 0),
    expiry_date: b.expiry_date,
    quantity_left: Number(b.quantity_left ?? 0),
    clearance_percent: Number(b.clearance_percent ?? 0),
  })) : undefined,
});

const distinctMrpCount = (batches: BillingBatch[]) => new Set(batches.map(b => b.mrp ?? null)).size;

// Near-expiry % of the batch being sold; without a chosen batch, stock is taken first expiry first
const clearanceOf = (product: SearchProduct): number => {
  if (product.is_loose) return product.clearance_percent ?? 0;
  const batches = product.batches || [];
  const batch = product.batch_id ? batches.find(b => b.id === product.batch_id) : batches[0];
  return batch?.clearance_percent ?? 0;
};

type DiscountSource = 'clearance' | 'offer' | 'coupon';

// Rupees off a line: the near-expiry %, offer or coupon saving the most (the server decides at checkout)
const lineDiscount = (item: CartItem): { amount: number; source?: DiscountSource } => {
  if (item.coupon_amount && item.coupon_amount > 0) return { amount: item.coupon_amount, source: 'coupon' };
  const gross = round2(item.unit_price * item.quantity);
  let best: { amount: number; source?: DiscountSource } = { amount: 0 };
  if (!item.skip_clearance && item.clearance_percent > 0) {
    best = { amount: round2(gross * item.clearance_percent / 100), source: 'clearance' };
  }
  if (item.offer_value) {
    const amount = round2(Math.min(gross, item.offer_type === 'percent'
      ? gross * item.offer_value / 100 : item.offer_value * item.quantity));
    if (amount > best.amount) best = { amount, source: 'offer' };
  }
  return best;
};

const offerText = (item: { offer_name?: string; offer_type?: OfferType; offer_value?: number; unit_type: string; is_loose: boolean }) =>
  `${item.offer_name} −${item.offer_type === 'percent' ? `${item.offer_value}%` : `₹${item.offer_value}${item.is_loose ? `/${item.unit_type}` : ''}`}`;

const highlightMatch = (text: string, term: string) => {
  const words = term.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return text;
  return text.split(new RegExp(`(${words.join('|')})`, 'ig'))
    .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
};

const Billing: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<PayMode>('cash');
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<PayMode, string>>(EMPTY_BY_MODE);
  const [paymentRefs, setPaymentRefs] = useState<Record<PayMode, string>>(EMPTY_BY_MODE);
  const [cashTendered, setCashTendered] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [knownCustomer, setKnownCustomer] = useState<Customer | null>(null);
  const [customerLookup, setCustomerLookup] = useState<'idle' | 'loading' | 'found' | 'new'>('idle');
  const autoFilled = useRef({ name: '', gstin: '' });
  const [deliverToCustomerState, setDeliverToCustomerState] = useState(false);
  const [storeStateCode, setStoreStateCode] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [matches, setMatches] = useState<SearchProduct[]>([]);
  const [matchedTerm, setMatchedTerm] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchSeq = useRef(0);
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const [weighProduct, setWeighProduct] = useState<SearchProduct | null>(null);
  const [weighMode, setWeighMode] = useState<'qty' | 'amount'>('qty');
  const [weighValue, setWeighValue] = useState('');
  const [batchPick, setBatchPick] = useState<SearchProduct | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scannedLabels = useRef<Set<string>>(new Set());
  const [heldBillId, setHeldBillId] = useState<number | null>(null);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);
  const couponSeq = useRef(0);
  const [loyalty, setLoyalty] = useState<LoyaltySettings | null>(null);

  const loadHeldBills = () =>
    api.get(API_ENDPOINTS.HELD_BILLS)
      .then((res) => setHeldBills(res.data.items))
      .catch(() => undefined);

  useEffect(() => {
    if (cartItems.length === 0) setHeldBillId(null);
  }, [cartItems.length]);

  useEffect(() => {
    searchRef.current?.focus();
    loadHeldBills();
    api.get(API_ENDPOINTS.SETTINGS_BILLING)
      .then((res) => setTaxInclusive(res.data.tax_inclusive_pricing !== false))
      .catch(() => undefined);
    api.get(API_ENDPOINTS.SETTINGS_STORE)
      .then((res) => setStoreStateCode(res.data.store_state_code || ''))
      .catch(() => undefined);
    api.get<LoyaltySettings>(API_ENDPOINTS.SETTINGS_LOYALTY)
      .then((res) => setLoyalty(res.data))
      .catch(() => undefined);
  }, []);

  const gstinValid = !customerGstin || GSTIN_REGEX.test(customerGstin);
  const customerStateCode = GSTIN_REGEX.test(customerGstin) ? customerGstin.slice(0, 2) : '';
  const otherState = !!customerStateCode && !!storeStateCode && customerStateCode !== storeStateCode;
  const mobileValid = !customerPhone || MOBILE_REGEX.test(customerPhone);

  const handleMobileChange = (value: string) => {
    let digits = value.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    setCustomerPhone(digits.slice(0, 10));
  };

  useEffect(() => {
    setKnownCustomer(null);
    const filled = autoFilled.current;
    autoFilled.current = { name: '', gstin: '' };
    if (filled.name) setCustomerName((name) => (name === filled.name ? '' : name));
    if (filled.gstin) setCustomerGstin((gstin) => (gstin === filled.gstin ? '' : gstin));
    if (!MOBILE_REGEX.test(customerPhone)) {
      setCustomerLookup('idle');
      return;
    }
    let cancelled = false;
    setCustomerLookup('loading');
    api.get<Customer>(API_ENDPOINTS.CUSTOMER_LOOKUP, { params: { mobile: customerPhone } })
      .then((res) => {
        if (cancelled) return;
        setKnownCustomer(res.data);
        setCustomerLookup('found');
        const savedName = res.data.customer_name || '';
        const savedGstin = res.data.customer_gstin || '';
        setCustomerName((name) => {
          if (name.trim()) return name;
          autoFilled.current.name = savedName;
          return savedName;
        });
        setCustomerGstin((gstin) => {
          if (gstin) return gstin;
          autoFilled.current.gstin = savedGstin;
          return savedGstin;
        });
      })
      .catch(() => { if (!cancelled) setCustomerLookup('new'); });
    return () => { cancelled = true; };
  }, [customerPhone]);

  useEffect(() => {
    const term = searchInput.trim();
    const seq = ++searchSeq.current;
    if (term.length < 2 || BARCODE_SCAN.test(term)) {
      setMatches([]);
      setMatchedTerm('');
      setHighlight(-1);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.get(API_ENDPOINTS.PRODUCTS, {
          params: { search: term, status: 'active', page_size: 15 },
        });
        if (seq !== searchSeq.current) return;
        setMatches(response.data.items.map(normalize));
        setMatchedTerm(term);
        setHighlight(0);
        setDropdownOpen(true);
      } catch {
        if (seq === searchSeq.current) setMatches([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (highlight >= 0) document.getElementById(`search-option-${highlight}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const searchProduct = async () => {
    const term = searchInput.trim();
    if (!term) return;
    setError('');
    searchSeq.current++;
    setSearching(false);
    setMatches([]);

    try {
      const response = await api.get(API_ENDPOINTS.PRODUCT_SEARCH, { params: { barcode: term } });
      selectProduct({ ...normalize(response.data), scanned_label: term });
      setSearchInput('');
      return;
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError(err.response?.data?.detail || 'Search failed');
        return;
      }
    }

    try {
      const response = await api.get(API_ENDPOINTS.PRODUCTS, {
        params: { search: term, status: 'active', page_size: 10 },
      });
      const found: SearchProduct[] = response.data.items.map(normalize);
      if (found.length === 0) {
        setError(`No product found for "${term}"`);
      } else if (found.length === 1) {
        selectProduct(found[0]);
        setSearchInput('');
      } else {
        setMatches(found);
        setMatchedTerm(term);
        setHighlight(0);
        setDropdownOpen(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Product not found');
    }
  };

  const selectProduct = async (product: SearchProduct) => {
    setMatches([]);
    setMatchedTerm('');
    setHighlight(-1);
    setSearchInput('');
    const needsLookup = product.is_loose ? product.clearance_percent === undefined : !product.batches;
    if (needsLookup && product.product_no && !product.scanned_quantity) {
      try {
        const response = await api.get(API_ENDPOINTS.PRODUCT_SEARCH, { params: { product_no: product.product_no } });
        product = normalize(response.data);
      } catch (err: any) {
        toast.error(err.response?.data?.detail || 'Could not load product stock');
        return;
      }
    }
    if (product.selling_price <= 0) {
      toast.error(`${product.product_name} has no selling price set`);
      return;
    }
    if (product.is_loose && product.scanned_quantity) {
      const label = product.scanned_label;
      if (label && scannedLabels.current.has(label)
        && !window.confirm(`This ${product.product_name} label was already scanned in this bill. Add it again?`)) {
        searchRef.current?.focus();
        return;
      }
      if (addToCart(product, product.scanned_quantity) && label) scannedLabels.current.add(label);
      return;
    }
    if (product.is_loose) {
      setWeighProduct(product);
      setWeighMode('qty');
      setWeighValue('');
      return;
    }
    const batches = product.batches || [];
    if (product.batch_id) {
      const scanned = batches.find(b => b.id === product.batch_id);
      if (!scanned) {
        toast.error(`${product.product_name}: this label's batch is out of stock`);
        return;
      }
      addBatchToCart(product, scanned);
      return;
    }
    if (distinctMrpCount(batches) > 1) {
      setBatchPick(product);
      return;
    }
    addToCart(product, 1);
  };

  const addBatchToCart = (product: SearchProduct, batch: BillingBatch) => {
    setBatchPick(null);
    addToCart({
      ...product,
      batch_id: batch.id,
      selling_price: batch.selling_price,
      mrp: batch.mrp,
      stock_quantity: batch.quantity_left,
    }, 1);
  };

  const calculateLine = (item: CartItem): CartItem => {
    const gross = round2(item.unit_price * item.quantity);
    const net = gross - lineDiscount(item).amount;
    const tax = taxInclusive
      ? round2(net * item.tax_percent / (100 + item.tax_percent))
      : round2(net * item.tax_percent / 100);
    return { ...item, tax_amount: tax, line_total: taxInclusive ? net : net + tax };
  };

  const couponCartKey = cartItems.map(i => `${i.product_id}:${i.batch_id ?? ''}:${i.quantity}:${i.skip_clearance ? 1 : 0}`).join('|');
  const couponPhone = MOBILE_REGEX.test(customerPhone) ? customerPhone : '';

  // The coupon's share of each line is re-checked by the server whenever the cart or mobile changes
  useEffect(() => {
    const seq = ++couponSeq.current;
    const clearAmounts = () => setCartItems(items => items.some(i => i.coupon_amount)
      ? items.map(i => calculateLine({ ...i, coupon_amount: 0 })) : items);
    if (!couponCode || cartItems.length === 0) {
      setCoupon(null);
      setCouponError('');
      setCouponChecking(false);
      clearAmounts();
      return;
    }
    setCouponChecking(true);
    const items = cartItems.map(i => ({
      product_id: i.product_id, batch_id: i.batch_id, quantity: i.quantity, skip_clearance: i.skip_clearance || undefined,
    }));
    const timer = setTimeout(async () => {
      try {
        const res = await api.post(API_ENDPOINTS.COUPON_CHECK, {
          code: couponCode, items, customer_phone: couponPhone || undefined,
        });
        if (seq !== couponSeq.current) return;
        const amounts: Record<number, number> = {};
        res.data.items.forEach((i: any) => { amounts[i.index] = Number(i.coupon_amount); });
        setCartItems(current => current.map((i, idx) => calculateLine({ ...i, coupon_amount: amounts[idx] ?? 0 })));
        setCoupon({
          code: res.data.code, description: res.data.description,
          coupon_discount: Number(res.data.coupon_discount), saving: Number(res.data.saving), notes: res.data.notes || [],
        });
        setCouponError('');
      } catch (err: any) {
        if (seq !== couponSeq.current) return;
        const detail = err.response?.data?.detail;
        setCoupon(null);
        setCouponError(Array.isArray(detail)
          ? detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ')
          : detail || 'Could not check the coupon');
        clearAmounts();
      } finally {
        if (seq === couponSeq.current) setCouponChecking(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponCode, couponCartKey, couponPhone]);

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (code) setCouponCode(code);
  };

  const removeCoupon = () => {
    setCouponCode('');
    setCouponInput('');
  };

  const addToCart = (product: SearchProduct, qty: number, replace = false): boolean => {
    const existingIndex = cartItems.findIndex(item => item.product_id === product.id && item.batch_id === product.batch_id);
    const currentQty = existingIndex >= 0 ? cartItems[existingIndex].quantity : 0;
    const newQty = round3(replace ? qty : currentQty + qty);

    if (newQty > product.stock_quantity) {
      toast.error(`Insufficient stock. Available: ${formatQty(product.stock_quantity, product.unit_type, product.is_loose)}`);
      return false;
    }

    if (existingIndex >= 0) {
      const updated = [...cartItems];
      updated[existingIndex] = calculateLine({ ...updated[existingIndex], quantity: newQty });
      setCartItems(updated);
    } else {
      const newItem = calculateLine({
        product_id: product.id,
        batch_id: product.batch_id,
        product_name: product.product_name,
        barcode: product.barcode || '',
        quantity: newQty,
        unit_price: product.selling_price,
        mrp: product.mrp,
        unit_type: product.unit_type,
        is_loose: product.is_loose,
        tax_percent: product.tax_percent,
        clearance_percent: clearanceOf(product),
        skip_clearance: false,
        offer_name: product.offer_name,
        offer_type: product.offer_type,
        offer_value: product.offer_value,
        tax_amount: 0,
        line_total: 0,
        stock_quantity: product.stock_quantity,
      });
      setCartItems([...cartItems, newItem]);
    }
    searchRef.current?.focus();
    return true;
  };

  const weighQty = (): number => {
    if (!weighProduct) return 0;
    const v = parseFloat(weighValue);
    if (!v || v <= 0) return 0;
    return round3(weighMode === 'amount' ? v / weighProduct.selling_price : v);
  };

  const confirmWeigh = () => {
    if (!weighProduct) return;
    const qty = weighQty();
    if (qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    const inCart = cartItems.some(i => i.product_id === weighProduct.id);
    addToCart(weighProduct, qty, inCart);
    setWeighProduct(null);
  };

  const editLooseItem = (item: CartItem) => {
    setWeighProduct({
      id: item.product_id, product_name: item.product_name, barcode: item.barcode,
      selling_price: item.unit_price, mrp: item.mrp, tax_percent: item.tax_percent, stock_quantity: item.stock_quantity,
      unit_type: item.unit_type, is_loose: true,
    });
    setWeighMode('qty');
    setWeighValue(item.quantity.toString());
  };

  const updateQuantity = (index: number, delta: number) => {
    const newQty = cartItems[index].quantity + delta;

    if (newQty <= 0) {
      removeItem(index);
      return;
    }

    if (newQty > cartItems[index].stock_quantity) {
      toast.error('Insufficient stock');
      return;
    }

    const updated = [...cartItems];
    updated[index] = calculateLine({ ...updated[index], quantity: newQty });
    setCartItems(updated);
  };

  const removeItem = (index: number) => {
    setCartItems(cartItems.filter((_, i) => i !== index));
  };

  const toggleClearance = (index: number) => {
    const updated = [...cartItems];
    updated[index] = calculateLine({ ...updated[index], skip_clearance: !updated[index].skip_clearance });
    setCartItems(updated);
  };

  const getGrandTotal = () => round2(cartItems.reduce((sum, item) => sum + item.line_total, 0));
  const getTotalTax = () => round2(cartItems.reduce((sum, item) => sum + item.tax_amount, 0));
  const getSubtotal = () => round2(getGrandTotal() - getTotalTax());
  const getMrpSavings = () => round2(cartItems.reduce((sum, item) =>
    sum + (item.mrp && item.mrp > item.unit_price ? (item.mrp - item.unit_price) * item.quantity : 0), 0));
  const getDiscountTotal = () => round2(cartItems.reduce((sum, item) =>
    sum + lineDiscount(item).amount, 0));

  // Points can pay part of a split bill for a known customer with enough points
  const pointValue = loyalty ? Number(loyalty.point_value) : 0;
  const pointsBalance = knownCustomer?.points_balance || 0;
  const pointsAvailable = !!loyalty?.enabled && pointValue > 0 && pointsBalance >= loyalty.min_redeem_points;
  const splitModes = pointsAvailable ? [...PAY_MODES, POINTS_MODE] : PAY_MODES;
  const pointsCap = loyalty ? round2(getGrandTotal() * Number(loyalty.max_redeem_percent) / 100) : 0;
  const maxPointsAmount = pointsAvailable
    ? round2(Math.min(Math.floor(pointsCap / pointValue + 1e-9), pointsBalance) * pointValue) : 0;

  // Amount paid by each mode; without split the whole bill is paid by one mode
  const getPaymentRows = () => splitPayment
    ? splitModes.map(({ mode }) => ({ mode, amount: toAmount(splitAmounts[mode]) })).filter((p) => p.amount > 0)
    : [{ mode: paymentMode, amount: getGrandTotal() }];
  const paymentRows = getPaymentRows();
  const cashDue = round2(paymentRows.filter((p) => p.mode === 'cash').reduce((s, p) => s + p.amount, 0));
  const pointsPaid = round2(paymentRows.filter((p) => p.mode === 'points').reduce((s, p) => s + p.amount, 0));
  const pointsUsed = pointValue > 0 ? pointsPaid / pointValue : 0;
  const splitRemaining = round2(getGrandTotal() - paymentRows.reduce((s, p) => s + p.amount, 0));
  const tendered = cashDue > 0 ? toAmount(cashTendered) : 0;
  const changeDue = tendered > 0 ? round2(tendered - cashDue) : null;
  const pointsError = pointsPaid <= 0 || !loyalty ? ''
    : Math.abs(pointsUsed - Math.round(pointsUsed)) > 1e-6 ? `Points amount must be a multiple of ₹${pointValue} (one point)`
    : Math.round(pointsUsed) < loyalty.min_redeem_points ? `At least ${loyalty.min_redeem_points} points must be redeemed`
    : pointsPaid > maxPointsAmount ? `Points can pay at most ₹${maxPointsAmount.toFixed(2)} of this bill`
    : '';
  const paymentError = splitPayment && paymentRows.length === 0 ? 'Enter the amount paid by each mode'
    : pointsError
    || (splitPayment && splitRemaining > 0 ? `₹${splitRemaining.toFixed(2)} still to be paid`
    : splitPayment && splitRemaining < 0 ? `Payments are ₹${(-splitRemaining).toFixed(2)} more than the bill`
    : changeDue !== null && changeDue < 0 ? `Cash received is less than the cash amount ₹${cashDue.toFixed(2)}`
    : '');

  const resetBill = () => {
    setCartItems([]);
    setHeldBillId(null);
    scannedLabels.current.clear();
    setCustomerName('');
    setCustomerPhone('');
    setCustomerGstin('');
    setDeliverToCustomerState(false);
    setSplitPayment(false);
    setSplitAmounts(EMPTY_BY_MODE);
    setPaymentRefs(EMPTY_BY_MODE);
    setCashTendered('');
    removeCoupon();
    searchRef.current?.focus();
  };

  const holdBill = async () => {
    if (cartItems.length === 0) return;
    if (!mobileValid) {
      toast.error('Invalid mobile number (10 digits starting with 6-9)');
      return;
    }
    const label = window.prompt('Note for this held bill (optional, e.g. "lady in blue saree")', '');
    if (label === null) return;
    setHolding(true);
    try {
      const data = {
        items: cartItems.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          product_name: item.product_name,
          barcode: item.barcode || undefined,
          quantity: item.quantity,
          unit_price: item.unit_price,
          mrp: item.mrp,
          unit_type: item.unit_type,
          is_loose: item.is_loose,
          tax_percent: item.tax_percent,
          clearance_percent: item.clearance_percent,
          skip_clearance: item.skip_clearance,
          offer_name: item.offer_name,
          offer_type: item.offer_type,
          offer_value: item.offer_value,
          line_total: item.line_total,
        })),
        label: label.trim() || undefined,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone || undefined,
        coupon_code: couponCode || undefined,
      };
      if (heldBillId) await api.put(`${API_ENDPOINTS.HELD_BILLS}/${heldBillId}`, data);
      else await api.post(API_ENDPOINTS.HELD_BILLS, data);
      toast.success('Bill held. Recall it from Held Bills.');
      resetBill();
      loadHeldBills();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not hold the bill');
    } finally {
      setHolding(false);
    }
  };

  const openHeldBills = () => {
    loadHeldBills();
    setHeldOpen(true);
  };

  const recallHeldBill = async (id: number) => {
    if (cartItems.length > 0 && id !== heldBillId) {
      toast.error('Hold or clear the current bill first');
      return;
    }
    try {
      const res = await api.get(`${API_ENDPOINTS.HELD_BILLS}/${id}`);
      const held: HeldBill = res.data;
      // Stock is re-checked when the sale is completed
      setCartItems(held.items.map((i: any) => calculateLine({
        product_id: i.product_id,
        batch_id: i.batch_id ?? undefined,
        product_name: i.product_name,
        barcode: i.barcode || '',
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        mrp: i.mrp != null ? Number(i.mrp) : undefined,
        unit_type: i.unit_type || 'pcs',
        is_loose: !!i.is_loose,
        tax_percent: Number(i.tax_percent ?? 0),
        clearance_percent: Number(i.clearance_percent ?? 0),
        skip_clearance: !!i.skip_clearance,
        offer_name: i.offer_name ?? undefined,
        offer_type: i.offer_type ?? undefined,
        offer_value: i.offer_value != null ? Number(i.offer_value) : undefined,
        tax_amount: 0,
        line_total: 0,
        stock_quantity: Infinity,
      })));
      scannedLabels.current.clear();
      setCustomerName(held.customer_name || '');
      setCustomerPhone(held.customer_phone || '');
      setCustomerGstin('');
      setDeliverToCustomerState(false);
      setCouponInput(held.coupon_code || '');
      setCouponCode(held.coupon_code || '');
      setHeldBillId(held.id);
      setHeldOpen(false);
      searchRef.current?.focus();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not recall the bill');
      loadHeldBills();
    }
  };

  const discardHeldBill = async (held: HeldBill) => {
    if (!window.confirm(`Discard this held bill of ₹${Number(held.total_amount).toFixed(2)}? This cannot be undone.`)) return;
    try {
      await api.delete(`${API_ENDPOINTS.HELD_BILLS}/${held.id}`);
      if (held.id === heldBillId) setHeldBillId(null);
      toast.success('Held bill discarded');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not discard the bill');
    }
    loadHeldBills();
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setCheckoutOpen(true);
  };

  const completeSale = async () => {
    if (!mobileValid) {
      toast.error('Invalid mobile number (10 digits starting with 6-9)');
      return;
    }
    if (!gstinValid) {
      toast.error('Invalid customer GSTIN');
      return;
    }
    if (customerGstin && !customerName.trim()) {
      toast.error('Customer name is required for a GSTIN invoice');
      return;
    }
    if (couponCode && (couponChecking || !coupon)) {
      toast.error(couponError || 'The coupon is still being checked');
      return;
    }
    if (paymentError) {
      toast.error(paymentError);
      return;
    }
    const withReference = paymentRows.some((p) => p.mode !== 'cash' && paymentRefs[p.mode].trim());
    setLoading(true);
    try {
      const saleData = {
        items: cartItems.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity,
          skip_clearance: item.skip_clearance || undefined,
        })),
        payment_mode: paymentMode,
        payments: splitPayment || withReference
          ? paymentRows.map((p) => ({ ...p, reference: paymentRefs[p.mode].trim() || undefined }))
          : undefined,
        cash_tendered: tendered > 0 ? tendered : undefined,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone || undefined,
        customer_gstin: customerGstin || undefined,
        place_of_supply_code: otherState && deliverToCustomerState ? customerStateCode : undefined,
        held_bill_id: heldBillId || undefined,
        coupon_code: couponCode || undefined,
      };

      const response = await api.post(API_ENDPOINTS.SALES, saleData);
      const { points_earned: earned, points_redeemed: redeemed, points_balance: balance } = response.data;
      const pointsNote = earned || redeemed
        ? ` · Points${earned ? ` +${earned}` : ''}${redeemed ? ` −${redeemed}` : ''}, balance ${balance ?? 0}` : '';
      toast.success(`Sale completed! Invoice: ${response.data.invoice_no || response.data.sale_no}${pointsNote}`);

      const wasHeld = !!heldBillId;
      resetBill();
      setCheckoutOpen(false);
      if (wasHeld) loadHeldBills();

      if (response.data.invoice_id) {
        printReceipt(response.data.invoice_id).catch(() => toast.error('Receipt printing failed. Reprint from Invoices.'));
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(Array.isArray(detail)
        ? detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ')
        : detail || 'Sale failed');
    } finally {
      setLoading(false);
    }
  };

  const showDropdown = dropdownOpen && searchInput.trim().length >= 2 && !BARCODE_SCAN.test(searchInput.trim());
  const resultsCurrent = matchedTerm === searchInput.trim();

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (matches.length === 0) return;
      e.preventDefault();
      setDropdownOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => (h + step + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && resultsCurrent && matches[highlight]) {
        selectProduct(matches[highlight]);
      } else {
        searchProduct();
      }
    } else if (e.key === 'Escape') {
      if (showDropdown) setDropdownOpen(false);
      else setSearchInput('');
    }
  };

  return (
    <Box>
      <PageHeader title="Billing / POS" />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Box>
                <Box ref={searchAnchorRef} sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    autoComplete="off"
                    placeholder="Scan barcode, or type product name / code (e.g. sugar, toor dal, P00012)..."
                    value={searchInput}
                    onChange={(e) => { setSearchInput(e.target.value); setError(''); setDropdownOpen(true); }}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => setDropdownOpen(true)}
                    onBlur={() => setDropdownOpen(false)}
                    inputRef={searchRef}
                    InputProps={{
                      startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} />,
                      endAdornment: searching ? <InputAdornment position="end"><CircularProgress size={18} /></InputAdornment> : undefined,
                    }}
                  />
                  <Button variant="contained" onClick={searchProduct}>Add</Button>
                </Box>
                <Popper
                  open={showDropdown && (resultsCurrent || matches.length > 0)}
                  anchorEl={searchAnchorRef.current}
                  placement="bottom-start"
                  style={{ width: searchAnchorRef.current?.clientWidth, zIndex: 1300 }}
                >
                  <Paper elevation={8} sx={{ mt: 0.5 }}>
                    {matches.length === 0 ? (
                      <Typography sx={{ p: 2 }} color="text.secondary">No products match "{searchInput.trim()}"</Typography>
                    ) : (
                      <>
                        <List dense sx={{ maxHeight: 360, overflow: 'auto', py: 0 }}>
                          {matches.map((p, i) => {
                            const outOfStock = p.stock_quantity <= 0;
                            return (
                              <ListItemButton
                                key={p.id}
                                id={`search-option-${i}`}
                                selected={i === highlight}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setHighlight(i)}
                                onClick={() => selectProduct(p)}
                                sx={{ opacity: outOfStock ? 0.6 : 1 }}
                              >
                                <ListItemText
                                  primary={highlightMatch(p.product_name, matchedTerm)}
                                  secondary={
                                    <>
                                      {p.product_no && <>{highlightMatch(p.product_no, matchedTerm)} · </>}
                                      ₹{p.selling_price.toFixed(2)}{p.is_loose ? `/${p.unit_type}` : ''} ·{' '}
                                      <Box component="span" sx={{ color: outOfStock ? 'error.main' : 'inherit' }}>
                                        {outOfStock ? 'Out of stock' : `Stock: ${formatQty(p.stock_quantity, p.unit_type, p.is_loose)}`}
                                      </Box>
                                    </>
                                  }
                                />
                                {p.is_loose && <Chip label="Loose" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} />}
                              </ListItemButton>
                            );
                          })}
                        </List>
                        <Divider />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 0.5 }}>
                          ↑ ↓ to choose · Enter to add · Esc to close
                        </Typography>
                      </>
                    )}
                  </Paper>
                </Popper>
              </Box>
            </CardContent>
          </Card>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'primary.contrastText' }}>Product</TableCell>
                  <TableCell sx={{ color: 'primary.contrastText' }} align="center">Price</TableCell>
                  <TableCell sx={{ color: 'primary.contrastText' }} align="center">Qty</TableCell>
                  <TableCell sx={{ color: 'primary.contrastText' }} align="right">Total</TableCell>
                  <TableCell sx={{ color: 'primary.contrastText' }} align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cartItems.map((item, index) => (
                  <TableRow key={`${item.product_id}-${item.batch_id ?? ''}`}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{item.product_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.barcode}{item.batch_id && item.mrp ? ` · MRP ₹${item.mrp.toFixed(2)} batch` : ''}
                      </Typography>
                      {(item.clearance_percent > 0 || !!item.offer_value || !!item.coupon_amount) && (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {item.coupon_amount ? (
                            <Chip size="small" color="success" label={`Coupon ${couponCode} −₹${item.coupon_amount.toFixed(2)}`} />
                          ) : null}
                          {item.offer_value ? (
                            <Chip size="small" color="secondary" label={offerText(item)}
                              variant={lineDiscount(item).source === 'offer' ? 'filled' : 'outlined'} />
                          ) : null}
                          {item.clearance_percent > 0 && (item.skip_clearance ? (
                            <Chip size="small" variant="outlined" label={`Near-expiry −${item.clearance_percent}% removed · Restore`}
                              onClick={() => toggleClearance(index)} />
                          ) : (
                            <Chip size="small" color="warning" label={`Near expiry −${item.clearance_percent}%`}
                              onDelete={() => toggleClearance(index)} />
                          ))}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      ₹{item.unit_price.toFixed(2)}{item.is_loose ? `/${item.unit_type}` : ''}
                      {item.mrp && item.mrp > item.unit_price && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                          MRP ₹{item.mrp.toFixed(2)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {item.is_loose ? (
                        <Button size="small" variant="outlined" onClick={() => editLooseItem(item)}>
                          {formatQty(item.quantity, item.unit_type, true)}
                        </Button>
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconButton size="small" onClick={() => updateQuantity(index, -1)}><Remove /></IconButton>
                          <Typography sx={{ mx: 1 }}>{item.quantity}</Typography>
                          <IconButton size="small" onClick={() => updateQuantity(index, 1)}><Add /></IconButton>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="right">₹{item.line_total.toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <IconButton size="small" color="error" onClick={() => removeItem(index)}><Delete /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {cartItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Scan or search products to add to cart</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Order Summary</Typography>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography>Items:</Typography>
                <Typography>{cartItems.length}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography>Taxable Value:</Typography>
                <Typography>₹{getSubtotal().toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography>GST{taxInclusive ? ' (included)' : ''}:</Typography>
                <Typography>₹{getTotalTax().toFixed(2)}</Typography>
              </Box>
              {getDiscountTotal() > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography color="success.main">Discount:</Typography>
                  <Typography color="success.main">−₹{getDiscountTotal().toFixed(2)}</Typography>
                </Box>
              )}
              {coupon && coupon.coupon_discount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="success.main">incl. coupon {coupon.code}:</Typography>
                  <Typography variant="body2" color="success.main">−₹{coupon.coupon_discount.toFixed(2)}</Typography>
                </Box>
              )}
              {getMrpSavings() > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography color="success.main">You save (vs MRP):</Typography>
                  <Typography color="success.main">₹{getMrpSavings().toFixed(2)}</Typography>
                </Box>
              )}
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6">Grand Total:</Typography>
                <Typography variant="h6" color="primary">₹{getGrandTotal().toFixed(2)}</Typography>
              </Box>
              {heldBillId && (
                <Alert severity="info" sx={{ mb: 2 }}>Recalled held bill</Alert>
              )}
              <Button fullWidth variant="contained" size="large" onClick={handleCheckout} disabled={cartItems.length === 0}>
                Checkout
              </Button>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button fullWidth variant="outlined" startIcon={<PauseCircleOutline />}
                  onClick={holdBill} disabled={cartItems.length === 0 || holding}>
                  Hold Bill
                </Button>
                <Button fullWidth variant="outlined" startIcon={<ReceiptLong />} onClick={openHeldBills}>
                  Held ({heldBills.length})
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Complete Sale</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <FormControlLabel
              control={<Checkbox checked={splitPayment} onChange={(e) => setSplitPayment(e.target.checked)} />}
              label="Split payment (more than one mode)"
            />
            {splitPayment ? (
              <Box sx={{ mt: 1, mb: 2 }}>
                {splitModes.map(({ mode, label }) => (
                  <Box key={mode} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <TextField
                      size="small" type="number" label={`${label} amount`} value={splitAmounts[mode]} sx={{ flex: 1 }}
                      onChange={(e) => setSplitAmounts((a) => ({ ...a, [mode]: e.target.value }))}
                      inputProps={{ min: 0, step: mode === 'points' ? pointValue : '0.01' }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText={mode === 'points'
                        ? `${pointsBalance} points · up to ₹${maxPointsAmount.toFixed(2)} on this bill` : undefined}
                    />
                    {mode === 'points' ? (
                      <Button
                        size="small" sx={{ flex: 1, alignSelf: 'flex-start', height: 40 }} disabled={maxPointsAmount <= 0}
                        onClick={() => setSplitAmounts((a) => ({ ...a, points: maxPointsAmount.toFixed(2) }))}
                      >
                        Use max
                      </Button>
                    ) : mode === 'cash' ? <Box sx={{ flex: 1 }} /> : (
                      <TextField
                        size="small" label="Reference (optional)" value={paymentRefs[mode]} sx={{ flex: 1 }}
                        onChange={(e) => setPaymentRefs((r) => ({ ...r, [mode]: e.target.value }))}
                        inputProps={{ maxLength: 50 }}
                      />
                    )}
                  </Box>
                ))}
                <Typography variant="body2" color={splitRemaining === 0 ? 'success.main' : 'error'}>
                  {splitRemaining === 0 ? 'Payments match the bill total' : paymentError}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2 }}>
                <FormControl sx={{ flex: 1 }}>
                  <InputLabel>Payment Mode</InputLabel>
                  <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PayMode)} label="Payment Mode">
                    {PAY_MODES.map(({ mode, label }) => <MenuItem key={mode} value={mode}>{label}</MenuItem>)}
                  </Select>
                </FormControl>
                {paymentMode !== 'cash' && (
                  <TextField
                    label={paymentMode === 'upi' ? 'UPI transaction ID (optional)' : 'Card last 4 digits (optional)'}
                    value={paymentRefs[paymentMode]} sx={{ flex: 1 }}
                    onChange={(e) => setPaymentRefs((r) => ({ ...r, [paymentMode]: e.target.value }))}
                    inputProps={{ maxLength: 50 }}
                  />
                )}
              </Box>
            )}
            {cashDue > 0 && (
              <TextField
                fullWidth type="number" label="Cash Received (Optional)" value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                error={changeDue !== null && changeDue < 0}
                helperText={changeDue === null ? `Cash to collect: ₹${cashDue.toFixed(2)}`
                  : changeDue < 0 ? paymentError : `Change to return: ₹${changeDue.toFixed(2)}`}
                inputProps={{ min: 0, step: '0.01' }}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                sx={{ mb: 2 }}
              />
            )}
            <TextField
              fullWidth autoFocus label="Customer Mobile (Optional)" value={customerPhone}
              onChange={(e) => handleMobileChange(e.target.value)}
              error={!mobileValid}
              helperText={!mobileValid ? 'Enter a 10-digit mobile number starting with 6-9'
                : customerLookup === 'loading' ? 'Looking up customer...'
                : customerLookup === 'new' ? 'New customer - will be saved with this bill'
                : ''}
              inputProps={{ inputMode: 'numeric' }}
              InputProps={{
                startAdornment: <InputAdornment position="start">+91</InputAdornment>,
                endAdornment: customerLookup === 'loading' ? <CircularProgress size={18} /> : undefined,
              }}
              sx={{ mb: knownCustomer ? 1 : 2 }}
            />
            {knownCustomer && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Returning customer{knownCustomer.customer_name ? `: ${knownCustomer.customer_name}` : ''} ·{' '}
                {knownCustomer.visits} visit{knownCustomer.visits === 1 ? '' : 's'} · ₹{Number(knownCustomer.total_spent).toFixed(2)} spent
                {knownCustomer.last_visit ? ` · last on ${new Date(knownCustomer.last_visit + 'Z').toLocaleDateString('en-IN')}` : ''}
                {loyalty?.enabled && (
                  <>
                    {' '}· {pointsBalance} points (₹{Number(knownCustomer.points_value || 0).toFixed(2)})
                    {pointsAvailable && !splitPayment ? ' - tick Split payment to pay by points' : ''}
                  </>
                )}
              </Alert>
            )}
            <TextField fullWidth label="Customer Name (Optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} sx={{ mb: 2 }} />
            <TextField
              fullWidth label="Customer GSTIN (for business buyers, optional)" value={customerGstin}
              onChange={(e) => setCustomerGstin(e.target.value.toUpperCase().trim())}
              error={!gstinValid}
              helperText={!gstinValid ? 'Invalid GSTIN (15 characters, e.g. 27ABCDE1234F1Z5)'
                : customerStateCode ? `State: ${stateNameFromCode(customerStateCode)}` : ''}
              inputProps={{ maxLength: 15 }}
            />
            {otherState && (
              <FormControlLabel
                control={<Checkbox checked={deliverToCustomerState} onChange={(e) => setDeliverToCustomerState(e.target.checked)} />}
                label={`Goods delivered to ${stateNameFromCode(customerStateCode)} (charge IGST)`}
              />
            )}
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <TextField
                fullWidth size="small" label="Coupon Code (Optional)" value={couponInput} disabled={!!couponCode}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/\s/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }}
                inputProps={{ maxLength: 30 }}
              />
              {couponCode ? (
                <Button onClick={removeCoupon}>Remove</Button>
              ) : (
                <Button variant="outlined" onClick={applyCoupon} disabled={!couponInput.trim()}>Apply</Button>
              )}
            </Box>
            {couponCode && (couponChecking ? (
              <Typography variant="caption" color="text.secondary">Checking coupon...</Typography>
            ) : couponError ? (
              <Alert severity="error" sx={{ mt: 1 }}>{couponError}</Alert>
            ) : coupon && (
              <Alert severity={coupon.saving > 0 ? 'success' : 'info'} sx={{ mt: 1 }}>
                {coupon.code}{coupon.description ? ` (${coupon.description})` : ''}:{' '}
                {coupon.saving > 0 ? `saves ₹${coupon.saving.toFixed(2)} more` : 'no extra saving on this bill'}
                {coupon.notes.map((n) => <Typography key={n} variant="caption" display="block">{n}</Typography>)}
              </Alert>
            ))}
            <Box sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="h5" align="center" color="primary">Total: ₹{getGrandTotal().toFixed(2)}</Typography>
              {changeDue !== null && changeDue >= 0 && (
                <Typography variant="h6" align="center">Change: ₹{changeDue.toFixed(2)}</Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckoutOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={completeSale}
            disabled={loading || !!paymentError || (!!couponCode && (couponChecking || !coupon))} startIcon={<Print />}>
            {loading ? 'Processing...' : 'Complete & Print'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={heldOpen} onClose={() => setHeldOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Held Bills</DialogTitle>
        <DialogContent sx={{ px: 1 }}>
          {heldBills.length === 0 ? (
            <Typography sx={{ p: 2 }} color="text.secondary">No held bills</Typography>
          ) : (
            <List dense>
              {heldBills.map((h, i) => (
                <ListItemButton key={h.id} autoFocus={i === 0} selected={h.id === heldBillId} onClick={() => recallHeldBill(h.id)}>
                  <ListItemText
                    primary={`${h.label || h.customer_name || `Bill #${h.id}`} · ₹${Number(h.total_amount).toFixed(2)}`}
                    secondary={[
                      `${h.item_count} item${h.item_count === 1 ? '' : 's'}`,
                      new Date(h.created_at + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                      h.customer_phone || '',
                      h.cashier_name ? `by ${h.cashier_name}` : '',
                    ].filter(Boolean).join(' · ')}
                  />
                  <IconButton edge="end" color="error" aria-label="Discard held bill"
                    onClick={(e) => { e.stopPropagation(); discardHeldBill(h); }}>
                    <Delete />
                  </IconButton>
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHeldOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!batchPick} onClose={() => { setBatchPick(null); searchRef.current?.focus(); }} maxWidth="xs" fullWidth>
        <DialogTitle>
          {batchPick?.product_name}
          <Typography variant="body2" color="text.secondary">
            In stock at different MRPs. Select the MRP printed on the pack.
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 1 }}>
          <List dense>
            {batchPick?.batches?.map((b, i) => (
              <ListItemButton key={b.id} autoFocus={i === 0} onClick={() => batchPick && addBatchToCart(batchPick, b)}>
                <ListItemText
                  primary={`MRP ₹${b.mrp != null ? b.mrp.toFixed(2) : 'N/A'} · Price ₹${b.selling_price.toFixed(2)}`}
                  secondary={[
                    `Stock: ${b.quantity_left}`,
                    b.expiry_date ? `Expiry: ${new Date(b.expiry_date).toLocaleDateString('en-IN')}` : '',
                    b.batch_no ? `Batch: ${b.batch_no}` : '',
                    b.clearance_percent > 0 ? `Near expiry −${b.clearance_percent}%` : '',
                  ].filter(Boolean).join(' · ')}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setBatchPick(null); searchRef.current?.focus(); }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!weighProduct} onClose={() => setWeighProduct(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {weighProduct?.product_name}
          <Typography variant="body2" color="text.secondary">
            ₹{weighProduct?.selling_price.toFixed(2)} per {weighProduct?.unit_type}
            {weighProduct && Number.isFinite(weighProduct.stock_quantity) && ` · Stock: ${formatQty(weighProduct.stock_quantity, weighProduct.unit_type, true)}`}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={weighMode} sx={{ mb: 2 }}
            onChange={(_, v) => { if (v) { setWeighMode(v); setWeighValue(''); } }}>
            <ToggleButton value="qty">By {weighProduct?.unit_type}</ToggleButton>
            <ToggleButton value="amount">By amount (₹)</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            fullWidth autoFocus type="number"
            label={weighMode === 'qty' ? `Quantity (${weighProduct?.unit_type})` : 'Amount (₹)'}
            value={weighValue}
            onChange={(e) => setWeighValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmWeigh(); }}
            inputProps={{ step: 'any', min: 0 }}
            InputProps={{
              endAdornment: <InputAdornment position="end">{weighMode === 'qty' ? weighProduct?.unit_type : '₹'}</InputAdornment>,
            }}
          />
          {weighMode === 'qty' && weighProduct && QUICK_WEIGHTS[weighProduct.unit_type] && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              {QUICK_WEIGHTS[weighProduct.unit_type].map((w) => (
                <Chip key={w} label={`${w} ${weighProduct.unit_type}`} onClick={() => setWeighValue(w.toString())} />
              ))}
            </Box>
          )}
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', justifyContent: 'space-between' }}>
            <Typography>{weighProduct && formatQty(weighQty(), weighProduct.unit_type, true)}</Typography>
            <Typography fontWeight="bold">₹{weighProduct ? round2(weighQty() * weighProduct.selling_price).toFixed(2) : '0.00'}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWeighProduct(null)}>Cancel</Button>
          <Button variant="contained" onClick={confirmWeigh} disabled={weighQty() <= 0}>Add to Bill</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Billing;

