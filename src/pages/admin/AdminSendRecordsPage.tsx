import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { Alert, Button, Chip, Stack, Tab, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminMetricGrid, AdminSection, AdminTableFrame, type AdminMetricItem } from '../../components/admin/AdminSurface';
import { adminApi } from '../../services/adminApi';
import { readPersistentUiValue, writePersistentUiValue } from '../../utils/persistentUiState';

type RecordTab = 'sms' | 'email';
const SEND_RECORDS_TAB_STORAGE_KEY = 'admin.sendRecords.tab';

function isRecordTab(value: unknown): value is RecordTab {
  return value === 'sms' || value === 'email';
}

function formatTime(value: unknown) {
  const timestamp = Number(value || 0);
  return timestamp ? new Date(timestamp).toLocaleString() : '-';
}

function statusLabel(value: unknown) {
  const status = String(value || '');
  if (status === 'sent') return '已发送';
  if (status === 'failed') return '失败';
  return status || '-';
}

function sourceLabel(row: Record<string, unknown>) {
  const source = String(row.source || '');
  const purpose = String(row.purpose || '');
  if (source === 'auth_verification') {
    if (purpose === 'change-phone') return '换绑手机号验证码';
    if (purpose === 'register') return '注册验证码';
    if (purpose === 'forgot-password') return '找回密码验证码';
    return '登录验证码';
  }
  if (source === 'notification_job') return '通知任务';
  if (source === 'integration_test') return '配置测试';
  return source || purpose || '-';
}

function errorTooltip(row: Record<string, unknown>) {
  const parts = [row.error_message, row.error_detail]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join('\n') : '失败详情为空';
}

function StatusChip({ row }: { row: Record<string, unknown> }) {
  const failed = String(row.status || '') === 'failed';
  const chip = (
    <Chip
      size="small"
      color={failed ? 'error' : 'success'}
      variant={failed ? 'filled' : 'outlined'}
      label={statusLabel(row.status)}
    />
  );
  return failed ? (
    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{errorTooltip(row)}</span>} arrow placement="top">
      {chip}
    </Tooltip>
  ) : chip;
}

function UserCell({ row }: { row: Record<string, unknown> }) {
  const user = String(row.user_nickname || row.user_phone || '');
  return user || '-';
}

export default function AdminSendRecordsPage() {
  const [tab, setTab] = useState<RecordTab>(() => readPersistentUiValue<RecordTab>(SEND_RECORDS_TAB_STORAGE_KEY, 'sms', isRecordTab));
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => ({
    failed: items.filter((item) => String(item.status || '') === 'failed').length,
    sent: items.filter((item) => String(item.status || '') === 'sent').length,
  }), [items]);
  const metricItems = useMemo<AdminMetricItem[]>(() => [
    { key: 'sent', label: '本页成功', value: stats.sent, tone: 'success' },
    { key: 'failed', label: '本页失败', value: stats.failed, tone: 'error' },
    { key: 'total', label: '总记录', value: total, helper: '按当前筛选统计', tone: 'primary' },
  ], [stats.failed, stats.sent, total]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        status: status || undefined,
        search: search || undefined,
        page: page + 1,
        limit,
      };
      const result = tab === 'sms'
        ? await adminApi.getSmsSendRecords(params)
        : await adminApi.getEmailSendRecords(params);
      setItems(result.items || []);
      setTotal(Number(result.total || 0));
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tab, status, search, page, limit]);

  const changeTab = (_event: SyntheticEvent, value: RecordTab) => {
    setTab(value);
    writePersistentUiValue(SEND_RECORDS_TAB_STORAGE_KEY, value);
    setPage(0);
  };

  const changeStatus = (nextStatus: string) => {
    setStatus(nextStatus);
    setPage(0);
  };

  const submitSearch = () => {
    setSearch(searchDraft.trim());
    setPage(0);
  };

  return (
    <Stack spacing={2}>
      <AdminSection title="发送记录" subtitle="查询短信和邮件发送结果，失败记录可悬浮查看错误详情。" bodySx={{ py: 0.75 }}>
        <Tabs value={tab} onChange={changeTab} variant="scrollable" allowScrollButtonsMobile>
          <Tab value="sms" label="短信发送记录" />
          <Tab value="email" label="邮件发送记录" />
        </Tabs>
      </AdminSection>

      <AdminSection title="发送概览">
        <AdminMetricGrid items={metricItems} compact minWidth={132} />
      </AdminSection>

      <AdminSection title="筛选">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant={status === '' ? 'contained' : 'outlined'} onClick={() => changeStatus('')}>全部状态</Button>
          <Button variant={status === 'sent' ? 'contained' : 'outlined'} onClick={() => changeStatus('sent')}>已发送</Button>
          <Button variant={status === 'failed' ? 'contained' : 'outlined'} onClick={() => changeStatus('failed')}>失败</Button>
          <TextField
            size="small"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitSearch();
            }}
            placeholder={tab === 'sms' ? '搜索手机号、用途、用户' : '搜索邮箱、主题、用户'}
            sx={{ minWidth: { xs: '100%', sm: 260 }, ml: { sm: 'auto' } }}
          />
          <Button variant="outlined" onClick={submitSearch}>搜索</Button>
          {search ? <Button onClick={() => { setSearchDraft(''); setSearch(''); setPage(0); }}>清空</Button> : null}
        </Stack>
      </AdminSection>

      <AdminRequestState loading={loading} error={error} onRetry={() => void load()} />

      <AdminSection title="记录列表" bodySx={{ p: 0 }}>
        <AdminTableFrame minWidth={tab === 'sms' ? 960 : 900}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>时间</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>服务商</TableCell>
                <TableCell>{tab === 'sms' ? '手机号' : '收件人'}</TableCell>
                {tab === 'sms' ? <TableCell>验证码</TableCell> : null}
                <TableCell>{tab === 'sms' ? '用途' : '主题'}</TableCell>
                <TableCell>用户</TableCell>
                <TableCell>模板</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={String(item.id)} hover>
                  <TableCell>{formatTime(item.created_at)}</TableCell>
                  <TableCell><StatusChip row={item} /></TableCell>
                  <TableCell>{String(item.provider_code || '-')}</TableCell>
                  <TableCell>{String(tab === 'sms' ? item.phone || '-' : item.recipient || '-')}</TableCell>
                  {tab === 'sms' ? <TableCell>{String(item.verification_code || '-')}</TableCell> : null}
                  <TableCell>{tab === 'sms' ? sourceLabel(item) : String(item.subject || sourceLabel(item))}</TableCell>
                  <TableCell><UserCell row={item} /></TableCell>
                  <TableCell>{String(item.template_code || '-')}</TableCell>
                </TableRow>
              ))}
              {!items.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={tab === 'sms' ? 8 : 7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>暂无发送记录</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </AdminTableFrame>
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={limit}
          rowsPerPageOptions={[20, 50, 100]}
          onPageChange={(_event, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={(event) => {
            setLimit(Number(event.target.value));
            setPage(0);
          }}
        />
      </AdminSection>
    </Stack>
  );
}
