/**
 * A store's home and products: category dropdown and search in the header (recent searches below),
 * today's offers, recently viewed, then all products with "Show more" paging. Sort appears once the
 * customer searches or filters.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, IconButton, InputAdornment, MenuItem, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import { Apps, Close, History, Search, SearchOff, SwapVert } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { ListResponse, PageResponse, ShopCategory, ShopProduct } from '../api/types';
import ProductCard from '../components/ProductCard';
import StoreHomeSections from '../components/StoreHomeSections';
import StoreNotFound from '../components/StoreNotFound';
import { useShopStore } from '../hooks/useShopStore';
import { categoryStyle } from '../utils/categoryStyle';
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
  const searchSlot = useOutletContext<HTMLElement | null>();
  const { notFound, error: storeError } = useShopStore(store);
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

  const browsing = !query && categoryId === null && !onOffer;
  const activeSort = browsing ? 'name' : sort;
  const key = `${store}|${query}|${categoryId ?? ''}|${activeSort}|${onOffer}`;

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
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: activeSort });
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
  }, [store, query, categoryId, activeSort, onOffer, page, key]);

  if (notFound) return <StoreNotFound />;
  if (storeError) return <Alert severity="error">{storeError}</Alert>;

  const current = result?.key === key ? result : null;
  const loading = !current || current.page !== page;
  const chooseCategory = (id: number | null) => { setCategoryId(id); setPage(1); };

  const categoryName = categories.find((c) => c.id === categoryId)?.category_name;
  const items = current?.items ?? [];
  const seeAllOffers = () => {
    setOnOffer(true);
    setCategoryId(null);
    setSearch('');
    setQuery('');
    setPage(1);
  };
  const title = query ? `Results for "${query}"` : onOffer ? "Today's offers" : categoryName || 'All products';
  const categoryLabel = (id: string) => {
    const category = categories.find((c) => String(c.id) === id);
    const { Icon, color, background } = category ? categoryStyle(category.category_name)
      : { Icon: Apps, color: '#15803d', background: '#dcfce7' };
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
          color, bgcolor: background }}>
          <Icon sx={{ fontSize: 16 }} />
        </Box>
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {category?.category_name ?? 'All categories'}
        </Box>
      </Box>
    );
  };

  return (
    <>
      {searchSlot && createPortal(
        <Box sx={{ display: 'flex', gap: 1,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.6)' },
          '& .MuiOutlinedInput-root.Mui-focused': { boxShadow: '0 0 0 3px rgba(255,255,255,0.45)' },
          '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
          '& .MuiOutlinedInput-input': { height: { xs: 42, md: 44 }, py: 0, boxSizing: 'border-box' },
          '& .MuiSelect-select': { display: 'flex', alignItems: 'center', height: { xs: '42px !important', md: '44px !important' } },
          '& .MuiInputBase-input::placeholder': { fontSize: { xs: 15, sm: 16 } } }}>
          {categories.length > 0 && (
            <TextField select value={categoryId === null ? 'all' : String(categoryId)}
              sx={{ flexShrink: 0, width: { xs: 64, lg: 210 },
                '& .MuiSelect-select': { pl: { xs: 1.25, lg: 1.75 }, pr: { xs: '28px !important', lg: '32px !important' } },
                '& .MuiSelect-icon': { right: { xs: 4, lg: 7 } } }}
              onChange={(e) => {
                setOnOffer(false);
                chooseCategory(e.target.value === 'all' ? null : Number(e.target.value));
              }}
              slotProps={{
                htmlInput: { 'aria-label': 'Category' },
                select: {
                  renderValue: (v) => (
                    <Box sx={{ '& span': { display: { xs: 'none', lg: 'inline' } } }}>{categoryLabel(String(v))}</Box>
                  ),
                  MenuProps: { slotProps: { paper: { sx: { maxHeight: 420 } } } },
                },
              }}>
              <MenuItem value="all">{categoryLabel('all')}</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={String(c.id)} sx={{ justifyContent: 'space-between', gap: 2 }}>
                  {categoryLabel(String(c.id))}
                  <Typography variant="caption" color="text.secondary">{c.product_count}</Typography>
                </MenuItem>
              ))}
            </TextField>
          )}
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
        </Box>,
        searchSlot,
      )}

      <Stack spacing={2.5}>
        {!query && recentSearches.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: { xs: 'nowrap', sm: 'wrap' },
            overflowX: { xs: 'auto', sm: 'visible' }, mx: { xs: -2, sm: 0 }, px: { xs: 2, sm: 0 },
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            <Typography variant="body2" color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <History fontSize="small" />Recent
            </Typography>
            {recentSearches.map((term) => (
              <Chip key={term} label={term} variant="outlined" sx={{ bgcolor: 'background.paper', flexShrink: 0 }}
                onClick={() => { setSearch(term); setOnOffer(false); }} />
            ))}
            <Button size="small" sx={{ color: 'text.secondary', flexShrink: 0 }}
              onClick={() => { clearRecentSearches(); setRecentSearches([]); }}>
              Clear
            </Button>
          </Box>
        )}

        {browsing && <StoreHomeSections store={store} onSeeAllOffers={seeAllOffers} />}

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontSize: { xs: 18, sm: 20 }, overflowWrap: 'anywhere' }}>{title}</Typography>
            {onOffer && <Chip size="small" label="Show all products" onDelete={() => { setOnOffer(false); setPage(1); }}
              onClick={() => { setOnOffer(false); setPage(1); }} />}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: { xs: 1, sm: 0 },
            justifyContent: 'space-between' }}>
            {current && <Typography variant="body2" color="text.secondary" noWrap>{current.total} items</Typography>}
            {!browsing && (
              <TextField select size="small" value={sort} sx={{ minWidth: { xs: 0, sm: 200 }, width: { xs: 190, sm: 'auto' } }}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                slotProps={{ htmlInput: { 'aria-label': 'Sort' }, select: { renderValue: (v) => (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SwapVert fontSize="small" color="action" />
                    {SORTS.find((s) => s.value === v)?.label}
                  </Box>
                ) } }}>
                {SORTS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </TextField>
            )}
          </Box>
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
      </Stack>
    </>
  );
}
