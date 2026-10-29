/**
 * Six boxes for the login code: typing moves to the next box, backspace to the previous one,
 * and pasting or SMS autofill fills all of them
 */
import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';

const DigitBox = styled('input', { shouldForwardProp: (prop) => prop !== 'filled' && prop !== 'invalid' })<{
  filled: boolean;
  invalid: boolean;
}>(({ theme, filled, invalid }) => ({
  width: '100%', aspectRatio: '1 / 1.15', textAlign: 'center', fontSize: 24, fontWeight: 700,
  fontFamily: 'inherit', color: theme.palette.text.primary, borderRadius: 6, outline: 'none',
  border: `1.5px solid ${invalid ? theme.palette.error.main : filled ? theme.palette.primary.main : theme.palette.divider}`,
  backgroundColor: filled ? 'rgba(21,128,61,0.04)' : theme.palette.background.paper,
  transition: 'border-color .15s, box-shadow .15s',
  '&:focus': { borderColor: theme.palette.primary.main, boxShadow: '0 0 0 4px rgba(21,128,61,0.15)' },
  '&:disabled': { opacity: 0.6 },
}));

interface Props {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
}

export default function OtpInput({ value, onChange, length = 6, disabled = false, error = false }: Props) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  const focus = (index: number) => inputs.current[Math.max(0, Math.min(index, length - 1))]?.focus();

  const setFrom = (index: number, typed: string) => {
    const clean = typed.replace(/[^0-9]/g, '');
    if (!clean) return;
    const next = (value.slice(0, index) + clean).slice(0, length);
    onChange(next);
    focus(next.length);
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) onChange(value.slice(0, index) + value.slice(index + 1));
      else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        focus(index - 1);
      }
    } else if (e.key === 'ArrowLeft') focus(index - 1);
    else if (e.key === 'ArrowRight') focus(index + 1);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setFrom(0, e.clipboardData.getData('text'));
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${length}, 1fr)`, gap: { xs: 1, sm: 1.5 } }}>
      {digits.map((digit, i) => (
        <DigitBox key={i} ref={(el) => { inputs.current[i] = el; }}
          value={digit} disabled={disabled} inputMode="numeric" maxLength={length}
          autoComplete={i === 0 ? 'one-time-code' : 'off'} autoFocus={i === 0}
          aria-label={`Digit ${i + 1}`} filled={Boolean(digit)} invalid={error}
          onChange={(e) => setFrom(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()} />
      ))}
    </Box>
  );
}
