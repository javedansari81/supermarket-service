/**
 * Product picture in the product form: preview, upload / replace and remove. The server saves
 * it as WebP in two sizes; it shows on the shop website and in the product list.
 */
import React, { useRef, useState } from 'react';
import { Avatar, Box, Button, CircularProgress, Typography } from '@mui/material';
import { AddPhotoAlternate, DeleteOutline, ImageNotSupported } from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { API_ENDPOINTS, imageSrc } from '../../config/api';
import { Product } from '../../types';

const IMAGE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_MB = 5;

interface Props {
  product: Product;
  onChange: (product: Product) => void;
}

export const ProductThumb: React.FC<{ product: Product; size?: number }> = ({ product, size = 36 }) => (
  <Avatar variant="rounded" src={imageSrc(product.thumb_url)} alt={product.product_name}
    sx={{ width: size, height: size, bgcolor: 'action.hover', color: 'text.disabled' }}
    imgProps={{ loading: 'lazy', style: { objectFit: 'contain' } }}>
    <ImageNotSupported fontSize="small" />
  </Avatar>
);

const ProductImageField: React.FC<Props> = ({ product, onChange }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const errorText = (error: any, fallback: string) => {
    const detail = error?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!IMAGE_ACCEPT.includes(file.type)) { toast.error('Only JPG, PNG or WEBP pictures are allowed'); return; }
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) { toast.error(`The picture must be ${IMAGE_MAX_MB} MB or smaller`); return; }
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      const res = await api.post<Product>(`${API_ENDPOINTS.PRODUCTS}/${product.id}/image`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data);
      toast.success('Picture saved');
    } catch (error) { toast.error(errorText(error, 'Failed to upload the picture')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.delete<Product>(`${API_ENDPOINTS.PRODUCTS}/${product.id}/image`);
      onChange(res.data);
      toast.success('Picture removed');
    } catch (error) { toast.error(errorText(error, 'Failed to remove the picture')); }
    finally { setBusy(false); }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ position: 'relative' }}>
        <ProductThumb product={product} size={88} />
        {busy && (
          <CircularProgress size={28} sx={{ position: 'absolute', top: '50%', left: '50%', mt: '-14px', ml: '-14px' }} />
        )}
      </Box>
      <Box>
        <Typography variant="subtitle2">Product picture</Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
          Shown on the shop website. JPG, PNG or WEBP up to {IMAGE_MAX_MB} MB; a square photo on a plain background looks best.
        </Typography>
        <input ref={input} type="file" hidden accept={IMAGE_ACCEPT.join(',')} onChange={upload} />
        <Button size="small" variant="outlined" startIcon={<AddPhotoAlternate />} disabled={busy}
          onClick={() => input.current?.click()}>
          {product.image_url ? 'Replace' : 'Add picture'}
        </Button>
        {product.image_url && (
          <Button size="small" color="error" startIcon={<DeleteOutline />} disabled={busy} onClick={remove} sx={{ ml: 1 }}>
            Remove
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default ProductImageField;
