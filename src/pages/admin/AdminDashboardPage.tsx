import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Chip, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminMetricGrid, AdminSection, AdminTableFrame, type AdminMetricItem } from '../../components/admin/AdminSurface';
import { adminApi } from '../../services/adminApi';

type MetricFormat = 'count' | 'money' | 'points';
type MetricMeta = { title: string; route?: string; format?: MetricFormat };

const metricMeta: Record<string, MetricMeta> = {
  users: { title: '用户总数', route: '/admin/users' },
  activeAiEntitlements: { title: 'AI开通数', route: '/admin/platform?tab=ai' },
  pendingShareReviews: { title: '待处理审核', route: '/admin/moderation' },
  activeRestrictions: { title: '生效限制', route: '/admin/risk' },
  todayPaidAmount: { title: '今日实收', route: '/admin/billing', format: 'money' },
  todayPaidOrders: { title: '今日支付订单', route: '/admin/billing' },
  pendingOrders: { title: '待支付订单', route: '/admin/billing' },
  stalePendingOrders: { title: '超时待支付', route: '/admin/billing' },
  todayRefundAmount: { title: '今日退款', route: '/admin/billing', format: 'money' },
  todayRefunds: { title: '今日退款笔数', route: '/admin/billing' },
  pendingRefunds: { title: '处理中退款', route: '/admin/billing' },
  failedRefunds: { title: '失败退款', route: '/admin/billing' },
  todayAiRequests: { title: '今日AI请求', route: '/admin/platform?tab=ai' },
  todayAiActiveUsers: { title: '今日AI用户', route: '/admin/platform?tab=ai' },
  todayAiRevenuePoints: { title: '今日AI收入', route: '/admin/platform?tab=ai', format: 'points' },
  todayAiEstimatedCostPoints: { title: '今日AI估算成本', route: '/admin/platform?tab=ai', format: 'points' },
  todayAiGrossProfitPoints: { title: '今日AI毛利', route: '/admin/platform?tab=ai', format: 'points' },
  todayAiFailed: { title: '今日AI失败', route: '/admin/platform?tab=ai' },
  queuedNotifications: { title: '排队通知', route: '/admin/notifications' },
  dueNotifications: { title: '待发送通知', route: '/admin/notifications' },
  failedNotifications: { title: '失败通知', route: '/admin/notifications' },
  staleNotificationJobs: { title: '卡住通知', route: '/admin/notifications' },
  auditEvents24h: { title: '24h审计事件', route: '/admin/audit' },
  failedAdminLogins24h: { title: '24h登录失败', route: '/admin/audit' },
};

const primaryMetricKeys = ['todayPaidAmount', 'todayPaidOrders', 'todayRefundAmount', 'todayAiGrossProfitPoints'];
const operationMetricKeys = ['pendingOrders', 'stalePendingOrders', 'pendingRefunds', 'failedRefunds', 'pendingShareReviews', 'activeRestrictions', 'dueNotifications', 'failedNotifications'];
const aiMetricKeys = ['todayAiRequests', 'todayAiActiveUsers', 'todayAiRevenuePoints', 'todayAiEstimatedCostPoints', 'todayAiFailed'];
const baseMetricKeys = ['users', 'activeAiEntitlements', 'queuedNotifications', 'auditEvents24h', 'failedAdminLogins24h'];

function formatTime(value: unknown) {
  const parsed = Number(value || 0);
  return parsed > 0 ? new Date(parsed).toLocaleString() : '-';
}

function formatMetricValue(value: number, format: MetricFormat = 'count') {
  if (format === 'money') return `¥${value.toFixed(2)}`;
  if (format === 'points') return `${value.toFixed(2)}P`;
  return String(Math.round(value));
}

function formatGeneratedAt(value: unknown) {
  const parsed = Number(value || 0);
  return parsed > 0 ? `更新于 ${new Date(parsed).toLocaleTimeString()}` : '';
}

function metricSecondaryText(key: string, metrics: Record<string, number>) {
  if (key === 'todayPaidAmount') return `${formatMetricValue(Number(metrics.todayPaidOrders || 0))} 笔支付`;
  if (key === 'todayRefundAmount') return `${formatMetricValue(Number(metrics.todayRefunds || 0))} 笔退款`;
  if (key === 'todayAiGrossProfitPoints') return `收入 ${formatMetricValue(Number(metrics.todayAiRevenuePoints || 0), 'points')}`;
  if (key === 'todayAiEstimatedCostPoints') return `毛利 ${formatMetricValue(Number(metrics.todayAiGrossProfitPoints || 0), 'points')}`;
  if (key === 'queuedNotifications') return `${formatMetricValue(Number(metrics.dueNotifications || 0))} 条待发送`;
  return '';
}

function metricTone(key: string): AdminMetricItem['tone'] {
  if (key.includes('Failed') || key.includes('stale')) return 'error';
  if (key.includes('Revenue') || key.includes('Paid') || key.includes('Gross')) return 'success';
  return 'default';
}

function buildMetricItem(metricKey: string, metrics: Record<string, number>, onNavigate: (route: string) => void): AdminMetricItem | null {
  const meta = metricMeta[metricKey];
  if (!meta) return null;
  const value = Number(metrics[metricKey] || 0);
  return {
    key: metricKey,
    label: meta.title,
    value: formatMetricValue(value, meta.format),
    helper: metricSecondaryText(metricKey, metrics),
    onClick: meta.route ? () => onNavigate(meta.route!) : undefined,
    tone: metricTone(metricKey),
  };
}

function MetricGrid({
  metricKeys,
  metrics,
  minWidth = 144,
  compact = false,
  onNavigate,
}: {
  metricKeys: string[];
  metrics: Record<string, number>;
  minWidth?: number;
  compact?: boolean;
  onNavigate: (route: string) => void;
}) {
  const items = metricKeys
    .map((key) => buildMetricItem(key, metrics, onNavigate))
    .filter(Boolean) as AdminMetricItem[];
  return <AdminMetricGrid items={items} minWidth={minWidth} compact={compact} />;
}

function CompactSummaryTable({ title, empty, rows, route }: { title: string; empty: string; rows: Array<Record<string, unknown>>; route: string }) {
  const navigate = useNavigate();
  return (
    <AdminSection title={title} action={<Button size="small" onClick={() => navigate(route)}>查看全部</Button>} sx={{ height: '100%' }} bodySx={{ p: 0 }}>
      {!rows.length ? <Alert severity="info" sx={{ mx: 2, mb: 2 }}>{empty}</Alert> : null}
      {rows.length ? (
        <AdminTableFrame minWidth={520}>
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
        </AdminTableFrame>
      ) : null}
    </AdminSection>
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
    <Stack spacing={1.5}>
      <AdminRequestState loading={loading} error={error} onRetry={() => void load()} />

      <AdminSection
        title="运营总览"
        subtitle={formatGeneratedAt(operations.generatedAt) || '实时运营指标'}
        action={<Button size="small" variant="outlined" onClick={() => void load()} disabled={loading}>刷新</Button>}
      >
        <MetricGrid metricKeys={primaryMetricKeys} metrics={metrics} minWidth={150} onNavigate={navigate} />
      </AdminSection>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <AdminSection
            title="待处理事项"
            action={<Chip size="small" color={alerts.length ? 'warning' : 'success'} label={alerts.length ? `${alerts.length}项` : '正常'} />}
            sx={{ height: '100%' }}
          >
            <Stack spacing={1}>
              {alerts.length ? alerts.map((item) => (
                <Alert
                  key={item.key}
                  severity={item.severity}
                  variant="outlined"
                  action={<Button size="small" color="inherit" onClick={() => navigate(item.route)}>处理</Button>}
                  sx={{ alignItems: 'center' }}
                >
                  {item.message}
                </Alert>
              )) : (
                <Alert severity="success" variant="outlined">当前没有需要立即处理的运营事项。</Alert>
              )}
            </Stack>
          </AdminSection>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <AdminSection title="运营指标" sx={{ height: '100%' }}>
            <MetricGrid metricKeys={operationMetricKeys} metrics={metrics} minWidth={132} compact onNavigate={navigate} />
          </AdminSection>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <AdminSection title="AI 指标" sx={{ height: '100%' }}>
            <MetricGrid metricKeys={aiMetricKeys} metrics={metrics} minWidth={132} compact onNavigate={navigate} />
          </AdminSection>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <AdminSection title="基础状态" sx={{ height: '100%' }}>
            <MetricGrid metricKeys={baseMetricKeys} metrics={metrics} minWidth={124} compact onNavigate={navigate} />
          </AdminSection>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
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
