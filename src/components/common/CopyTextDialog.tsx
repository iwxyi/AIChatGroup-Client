import { useEffect, useRef } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

export function CopyTextDialog({ open, label = '复制内容', value, onClose }: { open: boolean; label?: string; value: string; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, value]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>手动复制</DialogTitle>
      <DialogContent>
        <TextField
          inputRef={inputRef}
          label={label}
          value={value}
          fullWidth
          multiline
          minRows={4}
          maxRows={14}
          slotProps={{ input: { readOnly: true } }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>关闭</Button></DialogActions>
    </Dialog>
  );
}
