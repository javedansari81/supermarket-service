/**
 * A store's home and products: greeting, search (with recent searches), categories, today's
 * offers, recently viewed, then all products with sort and "Show more" paging
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, IconButton, InputAdornment, MenuItem, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import { Close, History, Search, SearchOff, SwapVert } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { ListResponse, PageResponse, ShopCategory, ShopProduct } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import CategoryBar from '../components/CategoryBar';
import ProductCard from '../components/ProductCard';
import StoreHomeSections from '../components/StoreHomeSections';
import StoreInfo from '../components/StoreInfo';
import StoreNotFound from '../components/StoreNotFound';
import { useShopStore } from '../hooks/useShopStore';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../utils/history';

const PAGE_SIZE = 24;
const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

interface Result {
  key: string;
  page: number;
  items: ShopProduct[];
  total: number;
}

export default function StorePage() {
  const store = useParams().store!;
  const { account } = useAuth();
  const { detail, notFound, error: storeError } = useShopStore(store);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const [onOffer, setOnOffer] = useState(false);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const key = `${store}|${query}|${categoryId ?? ''}|${sort}|${onOffer}`;

  useEffect(() => {
    api<ListResponse<ShopCategory>>(`/shop/stores/${encodeURIComponent(store)}/categories`)
      .then((res) => setCategories(res.items))
      .catch(() => setCategories([]));
  }, [store]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort });
    if (query) params.set('search', query);
    if (categoryId) params.set('category_id', String(categoryId));
    if (onOffer) params.set('on_offer', 'true');
    api<PageResponse<ShopProduct>>(`/shop/stores/${encodeURIComponent(store)}/products?${params}`)
      .then((res) => {
        if (cancelled) return;
        setError('');
        if (query && page === 1 && res.total > 0) setRecentSearches(addRecentSearch(query));
        setResult((prev) => ({
          key, page, total: res.total,
          items: page > 1 && prev?.key === key ? [...prev.items, ...res.items] : res.items,
        }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load products');
      });
    return () => { cancelled = true; };
  }, [store, query, categoryId, sort, onOffer, page, key]);

  if (notFound) return <StoreNotFound />;
  if (storeError) return <Alert severity="error">{storeError}</Alert>;

  const current = result?.key === key ? result : null;
  const loading = !current || current.page !== page;
  const chooseCategory = (id: number | null) => { setCategoryId(id); setPage(1); };

  const categoryName = categories.find((c) => c.id === categoryId)?.category_name;
  const items = current?.items ?? [];
  const browsing = !query && categoryId === null && !onOffer;
  const firstName = account?.customer_name?.split(' ')[0];
  const seeAllOffers = () => {
    setOnOffer(true);
    setCategoryId(null);
    setSearch('');
    setQuery('');
    setPage(1);
  };
  const title = query ? `Results for "${query}"` : onOffer ? "Today's offers" : categoryName || 'All products';

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5">{firstName ? `Hi ${firstName} 👋` : 'Welcome 👋'}</Typography>
        <Typography color="text.secondary">
          What would you like today{detail ? ` from ${detail.store_name}` : ''}?
        </Typography>
      </Box>

      <Box sx={{ position: 'sticky', top: { xs: 60, sm: 68 }, zIndex: 2, mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 },
        py: 1.25, mt: '12px !important', bgcolor: 'rgba(245,247,246,0.92)', backdropFilter: 'blur(10px)' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField fullWidth placeholder="Search for atta, milk, chips..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 100, 'aria-label': 'Search products' },
              input: {
                startAdornment: <InputAdornment position="start"><Search color="action" /></InputAdornment>,
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')} aria-label="Clear search"><Close /></IconButton>
                  </InputAdornment>
                ) : undefined,
              } }} />
          <TextField select value={sort} sx={{ minWidth: { xs: 56, sm: 200 } }} aria-label="Sort"
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            slotProps={{ select: { renderValue: (v) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SwapVert fontSize="small" color="action" />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  {SORTS.find((s) => s.value === v)?.label}
                </Box>
              </Box>
            ) } }}>
            {SORTS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
          </TextField>
        </Box>
      </Box>

      {!query && recentSearches.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <History fontSize="small" />Recent
          </Typography>
          {recentSearches.map((term) => (
            <Chip key={term} label={term} variant="outlined" sx={{ bgcolor: 'background.paper' }}
              onClick={() => { setSearch(term); setOnOffer(false); }} />
          ))}
          <Button size="small" sx={{ color: 'text.secondary' }}
            onClick={() => { clearRecentSearches(); setRecentSearches([]); }}>
            Clear
          </Button>
        </Box>
      )}

      {categories.length > 0 && (
        <CategoryBar categories={categories} selected={categoryId}
          onSelect={(id) => { setOnOffer(false); chooseCategory(id); }} />
      )}

      {browsing && <StoreHomeSections store={store} onSeeAllOffers={seeAllOffers} />}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">{title}</Typography>
          {onOffer && <Chip size="small" label="Show all products" onDelete={() => { setOnOffer(false); setPage(1); }}
            onClick={() => { setOnOffer(false); setPage(1); }} />}
        </Box>
        {current && <Typography variant="body2" color="text.secondary">{current.total} items</Typography>}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {(items.length > 0 || loading) && (
        <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 },
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)' } }}>
          {items.map((p) => <ProductCard key={p.id} store={store} product={p} />)}
          {loading && !error && Array.from({ length: items.length ? 5 : 10 }, (_, i) => (
            <Skeleton key={`s${i}`} variant="rounded" height={268} sx={{ borderRadius: 4 }} />
          ))}
        </Box>
      )}

      {current && !loading && items.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <SearchOff sx={{ fontSize: 56, opacity: 0.5 }} />
          <Typography variant="h6" color="text.primary" sx={{ mt: 1 }}>
            {query ? `No products match "${query}"` : 'Nothing here yet'}
          </Typography>
          <Typography>Try another word or category.</Typography>
        </Box>
      )}

      {current && !loading && items.length < current.total && (
        <Button variant="outlined" size="large" onClick={() => setPage(page + 1)} sx={{ alignSelf: 'center', px: 4 }}>
          Show more products ({current.total - items.length})
        </Button>
      )}

      {detail && <StoreInfo detail={detail} />}
    </Stack>
  );
}
