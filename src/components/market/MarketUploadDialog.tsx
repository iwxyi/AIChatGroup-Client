import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { marketApi, type MarketItem, type MarketItemKind } from '../../services/marketApi';

export interface MarketUploadDraft {
  kind: MarketItemKind;
  title: string;
  summary?: string;
  coverImage?: string | null;
  payload: Record<string, unknown>;
  sourceEntityId?: string | null;
  marketItemId?: string | null;
}

export default function MarketUploadDialog({
  open,
  draft,
  onClose,
  onUploaded,
}: {
  open: boolean;
  draft: MarketUploadDraft | null;
  onClose: () => void;
  onUploaded?: (item: MarketItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !draft) return;
    setTitle(draft.title);
    setSummary(draft.summary || '');
    setError('');
  }, [draft, open]);

  const submit = async () => {
    if (!draft || saving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('标题不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await marketApi.upload({
        ...draft,
        title: trimmedTitle,
        summary: summary.trim(),
      });
      onUploaded?.(result.item);
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{draft?.marketItemId ? '更新市场模板' : '上传到市场'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 160 } }}
            fullWidth
          />
          <TextField
            label="摘要"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            minRows={3}
            maxRows={6}
            multiline
            fullWidth
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>取消</Button>
        <Button variant="contained" onClick={submit} disabled={saving || !draft}>
          {saving ? '上传中' : '确认上传'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
