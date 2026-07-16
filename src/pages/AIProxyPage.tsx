import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Collapse,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import PowerIcon from '@mui/icons-material/PowerSettingsNew';
import VpnKeyIcon from '@mui/icons-material/VpnKeyOutlined';
import { useLayoutHeaderActions } from '../components/layout/AppLayoutContext';
import AppSnackbar from '../components/common/AppSnackbar';
import PageSection from '../components/common/PageSection';
import SurfaceCard from '../components/common/SurfaceCard';
import { api, type AiProxyKeyItem, type AiProxyUsageGroupItem, type AiProxyUsageRecordItem } from '../services/api';
import { copyTextToClipboard } from '../utils/clipboard';
import { formatAiBalanceAmount, formatAiAmount } from '../utils/aiPoints';

type NewKeyDialogState = {
  open: boolean;
  name: string;
  dailyQuota: string;
  monthlyQuota: string;
  rpmLimit: string;
  allowedModels: string[];
  rawKey: string;
};

type EditKeyDialogState = {
  open: boolean;
  keyId: string;
  name: string;
  dailyQuota: string;
  monthlyQuota: string;
  rpmLimit: string;
  allowedModels: string[];
  status: string;
  rawKey: string;
};

const initialDialog: NewKeyDialogState = {
  open: false,
  name: '',
  dailyQuota: '',
  monthlyQuota: '',
  rpmLimit: '60',
  allowedModels: [],
  rawKey: '',
};

const initialEditDialog: EditKeyDialogState = {
  open: false,
  keyId: '',
  name: '',
  dailyQuota: '',
  monthlyQuota: '',
  rpmLimit: '',
  allowedModels: [],
  status: 'active',
  rawKey: '',
};

const USAGE_PAGE_SIZE = 10;
type QuickSetupTarget = 'codex' | 'claude' | 'deepseek';

function formatDateTime(value: number | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatNumber(value: unknown, digits = 2) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(digits).replace(/\.?0+$/, '') : '0';
}

function parseOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeModelList(value: string[]) {
  const models = value.map((item) => item.trim()).filter(Boolean);
  return models.length ? Array.from(new Set(models)) : null;
}

function getSummaryAmount(summary: Record<string, unknown> | null, scope: 'today' | 'month' | 'total') {
  const record = summary?.[scope];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 0;
  return Number((record as Record<string, unknown>).chargedAmount || 0);
}

function StatusChip({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <Chip
      size="small"
      color={active ? 'success' : 'default'}
      label={active ? '启用' : '停用'}
      variant={active ? 'filled' : 'outlined'}
    />
  );
}

function getAiProxyBaseUrl() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function buildCurlExamples(apiKey: string, baseUrl: string, model: string) {
  const auth = apiKey || 'pn_xxx';
  return [
    {
      label: 'OpenAI Chat',
      code: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${auth}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"你好"}]}'`,
    },
    {
      label: 'OpenAI Responses',
      code: `curl ${baseUrl}/v1/responses \\
  -H "Authorization: Bearer ${auth}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","input":"写一个一句话简介"}'`,
    },
    {
      label: 'Anthropic Messages',
      code: `curl ${baseUrl}/anthropic/v1/messages \\
  -H "Authorization: Bearer ${auth}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","max_tokens":256,"messages":[{"role":"user","content":"你好"}]}'`,
    },
    {
      label: 'Web Search',
      code: `curl ${baseUrl}/web_search \\
  -H "Authorization: Bearer ${auth}" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"最新世界杯消息","summary":true,"freshness":"noLimit","count":10}'`,
    },
  ];
}

function maskApiKey(value: string) {
  if (!value) return 'pn_xxx';
  if (value.includes('...')) return value;
  if (value.length <= 14) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function quotePowerShell(value: string) {
  return value.replace(/`/g, '``').replace(/"/g, '`"');
}

function quickSetupLines(target: QuickSetupTarget, baseUrl: string, apiKey: string, platform: 'posix' | 'windows') {
  const value = (key: string, raw: string) => platform === 'windows'
    ? `$env:${key}="${quotePowerShell(raw)}"`
    : `export ${key}=${raw}`;
  const comment = (text: string) => platform === 'windows' ? `# ${text}` : `# ${text}`;
  if (target === 'claude') {
    return [
      value('ANTHROPIC_BASE_URL', baseUrl),
      value('ANTHROPIC_AUTH_TOKEN', apiKey),
      comment('关闭非必要流量，提升访问速度'),
      value('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'),
    ].join('\n');
  }
  if (target === 'codex') {
    return [
      value('OPENAI_BASE_URL', baseUrl),
      value('OPENAI_API_KEY', apiKey),
    ].join('\n');
  }
  return [
    value('DEEPSEEK_BASE_URL', baseUrl),
    value('DEEPSEEK_API_KEY', apiKey),
    value('DEEPSEEK_MODEL', 'deepseek-chat'),
  ].join('\n');
}

function quickSetupLabel(target: QuickSetupTarget) {
  if (target === 'codex') return 'Codex';
  if (target === 'claude') return 'Claude';
  return 'DeepSeek';
}

export default function AIProxyPage() {
  const { setHeaderTitle, setHeaderActions } = useLayoutHeaderActions();
  const [keys, setKeys] = useState<AiProxyKeyItem[]>([]);
  const [balance, setBalance] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [records, setRecords] = useState<AiProxyUsageRecordItem[]>([]);
  const [daily, setDaily] = useState<AiProxyUsageGroupItem[]>([]);
  const [monthly, setMonthly] = useState<AiProxyUsageGroupItem[]>([]);
  const [recordsPage, setRecordsPage] = useState(0);
  const [dailyPage, setDailyPage] = useState(0);
  const [monthlyPage, setMonthlyPage] = useState(0);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<NewKeyDialogState>(initialDialog);
  const [editDialog, setEditDialog] = useState<EditKeyDialogState>(initialEditDialog);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [quickSetupTarget, setQuickSetupTarget] = useState<QuickSetupTarget>('codex');
  const [quickSetupPreviewPlatform, setQuickSetupPreviewPlatform] = useState<'posix' | 'windows'>('posix');
  const [quickSetupRawKey, setQuickSetupRawKey] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'success' });

  const selectedKeyName = useMemo(() => keys.find((item) => item.id === selectedKeyId)?.name || '全部 Key', [keys, selectedKeyId]);
  const sampleKey = keys[0]?.keyMask || '';
  const proxyBaseUrl = useMemo(() => getAiProxyBaseUrl(), []);
  const displayApiKey = quickSetupRawKey ? maskApiKey(quickSetupRawKey) : (sampleKey || 'pn_xxx');
  const quickSetupCopyKey = quickSetupRawKey || displayApiKey;
  const quickSetupDisplayCode = useMemo(
    () => quickSetupLines(quickSetupTarget, proxyBaseUrl, displayApiKey, quickSetupPreviewPlatform),
    [displayApiKey, proxyBaseUrl, quickSetupPreviewPlatform, quickSetupTarget],
  );
  const quickSetupPosixCode = useMemo(
    () => quickSetupLines(quickSetupTarget, proxyBaseUrl, quickSetupCopyKey, 'posix'),
    [proxyBaseUrl, quickSetupCopyKey, quickSetupTarget],
  );
  const quickSetupWindowsCode = useMemo(
    () => quickSetupLines(quickSetupTarget, proxyBaseUrl, quickSetupCopyKey, 'windows'),
    [proxyBaseUrl, quickSetupCopyKey, quickSetupTarget],
  );
  const exampleModel = keys[0]?.allowedModels?.[0] || modelOptions[0] || 'deepseek-chat';
  const curlDisplayExamples = useMemo(() => buildCurlExamples(displayApiKey, proxyBaseUrl, exampleModel), [displayApiKey, exampleModel, proxyBaseUrl]);
  const curlCopyExamples = useMemo(() => buildCurlExamples(quickSetupCopyKey, proxyBaseUrl, exampleModel), [exampleModel, proxyBaseUrl, quickSetupCopyKey]);
  const endpointList = useMemo(() => [
    `${proxyBaseUrl}/v1/models`,
    `${proxyBaseUrl}/v1/chat/completions`,
    `${proxyBaseUrl}/v1/responses`,
    `${proxyBaseUrl}/anthropic/v1/messages`,
    `${proxyBaseUrl}/v1/embeddings`,
    `${proxyBaseUrl}/v1/images/generations`,
    `${proxyBaseUrl}/web_search`,
  ], [proxyBaseUrl]);
  const allowedModelOptions = useMemo(() => {
    const values = [
      ...modelOptions,
      ...dialog.allowedModels,
      ...editDialog.allowedModels,
      ...keys.flatMap((key) => key.allowedModels || []),
    ].map((item) => item.trim()).filter(Boolean);
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
  }, [dialog.allowedModels, editDialog.allowedModels, keys, modelOptions]);
  const canCreateKey = dialog.name.trim().length > 0;
  const canSaveKey = editDialog.name.trim().length > 0;

  const handleSelectKey = useCallback((keyId: string) => {
    setSelectedKeyId(keyId);
    setRecordsPage(0);
    setDailyPage(0);
    setMonthlyPage(0);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [keyResult, balanceResult, summaryResult, recordResult, dailyResult, monthlyResult] = await Promise.all([
        api.getAiProxyKeys(),
        api.getAiProxyBalance(),
        api.getAiProxyUsageSummary(),
        api.getAiProxyUsageRecords({ keyId: selectedKeyId || null, page: recordsPage + 1, limit: USAGE_PAGE_SIZE }),
        api.getAiProxyUsageGroups('daily', { keyId: selectedKeyId || null, page: dailyPage + 1, limit: USAGE_PAGE_SIZE }),
        api.getAiProxyUsageGroups('monthly', { keyId: selectedKeyId || null, page: monthlyPage + 1, limit: USAGE_PAGE_SIZE }),
      ]);
      setKeys(keyResult.items);
      setBalance(balanceResult);
      setSummary(summaryResult);
      setRecords(recordResult.items);
      setDaily(dailyResult.items);
      setMonthly(monthlyResult.items);
      setRecordsTotal(recordResult.total || recordResult.items.length);
      setDailyTotal(dailyResult.total || dailyResult.items.length);
      setMonthlyTotal(monthlyResult.total || monthlyResult.items.length);
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : '加载中转数据失败', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [dailyPage, monthlyPage, recordsPage, selectedKeyId]);

  useEffect(() => {
    setHeaderTitle('中转');
    setHeaderActions(
      <Button size="small" startIcon={<RefreshIcon />} onClick={() => void loadData()}>
        刷新
      </Button>,
    );
    return () => {
      setHeaderTitle(null);
      setHeaderActions(null);
    };
  }, [loadData, setHeaderActions, setHeaderTitle]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      try {
        const result = await api.getOfficialAiModels();
        if (cancelled) return;
        setModelOptions(Array.from(new Set((result.items || []).map((item) => item.id || item.label || '').filter(Boolean))).sort());
      } catch {
        if (!cancelled) setModelOptions([]);
      }
    };
    void loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateKey = async () => {
    if (!canCreateKey) {
      setSnackbar({ open: true, message: '请填写 Key 名称', severity: 'error' });
      return;
    }
    try {
      const result = await api.createAiProxyKey({
        name: dialog.name.trim(),
        dailyQuota: parseOptionalNumber(dialog.dailyQuota),
        monthlyQuota: parseOptionalNumber(dialog.monthlyQuota),
        rpmLimit: parseOptionalNumber(dialog.rpmLimit),
        allowedModels: normalizeModelList(dialog.allowedModels),
      });
      setQuickSetupRawKey(result.rawKey);
      setDialog((prev) => ({ ...prev, rawKey: result.rawKey }));
      await loadData();
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : '创建 Key 失败', severity: 'error' });
    }
  };

  const copyText = async (value: string, options: { maskedKey?: boolean } = {}) => {
    const copied = await copyTextToClipboard(value);
    if (!copied) {
      setSnackbar({ open: true, message: '复制失败，请手动复制', severity: 'error' });
      return;
    }
    setSnackbar({
      open: true,
      message: options.maskedKey ? '已复制脱敏示例，使用前请替换为真实 Key' : '已复制',
      severity: options.maskedKey ? 'info' : 'success',
    });
  };

  const openEditKey = (key: AiProxyKeyItem) => {
    setEditDialog({
      open: true,
      keyId: key.id,
      name: key.name,
      dailyQuota: key.dailyQuota == null ? '' : String(key.dailyQuota),
      monthlyQuota: key.monthlyQuota == null ? '' : String(key.monthlyQuota),
      rpmLimit: key.rpmLimit == null ? '' : String(key.rpmLimit),
      allowedModels: key.allowedModels || [],
      status: key.status,
      rawKey: '',
    });
  };

  const saveEditKey = async () => {
    if (!canSaveKey) {
      setSnackbar({ open: true, message: '请填写 Key 名称', severity: 'error' });
      return;
    }
    try {
      await api.updateAiProxyKey(editDialog.keyId, {
        name: editDialog.name.trim(),
        status: editDialog.status,
        dailyQuota: parseOptionalNumber(editDialog.dailyQuota),
        monthlyQuota: parseOptionalNumber(editDialog.monthlyQuota),
        rpmLimit: parseOptionalNumber(editDialog.rpmLimit),
        allowedModels: normalizeModelList(editDialog.allowedModels),
      });
      setEditDialog(initialEditDialog);
      await loadData();
      setSnackbar({ open: true, message: 'Key 已更新', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : '保存 Key 失败', severity: 'error' });
    }
  };

  const toggleEditKey = async () => {
    const nextStatus = editDialog.status === 'active' ? 'disabled' : 'active';
    try {
      await api.updateAiProxyKey(editDialog.keyId, { status: nextStatus });
      setEditDialog((prev) => ({ ...prev, status: nextStatus }));
      await loadData();
      setSnackbar({ open: true, message: nextStatus === 'active' ? 'Key 已启用' : 'Key 已停用', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : '更新 Key 失败', severity: 'error' });
    }
  };

  const rotateEditKey = async () => {
    try {
      const result = await api.rotateAiProxyKey(editDialog.keyId);
      setQuickSetupRawKey(result.rawKey);
      setEditDialog((prev) => ({ ...prev, status: result.key.status, rawKey: result.rawKey }));
      await loadData();
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : '轮换 Key 失败', severity: 'error' });
    }
  };

  const deleteKey = async (key: AiProxyKeyItem) => {
    try {
      await api.deleteAiProxyKey(key.id);
      if (selectedKeyId === key.id) handleSelectKey('');
      await loadData();
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : '删除 Key 失败', severity: 'error' });
    }
  };

  return (
    <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: { xs: 1.5, sm: 2 }, maxWidth: 1280, mx: 'auto' }}>
      <PageSection spacing={2}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
          {[
            { label: '当前 AI 点数', value: formatAiBalanceAmount(balance, undefined, { empty: loading ? '加载中' : '-' }) },
            { label: '今日 API 消耗', value: `${formatNumber(getSummaryAmount(summary, 'today'))} P` },
            { label: '本月 API 消耗', value: `${formatNumber(getSummaryAmount(summary, 'month'))} P` },
            { label: '活跃 Key', value: String(summary?.activeKeyCount ?? keys.filter((item) => item.status === 'active').length) },
          ].map((item) => (
            <Box key={item.label}>
              <SurfaceCard contentSx={{ py: 1.6 }}>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>{item.value}</Typography>
              </SurfaceCard>
            </Box>
          ))}
        </Box>

        <SurfaceCard>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>API Key</Typography>
              <Box
                role="button"
                tabIndex={0}
                onClick={() => void copyText(proxyBaseUrl)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') void copyText(proxyBaseUrl);
                }}
                sx={{
                  mt: 0.5,
                  color: 'primary.main',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  overflowWrap: 'anywhere',
                  cursor: 'pointer',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {proxyBaseUrl}
              </Box>
            </Box>
            <Button size="small" startIcon={<AddIcon />} variant="contained" sx={{ flexShrink: 0, mt: 0.25 }} onClick={() => setDialog({ ...initialDialog, open: true })}>
              新建 Key
            </Button>
          </Stack>
          <TableContainer sx={{ mt: 1.5 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell>Key</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>模型限制</TableCell>
                  <TableCell align="right">今日</TableCell>
                  <TableCell align="right">本月</TableCell>
                  <TableCell>最后使用</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id} hover selected={selectedKeyId === key.id} onClick={() => handleSelectKey(key.id)}>
                    <TableCell>{key.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{key.keyMask}</TableCell>
                    <TableCell><StatusChip status={key.status} /></TableCell>
                    <TableCell>{key.allowedModels?.length ? `${key.allowedModels.length} 个模型` : '跟随账号'}</TableCell>
                    <TableCell align="right">{formatAiAmount(key.usage?.todayChargedAmount || 0, 'moacode')}</TableCell>
                    <TableCell align="right">{formatAiAmount(key.usage?.monthChargedAmount || 0, 'moacode')}</TableCell>
                    <TableCell>{formatDateTime(key.lastUsedAt || key.usage?.lastUsedAt)}</TableCell>
                    <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                      <Tooltip title="编辑"><IconButton size="small" onClick={() => openEditKey(key)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="删除"><IconButton size="small" color="error" onClick={() => void deleteKey(key)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {!keys.length && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Alert severity="info" icon={<VpnKeyIcon />}>还没有 API Key。</Alert>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SurfaceCard>

        <SurfaceCard>
          <Stack spacing={1.25}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>快速设置</Typography>
            </Box>
            {!quickSetupRawKey ? (
              <Alert severity="info">真实 Key 只在新建或轮换后显示一次；当前脚本会使用已有 Key 的脱敏值。</Alert>
            ) : null}
            <Tabs
              value={quickSetupTarget}
              onChange={(_event, value) => setQuickSetupTarget(value)}
              variant="scrollable"
              allowScrollButtonsMobile
            >
              {(['codex', 'claude', 'deepseek'] as QuickSetupTarget[]).map((target) => (
                <Tab key={target} value={target} label={quickSetupLabel(target)} />
              ))}
            </Tabs>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.25,
                maxHeight: 260,
                overflowX: 'auto',
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                bgcolor: 'action.hover',
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              {quickSetupDisplayCode}
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                startIcon={<ContentCopyIcon />}
                onMouseEnter={() => setQuickSetupPreviewPlatform('posix')}
                onFocus={() => setQuickSetupPreviewPlatform('posix')}
                onClick={() => void copyText(quickSetupPosixCode, { maskedKey: !quickSetupRawKey })}
              >
                复制 Linux/MacOS
              </Button>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onMouseEnter={() => setQuickSetupPreviewPlatform('windows')}
                onFocus={() => setQuickSetupPreviewPlatform('windows')}
                onClick={() => void copyText(quickSetupWindowsCode, { maskedKey: !quickSetupRawKey })}
              >
                复制 Windows PowerShell
              </Button>
            </Stack>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>调用示例</Typography>
              <Typography variant="body2" color="text.secondary">示例里的 Key 使用脱敏值占位，真实 Key 只在创建或轮换后显示一次。</Typography>
            </Box>
            <Button
              size="small"
              endIcon={<ExpandMoreIcon sx={{ transform: examplesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }} />}
              onClick={() => setExamplesOpen((prev) => !prev)}
            >
              {examplesOpen ? '收起' : '展开'}
            </Button>
          </Stack>
          <Collapse in={examplesOpen} unmountOnExit>
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                {endpointList.map((endpoint) => (
                  <Box
                    key={endpoint}
                    role="button"
                    tabIndex={0}
                    onClick={() => void copyText(endpoint)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') void copyText(endpoint);
                    }}
                    sx={{
                      px: 1,
                      py: 0.75,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      overflowWrap: 'anywhere',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.selected' },
                    }}
                  >
                    {endpoint}
                  </Box>
                ))}
              </Box>
              {curlDisplayExamples.map((example, index) => (
                <Box key={example.label} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                  <Stack direction="row" sx={{ px: 1.25, py: 0.75, alignItems: 'center', justifyContent: 'space-between', bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{example.label}</Typography>
                    <Tooltip title="复制示例">
                      <IconButton size="small" onClick={() => void copyText(curlCopyExamples[index]?.code || example.code, { maskedKey: !quickSetupRawKey })}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Box
                    component="pre"
                    role="button"
                    tabIndex={0}
                    onClick={() => void copyText(curlCopyExamples[index]?.code || example.code, { maskedKey: !quickSetupRawKey })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') void copyText(curlCopyExamples[index]?.code || example.code, { maskedKey: !quickSetupRawKey });
                    }}
                    sx={{ m: 0, p: 1.25, overflowX: 'auto', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', cursor: 'pointer' }}
                  >
                    {example.code}
                  </Box>
                </Box>
              ))}
            </Stack>
          </Collapse>
        </SurfaceCard>

        <SurfaceCard>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>用量</Typography>
              <Typography variant="body2" color="text.secondary">当前筛选：{selectedKeyName}</Typography>
            </Box>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Key</InputLabel>
              <Select label="Key" value={selectedKeyId} onChange={(event) => handleSelectKey(event.target.value)}>
                <MenuItem value="">全部 Key</MenuItem>
                {keys.map((key) => <MenuItem key={key.id} value={key.id}>{key.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>消耗记录</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>时间</TableCell>
                  <TableCell>模型</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                  <TableCell align="right">扣点</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell>{item.model || '-'}</TableCell>
                    <TableCell>{item.status === 'success' ? '成功' : '失败'}</TableCell>
                    <TableCell align="right">{item.totalTokens || 0}</TableCell>
                    <TableCell align="right">{formatNumber(item.chargedAmount)} P</TableCell>
                  </TableRow>
                ))}
                {!records.length && <TableRow><TableCell colSpan={5}>暂无记录</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={recordsTotal}
            page={recordsPage}
            rowsPerPage={USAGE_PAGE_SIZE}
            rowsPerPageOptions={[USAGE_PAGE_SIZE]}
            onPageChange={(_event, page) => setRecordsPage(page)}
            labelRowsPerPage="每页"
          />
        </SurfaceCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <SurfaceCard>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>每日统计</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>日期</TableCell>
                    <TableCell align="right">请求</TableCell>
                    <TableCell align="right">Tokens</TableCell>
                    <TableCell align="right">扣点</TableCell>
                    <TableCell>最近使用</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {daily.map((item) => (
                    <TableRow key={item.groupKey}>
                      <TableCell>{item.groupKey}</TableCell>
                      <TableCell align="right">{item.requestCount}</TableCell>
                      <TableCell align="right">{item.totalTokens || 0}</TableCell>
                      <TableCell align="right">{formatNumber(item.chargedAmount)} P</TableCell>
                      <TableCell>{formatDateTime(item.lastUsedAt)}</TableCell>
                    </TableRow>
                  ))}
                  {!daily.length && <TableRow><TableCell colSpan={5}>暂无每日统计</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={dailyTotal}
              page={dailyPage}
              rowsPerPage={USAGE_PAGE_SIZE}
              rowsPerPageOptions={[USAGE_PAGE_SIZE]}
              onPageChange={(_event, page) => setDailyPage(page)}
              labelRowsPerPage="每页"
            />
          </SurfaceCard>

          <SurfaceCard>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>每月统计</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>月份</TableCell>
                    <TableCell align="right">请求</TableCell>
                    <TableCell align="right">Tokens</TableCell>
                    <TableCell align="right">扣点</TableCell>
                    <TableCell>最近使用</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {monthly.map((item) => (
                    <TableRow key={item.groupKey}>
                      <TableCell>{item.groupKey}</TableCell>
                      <TableCell align="right">{item.requestCount}</TableCell>
                      <TableCell align="right">{item.totalTokens || 0}</TableCell>
                      <TableCell align="right">{formatNumber(item.chargedAmount)} P</TableCell>
                      <TableCell>{formatDateTime(item.lastUsedAt)}</TableCell>
                    </TableRow>
                  ))}
                  {!monthly.length && <TableRow><TableCell colSpan={5}>暂无每月统计</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={monthlyTotal}
              page={monthlyPage}
              rowsPerPage={USAGE_PAGE_SIZE}
              rowsPerPageOptions={[USAGE_PAGE_SIZE]}
              onPageChange={(_event, page) => setMonthlyPage(page)}
              labelRowsPerPage="每页"
            />
          </SurfaceCard>
        </Box>
      </PageSection>

      <Dialog open={dialog.open} onClose={() => setDialog(initialDialog)} fullWidth maxWidth="sm">
        <DialogTitle>{dialog.rawKey ? '保存新 Key' : '新建 API Key'}</DialogTitle>
        <DialogContent>
          {dialog.rawKey ? (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <Alert severity="warning">明文 Key 只显示一次，关闭后无法再次查看。</Alert>
              <TextField value={dialog.rawKey} fullWidth slotProps={{ input: { readOnly: true, endAdornment: <IconButton onClick={() => void copyText(dialog.rawKey)}><ContentCopyIcon /></IconButton> } }} />
            </Stack>
          ) : (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField
                label="名称"
                required
                value={dialog.name}
                onChange={(event) => setDialog((prev) => ({ ...prev, name: event.target.value }))}
                fullWidth
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField label="每日限额 P" value={dialog.dailyQuota} onChange={(event) => setDialog((prev) => ({ ...prev, dailyQuota: event.target.value }))} fullWidth />
                <TextField label="每月限额 P" value={dialog.monthlyQuota} onChange={(event) => setDialog((prev) => ({ ...prev, monthlyQuota: event.target.value }))} fullWidth />
                <TextField label="RPM" value={dialog.rpmLimit} onChange={(event) => setDialog((prev) => ({ ...prev, rpmLimit: event.target.value }))} fullWidth />
              </Stack>
              <Autocomplete
                multiple
                options={allowedModelOptions}
                value={dialog.allowedModels}
                onChange={(_event, value) => setDialog((prev) => ({ ...prev, allowedModels: value }))}
                renderInput={(params) => (
                  <TextField {...params} label="允许模型" placeholder="留空表示跟随账号" helperText="不选择时跟随账号可用模型" />
                )}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(initialDialog)}>关闭</Button>
          {!dialog.rawKey && <Button variant="contained" disabled={!canCreateKey} onClick={() => void handleCreateKey()}>创建</Button>}
        </DialogActions>
      </Dialog>

      <Dialog open={editDialog.open} onClose={() => setEditDialog(initialEditDialog)} fullWidth maxWidth="sm">
        <DialogTitle>编辑 API Key</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {editDialog.rawKey && (
              <Alert severity="warning">
                明文 Key 只显示一次：
                <Box
                  component="span"
                  role="button"
                  tabIndex={0}
                  onClick={() => void copyText(editDialog.rawKey)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') void copyText(editDialog.rawKey);
                  }}
                  sx={{ ml: 0.75, fontFamily: 'monospace', overflowWrap: 'anywhere', cursor: 'pointer' }}
                >
                  {editDialog.rawKey}
                </Box>
              </Alert>
            )}
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <StatusChip status={editDialog.status} />
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<PowerIcon />} onClick={() => void toggleEditKey()}>
                  {editDialog.status === 'active' ? '停用' : '启用'}
                </Button>
                <Button size="small" startIcon={<RefreshIcon />} onClick={() => void rotateEditKey()}>
                  轮换
                </Button>
              </Stack>
            </Stack>
            <TextField
              label="名称"
              required
              value={editDialog.name}
              onChange={(event) => setEditDialog((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField label="每日限额 P" value={editDialog.dailyQuota} onChange={(event) => setEditDialog((prev) => ({ ...prev, dailyQuota: event.target.value }))} fullWidth />
              <TextField label="每月限额 P" value={editDialog.monthlyQuota} onChange={(event) => setEditDialog((prev) => ({ ...prev, monthlyQuota: event.target.value }))} fullWidth />
              <TextField label="RPM" value={editDialog.rpmLimit} onChange={(event) => setEditDialog((prev) => ({ ...prev, rpmLimit: event.target.value }))} fullWidth />
            </Stack>
            <Autocomplete
              multiple
              options={allowedModelOptions}
              value={editDialog.allowedModels}
              onChange={(_event, value) => setEditDialog((prev) => ({ ...prev, allowedModels: value }))}
              renderInput={(params) => (
                <TextField {...params} label="允许模型" placeholder="留空表示跟随账号" helperText="不选择时跟随账号可用模型" />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(initialEditDialog)}>取消</Button>
          <Button variant="contained" disabled={!canSaveKey} onClick={() => void saveEditKey()}>保存</Button>
        </DialogActions>
      </Dialog>

      <AppSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
