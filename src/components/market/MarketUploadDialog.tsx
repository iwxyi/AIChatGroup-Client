import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !draft) return;
    setError('');
  }, [draft, open]);

  const submit = async () => {
    if (!draft || saving) return;
    const trimmedTitle = draft.title.trim();
    setSaving(true);
    setError('');
    try {
      const result = await marketApi.upload({
        ...draft,
        title: trimmedTitle,
        summary: draft.summary?.trim() || '',
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
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>会保留</Typography>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {draft?.kind === 'character_template' ? (
                ['头像', '形象图', '视觉形象', '核心画像', '人格', '背景', '说话风格', '展示配置'].map((item) => <Chip key={item} size="small" label={item} />)
              ) : draft?.kind === 'chat_template' ? (
                ['聊天类型', '主题', '玩法配置', '导演控制', '展示配置'].map((item) => <Chip key={item} size="small" label={item} />)
              ) : (
                ['聊天配置', '包内角色', '包内关系', '包内记忆', '陪伴起点', '运行种子'].map((item) => <Chip key={item} size="small" label={item} />)
              )}
            </Stack>
          </Box>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>会去掉</Typography>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {(draft?.kind === 'bundle_template'
                ? ['包外角色', '包外关系', '包外记忆', '历史聊天全文', '用户私域信息', '密钥与内部字段']
                : ['记忆历史', '关系历史', '历史聊天全文', '用户私域信息', '密钥与内部字段']
              ).map((item) => <Chip key={item} size="small" variant="outlined" label={item} />)}
            </Stack>
          </Box>
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
