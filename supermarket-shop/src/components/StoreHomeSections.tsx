/**
 * Store home rows above the product list: today's offers and recently viewed products
 * (viewed history is kept on this device)
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { LocalOffer, Visibility } from '@mui/icons-material';
import { api } from '../api/client';
import type { PageResponse, ShopProduct } from '../api/types';
import { getViewed } from '../utils/history';
import ProductRow from './ProductRow';

interface Props {
  store: string;
  onSeeAllOffers: () => void;
}

const rowIcon = (icon: ReactNode, color: string, background: string) => (
  <Box sx={{ width: 36, height: 36, borderRadius: 2.5, display: 'grid', placeItems: 'center', color, bgcolor: background }}>
    {icon}
  </Box>
);

export default function StoreHomeSections({ store, onSeeAllOffers }: Props) {
  const [offers, setOffers] = useState<{ store: string; items: ShopProduct[]; total: number } | null>(null);
  const [viewed, setViewed] = useState<{ store: string; items: ShopProduct[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = `/shop/stores/${encodeURIComponent(store)}/products`;
    api<PageResponse<ShopProduct>>(`${base}?on_offer=true&page_size=12`)
      .then((res) => { if (!cancelled) setOffers({ store, items: res.items, total: res.total }); })
      .catch(() => undefined);
    const ids = getViewed(store);
    if (ids.length) {
      api<PageResponse<ShopProduct>>(`${base}?ids=${ids.join(',')}&page_size=${ids.length}`)
        .then((res) => {
          if (cancelled) return;
          const byId = new Map(res.items.map((p) => [p.id, p]));
          setViewed({ store, items: ids.map((id) => byId.get(id)).filter((p): p is ShopProduct => Boolean(p)) });
        })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [store]);

  const offerItems = offers?.store === store ? offers.items : [];
  const viewedItems = viewed?.store === store ? viewed.items : [];

  return (
    <>
      <Box sx={{ borderRadius: { xs: 0, sm: 4 }, mx: { xs: -2, sm: 0 }, px: { xs: 2, sm: 2.5 }, py: { xs: 2, sm: 2.5 },
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        display: offerItems.length ? 'block' : 'none' }}>
        <ProductRow store={store} products={offerItems}
          title="Today's offers" subtitle={`${offers?.total ?? 0} products on offer`}
          icon={rowIcon(<LocalOffer fontSize="small" />, '#fff', '#f59e0b')}
          onSeeAll={onSeeAllOffers} />
      </Box>

      <ProductRow store={store} products={viewedItems} title="Recently viewed" subtitle="Pick up where you left off"
        icon={rowIcon(<Visibility fontSize="small" />, '#15803d', 'rgba(21,128,61,0.1)')} />
    </>
  );
}
