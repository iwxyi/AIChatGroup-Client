import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminMetricGrid, AdminSection, AdminTableFrame, type AdminMetricItem } from '../../components/admin/AdminSurface';
import { ADMIN_PERMISSION_CODES, adminHasPermission } from '../../constants/adminPermissions';
import { adminApi, type AdminUsageMaintenanceStatus, type AdminUsageSessionItem } from '../../services/adminApi';
import { useAdminAuthStore } from '../../stores/useAdminAuthStore';

const statusLabels: Record<string, { label: string; color: 'success' | 'warning' | 'default' }> = {
  online: { label: '在线', color: 'success' },
  timeout: { label: '无心跳', color: 'warning' },
  ended: { label: '已关闭', color: 'default' },
};

function formatTime(value: number | null | undefined) {
  const parsed = Number(value || 0);
  return parsed > 0 ? new Date(parsed).toLocaleString() : '-';
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  if (minutes > 0) return `${minutes}分钟${seconds}秒`;
  return `${seconds}秒`;
}

function formatInterval(ms: number) {
  const minutes = Math.round(Number(ms || 0) / 60000);
  if (minutes >= 60) return `${Math.round(minutes / 60)} 小时`;
  return `${minutes} 分钟`;
}

function statusChip(status: string) {
  const meta = statusLabels[status] || { label: status || '未知', color: 'default' as const };
  return <Chip size="small" color={meta.color} label={meta.label} />;
}

function SessionTable({ rows }: { rows: AdminUsageSessionItem[] }) {
  if (!rows.length) return <Alert severity="info">暂无使用记录。</Alert>;
  return (
    <AdminTableFrame minWidth={960}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>用户</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>启动时间</TableCell>
            <TableCell>最后心跳</TableCell>
            <TableCell>关闭时间</TableCell>
            <TableCell align="right">使用时长</TableCell>
            <TableCell align="right">心跳</TableCell>
            <TableCell>入口</TableCell>
            <TableCell>最后页面</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{row.userLabel || '未知用户'}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.anonymous ? '访客' : '登录用户'}</Typography>
                </Box>
              </TableCell>
              <TableCell>{statusChip(row.status)}</TableCell>
              <TableCell>{formatTime(row.startedAt)}</TableCell>
              <TableCell>{formatTime(row.lastHeartbeatAt)}</TableCell>
              <TableCell>{formatTime(row.endedAt)}</TableCell>
              <TableCell align="right">{formatDuration(row.durationMs)}</TableCell>
              <TableCell align="right">{Math.round(Number(row.heartbeatCount || 0))}</TableCell>
              <TableCell>{row.entryPath || '-'}</TableCell>
              <TableCell>{row.lastPath || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTableFrame>
  );
}

export default function AdminUsagePage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const [items, setItems] = useState<AdminUsageSessionItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [heartbeatTimeoutMs, setHeartbeatTimeoutMs] = useState(90_000);
  const [maintenance, setMaintenance] = useState<AdminUsageMaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const limit = 30;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total]);
  const canRunMaintenance = adminHasPermission(admin, ADMIN_PERMISSION_CODES.usersManage);
  const maintenanceMetrics = useMemo<AdminMetricItem[]>(() => {
    if (!maintenance) return [];
    return [
      { key: 'rawSessionCount', label: '原始会话', value: String(maintenance.rawSessionCount || 0), helper: `保留 ${maintenance.rawSessionRetentionDays || 180} 天` },
      { key: 'dailyStatCount', label: '日汇总', value: String(maintenance.dailyStatCount || 0), helper: maintenance.latestSummaryDate ? `最近 ${maintenance.latestSummaryDate}` : '暂无汇总' },
      { key: 'onlineSessionCount', label: '在线会话', value: String(maintenance.onlineSessionCount || 0), tone: maintenance.onlineSessionCount > 0 ? 'success' : 'default' },
      { key: 'latestSummarizedAt', label: '最近汇总', value: formatTime(maintenance.latestSummarizedAt), helper: `每 ${formatInterval(maintenance.maintenanceIntervalMs)}维护` },
      { key: 'oldestSessionStartedAt', label: '最早原始记录', value: formatTime(maintenance.oldestSessionStartedAt) },
    ];
  }, [maintenance]);

  const loadMaintenance = useCallback(async () => {
    setMaintenanceLoading(true);
    setMaintenanceError(null);
    try {
      setMaintenance(await adminApi.getUsageMaintenanceStatus());
    } catch (loadError) {
      setMaintenanceError(getAdminErrorMessage(loadError));
    } finally {
      setMaintenanceLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getUsageSessions({ page: nextPage, limit, search });
      setItems(result.items || []);
      setPage(result.page || nextPage);
      setTotal(result.total || 0);
      setHeartbeatTimeoutMs(Number(result.heartbeatTimeoutMs || 90_000));
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    void loadMaintenance();
  }, [loadMaintenance]);

  const runMaintenance = async () => {
    setMaintenanceLoading(true);
    setMaintenanceError(null);
    try {
      const result = await adminApi.runUsageMaintenance();
      setMaintenance(result.status);
      await loadPage(page);
    } catch (runError) {
      setMaintenanceError(getAdminErrorMessage(runError));
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const submitSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <Stack spacing={1.5}>
      <AdminRequestState loading={loading} error={error} onRetry={() => void loadPage(page)} />
      <AdminSection
        title="统计维护"
        subtitle="日汇总用于趋势统计，原始会话用于最近记录和在线判断。"
        action={(
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={() => void loadMaintenance()} disabled={maintenanceLoading}>刷新状态</Button>
            {canRunMaintenance ? <Button size="small" variant="contained" onClick={() => void runMaintenance()} disabled={maintenanceLoading}>立即维护</Button> : null}
          </Stack>
        )}
      >
        <Stack spacing={1}>
          <AdminRequestState loading={maintenanceLoading} error={maintenanceError} onRetry={() => void loadMaintenance()} />
          {maintenance ? <AdminMetricGrid items={maintenanceMetrics} minWidth={132} compact /> : <Alert severity="info">暂无维护状态。</Alert>}
        </Stack>
      </AdminSection>
      <AdminSection
        title="使用记录"
        subtitle={`最近启动和心跳记录；超过 ${Math.round(heartbeatTimeoutMs / 1000)} 秒未心跳视为无心跳`}
        action={<Button size="small" variant="outlined" onClick={() => void loadPage(page)} disabled={loading}>刷新</Button>}
      >
        <Stack spacing={1.25}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
            <TextField
              size="small"
              label="搜索用户"
              placeholder="昵称、手机号或访客标识"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitSearch();
              }}
              sx={{ maxWidth: { sm: 320 } }}
            />
            <Button variant="contained" onClick={submitSearch} disabled={loading}>查询</Button>
            {search ? <Button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}>清空</Button> : null}
          </Stack>
          <SessionTable rows={items} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">共 {total} 条，第 {page} / {totalPages} 页</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" disabled={loading || page <= 1} onClick={() => void loadPage(page - 1)}>上一页</Button>
              <Button size="small" variant="outlined" disabled={loading || page >= totalPages} onClick={() => void loadPage(page + 1)}>下一页</Button>
            </Stack>
          </Stack>
        </Stack>
      </AdminSection>
    </Stack>
  );
}
