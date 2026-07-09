import { useCallback, useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { marketApi, type MarketItem, type MarketItemKind } from '../services/marketApi';

const kindLabels: Record<MarketItemKind, string> = {
  character_template: '角色模板',
  chat_template: '聊天模板',
  bundle_template: '组合包',
};

export default function MarketPage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<MarketItemKind | ''>('');
  const [items, setItems] = useState<MarketItem[]>([]);
  const [selected, setSelected] = useState<MarketItem | null>(null);
  const [detail, setDetail] = useState<MarketItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await marketApi.list({ kind: kind || undefined, limit: 80 });
      setItems(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载市场失败');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const openImport = async (item: MarketItem) => {
    setSelected(item);
    setDetail(null);
    setError('');
    try {
      const result = await marketApi.detail(item.id);
      setDetail(result.item);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : '加载模板详情失败');
    }
  };

  const importSelected = async () => {
    if (!detail?.payload) return;
    setImporting(true);
    setError('');
    try {
      if (detail.kind === 'character_template') {
        setSelected(null);
        navigate('/characters/create', { state: { marketImportDraft: { item: detail } } });
        return;
      }
      setSelected(null);
      navigate('/chats/create', { state: { marketImportDraft: { item: detail } } });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>市场</Typography>
        <Typography variant="body2" color="text.secondary">导入已审核通过的角色模板、聊天模板和组合包。导入后会先进入编辑页，保存后才会创建你的本地实例。</Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>类型</InputLabel>
            <Select label="类型" value={kind} onChange={(event) => setKind(event.target.value as MarketItemKind | '')}>
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="character_template">角色模板</MenuItem>
              <MenuItem value="chat_template">聊天模板</MenuItem>
              <MenuItem value="bundle_template">组合包</MenuItem>
            </Select>
          </FormControl>
          <Button onClick={() => void load()} disabled={loading}>刷新</Button>
        </Stack>
      </Paper>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5 }}>
        {items.map((item) => (
          <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: 'grid', gap: 1 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
              <Avatar src={item.coverImage || undefined}>{item.title.slice(0, 1)}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800 }} noWrap>{item.title}</Typography>
                <Chip size="small" label={kindLabels[item.kind]} />
              </Box>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>{item.summary || '暂无摘要'}</Typography>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">导入 {item.importedCount}</Typography>
              <Button size="small" variant="contained" onClick={() => void openImport(item)}>导入</Button>
            </Stack>
          </Paper>
        ))}
      </Box>
      {!items.length && !loading ? <Alert severity="info">暂无已审核市场模板</Alert> : null}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        <DialogTitle>确认导入</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography sx={{ fontWeight: 800 }}>{selected?.title}</Typography>
            <Typography variant="body2" color="text.secondary">{selected?.summary || '无摘要'}</Typography>
            <Alert severity="info">确认后会进入编辑页，你可以修改内容；只有点击保存后才会创建本地实例并绑定市场来源 ID。</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={importing}>取消</Button>
          <Button variant="contained" onClick={() => void importSelected()} disabled={importing || !detail}>
            {importing ? '打开中' : '进入编辑'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
