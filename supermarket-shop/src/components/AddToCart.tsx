/**
 * "Add" button that turns into a − quantity + stepper once the product is in the cart
 */
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Add, AddShoppingCart, Remove } from '@mui/icons-material';
import type { ShopProduct } from '../api/types';
import { MAX_CART_PRODUCTS, useCart } from '../cart/CartContext';
import { cartMax, cartStep, formatQuantity } from '../utils/format';

interface Props {
  store: string;
  product: ShopProduct;
  large?: boolean;
}

export default function AddToCart({ store, product, large = false }: Props) {
  const cart = useCart();
  const quantity = cart.quantity(store, product.id);
  const step = cartStep(product);
  const max = cartMax(product);
  const height = large ? 48 : 34;

  if (quantity === 0) {
    if (!product.in_stock) {
      return (
        <Button variant="outlined" fullWidth disabled size={large ? 'large' : 'small'} sx={{ height }}>
          Out of stock
        </Button>
      );
    }
    const full = !cart.canAdd(store, product.id);
    return (
      <Tooltip title={full ? `Your cart can hold up to ${MAX_CART_PRODUCTS} products` : ''}>
        <span style={{ display: 'block' }}>
          <Button variant={large ? 'contained' : 'outlined'} fullWidth disabled={full}
            size={large ? 'large' : 'small'} startIcon={<AddShoppingCart />} sx={{ height, fontWeight: 700 }}
            onClick={() => cart.setQuantity(store, product.id, step)}>
            Add
          </Button>
        </span>
      </Tooltip>
    );
  }

  return (
    <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2,
      bgcolor: 'primary.main', color: '#fff' }}>
      <IconButton size="small" aria-label={`Remove one ${product.product_name}`} sx={{ color: 'inherit', height }}
        onClick={() => cart.setQuantity(store, product.id, quantity - step)}>
        <Remove fontSize={large ? 'medium' : 'small'} />
      </IconButton>
      <Typography aria-live="polite" sx={{ fontWeight: 700, fontSize: large ? 18 : 14 }}>
        {formatQuantity(product, quantity)}
      </Typography>
      <IconButton size="small" aria-label={`Add one more ${product.product_name}`}
        disabled={quantity >= max || !product.in_stock}
        sx={{ color: 'inherit', height, '&.Mui-disabled': { color: 'rgba(255,255,255,0.5)' } }}
        onClick={() => cart.setQuantity(store, product.id, quantity + step)}>
        <Add fontSize={large ? 'medium' : 'small'} />
      </IconButton>
    </Box>
  );
}
