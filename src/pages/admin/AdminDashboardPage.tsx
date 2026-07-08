import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AdminResponsiveTable from '../../components/admin/AdminResponsiveTable';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { adminApi } from '../../services/adminApi';

type MetricFormat = 'count' | 'money' | 'points';
type MetricTone = 'default' | 'warning' | 'error' | 'success';

const metricMeta: Array<{ key: string; title: string; group: string; route?: string; format?: MetricFormat; tone?: MetricTone }> = [
  { key: 'users', title: '用户总数', group: '用户', route: '/admin/users' },
  { key: 'activeAiEntitlements', title: 'AI开通数', group: '用户', route: '/admin/platform?tab=ai' },
  { key: 'pendingShareReviews', title: '待处理审核', group: '用户', route: '/admin/moderation', tone: 'warning' },
  { key: 'activeRestrictions', title: '生效限制', group: '用户', route: '/admin/risk', tone: 'warning' },
  { key: 'todayPaidAmount', title: '今日实收', group: '订单', route: '/admin/billing', format: 'money', tone: 'success' },
  { key: 'todayPaidOrders', title: '今日支付订单', group: '订单', route: '/admin/billing' },
  { key: 'pendingOrders', title: '待支付订单', group: '订单', route: '/admin/billing', tone: 'warning' },
  { key: 'stalePendingOrders', title: '超时待支付', group: '订单', route: '/admin/billing', tone: 'error' },
  { key: 'todayRefundAmount', title: '今日退款', group: '退款', route: '/admin/billing', format: 'money', tone: 'warning' },
  { key: 'todayRefunds', title: '今日退款笔数', group: '退款', route: '/admin/billing' },
  { key: 'pendingRefunds', title: '处理中退款', group: '退款', route: '/admin/billing', tone: 'warning' },
  { key: 'failedRefunds', title: '失败退款', group: '退款', route: '/admin/billing', tone: 'error' },
  { key: 'todayAiRequests', title: '今日AI请求', group: 'AI', route: '/admin/platform?tab=ai' },
  { key: 'todayAiActiveUsers', title: '今日AI用户', group: 'AI', route: '/admin/platform?tab=ai' },
  { key: 'todayAiRevenuePoints', title: '今日AI收入', group: 'AI', route: '/admin/platform?tab=ai', format: 'points', tone: 'success' },
  { key: 'todayAiEstimatedCostPoints', title: '今日AI估算成本', group: 'AI', route: '/admin/platform?tab=ai', format: 'points' },
  { key: 'todayAiGrossProfitPoints', title: '今日AI毛利', group: 'AI', route: '/admin/platform?tab=ai', format: 'points', tone: 'success' },
  { key: 'todayAiFailed', title: '今日AI失败', group: 'AI', route: '/admin/platform?tab=ai', tone: 'error' },
  { key: 'queuedNotifications', title: '排队通知', group: '通知安全', route: '/admin/notifications' },
  { key: 'dueNotifications', title: '待发送通知', group: '通知安全', route: '/admin/notifications', tone: 'warning' },
  { key: 'failedNotifications', title: '失败通知', group: '通知安全', route: '/admin/notifications', tone: 'error' },
  { key: 'staleNotificationJobs', title: '卡住通知', group: '通知安全', route: '/admin/notifications', tone: 'error' },
  { key: 'auditEvents24h', title: '24h审计事件', group: '通知安全', route: '/admin/audit' },
  { key: 'failedAdminLogins24h', title: '24h登录失败', group: '通知安全', route: '/admin/audit', tone: 'warning' },
];

function formatTime(value: unknown) {
  const parsed = Number(value || 0);
  return parsed > 0 ? new Date(parsed).toLocaleString() : '-';
}

function formatMetricValue(value: number, format: MetricFormat = 'count') {
  if (format === 'money') return `¥${value.toFixed(2)}`;
  if (format === 'points') return `${value.toFixed(2)}P`;
  return String(Math.round(value));
}

function getToneColor(tone: MetricTone = 'default') {
  if (tone === 'success') return 'success.main';
  if (tone === 'warning') return 'warning.main';
  if (tone === 'error') return 'error.main';
  return 'primary.main';
}

function CompactSummaryTable({ title, empty, rows, route }: { title: string; empty: string; rows: Array<Record<string, unknown>>; route: string }) {
  const navigate = useNavigate();
  return (
    <Paper sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
      <Stack direction="row" sx={{ px: 2, py: 1.5, justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
        <Button size="small" onClick={() => navigate(route)}>查看全部</Button>
      </Stack>
      {!rows.length ? <Alert severity="info" sx={{ mx: 2, mb: 2 }}>{empty}</Alert> : null}
      {rows.length ? (
        <AdminResponsiveTable minWidth={520}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>主信息</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>时间</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => {
                const primary = String(item.order_no || item.id || item.action || '-');
                const status = String(item.status || item.result || item.latest_decision || '-');
                const time = formatTime(item.created_at);
                return (
                  <TableRow key={String(item.id || primary)} hover>
                    <TableCell>{primary}</TableCell>
                    <TableCell>{status}</TableCell>
                    <TableCell>{time}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AdminResponsiveTable>
      ) : null}
    </Paper>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [operations, setOperations] = useState<Record<string, unknown>>({});
  const [recentOrders, setRecentOrders] = useState<Array<Record<string, unknown>>>([]);
  const [recentReviews, setRecentReviews] = useState<Array<Record<string, unknown>>>([]);
  const [recentAudits, setRecentAudits] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metricGroups = useMemo(() => {
    const groups = new Map<string, typeof metricMeta>();
    metricMeta.forEach((item) => {
      const items = groups.get(item.group) || [];
      items.push(item);
      groups.set(item.group, items);
    });
    return Array.from(groups.entries());
  }, []);
  const alerts = useMemo(() => {
    const stalePendingOrderMinutes = Number(operations.stalePendingOrderMinutes || 120);
    return [
      {
        key: 'stalePendingOrders',
        severity: 'warning' as const,
        route: '/admin/billing',
        message: `${Math.round(metrics.stalePendingOrders || 0)} 个订单待支付超过 ${stalePendingOrderMinutes} 分钟，需要同步或关闭。`,
      },
      {
        key: 'failedRefunds',
        severity: 'error' as const,
        route: '/admin/billing',
        message: `${Math.round(metrics.failedRefunds || 0)} 条退款失败记录，需要查看支付宝或人工处理结果。`,
      },
      {
        key: 'failedNotifications',
        severity: 'error' as const,
        route: '/admin/notifications',
        message: `${Math.round(metrics.failedNotifications || 0)} 条通知发送失败，可进入发送记录或通知队列重试。`,
      },
      {
        key: 'staleNotificationJobs',
        severity: 'warning' as const,
        route: '/admin/notifications',
        message: `${Math.round(metrics.staleNotificationJobs || 0)} 条通知卡在处理中，调度器会自动回收，也可以手动重排。`,
      },
      {
        key: 'todayAiFailed',
        severity: 'warning' as const,
        route: '/admin/platform?tab=ai',
        message: `今日 AI 请求失败 ${Math.round(metrics.todayAiFailed || 0)} 次，需要排查模型、余额或上游限流。`,
      },
      {
        key: 'failedAdminLogins24h',
        severity: 'warning' as const,
        route: '/admin/audit',
        message: `过去 24 小时管理员登录失败 ${Math.round(metrics.failedAdminLogins24h || 0)} 次，建议查看审计日志。`,
      },
    ].filter((item) => Number(metrics[item.key] || 0) > 0);
  }, [metrics, operations.stalePendingOrderMinutes]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getDashboardStats();
      setMetrics(result.metrics);
      setOperations(result.operations || {});
      setRecentOrders(result.recentOrders);
      setRecentReviews(result.recentReviews);
      setRecentAudits(result.recentAudits);
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <Stack spacing={2}>
      <AdminRequestState loading={loading} error={error} onRetry={() => void load()} />

      {alerts.length ? (
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 900 }}>运营预警</Typography>
              <Chip size="small" color="warning" label={`${alerts.length}项待处理`} />
            </Stack>
            {alerts.map((item) => (
              <Alert
                key={item.key}
                severity={item.severity}
                action={<Button size="small" color="inherit" onClick={() => navigate(item.route)}>处理</Button>}
              >
                {item.message}
              </Alert>
            ))}
          </Stack>
        </Paper>
      ) : null}

      <Stack spacing={2}>
        {metricGroups.map(([group, cards]) => (
          <Box key={group}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 800 }}>{group}</Typography>
            <Grid container spacing={2}>
              {cards.map((meta) => {
                const value = Number(metrics[meta.key] || 0);
                return (
                  <Grid key={meta.key} size={{ xs: 12, sm: 6, lg: 4, xl: 3 }}>
                    <Paper
                      sx={{
                        p: { xs: 1.75, sm: 2.25 },
                        borderRadius: 3,
                        height: '100%',
                        cursor: meta.route ? 'pointer' : 'default',
                        borderLeft: 4,
                        borderColor: getToneColor(value > 0 ? meta.tone : 'default'),
                      }}
                      onClick={meta.route ? () => navigate(meta.route!) : undefined}
                    >
                      <Typography variant="body2" color="text.secondary">{meta.title}</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5 }}>{formatMetricValue(value, meta.format)}</Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        ))}
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 4 }}>
          <CompactSummaryTable title="最近订单" empty="暂无订单" rows={recentOrders} route="/admin/billing" />
        </Grid>
        <Grid size={{ xs: 12, xl: 4 }}>
          <CompactSummaryTable title="最近审核" empty="暂无审核" rows={recentReviews} route="/admin/moderation" />
        </Grid>
        <Grid size={{ xs: 12, xl: 4 }}>
          <CompactSummaryTable title="最近审计" empty="暂无审计" rows={recentAudits} route="/admin/audit" />
        </Grid>
      </Grid>
    </Stack>
  );
}
