/**
 * Dropdown with type-to-filter, for option lists that can grow large
 */
import React from 'react';
import { Autocomplete, TextField, SxProps, Theme } from '@mui/material';

export interface SelectOption { value: string; label: string; }

interface SearchableSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
  sx?: SxProps<Theme>;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label, value, options, onChange, size, fullWidth = true, disabled, required, helperText, sx,
}) => (
  <Autocomplete
    options={options}
    value={options.find((o) => o.value === value) ?? null}
    onChange={(_, option) => onChange(option?.value ?? '')}
    getOptionLabel={(o) => o.label}
    isOptionEqualToValue={(o, v) => o.value === v.value}
    renderOption={(props, o) => <li {...props} key={o.value}>{o.label}</li>}
    noOptionsText="No matches"
    size={size}
    fullWidth={fullWidth}
    disabled={disabled}
    sx={sx}
    renderInput={(params) => (
      <TextField {...params} label={label} required={required} helperText={helperText} placeholder="Type to search..." />
    )}
  />
);

export default SearchableSelect;
