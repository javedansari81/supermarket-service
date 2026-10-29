/**
 * The store the customer shopped at last, so login and the home page can take them back to it
 */
const LAST_STORE_KEY = 'shop_last_store';

export const getLastStore = () => localStorage.getItem(LAST_STORE_KEY);

export const setLastStore = (store: string) => localStorage.setItem(LAST_STORE_KEY, store);

export const clearLastStore = () => localStorage.removeItem(LAST_STORE_KEY);
