import { useState, type ReactNode } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  children?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  destructive?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export default function ConfirmDialog({ open, title, message, children, onConfirm, onCancel, destructive, loading = false, loadingLabel }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const busy = loading || submitting;
  const handleConfirm = async () => {
    if (busy) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button>
        <Button onClick={handleConfirm} disabled={busy} color={destructive ? 'error' : 'primary'} variant="contained" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {busy ? (loadingLabel || t('common.loading')) : t('common.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
