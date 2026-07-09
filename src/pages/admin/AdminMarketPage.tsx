import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { adminApi } from '../../services/adminApi';
import type { MarketItem } from '../../services/marketApi';

const kindLabels: Record<string, string> = {
  character_template: '角色模板',
  chat_template: '聊天模板',
  bundle_template: '组合包',
};

const statusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  archived: '已下架',
};

type PreviewEntry = {
  key: string;
  label: string;
  type: string;
  summary: string;
  value: unknown;
  diffState?: 'added' | 'deleted' | 'changed' | 'same';
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringifyStable(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function readTemplateName(value: unknown) {
  const record = asRecord(value);
  return String(record.name || record.title || '未命名');
}

function summarizeEntry(type: string, value: unknown) {
  const record = asRecord(value);
  if (type === '角色') return String(record.background || record.speakingStyle || (Array.isArray(record.expertise) ? record.expertise.join('、') : '') || '无摘要');
  if (type === '聊天') return String(record.topic || record.topicSeed || record.name || '无摘要');
  return String(record.summary || record.background || record.topic || '无摘要');
}

function payloadEntries(payload: unknown): PreviewEntry[] {
  if (!payload) return [];
  const root = asRecord(payload);
  const kind = String(root.kind || '');
  if (kind === 'character_template') {
    const character = asRecord(root.character);
    return [{ key: 'character', label: readTemplateName(character), type: '角色', summary: summarizeEntry('角色', character), value: character }];
  }
  if (kind === 'chat_template') {
    const chat = asRecord(root.chat);
    return [{ key: 'chat', label: readTemplateName(chat), type: '聊天', summary: summarizeEntry('聊天', chat), value: chat }];
  }
  if (kind === 'bundle_template') {
    const chat = asRecord(root.chat);
    const characters = Array.isArray(root.characters) ? root.characters.map(asRecord) : [];
    const runtimeEntries = (['relationshipLedger', 'runtimeEventsV2', 'layeredMemories', 'runtimeTimeline'] as const)
      .flatMap((key) => {
        const values = [
          { sourceKey: key, label: key, value: root[key] },
          { sourceKey: `chat.${key}`, label: `chat.${key}`, value: chat[key] },
        ];
        return values
          .filter((entry) => Array.isArray(entry.value) && entry.value.length)
          .map((entry) => ({
            key: entry.sourceKey,
            label: entry.label,
            type: '运行数据',
            summary: `${(entry.value as unknown[]).length} 条`,
            value: entry.value,
          }));
      });
    return [
      { key: 'chat', label: readTemplateName(chat), type: '聊天', summary: summarizeEntry('聊天', chat), value: chat },
      ...characters.map((entry) => {
        const localId = String(entry.localId || '');
        const template = asRecord(entry.template);
        return {
          key: `character:${localId || readTemplateName(template)}`,
          label: readTemplateName(template),
          type: '角色',
          summary: summarizeEntry('角色', template),
          value: template,
        };
      }),
      ...runtimeEntries,
    ];
  }
  return [{ key: 'payload', label: 'Payload', type: '未知', summary: '', value: payload }];
}

function withDiffState(current: PreviewEntry[], previous: PreviewEntry[]) {
  const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
  const currentByKey = new Map(current.map((entry) => [entry.key, entry]));
  const merged: PreviewEntry[] = current.map((entry) => {
    const old = previousByKey.get(entry.key);
    if (!old) return { ...entry, diffState: 'added' };
    return { ...entry, diffState: stringifyStable(old.value) === stringifyStable(entry.value) ? 'same' : 'changed' };
  });
  for (const entry of previous) {
    if (!currentByKey.has(entry.key)) merged.push({ ...entry, diffState: 'deleted' });
  }
  return merged;
}

function diffBorderColor(state?: PreviewEntry['diffState']) {
  if (state === 'added') return 'success.main';
  if (state === 'deleted') return 'error.main';
  if (state === 'changed') return 'warning.main';
  return 'divider';
}

function diffLabel(state?: PreviewEntry['diffState']) {
  if (state === 'added') return '新增';
  if (state === 'deleted') return '删除';
  if (state === 'changed') return '变更';
  return '无变化';
}

export default function AdminMarketPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('pending');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState('updated_at');
  const [order, setOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [detail, setDetail] = useState<MarketItem | null>(null);
  const [activeEntryKey, setActiveEntryKey] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);
  const [defaultCreating, setDefaultCreating] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminApi.getMarketItems({ status, kind, sort, order, limit: 80 });
      setItems(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载市场条目失败');
    } finally {
      setLoading(false);
    }
  }, [kind, order, sort, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (item: Record<string, unknown>) => {
    setSelected(item);
    setDetail(null);
    setReviewNote(String(item.reviewNote || ''));
    try {
      const result = await adminApi.getMarketItem(String(item.id));
      const loadedItem = result.item as unknown as MarketItem;
      setDetail(loadedItem);
      const entries = payloadEntries(loadedItem.payload);
      setActiveEntryKey(entries[0]?.key || '');
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : '加载详情失败');
    }
  };

  const currentEntries = payloadEntries(detail?.payload);
  const previousEntries = payloadEntries(detail?.previousPayload);
  const hasPreviousPayload = Boolean(detail?.previousPayload);
  const displayEntries = hasPreviousPayload ? withDiffState(currentEntries, previousEntries) : currentEntries;
  const activeEntry = displayEntries.find((entry) => entry.key === activeEntryKey) || displayEntries[0] || null;
  const previousEntry = activeEntry ? previousEntries.find((entry) => entry.key === activeEntry.key) : null;

  const decide = async (nextStatus: 'approved' | 'rejected' | 'archived') => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const result = await adminApi.decideMarketItem(String(selected.id), { status: nextStatus, reviewNote });
      setSelected(result.item);
      setDetail((prev) => ({ ...(prev || {}), ...(result.item as unknown as Partial<MarketItem>) } as MarketItem));
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : '审核操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const createDefaults = async () => {
    setDefaultCreating(true);
    setError('');
    try {
      const result = await adminApi.createDefaultMarketItems();
      setDefaultDialogOpen(false);
      setStatus('approved');
      setKind('');
      setSnackbarMessage(`默认预设已同步：新建 ${result.createdCount} 个，更新 ${result.updatedCount} 个`);
      const refreshed = await adminApi.getMarketItems({ status: 'approved', kind: '', sort, order, limit: 80 });
      setItems(refreshed.items);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建默认预设失败');
    } finally {
      setDefaultCreating(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>市场管理</Typography>
          <Typography variant="body2" color="text.secondary">角色模板、聊天模板和组合包默认待审核，通过后才进入公开市场。</Typography>
        </Box>
        <Button variant="contained" onClick={() => setDefaultDialogOpen(true)}>创建默认</Button>
      </Box>
      <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, borderRadius: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(auto-fit, minmax(136px, 1fr))',
            },
            gap: 1.25,
            alignItems: 'center',
          }}
        >
          <FormControl size="small" sx={{ minWidth: 0 }}>
            <InputLabel>状态</InputLabel>
            <Select label="状态" value={status} onChange={(event) => setStatus(event.target.value)}>
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="pending">待审核</MenuItem>
              <MenuItem value="approved">已通过</MenuItem>
              <MenuItem value="rejected">已拒绝</MenuItem>
              <MenuItem value="archived">已下架</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 0 }}>
            <InputLabel>类型</InputLabel>
            <Select label="类型" value={kind} onChange={(event) => setKind(event.target.value)}>
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="character_template">角色模板</MenuItem>
              <MenuItem value="chat_template">聊天模板</MenuItem>
              <MenuItem value="bundle_template">组合包</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 0 }}>
            <InputLabel>排序</InputLabel>
            <Select label="排序" value={sort} onChange={(event) => setSort(event.target.value)}>
              <MenuItem value="updated_at">更新时间</MenuItem>
              <MenuItem value="created_at">创建时间</MenuItem>
              <MenuItem value="imported_count">导入数</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 0 }}>
            <InputLabel>方向</InputLabel>
            <Select label="方向" value={order} onChange={(event) => setOrder(event.target.value)}>
              <MenuItem value="desc">倒序</MenuItem>
              <MenuItem value="asc">正序</MenuItem>
            </Select>
          </FormControl>
          <Button
            onClick={() => void load()}
            disabled={loading}
            sx={{
              justifySelf: 'end',
              minWidth: 88,
              gridColumn: { xs: '2', sm: 'auto' },
            }}
          >
            刷新
          </Button>
        </Box>
      </Paper>
      {snackbarMessage ? <Alert severity="success" onClose={() => setSnackbarMessage('')}>{snackbarMessage}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 760 }}>
          <TableHead>
            <TableRow>
              <TableCell>标题</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>作者</TableCell>
              <TableCell>版本</TableCell>
              <TableCell>导入</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={String(item.id)} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{String(item.title || '')}</Typography>
                  <Typography variant="caption" color="text.secondary">{String(item.summary || '').slice(0, 80)}</Typography>
                </TableCell>
                <TableCell>{kindLabels[String(item.kind)] || String(item.kind || '')}</TableCell>
                <TableCell><Chip size="small" label={statusLabels[String(item.status)] || String(item.status || '')} /></TableCell>
                <TableCell>{String(item.ownerNickname || item.ownerPhone || item.ownerUserId || '')}</TableCell>
                <TableCell>{String(item.payloadVersion || 1)}</TableCell>
                <TableCell>{String(item.importedCount || 0)}</TableCell>
                <TableCell align="right"><Button size="small" onClick={() => void openDetail(item)}>查看</Button></TableCell>
              </TableRow>
            ))}
            {!items.length ? (
              <TableRow><TableCell colSpan={7}><Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>暂无市场条目</Typography></TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="lg" fullWidth>
        <DialogTitle>{String(selected?.title || '市场条目')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip label={kindLabels[String(selected?.kind)] || String(selected?.kind || '')} />
              <Chip label={statusLabels[String(selected?.status)] || String(selected?.status || '')} />
              <Chip label={`版本 ${String(selected?.payloadVersion || 1)}`} />
            </Stack>
            <Typography variant="body2" color="text.secondary">{String(selected?.summary || '') || '无摘要'}</Typography>
            <TextField label="审核备注" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} multiline minRows={2} maxRows={5} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 1.5 }}>
              <Paper variant="outlined" sx={{ p: 1, maxHeight: 420, overflow: 'auto' }}>
                <Typography variant="subtitle2" sx={{ px: 1, py: 0.75, fontWeight: 800 }}>内容列表</Typography>
                <Stack spacing={1}>
                  {displayEntries.map((entry) => (
                    <Paper
                      key={entry.key}
                      variant="outlined"
                      onClick={() => setActiveEntryKey(entry.key)}
                      sx={{
                        p: 1,
                        cursor: 'pointer',
                        borderColor: activeEntry?.key === entry.key ? 'primary.main' : diffBorderColor(entry.diffState),
                        bgcolor: activeEntry?.key === entry.key ? 'action.selected' : 'background.paper',
                      }}
                    >
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5 }}>
                        <Chip size="small" label={entry.type} />
                        {hasPreviousPayload ? <Chip size="small" variant="outlined" label={diffLabel(entry.diffState)} /> : null}
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{entry.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{entry.summary.slice(0, 90)}</Typography>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default', minHeight: 280, maxHeight: 420, overflow: 'auto' }}>
                {activeEntry ? (
                  <Stack spacing={1.25}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>{activeEntry.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{activeEntry.type} · {hasPreviousPayload ? diffLabel(activeEntry.diffState) : '当前内容'}</Typography>
                    </Box>
                    <Divider />
                    {hasPreviousPayload ? (
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">旧版本 v{String((detail as MarketItem | null)?.previousPayloadVersion || '-')}</Typography>
                          <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', m: 0, mt: 0.75 }}>
                            {previousEntry ? stringifyStable(previousEntry.value) : '旧版本不存在'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">新版本 v{String((detail as MarketItem | null)?.payloadVersion || '-')}</Typography>
                          <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', m: 0, mt: 0.75 }}>
                            {activeEntry.diffState === 'deleted' ? '新版本已删除' : stringifyStable(activeEntry.value)}
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
                        {stringifyStable(activeEntry.value)}
                      </Typography>
                    )}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">{detail ? '没有可预览内容' : '正在加载详情...'}</Typography>
                )}
              </Paper>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={actionLoading}>关闭</Button>
          <Button color="warning" onClick={() => void decide('archived')} disabled={actionLoading}>下架</Button>
          <Button color="error" onClick={() => void decide('rejected')} disabled={actionLoading}>拒绝</Button>
          <Button variant="contained" color="success" onClick={() => void decide('approved')} disabled={actionLoading}>通过</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={defaultDialogOpen} onClose={() => defaultCreating ? undefined : setDefaultDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>创建默认市场预设</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              将直接创建或更新一组已通过的默认市场预设，包括角色模板、普通群聊模板、故事房模板，以及对应的组合包。
            </Typography>
            <Alert severity="info">
              这些预设会以“系统默认市场”为作者进入公开市场；再次点击会同步更新已有默认预设，不会重复创建同一批条目。
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDefaultDialogOpen(false)} disabled={defaultCreating}>取消</Button>
          <Button variant="contained" onClick={() => void createDefaults()} disabled={defaultCreating}>
            {defaultCreating ? '创建中' : '确认创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
