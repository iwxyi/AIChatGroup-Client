import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PaidIcon from '@mui/icons-material/Paid';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AdminInlineGroup from '../../components/admin/AdminInlineGroup';
import AdminResponsiveTable from '../../components/admin/AdminResponsiveTable';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { adminApi } from '../../services/adminApi';
import { readPersistentUiValue, writePersistentUiValue } from '../../utils/persistentUiState';

type PlanForm = {
  id: string;
  code: string;
  name: string;
  description: string;
  vipEnabled: boolean;
  pointsEnabled: boolean;
  priceAmount: string;
  currency: string;
  durationDays: string;
  grantPoints: string;
  status: string;
  visibleToUsers: boolean;
  featured: boolean;
  sortOrder: string;
  featureUnlockEnabled: boolean;
  featuresText: string;
};

const EMPTY_PLAN_FORM: PlanForm = {
  id: '',
  code: '',
  name: '',
  description: '',
  vipEnabled: false,
  pointsEnabled: true,
  priceAmount: '',
  currency: 'CNY',
  durationDays: '30',
  grantPoints: '',
  status: 'active',
  visibleToUsers: true,
  featured: false,
  sortOrder: '0',
  featureUnlockEnabled: true,
  featuresText: '',
};
const BILLING_TAB_STORAGE_KEY = 'admin.billing.tab';
const EMPTY_ORDER_SUMMARY = { total: 0, pending: 0, paid: 0, cancelled: 0, refunded: 0, failed: 0 };

function isBillingTab(value: unknown): value is number {
  return value === 0 || value === 1;
}

function formatOrderTime(value: unknown) {
  const parsed = Number(value || 0);
  return parsed > 0 ? new Date(parsed).toLocaleString() : '-';
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function numberText(value: unknown, fallback = '') {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function formatMoney(value: unknown, currency: unknown = 'CNY') {
  const parsed = Number(value || 0);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return `${amount.toFixed(2)} ${String(currency || 'CNY')}`;
}

function formatPoints(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0P';
  return `${Number.isInteger(parsed) ? parsed : Number(parsed.toFixed(2))}P`;
}

function planBenefitsLabel(planKind: unknown, grantPoints: unknown) {
  const benefits = [];
  if (String(planKind || '') === 'vip') benefits.push('VIP');
  if (Number(grantPoints || 0) > 0) benefits.push('点数');
  return benefits.length ? benefits.join(' / ') : '-';
}

function statusLabel(value: unknown) {
  const status = String(value || '');
  if (status === 'active') return '启用';
  if (status === 'inactive') return '停用';
  if (status === 'archived') return '归档';
  if (status === 'paid') return '已支付';
  if (status === 'pending') return '待支付';
  if (status === 'cancelled' || status === 'canceled') return '已关闭';
  if (status === 'failed') return '失败';
  if (status === 'refunded') return '已退款';
  return status || '-';
}

function orderStatusColor(value: unknown): 'default' | 'error' | 'info' | 'success' | 'warning' {
  const status = String(value || '');
  if (status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'cancelled' || status === 'canceled' || status === 'failed') return 'error';
  if (status === 'refunded') return 'info';
  return 'default';
}

function OrderStatusChip({ status }: { status: unknown }) {
  return (
    <Chip
      size="small"
      label={statusLabel(status)}
      color={orderStatusColor(status)}
      variant={String(status || '') === 'pending' ? 'filled' : 'outlined'}
      sx={{ fontWeight: 800 }}
    />
  );
}

function canDeleteOrder(order: Record<string, unknown> | null) {
  if (!order) return false;
  const status = String(order.status || '');
  return status !== 'paid' && status !== 'refunded';
}

function canCancelOrder(order: Record<string, unknown> | null) {
  if (!order) return false;
  const status = String(order.status || '');
  return status !== 'paid' && status !== 'refunded' && status !== 'cancelled' && status !== 'canceled';
}

function parseMetadataFeatures(value: unknown) {
  if (!value) return [];
  let metadata: Record<string, unknown> = {};
  if (typeof value === 'object' && !Array.isArray(value)) metadata = value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }
  return Array.isArray(metadata.features) ? metadata.features.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function toPlanForm(item: Record<string, unknown>): PlanForm {
  const planKind = String(item.plan_kind || '') === 'vip' ? 'vip' : 'points';
  const grantPoints = numberText(item.grant_points);
  return {
    id: String(item.id || ''),
    code: String(item.code || ''),
    name: String(item.name || ''),
    description: String(item.description || ''),
    vipEnabled: planKind === 'vip',
    pointsEnabled: Number(item.grant_points || 0) > 0,
    priceAmount: numberText(item.price_amount),
    currency: String(item.currency || 'CNY'),
    durationDays: item.duration_days == null ? '30' : numberText(item.duration_days, '30'),
    grantPoints,
    status: String(item.status || 'active'),
    visibleToUsers: toBoolean(item.visible_to_users, true),
    featured: toBoolean(item.featured, false),
    sortOrder: numberText(item.sort_order, '0'),
    featureUnlockEnabled: planKind === 'vip' ? toBoolean(item.ai_enabled, true) : false,
    featuresText: parseMetadataFeatures(item.metadata).join('\n'),
  };
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPlanPayload(form: PlanForm) {
  const isVip = form.vipEnabled;
  const pointsEnabled = form.pointsEnabled;
  const benefits = [
    isVip ? 'vip' : '',
    pointsEnabled ? 'points' : '',
  ].filter(Boolean);
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    planKind: isVip ? 'vip' : 'points',
    vipEnabled: isVip,
    pointsEnabled,
    benefits,
    priceAmount: Math.max(0, toNumber(form.priceAmount, 0)),
    currency: form.currency.trim() || 'CNY',
    durationDays: isVip ? Math.max(1, Math.floor(toNumber(form.durationDays, 30))) : null,
    grantPoints: pointsEnabled ? Math.max(0, toNumber(form.grantPoints, 0)) : 0,
    status: form.status,
    visibleToUsers: form.visibleToUsers,
    featured: form.featured,
    sortOrder: Math.floor(toNumber(form.sortOrder, 0)),
    aiEnabled: isVip ? form.featureUnlockEnabled : false,
    featureUnlockEnabled: isVip ? form.featureUnlockEnabled : false,
    features: isVip ? form.featuresText.split('\n').map((item) => item.trim()).filter(Boolean) : [],
  };
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', gap: 1, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 96 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, textAlign: { xs: 'left', sm: 'right' }, wordBreak: 'break-all' }}>{value}</Typography>
    </Stack>
  );
}

function DetailMetric({ label, value, tone }: { label: string; value: ReactNode; tone?: 'primary' | 'success' | 'warning' }) {
  const color = tone === 'success' ? 'success.main' : tone === 'warning' ? 'warning.main' : 'primary.main';
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: '1 1 160px',
        minWidth: 0,
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'background.default',
      }}
    >
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ mt: 0.25, fontWeight: 900, color, wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Paper>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>{title}</Typography>
      </Box>
      <Stack divider={<Divider flexItem />} sx={{ px: 1.5, py: 0.25 }}>
        {children}
      </Stack>
    </Paper>
  );
}

function OrderTimelineItem({ label, time, active }: { label: string; time: unknown; active?: boolean }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
      <Box
        sx={{
          width: 10,
          height: 10,
          mt: 0.65,
          borderRadius: '50%',
          bgcolor: active ? 'primary.main' : 'divider',
          flex: '0 0 auto',
        }}
      />
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>{label}</Typography>
        <Typography variant="caption" color="text.secondary">{formatOrderTime(time)}</Typography>
      </Stack>
    </Stack>
  );
}

function OrderStatusFilterButton({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  color?: 'default' | 'error' | 'info' | 'success' | 'warning';
  onClick: () => void;
}) {
  const buttonColor = color === 'default' || !color ? 'primary' : color;
  return (
    <Button
      variant={active ? 'contained' : 'outlined'}
      color={buttonColor}
      onClick={onClick}
      sx={{ flex: '0 0 auto' }}
    >
      {label} {count}
    </Button>
  );
}

function OrderDetailDialog({
  order,
  markingPaid,
  cancelling,
  deleting,
  onClose,
  onMarkPaid,
  onRequestCancel,
  onRequestDelete,
}: {
  order: Record<string, unknown> | null;
  markingPaid: boolean;
  cancelling: boolean;
  deleting: boolean;
  onClose: () => void;
  onMarkPaid: (orderId: string) => void;
  onRequestCancel: (order: Record<string, unknown>) => void;
  onRequestDelete: (order: Record<string, unknown>) => void;
}) {
  const open = Boolean(order);
  const orderId = String(order?.id || '');
  const isPaid = String(order?.status || '') === 'paid';
  const isPending = String(order?.status || '') === 'pending';
  const cancellable = canCancelOrder(order);
  const deletable = canDeleteOrder(order);
  const busy = markingPaid || cancelling || deleting;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
            <ReceiptLongIcon color="primary" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>订单详情</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
                {String(order?.order_no || '')}
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={onClose} disabled={busy} aria-label="关闭">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {order ? (
          <Stack spacing={1.5}>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'background.default',
              }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1 }}>
                <Stack spacing={0.35} sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, wordBreak: 'break-all' }}>
                    {String(order.plan_name || '未命名套餐')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {String(order.user_nickname || order.user_phone || '未知用户')}
                  </Typography>
                </Stack>
                <OrderStatusChip status={order.status} />
              </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <DetailMetric label="订单金额" value={formatMoney(order.amount, order.currency)} tone="primary" />
              <DetailMetric label="套餐权益" value={planBenefitsLabel(order.order_type || order.plan_kind, order.grant_points)} tone="success" />
              <DetailMetric label="支付渠道" value={String(order.payment_channel || '未选择')} tone="warning" />
            </Stack>

            <DetailSection title="基础信息">
              <DetailLine label="订单号" value={String(order.order_no || '-')} />
              <DetailLine label="订单 ID" value={orderId || '-'} />
              <DetailLine label="用户" value={String(order.user_nickname || order.user_phone || '-')} />
              <DetailLine label="套餐编码" value={String(order.plan_code || '-')} />
            </DetailSection>

            <DetailSection title="订单时间">
              <OrderTimelineItem label="创建订单" time={order.created_at} active />
              <OrderTimelineItem label="支付完成" time={order.paid_at} active={isPaid} />
              <OrderTimelineItem label="关闭订单" time={order.cancelled_at} active={String(order.status || '') === 'cancelled' || String(order.status || '') === 'canceled'} />
            </DetailSection>

            {deletable ? null : (
              <Alert severity="info" sx={{ mt: 0.5 }}>
                已支付或退款订单会关联权益、点数和财务记录，不能关闭或删除。
              </Alert>
            )}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {order && isPending ? (
            <Button
              variant="outlined"
              startIcon={<PaidIcon />}
              disabled={busy}
              onClick={() => onMarkPaid(orderId)}
            >
              确认支付
            </Button>
          ) : null}
          {order && cancellable ? (
            <Button
              color="warning"
              variant="outlined"
              startIcon={<EventBusyIcon />}
              disabled={busy}
              onClick={() => onRequestCancel(order)}
            >
              关闭订单
            </Button>
          ) : null}
          {order && deletable ? (
            <Button
              color="error"
              variant="contained"
              startIcon={<DeleteIcon />}
              disabled={busy}
              onClick={() => onRequestDelete(order)}
            >
              删除订单
            </Button>
          ) : null}
        </Stack>
        <Button onClick={onClose} disabled={busy} sx={{ ml: 'auto' }}>返回</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminBillingPage() {
  const [tab, setTab] = useState(() => readPersistentUiValue<number>(BILLING_TAB_STORAGE_KEY, 0, isBillingTab));
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [orderStatusSummary, setOrderStatusSummary] = useState<Record<string, number>>(EMPTY_ORDER_SUMMARY);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN_FORM);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [cancelOrderTarget, setCancelOrderTarget] = useState<Record<string, unknown> | null>(null);
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<Record<string, unknown> | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const selectedPlanId = planForm.id;

  const orderListAmount = useMemo(() => orders.reduce((total, item) => total + Number(item.amount || 0), 0), [orders]);

  const planSummary = useMemo(() => ({
    vip: plans.filter((item) => String(item.plan_kind || '') === 'vip').length,
    points: plans.filter((item) => Number(item.grant_points || 0) > 0).length,
    active: plans.filter((item) => String(item.status || '') === 'active').length,
  }), [plans]);
  const planHasBenefit = planForm.vipEnabled || planForm.pointsEnabled;
  const planPointsValid = !planForm.pointsEnabled || toNumber(planForm.grantPoints, 0) > 0;
  const canSavePlan = planHasBenefit && planPointsValid && !savingPlan;

  const loadPlans = async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const result = await adminApi.getBillingPlans();
      setPlans(result.items || []);
      if (planDialogOpen && selectedPlanId) {
        const next = result.items.find((item) => String(item.id) === selectedPlanId);
        if (next) setPlanForm(toPlanForm(next));
      }
    } catch (loadError) {
      setPlansError(getAdminErrorMessage(loadError));
    } finally {
      setPlansLoading(false);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const result = await adminApi.getOrders({ status: status || undefined });
      setOrders(result.items || []);
      setOrderStatusSummary({ ...EMPTY_ORDER_SUMMARY, ...(result.summary || {}) });
      if (selectedOrder) {
        const next = result.items.find((item) => String(item.id) === String(selectedOrder.id));
        setSelectedOrder(next || null);
      }
    } catch (loadError) {
      setOrdersError(getAdminErrorMessage(loadError));
    } finally {
      setOrdersLoading(false);
    }
  };

  const savePlan = async () => {
    setSavingPlan(true);
    setPlansError(null);
    try {
      const payload = buildPlanPayload(planForm);
      if (planForm.id) await adminApi.updateBillingPlan(planForm.id, payload);
      else await adminApi.createBillingPlan(payload);
      setPlanForm(EMPTY_PLAN_FORM);
      setPlanDialogOpen(false);
      await loadPlans();
    } catch (saveError) {
      setPlansError(getAdminErrorMessage(saveError));
    } finally {
      setSavingPlan(false);
    }
  };

  const deletePlan = async () => {
    if (deletingPlanId) return;
    const planId = String(deleteTarget?.id || '');
    if (!planId) return;
    setDeletingPlanId(planId);
    setPlansError(null);
    try {
      await adminApi.deleteBillingPlan(planId);
      if (selectedPlanId === planId) {
        setPlanDialogOpen(false);
        setPlanForm(EMPTY_PLAN_FORM);
      }
      setDeleteTarget(null);
      await loadPlans();
    } catch (deleteError) {
      setPlansError(getAdminErrorMessage(deleteError));
    } finally {
      setDeletingPlanId(null);
    }
  };

  const markPaid = async (orderId: string) => {
    setActionLoadingId(orderId);
    setOrdersError(null);
    try {
      await adminApi.markOrderPaid(orderId, { paymentChannel: 'admin_manual' });
      await loadOrders();
    } catch (actionError) {
      setOrdersError(getAdminErrorMessage(actionError));
    } finally {
      setActionLoadingId(null);
    }
  };

  const cancelOrder = async () => {
    if (cancellingOrderId) return;
    const orderId = String(cancelOrderTarget?.id || '');
    if (!orderId) return;
    setCancellingOrderId(orderId);
    setOrdersError(null);
    try {
      await adminApi.cancelOrder(orderId, { reason: 'admin_cancelled' });
      setCancelOrderTarget(null);
      await loadOrders();
    } catch (cancelError) {
      setOrdersError(getAdminErrorMessage(cancelError));
    } finally {
      setCancellingOrderId(null);
    }
  };

  const deleteOrder = async () => {
    if (deletingOrderId) return;
    const orderId = String(deleteOrderTarget?.id || '');
    if (!orderId) return;
    setDeletingOrderId(orderId);
    setOrdersError(null);
    try {
      await adminApi.deleteOrder(orderId);
      if (String(selectedOrder?.id || '') === orderId) setSelectedOrder(null);
      setDeleteOrderTarget(null);
      await loadOrders();
    } catch (deleteError) {
      setOrdersError(getAdminErrorMessage(deleteError));
    } finally {
      setDeletingOrderId(null);
    }
  };

  useEffect(() => {
    if (tab === 0) void loadPlans();
    if (tab === 1) void loadOrders();
  }, [tab]);

  useEffect(() => {
    if (tab === 1) void loadOrders();
  }, [status]);

  const updateForm = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => {
    setPlanForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreatePlanDialog = () => {
    setTab(0);
    writePersistentUiValue(BILLING_TAB_STORAGE_KEY, 0);
    setPlanForm(EMPTY_PLAN_FORM);
    setPlanDialogOpen(true);
  };

  const openEditPlanDialog = (item: Record<string, unknown>) => {
    setPlanForm(toPlanForm(item));
    setPlanDialogOpen(true);
  };

  const changeTab = (_event: unknown, value: number) => {
    setTab(value);
    writePersistentUiValue(BILLING_TAB_STORAGE_KEY, value);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Tabs value={tab} onChange={changeTab} variant="scrollable" allowScrollButtonsMobile sx={{ minWidth: 0, flex: '1 1 auto' }}>
          <Tab label="套餐" />
          <Tab label="订单" />
        </Tabs>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={openCreatePlanDialog}
          sx={{ flex: '0 0 auto' }}
        >
          新建套餐
        </Button>
      </Stack>

      {tab === 0 ? (
        <Stack spacing={2}>
          <AdminRequestState loading={plansLoading} error={plansError} onRetry={() => void loadPlans()} />
          <AdminInlineGroup gap={1.25}>
            <Alert severity="info">VIP 套餐：{planSummary.vip}</Alert>
            <Alert severity="success">含点数套餐：{planSummary.points}</Alert>
            <Alert severity="warning">启用中：{planSummary.active}</Alert>
          </AdminInlineGroup>

          <Stack spacing={1.25}>
            <AdminResponsiveTable minWidth={900}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>套餐</TableCell>
                    <TableCell>权益</TableCell>
                    <TableCell>价格</TableCell>
                    <TableCell>赠送点数</TableCell>
                    <TableCell>时长</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {plans.map((item) => (
                    <TableRow
                      key={String(item.id)}
                      hover
                      selected={planDialogOpen && selectedPlanId === String(item.id)}
                      onClick={() => openEditPlanDialog(item)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>{String(item.name || '')}</Typography>
                          <Typography variant="caption" color="text.secondary">{String(item.code || '')}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={planBenefitsLabel(item.plan_kind, item.grant_points)} color={String(item.plan_kind || '') === 'vip' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell>{formatMoney(item.price_amount, item.currency)}</TableCell>
                      <TableCell>{formatPoints(item.grant_points)}</TableCell>
                      <TableCell>{String(item.plan_kind || '') === 'vip' ? `${String(item.duration_days || 0)} 天` : '-'}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                          <Chip size="small" label={statusLabel(item.status)} color={String(item.status || '') === 'active' ? 'success' : 'default'} />
                          {toBoolean(item.visible_to_users, true) ? null : <Chip size="small" label="隐藏" />}
                          {toBoolean(item.featured, false) ? <Chip size="small" label="推荐" color="warning" /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <Button size="small" onClick={(event) => { event.stopPropagation(); openEditPlanDialog(item); }}>编辑</Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteIcon />}
                            disabled={deletingPlanId === String(item.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(item);
                            }}
                          >
                            删除
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminResponsiveTable>
          </Stack>

          <Dialog open={planDialogOpen} onClose={() => setPlanDialogOpen(false)} maxWidth="md" fullWidth>
            <DialogTitle>{planForm.id ? '编辑套餐' : '新增套餐'}</DialogTitle>
            <DialogContent>
              <Stack spacing={1.25} sx={{ pt: 1 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <TextField label="套餐编码" value={planForm.code} onChange={(event) => updateForm('code', event.target.value)} fullWidth />
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flex: '0 0 auto', flexWrap: 'wrap' }}>
                    <FormControlLabel control={<Switch checked={planForm.vipEnabled} onChange={(event) => updateForm('vipEnabled', event.target.checked)} />} label="VIP" />
                    <FormControlLabel control={<Switch checked={planForm.pointsEnabled} onChange={(event) => updateForm('pointsEnabled', event.target.checked)} />} label="点数" />
                  </Stack>
                </Stack>
                <TextField label="套餐名称" value={planForm.name} onChange={(event) => updateForm('name', event.target.value)} fullWidth />
                <TextField label="说明" value={planForm.description} onChange={(event) => updateForm('description', event.target.value)} fullWidth multiline minRows={2} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <TextField label="价格" value={planForm.priceAmount} onChange={(event) => updateForm('priceAmount', event.target.value)} fullWidth />
                  <TextField label="币种" value={planForm.currency} onChange={(event) => updateForm('currency', event.target.value)} sx={{ minWidth: 100 }} />
                </Stack>
                {!planHasBenefit ? <Alert severity="warning">至少选择一个套餐权益。</Alert> : null}
                {planForm.pointsEnabled ? (
                  <TextField
                    label="赠送点数"
                    value={planForm.grantPoints}
                    onChange={(event) => updateForm('grantPoints', event.target.value)}
                    error={!planPointsValid}
                    helperText={!planPointsValid ? '启用点数权益时，赠送点数必须大于 0' : undefined}
                    fullWidth
                  />
                ) : null}
                {planForm.vipEnabled ? (
                  <>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                      <TextField label="有效天数" value={planForm.durationDays} onChange={(event) => updateForm('durationDays', event.target.value)} fullWidth />
                      <FormControlLabel control={<Switch checked={planForm.featureUnlockEnabled} onChange={(event) => updateForm('featureUnlockEnabled', event.target.checked)} />} label="解锁功能" />
                    </Stack>
                    <TextField label="功能权益（每行一项）" value={planForm.featuresText} onChange={(event) => updateForm('featuresText', event.target.value)} fullWidth multiline minRows={3} />
                  </>
                ) : null}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <TextField select label="状态" value={planForm.status} onChange={(event) => updateForm('status', event.target.value)} fullWidth>
                    <MenuItem value="active">启用</MenuItem>
                    <MenuItem value="inactive">停用</MenuItem>
                    <MenuItem value="archived">归档</MenuItem>
                  </TextField>
                  <TextField label="排序" value={planForm.sortOrder} onChange={(event) => updateForm('sortOrder', event.target.value)} fullWidth />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5}>
                  <FormControlLabel control={<Switch checked={planForm.visibleToUsers} onChange={(event) => updateForm('visibleToUsers', event.target.checked)} />} label="用户可见" />
                  <FormControlLabel control={<Switch checked={planForm.featured} onChange={(event) => updateForm('featured', event.target.checked)} />} label="推荐" />
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPlanDialogOpen(false)} disabled={savingPlan}>取消</Button>
              <Button variant="contained" startIcon={<SaveIcon />} disabled={!canSavePlan} onClick={() => void savePlan()}>
                {planForm.id ? '保存套餐' : '添加套餐'}
              </Button>
            </DialogActions>
          </Dialog>
          <ConfirmDialog
            open={Boolean(deleteTarget)}
            title="删除套餐"
            message={`确认删除套餐“${String(deleteTarget?.name || deleteTarget?.code || '')}”？如果已有订单或订阅引用它，系统会自动归档并隐藏，而不是破坏历史数据。`}
            destructive
            onCancel={() => {
              if (!deletingPlanId) setDeleteTarget(null);
            }}
            onConfirm={() => void deletePlan()}
          />
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <AdminInlineGroup gap={0.75}>
              <OrderStatusFilterButton active={status === ''} label="全部" count={Number(orderStatusSummary.total || 0)} onClick={() => setStatus('')} />
              <OrderStatusFilterButton active={status === 'pending'} label="待支付" count={Number(orderStatusSummary.pending || 0)} color="warning" onClick={() => setStatus('pending')} />
              <OrderStatusFilterButton active={status === 'paid'} label="已支付" count={Number(orderStatusSummary.paid || 0)} color="success" onClick={() => setStatus('paid')} />
              <OrderStatusFilterButton active={status === 'cancelled'} label="已关闭" count={Number(orderStatusSummary.cancelled || 0)} color="error" onClick={() => setStatus('cancelled')} />
              <Button startIcon={<RefreshIcon />} onClick={() => void loadOrders()}>刷新</Button>
            </AdminInlineGroup>
            <Chip
              size="small"
              variant="outlined"
              label={`当前列表金额 ${orderListAmount.toFixed(2)}`}
              sx={{ flex: '0 0 auto', fontWeight: 800 }}
            />
          </Stack>
          <AdminRequestState loading={ordersLoading} error={ordersError} onRetry={() => void loadOrders()} />
          <AdminResponsiveTable minWidth={820}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>订单号</TableCell>
                  <TableCell>用户</TableCell>
                  <TableCell>套餐</TableCell>
                  <TableCell>权益</TableCell>
                  <TableCell>金额</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((item) => (
                  <TableRow
                    key={String(item.id)}
                    hover
                    selected={String(selectedOrder?.id || '') === String(item.id)}
                    onClick={() => setSelectedOrder(item)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{String(item.order_no || '')}</TableCell>
                    <TableCell>{String(item.user_nickname || item.user_phone || '')}</TableCell>
                    <TableCell>{String(item.plan_name || '')}</TableCell>
                    <TableCell>{planBenefitsLabel(item.order_type || item.plan_kind, item.grant_points)}</TableCell>
                    <TableCell>{formatMoney(item.amount, item.currency)}</TableCell>
                    <TableCell><OrderStatusChip status={item.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminResponsiveTable>
          <OrderDetailDialog
            order={selectedOrder}
            markingPaid={actionLoadingId === String(selectedOrder?.id || '')}
            cancelling={cancellingOrderId === String(selectedOrder?.id || '')}
            deleting={deletingOrderId === String(selectedOrder?.id || '')}
            onClose={() => {
              if (!actionLoadingId && !cancellingOrderId && !deletingOrderId) setSelectedOrder(null);
            }}
            onMarkPaid={(orderId) => void markPaid(orderId)}
            onRequestCancel={setCancelOrderTarget}
            onRequestDelete={setDeleteOrderTarget}
          />
          <ConfirmDialog
            open={Boolean(cancelOrderTarget)}
            title="关闭订单"
            message={`确认关闭订单“${String(cancelOrderTarget?.order_no || '')}”？关闭会保留订单与支付尝试记录，但不会产生权益或点数。`}
            onCancel={() => {
              if (!cancellingOrderId) setCancelOrderTarget(null);
            }}
            onConfirm={() => void cancelOrder()}
          />
          <ConfirmDialog
            open={Boolean(deleteOrderTarget)}
            title="删除订单"
            message={`确认删除订单“${String(deleteOrderTarget?.order_no || '')}”？只能删除未支付且未产生权益记录的订单，删除后不会保留在订单列表中。`}
            destructive
            onCancel={() => {
              if (!deletingOrderId) setDeleteOrderTarget(null);
            }}
            onConfirm={() => void deleteOrder()}
          />
        </Stack>
      )}
    </Stack>
  );
}
