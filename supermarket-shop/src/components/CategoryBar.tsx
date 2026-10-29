/**
 * Horizontally scrolling category chips with the category's icon
 */
import type { ReactNode } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { Apps } from '@mui/icons-material';
import type { ShopCategory } from '../api/types';
import { categoryStyle } from '../utils/categoryStyle';

interface Props {
  categories: ShopCategory[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}

function Item({ label, active, onClick, icon, color, background }: {
  label: string; active: boolean; onClick: () => void; icon: ReactNode; color: string; background: string;
}) {
  return (
    <ButtonBase onClick={onClick} aria-pressed={active}
      sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0.75, width: 84, py: 1, borderRadius: 3,
        border: 1.5, borderColor: active ? 'primary.main' : 'transparent',
        bgcolor: active ? 'rgba(15,118,110,0.06)' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}>
      <Box sx={{ width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center',
        bgcolor: background, color }}>
        {icon}
      </Box>
      <Typography variant="caption" sx={{ fontWeight: active ? 700 : 600, lineHeight: 1.2, px: 0.5, textAlign: 'center',
        color: active ? 'primary.dark' : 'text.primary', display: '-webkit-box', overflow: 'hidden',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {label}
      </Typography>
    </ButtonBase>
  );
}

export default function CategoryBar({ categories, selected, onSelect }: Props) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5, mx: -0.5,
      scrollbarWidth: 'thin', '&::-webkit-scrollbar': { height: 6 } }}>
      <Item label="All" active={selected === null} onClick={() => onSelect(null)} icon={<Apps />}
        color="#0f766e" background="#ccfbf1" />
      {categories.map((c) => {
        const { Icon, color, background } = categoryStyle(c.category_name);
        return (
          <Item key={c.id} label={c.category_name} active={selected === c.id} onClick={() => onSelect(c.id)}
            icon={<Icon />} color={color} background={background} />
        );
      })}
    </Box>
  );
}
