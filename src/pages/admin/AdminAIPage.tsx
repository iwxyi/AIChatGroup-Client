import { useEffect, useMemo, useState } from 'react';
import { Button, Chip, Dialog, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AdminInlineGroup from '../../components/admin/AdminInlineGroup';
import AdminResponsiveTable from '../../components/admin/AdminResponsiveTable';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { adminApi } from '../../services/adminApi';

type BalanceState = {
  loading: boolean;
  value: string;
  error: string | null;
};

function providerSortWeight(item: Record<string, unknown>) {
  const code = String(item.code || '');
  if (code === 'api2d') return 100;
  if (String(item.status || '') === 'active') return 0;
  return 50;
}

function sortProviders(items: Array<Record<string, unknown>>) {
  return items.slice().sort((left, right) => {
    const leftWeight = providerSortWeight(left);
    const rightWeight = providerSortWeight(right);
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return String(left.code || '').localeCompare(String(right.code || ''), 'zh-CN');
  });
}

function formatBalance(result: Record<string, unknown>) {
  const value = Number(result.availableBalance ?? result.available_balance ?? result.balance);
  if (!Number.isFinite(value)) return '未知';
  const unit = String(result.currencyUnit ?? result.currency_unit ?? '').trim();
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  if (unit === 'CNY') return `¥${text}`;
  if (unit === 'moacode_balance') return `${text}`;
  if (unit === 'provider_balance') return `${text}`;
  return unit ? `${text} ${unit}` : text;
}

function ProviderTable({
  items,
  balances,
  onOpen,
}: {
  items: Array<Record<string, unknown>>;
  balances: Record<string, BalanceState>;
  onOpen: (providerCode: string) => void;
}) {
  return (
    <AdminResponsiveTable minWidth={760}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Code</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>AI 调用地址</TableCell>
            <TableCell>余额</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const code = String(item.code || '');
            const balance = balances[code];
            return (
              <TableRow
                key={String(item.id)}
                hover
                onClick={() => onOpen(code)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{code}</TableCell>
                <TableCell>{String(item.name || '')}</TableCell>
                <TableCell>{String(item.base_url || '')}</TableCell>
                <TableCell>
                  {balance?.loading ? (
                    <Typography variant="body2" color="text.secondary">查询中</Typography>
                  ) : balance?.error ? (
                    <Typography variant="body2" color="error.main">{balance.error}</Typography>
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{balance?.value || '-'}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={String(item.status || '') === 'active' ? '启用' : '停用'}
                    color={String(item.status || '') === 'active' ? 'success' : 'default'}
                    sx={{ height: 22 }}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </AdminResponsiveTable>
  );
}

export default function AdminAIPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [globalDialogOpen, setGlobalDialogOpen] = useState(false);
  const [globalForm, setGlobalForm] = useState({
    defaultProvisionEnabled: false,
    defaultGrantAmount: '',
    defaultDailyQuota: '',
    defaultMonthlyQuota: '',
    defaultPlanCode: 'default',
  });
  const [loading, setLoading] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const providerStats = useMemo(() => ({
    active: items.filter((item) => String(item.status || '') === 'active').length,
    disabled: items.filter((item) => String(item.status || '') !== 'active').length,
  }), [items]);

  const loadProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getAiProviders();
      const nextItems = sortProviders(result.items || []);
      setItems(nextItems);
      setBalances(Object.fromEntries(nextItems.map((item) => [String(item.code || ''), { loading: true, value: '', error: null }])));
      void Promise.all(nextItems.map(async (item) => {
        const code = String(item.code || '');
        if (!code) return;
        try {
          const balance = await adminApi.getAiProviderAccountBalance(code);
          setBalances((prev) => ({ ...prev, [code]: { loading: false, value: formatBalance(balance), error: null } }));
        } catch (balanceError) {
          setBalances((prev) => ({ ...prev, [code]: { loading: false, value: '', error: getAdminErrorMessage(balanceError) } }));
        }
      }));
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  const loadGlobalConfig = async () => {
    setGlobalLoading(true);
    setGlobalError(null);
    try {
      const result = await adminApi.getPlatformGlobalConfig();
      const ai = result.ai || {};
      setGlobalForm({
        defaultProvisionEnabled: Boolean(ai.defaultProvisionEnabled),
        defaultGrantAmount: ai.defaultGrantAmount == null ? '' : String(ai.defaultGrantAmount),
        defaultDailyQuota: ai.defaultDailyQuota == null ? '' : String(ai.defaultDailyQuota),
        defaultMonthlyQuota: ai.defaultMonthlyQuota == null ? '' : String(ai.defaultMonthlyQuota),
        defaultPlanCode: ai.defaultPlanCode == null ? '' : String(ai.defaultPlanCode),
      });
    } catch (loadError) {
      setGlobalError(getAdminErrorMessage(loadError));
    } finally {
      setGlobalLoading(false);
    }
  };

  const openGlobalDialog = () => {
    setGlobalDialogOpen(true);
    void loadGlobalConfig();
  };

  const saveGlobalConfig = async () => {
    setGlobalSaving(true);
    setGlobalError(null);
    try {
      await adminApi.updatePlatformGlobalConfig({
        ai: {
          defaultProvisionEnabled: globalForm.defaultProvisionEnabled,
          defaultGrantAmount: globalForm.defaultGrantAmount ? Number(globalForm.defaultGrantAmount) : 0,
          defaultDailyQuota: globalForm.defaultDailyQuota ? Number(globalForm.defaultDailyQuota) : 0,
          defaultMonthlyQuota: globalForm.defaultMonthlyQuota ? Number(globalForm.defaultMonthlyQuota) : 0,
          defaultPlanCode: globalForm.defaultPlanCode.trim() || null,
        },
      });
      setGlobalDialogOpen(false);
      await loadProviders();
    } catch (saveError) {
      setGlobalError(getAdminErrorMessage(saveError));
    } finally {
      setGlobalSaving(false);
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  return (
    <Stack spacing={2}>
      <AdminInlineGroup>
        <Paper
          variant="outlined"
          sx={{
            px: 1.25,
            py: 0.75,
            borderRadius: 1.5,
            minWidth: 120,
            borderColor: 'success.light',
            bgcolor: 'success.light',
            color: 'success.contrastText',
          }}
        >
          <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.82 }}>启用 Provider</Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25 }}>{providerStats.active}</Typography>
        </Paper>
        <Paper
          variant="outlined"
          sx={{
            px: 1.25,
            py: 0.75,
            borderRadius: 1.5,
            minWidth: 120,
            borderColor: 'warning.light',
            bgcolor: 'warning.light',
            color: 'warning.contrastText',
          }}
        >
          <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.82 }}>停用 Provider</Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25 }}>{providerStats.disabled}</Typography>
        </Paper>
        <Button variant="outlined" onClick={openGlobalDialog} sx={{ ml: 'auto' }}>全局配置</Button>
      </AdminInlineGroup>
      <AdminRequestState loading={loading} error={error} onRetry={() => void loadProviders()} />
      <ProviderTable items={items} balances={balances} onOpen={(providerCode) => navigate(`/admin/platform/ai/providers/${encodeURIComponent(providerCode)}`)} />
      <Dialog open={globalDialogOpen} onClose={() => setGlobalDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>AI 全局配置</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <AdminRequestState loading={globalLoading} error={globalError} onRetry={() => void loadGlobalConfig()} />
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>新用户默认分配额度</Typography>
                <FormControlLabel
                  control={<Switch checked={globalForm.defaultProvisionEnabled} onChange={(event) => setGlobalForm((prev) => ({ ...prev, defaultProvisionEnabled: event.target.checked }))} />}
                  label="新用户注册后自动开通默认 AI 权益并分配额度"
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <TextField label="默认点数" value={globalForm.defaultGrantAmount} onChange={(event) => setGlobalForm((prev) => ({ ...prev, defaultGrantAmount: event.target.value }))} fullWidth />
                  <TextField label="每日额度" value={globalForm.defaultDailyQuota} onChange={(event) => setGlobalForm((prev) => ({ ...prev, defaultDailyQuota: event.target.value }))} fullWidth />
                  <TextField label="每月额度" value={globalForm.defaultMonthlyQuota} onChange={(event) => setGlobalForm((prev) => ({ ...prev, defaultMonthlyQuota: event.target.value }))} fullWidth />
                </Stack>
                <TextField label="默认计划编码" value={globalForm.defaultPlanCode} onChange={(event) => setGlobalForm((prev) => ({ ...prev, defaultPlanCode: event.target.value }))} fullWidth />
              </Stack>
            </Paper>
            <Button variant="contained" disabled={globalSaving || globalLoading} onClick={() => void saveGlobalConfig()}>保存全局配置</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
