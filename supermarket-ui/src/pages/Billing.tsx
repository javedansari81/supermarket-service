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
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Delete, Add, Remove, Print, Search } from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

interface CartItem {
  product_id: number;
  product_name: string;
  barcode: string;
  quantity: number;
  unit_price: number;
  tax_percent: number;
  discount_percent: number;
  line_total: number;
  stock_quantity: number;
}

const Billing: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const searchProduct = async () => {
    if (!searchInput.trim()) return;
    setError('');

    try {
      const response = await api.get(API_ENDPOINTS.PRODUCT_SEARCH, {
        params: { barcode: searchInput },
      });
      
      const product = response.data;
      addToCart(product);
      setSearchInput('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Product not found');
    }
  };

  const addToCart = (product: any) => {
    const existingIndex = cartItems.findIndex(item => item.product_id === product.id);
    
    if (existingIndex >= 0) {
      const updated = [...cartItems];
      const newQty = updated[existingIndex].quantity + 1;
      
      if (newQty > product.stock_quantity) {
        toast.error('Insufficient stock');
        return;
      }
      
      updated[existingIndex].quantity = newQty;
      updated[existingIndex].line_total = calculateLineTotal(updated[existingIndex]);
      setCartItems(updated);
    } else {
      const newItem: CartItem = {
        product_id: product.id,
        product_name: product.product_name,
        barcode: product.barcode,
        quantity: 1,
        unit_price: product.selling_price,
        tax_percent: product.tax_percent || 0,
        discount_percent: 0,
        line_total: product.selling_price,
        stock_quantity: product.stock_quantity,
      };
      setCartItems([...cartItems, newItem]);
    }
    searchRef.current?.focus();
  };

  const calculateLineTotal = (item: CartItem): number => {
    const subtotal = item.unit_price * item.quantity;
    const discount = subtotal * (item.discount_percent / 100);
    const taxable = subtotal - discount;
    const tax = taxable * (item.tax_percent / 100);
    return taxable + tax;
  };

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cartItems];
    const newQty = updated[index].quantity + delta;
    
    if (newQty <= 0) {
      removeItem(index);
      return;
    }
    
    if (newQty > updated[index].stock_quantity) {
      toast.error('Insufficient stock');
      return;
    }
    
    updated[index].quantity = newQty;
    updated[index].line_total = calculateLineTotal(updated[index]);
    setCartItems(updated);
  };

  const removeItem = (index: number) => {
    setCartItems(cartItems.filter((_, i) => i !== index));
  };

  const getSubtotal = () => cartItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const getTotalTax = () => cartItems.reduce((sum, item) => {
    const subtotal = item.unit_price * item.quantity;
    return sum + (subtotal * item.tax_percent / 100);
  }, 0);
  const getGrandTotal = () => cartItems.reduce((sum, item) => sum + item.line_total, 0);

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setCheckoutOpen(true);
  };

  const completeSale = async () => {
    setLoading(true);
    try {
      const saleData = {
        items: cartItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          discount_percent: item.discount_percent,
        })),
        payment_mode: paymentMode,
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
      };

      const response = await api.post(API_ENDPOINTS.SALES, saleData);
      toast.success(`Sale completed! Invoice: ${response.data.sale_no}`);
      
      // Reset cart
      setCartItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setCheckoutOpen(false);
      searchRef.current?.focus();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Sale failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchProduct();
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Billing / POS</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  placeholder="Scan barcode or search product..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  inputRef={searchRef}
                  InputProps={{ startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} /> }}
                />
                <Button variant="contained" onClick={searchProduct}>Add</Button>
              </Box>
            </CardContent>
          </Card>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white' }}>Product</TableCell>
                  <TableCell sx={{ color: 'white' }} align="center">Price</TableCell>
                  <TableCell sx={{ color: 'white' }} align="center">Qty</TableCell>
                  <TableCell sx={{ color: 'white' }} align="right">Total</TableCell>
                  <TableCell sx={{ color: 'white' }} align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cartItems.map((item, index) => (
                  <TableRow key={item.product_id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{item.product_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.barcode}</Typography>
                    </TableCell>
                    <TableCell align="center">₹{item.unit_price.toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconButton size="small" onClick={() => updateQuantity(index, -1)}><Remove /></IconButton>
                        <Typography sx={{ mx: 1 }}>{item.quantity}</Typography>
                        <IconButton size="small" onClick={() => updateQuantity(index, 1)}><Add /></IconButton>
                      </Box>
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
                <Typography>Subtotal:</Typography>
                <Typography>₹{getSubtotal().toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography>Tax:</Typography>
                <Typography>₹{getTotalTax().toFixed(2)}</Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6">Grand Total:</Typography>
                <Typography variant="h6" color="primary">₹{getGrandTotal().toFixed(2)}</Typography>
              </Box>
              <Button fullWidth variant="contained" size="large" onClick={handleCheckout} disabled={cartItems.length === 0}>
                Checkout
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Complete Sale</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Payment Mode</InputLabel>
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} label="Payment Mode">
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="card">Card</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
              </Select>
            </FormControl>
            <TextField fullWidth label="Customer Name (Optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} sx={{ mb: 2 }} />
            <TextField fullWidth label="Customer Phone (Optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="h5" align="center" color="primary">Total: ₹{getGrandTotal().toFixed(2)}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckoutOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={completeSale} disabled={loading} startIcon={<Print />}>
            {loading ? 'Processing...' : 'Complete & Print'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Billing;

