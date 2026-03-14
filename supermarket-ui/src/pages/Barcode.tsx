/**
 * Barcode Management Page
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Checkbox, Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Print, Delete, Add, QrCode } from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { Product, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

interface PrintItem { product_id: number; product_name: string; barcode: string; price: number; quantity: number; }

const Barcode: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [printQty, setPrintQty] = useState('1');
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [labelSize, setLabelSize] = useState('small');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, { params: { page_size: 500 } });
        setProducts(response.data.items);
      } catch (error) { console.error('Failed to fetch products'); }
    };
    fetchProducts();
  }, []);

  const handleAddItem = () => {
    if (!selectedProduct) return;
    const product = products.find(p => p.id === parseInt(selectedProduct));
    if (!product || !product.barcode) { toast.error('Product must have a barcode'); return; }
    
    const existingIndex = printItems.findIndex(i => i.product_id === product.id);
    if (existingIndex >= 0) {
      const updated = [...printItems];
      updated[existingIndex].quantity += parseInt(printQty);
      setPrintItems(updated);
    } else {
      setPrintItems([...printItems, {
        product_id: product.id, product_name: product.product_name,
        barcode: product.barcode, price: product.selling_price || 0, quantity: parseInt(printQty)
      }]);
    }
    setSelectedProduct(''); setPrintQty('1');
  };

  const handleRemoveItem = (index: number) => setPrintItems(printItems.filter((_, i) => i !== index));

  const handlePrint = async () => {
    if (printItems.length === 0) { toast.error('Add items to print'); return; }
    try {
      const response = await api.post(API_ENDPOINTS.BARCODE_PRINT, {
        items: printItems.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
        label_size: labelSize
      });
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(response.data.html_content || '<pre>Barcode labels generated</pre>');
        printWindow.document.close();
        printWindow.print();
      }
      toast.success('Print job sent');
    } catch (error) { toast.error('Failed to print barcodes'); }
  };

  const generateBarcode = async (productId: number) => {
    try {
      await api.post(`${API_ENDPOINTS.BARCODE_GENERATE}/${productId}`);
      toast.success('Barcode generated');
      const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, { params: { page_size: 500 } });
      setProducts(response.data.items);
    } catch (error) { toast.error('Failed to generate barcode'); }
  };

  const getTotalLabels = () => printItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Barcode Management</Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Add Products to Print</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid size={6}>
                  <FormControl fullWidth>
                    <InputLabel>Select Product</InputLabel>
                    <Select value={selectedProduct} label="Select Product" onChange={(e) => setSelectedProduct(e.target.value)}>
                      {products.filter(p => p.barcode).map(p => (
                        <MenuItem key={p.id} value={p.id}>{p.product_name} - {p.barcode}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={3}>
                  <TextField fullWidth label="Quantity" type="number" value={printQty} onChange={(e) => setPrintQty(e.target.value)} />
                </Grid>
                <Grid size={3}>
                  <Button fullWidth variant="outlined" startIcon={<Add />} onClick={handleAddItem}>Add</Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
          {printItems.length > 0 && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Barcode</TableCell><TableCell>Price</TableCell><TableCell>Labels</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {printItems.map((item, index) => (
                    <TableRow key={index}><TableCell>{item.product_name}</TableCell><TableCell><Chip label={item.barcode} size="small" /></TableCell>
                      <TableCell>₹{item.price}</TableCell><TableCell>{item.quantity}</TableCell>
                      <TableCell><IconButton size="small" onClick={() => handleRemoveItem(index)}><Delete fontSize="small" /></IconButton></TableCell></TableRow>
                  ))}
                  <TableRow><TableCell colSpan={3}><strong>Total Labels</strong></TableCell><TableCell colSpan={2}><strong>{getTotalLabels()}</strong></TableCell></TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Print Settings</Typography>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Label Size</InputLabel>
                <Select value={labelSize} label="Label Size" onChange={(e) => setLabelSize(e.target.value)}>
                  <MenuItem value="small">Small (38x25mm)</MenuItem>
                  <MenuItem value="medium">Medium (50x30mm)</MenuItem>
                  <MenuItem value="large">Large (70x40mm)</MenuItem>
                </Select>
              </FormControl>
              <Button fullWidth variant="contained" size="large" startIcon={<Print />} onClick={handlePrint} disabled={printItems.length === 0}>
                Print Labels ({getTotalLabels()})
              </Button>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Products Without Barcode</Typography>
              {products.filter(p => !p.barcode).slice(0, 5).map(p => (
                <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
                  <Typography variant="body2">{p.product_name}</Typography>
                  <Button size="small" startIcon={<QrCode />} onClick={() => generateBarcode(p.id)}>Generate</Button>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Barcode;

