/**
 * Icon and colour per category, used for category chips and product tiles (no product images yet)
 */
import type { SvgIconComponent } from '@mui/icons-material';
import {
  AcUnit, BakeryDining, ChildFriendly, CleaningServices, Cookie, EditNote, Grass, HealthAndSafety,
  LocalCafe, LocalDrink, LocalGroceryStore, Pets, RiceBowl, SetMeal, Spa,
} from '@mui/icons-material';

export interface CategoryStyle {
  Icon: SvgIconComponent;
  color: string;
  background: string;
}

const STYLES: [string[], SvgIconComponent, string, string][] = [
  [['grocer', 'rice', 'atta', 'dal', 'pulse', 'flour', 'grain'], RiceBowl, '#b45309', '#fef3c7'],
  [['beverage', 'drink', 'juice', 'tea', 'coffee'], LocalCafe, '#9a3412', '#ffedd5'],
  [['dairy', 'milk'], LocalDrink, '#1d4ed8', '#dbeafe'],
  [['snack', 'biscuit', 'namkeen', 'chips'], Cookie, '#c2410c', '#ffedd5'],
  [['personal', 'beauty', 'skin'], Spa, '#be185d', '#fce7f3'],
  [['household', 'clean', 'detergent'], CleaningServices, '#0e7490', '#cffafe'],
  [['frozen', 'ice'], AcUnit, '#0369a1', '#e0f2fe'],
  [['bakery', 'bread'], BakeryDining, '#a16207', '#fef9c3'],
  [['fruit', 'vegetable'], Grass, '#15803d', '#dcfce7'],
  [['meat', 'seafood', 'fish', 'chicken'], SetMeal, '#b91c1c', '#fee2e2'],
  [['baby'], ChildFriendly, '#7c3aed', '#ede9fe'],
  [['health', 'wellness', 'vitamin'], HealthAndSafety, '#047857', '#d1fae5'],
  [['pet'], Pets, '#92400e', '#fef3c7'],
  [['stationery', 'office'], EditNote, '#4338ca', '#e0e7ff'],
];

const DEFAULT_STYLE: CategoryStyle = { Icon: LocalGroceryStore, color: '#15803d', background: '#dcfce7' };

export const categoryStyle = (categoryName?: string | null): CategoryStyle => {
  const name = (categoryName || '').toLowerCase();
  const match = STYLES.find(([words]) => words.some((word) => name.includes(word)));
  return match ? { Icon: match[1], color: match[2], background: match[3] } : DEFAULT_STYLE;
};
