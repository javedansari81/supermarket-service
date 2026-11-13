/**
 * Confirmation dialog
 * `const confirm = useConfirm()` then `if (!(await confirm({ ... }))) return;`
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { HelpOutline, WarningAmber } from '@mui/icons-material';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the action as dangerous (delete, discard, deactivate) */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  const destructive = options?.destructive ?? false;
  const tone = destructive ? 'error' : 'primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onClose={() => close(false)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="confirm-dialog-title"
        // Stay a compact card on phones instead of the full-screen form layout
        PaperProps={{
          sx: (theme) => ({
            [theme.breakpoints.down('sm')]: {
              margin: 2, width: 'calc(100% - 32px)', height: 'auto', maxHeight: 'calc(100% - 32px)', borderRadius: 3,
            },
          }),
        }}
      >
        <DialogTitle id="confirm-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={(theme) => ({
              display: 'grid', placeItems: 'center', flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
              color: `${tone}.main`,
              backgroundColor: `rgba(${theme.vars!.palette[tone].mainChannel} / 0.12)`,
            })}
          >
            {destructive ? <WarningAmber fontSize="small" /> : <HelpOutline fontSize="small" />}
          </Box>
          {options?.title}
        </DialogTitle>
        {options?.message && (
          <DialogContent>
            <Typography variant="body2" color="text.secondary">{options.message}</Typography>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => close(false)} color="inherit">{options?.cancelLabel ?? 'Cancel'}</Button>
          <Button variant="contained" color={tone} onClick={() => close(true)} autoFocus>
            {options?.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
};
