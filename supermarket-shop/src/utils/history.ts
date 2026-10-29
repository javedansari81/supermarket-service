/**
 * Shopping history kept on this device: recent searches and recently viewed products per store
 */
const SEARCHES_KEY = 'shop_recent_searches';
const MAX_SEARCHES = 6;
const MAX_VIEWED = 12;

const viewedKey = (store: string) => `shop_viewed_${store}`;

const readList = <T>(key: string): T[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const getRecentSearches = () => readList<string>(SEARCHES_KEY);

export const addRecentSearch = (term: string): string[] => {
  const clean = term.trim();
  if (!clean) return getRecentSearches();
  const next = [clean, ...getRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase())]
    .slice(0, MAX_SEARCHES);
  localStorage.setItem(SEARCHES_KEY, JSON.stringify(next));
  return next;
};

export const clearRecentSearches = () => localStorage.removeItem(SEARCHES_KEY);

/** Product ids, most recently viewed first */
export const getViewed = (store: string) => readList<number>(viewedKey(store));

export const addViewed = (store: string, productId: number) => {
  const next = [productId, ...getViewed(store).filter((id) => id !== productId)].slice(0, MAX_VIEWED);
  localStorage.setItem(viewedKey(store), JSON.stringify(next));
};
