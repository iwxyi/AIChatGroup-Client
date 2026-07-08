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
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminMetricGrid, AdminSection, AdminTableFrame, type AdminMetricItem } from '../../components/admin/AdminSurface';
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
const EMPTY_ORDER_SUMMARY = { total: 0, pending: 0, paid: 0, cancelled: 0, partiallyRefunded: 0, refunded: 0, failed: 0 };

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, unknown>> : [];
}

function formatPercent(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : '-';
}

function jsonText(value: unknown) {
  if (!value || (typeof value === 'object' && Object.keys(asRecord(value)).length === 0)) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function nonEmptyText(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
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
  if (status === 'partially_refunded') return '部分退款';
  if (status === 'refunded') return '已退款';
  if (status === 'processing') return '处理中';
  if (status === 'requested') return '已申请';
  if (status === 'succeeded') return '成功';
  return status || '-';
}

function orderStatusColor(value: unknown): 'default' | 'error' | 'info' | 'success' | 'warning' {
  const status = String(value || '');
  if (status === 'paid') return 'success';
  if (status === 'succeeded') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'processing' || status === 'requested') return 'warning';
  if (status === 'cancelled' || status === 'canceled' || status === 'failed') return 'error';
  if (status === 'partially_refunded' || status === 'refunded') return 'info';
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
  return status !== 'paid' && status !== 'partially_refunded' && status !== 'refunded';
}

function canCancelOrder(order: Record<string, unknown> | null) {
  if (!order) return false;
  const status = String(order.status || '');
  return status !== 'paid' && status !== 'partially_refunded' && status !== 'refunded' && status !== 'cancelled' && status !== 'canceled';
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

function JsonDetails({ title, payload }: { title: string; payload: unknown }) {
  const text = jsonText(payload);
  if (!text) return null;
  return (
    <Box
      component="details"
      sx={{
        mt: 1,
        '& summary': { cursor: 'pointer', color: 'text.secondary', fontSize: 13, fontWeight: 800 },
      }}
    >
      <Box component="summary">{title}</Box>
      <Box
        component="pre"
        sx={{
          mt: 0.75,
          p: 1,
          borderRadius: 1,
          bgcolor: 'background.default',
          border: 1,
          borderColor: 'divider',
          overflow: 'auto',
          maxHeight: 240,
          fontSize: 12,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

function PaymentAttemptCard({ item }: { item: Record<string, unknown> }) {
  const info = asRecord(item.paymentInfo);
  const fundBills = asArray(info.fundBillList);
  const fields: Array<[string, unknown]> = [
    ['外部交易号', info.tradeNo || item.provider_transaction_id],
    ['商户订单号', info.outTradeNo],
    ['交易状态', info.tradeStatus],
    ['买家账号', info.buyerLogonId],
    ['买家 ID', info.buyerUserId],
    ['订单总额', info.totalAmount],
    ['实收金额', info.receiptAmount],
    ['买家付款', info.buyerPayAmount],
    ['开票金额', info.invoiceAmount],
    ['集分宝金额', info.pointAmount],
    ['支付时间', info.gmtPayment],
  ];
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.default' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip size="small" label={String(item.channel || 'unknown')} color={String(item.channel || '') === 'alipay' ? 'primary' : 'default'} />
          <Chip size="small" label={statusLabel(item.status)} color={orderStatusColor(item.status)} variant="outlined" />
        </Stack>
        <Typography variant="caption" color="text.secondary">{formatOrderTime(item.created_at)}</Typography>
      </Stack>
      <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
        {fields.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => (
          <DetailLine key={label} label={label} value={nonEmptyText(value)} />
        ))}
      </Stack>
      {fundBills.length ? (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>资金渠道</Typography>
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>渠道</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>实际金额</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fundBills.map((row, index) => (
                <TableRow key={`${String(row.fund_channel || '')}-${index}`}>
                  <TableCell>{String(row.fund_channel || row.fundChannel || '-')}</TableCell>
                  <TableCell>{String(row.amount || '-')}</TableCell>
                  <TableCell>{String(row.real_amount || row.realAmount || '-')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : null}
      <JsonDetails title="完整支付返回" payload={item.responsePayload} />
    </Paper>
  );
}

function RefundRecordCard({
  item,
  syncing,
  onSync,
}: {
  item: Record<string, unknown>;
  syncing?: boolean;
  onSync?: (refundId: string) => void;
}) {
  const info = asRecord(item.refundInfo);
  const refundDetails = asArray(info.refundDetailItemList);
  const canSync = String(item.channel || '') === 'alipay';
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.default' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip size="small" label={String(item.refund_no || '')} />
          <Chip size="small" label={statusLabel(item.status)} color={orderStatusColor(item.status)} variant={String(item.status || '') === 'failed' ? 'filled' : 'outlined'} />
          <Chip size="small" label={String(item.channel || 'manual')} color={String(item.channel || '') === 'alipay' ? 'primary' : 'default'} />
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 900 }}>{formatMoney(item.amount, item.currency)}</Typography>
          {canSync && onSync ? (
            <Button size="small" variant="outlined" disabled={syncing} onClick={() => onSync(String(item.id || ''))}>
              同步退款
            </Button>
          ) : null}
        </Stack>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 1 }}>
        <DetailMetric label="扣回点数" value={formatPoints(item.point_reversal_amount)} tone="warning" />
        <DetailMetric label="点数退款金额" value={formatMoney(item.point_refund_amount, item.currency)} tone="primary" />
        <DetailMetric label="VIP 退款金额" value={formatMoney(item.vip_refund_amount, item.currency)} tone="success" />
      </Stack>
      <DetailSection title="退款进度">
        <OrderTimelineItem label="申请退款" time={item.requested_at} active />
        <OrderTimelineItem label="处理完成" time={item.processed_at} active={String(item.status || '') === 'succeeded'} />
        <OrderTimelineItem label="处理失败" time={item.failed_at} active={String(item.status || '') === 'failed'} />
      </DetailSection>
      <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
        <DetailLine label="退款原因" value={nonEmptyText(item.reason)} />
        <DetailLine label="外部交易号" value={nonEmptyText(info.tradeNo || item.provider_transaction_id)} />
        <DetailLine label="外部退款号" value={nonEmptyText(info.outRequestNo || item.provider_refund_id)} />
        <DetailLine label="退款流水金额" value={nonEmptyText(info.refundFee)} />
        <DetailLine label="资金变动" value={nonEmptyText(info.fundChange)} />
        <DetailLine label="退款到账时间" value={nonEmptyText(info.gmtRefundPay)} />
      </Stack>
      {refundDetails.length ? (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>退款资金渠道</Typography>
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>渠道</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>类型</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {refundDetails.map((row, index) => (
                <TableRow key={`${String(row.fund_channel || '')}-${index}`}>
                  <TableCell>{String(row.fund_channel || row.fundChannel || '-')}</TableCell>
                  <TableCell>{String(row.amount || '-')}</TableCell>
                  <TableCell>{String(row.bank_code || row.bankCode || row.fund_type || '-')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : null}
      <JsonDetails title="完整退款返回" payload={item.responsePayload} />
    </Paper>
  );
}

function OrderDetailDialog({
  order,
  detail,
  detailLoading,
  detailError,
  markingPaid,
  cancelling,
  deleting,
  refunding,
  syncingPayment,
  syncingRefundId,
  onClose,
  onReload,
  onMarkPaid,
  onRefund,
  onSyncPayment,
  onSyncRefund,
  onRequestCancel,
  onRequestDelete,
}: {
  order: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
  detailLoading: boolean;
  detailError: string | null;
  markingPaid: boolean;
  cancelling: boolean;
  deleting: boolean;
  refunding: boolean;
  syncingPayment: boolean;
  syncingRefundId: string | null;
  onClose: () => void;
  onReload: () => void;
  onMarkPaid: (orderId: string) => void;
  onRefund: (payload: Record<string, unknown>) => void;
  onSyncPayment: (orderId: string) => void;
  onSyncRefund: (refundId: string) => void;
  onRequestCancel: (order: Record<string, unknown>) => void;
  onRequestDelete: (order: Record<string, unknown>) => void;
}) {
  const open = Boolean(order);
  const detailOrder = asRecord(detail?.order);
  const displayOrder = Object.keys(detailOrder).length ? detailOrder : order;
  const orderId = String(displayOrder?.id || order?.id || '');
  const status = String(displayOrder?.status || order?.status || '');
  const isPaid = status === 'paid' || status === 'partially_refunded';
  const isPending = status === 'pending';
  const canSyncPayment = String(displayOrder?.payment_channel || order?.payment_channel || '') === 'alipay';
  const cancellable = canCancelOrder(displayOrder || order);
  const deletable = canDeleteOrder(displayOrder || order);
  const busy = markingPaid || cancelling || deleting || refunding || syncingPayment || Boolean(syncingRefundId);
  const detailRecord = asRecord(detail);
  const paymentAttempts = asArray(detailRecord.paymentAttempts);
  const refunds = asArray(detailRecord.refunds);
  const subscriptions = asArray(detailRecord.subscriptions);
  const pointLedgers = asArray(detailRecord.pointLedgers);
  const preview = asRecord(detailRecord.refundPreview);
  const previewPoints = asRecord(preview.points);
  const previewVip = asRecord(preview.vip);
  const maxRefundAmount = Number(preview.maxRefundAmount || 0);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('管理员退款');
  const refundAmountNumber = Number(refundAmount);
  const canRefund = isPaid && maxRefundAmount > 0 && Number.isFinite(refundAmountNumber) && refundAmountNumber > 0 && refundAmountNumber <= maxRefundAmount + 0.005 && !busy;

  useEffect(() => {
    if (!open) return;
    setRefundAmount(maxRefundAmount > 0 ? maxRefundAmount.toFixed(2) : '');
    setRefundReason('管理员退款');
  }, [open, orderId, maxRefundAmount]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
            <ReceiptLongIcon color="primary" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>订单详情</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
                {String(displayOrder?.order_no || order?.order_no || '')}
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={onClose} disabled={busy} aria-label="关闭">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {displayOrder ? (
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
                    {String(displayOrder.plan_name || '未命名套餐')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {String(displayOrder.user_nickname || displayOrder.user_phone || '未知用户')}
                  </Typography>
                </Stack>
                <OrderStatusChip status={displayOrder.status} />
              </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <DetailMetric label="订单金额" value={formatMoney(displayOrder.amount, displayOrder.currency)} tone="primary" />
              <DetailMetric label="已退金额" value={formatMoney(displayOrder.refunded_amount, displayOrder.currency)} tone="warning" />
              <DetailMetric label="套餐权益" value={planBenefitsLabel(displayOrder.order_type || displayOrder.plan_kind, displayOrder.grant_points)} tone="success" />
            </Stack>

            <DetailSection title="基础信息">
              <DetailLine label="订单号" value={String(displayOrder.order_no || '-')} />
              <DetailLine label="订单 ID" value={orderId || '-'} />
              <DetailLine label="用户" value={String(displayOrder.user_nickname || displayOrder.user_phone || '-')} />
              <DetailLine label="套餐编码" value={String(displayOrder.plan_code || '-')} />
              <DetailLine label="支付渠道" value={String(displayOrder.payment_channel || '未选择')} />
            </DetailSection>

            <DetailSection title="订单时间">
              <OrderTimelineItem label="创建订单" time={displayOrder.created_at} active />
              <OrderTimelineItem label="支付完成" time={displayOrder.paid_at} active={isPaid} />
              <OrderTimelineItem label="退款处理" time={displayOrder.refunded_at} active={status === 'partially_refunded' || status === 'refunded'} />
              <OrderTimelineItem label="关闭订单" time={displayOrder.cancelled_at} active={status === 'cancelled' || status === 'canceled'} />
            </DetailSection>

            <AdminRequestState loading={detailLoading} error={detailError} onRetry={onReload} />

            {detail && !detailLoading ? (
              <>
                <DetailSection title="支付信息">
                  {paymentAttempts.length ? (
                    <Stack spacing={1}>
                      {paymentAttempts.map((item) => <PaymentAttemptCard key={String(item.id)} item={item} />)}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>暂无支付尝试记录。</Typography>
                  )}
                </DetailSection>

                {preview && Object.keys(preview).length ? (
                  <DetailSection title="退款测算">
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ py: 1 }}>
                      <DetailMetric label="当前可退" value={formatMoney(preview.maxRefundAmount, displayOrder.currency)} tone="primary" />
                      <DetailMetric label="可扣回点数" value={formatPoints(previewPoints.reversiblePoints)} tone="warning" />
                      <DetailMetric label="当前点数余额" value={formatPoints(previewPoints.currentBalance)} tone="success" />
                    </Stack>
                    <DetailLine label="订单金额" value={formatMoney(preview.orderAmount, displayOrder.currency)} />
                    <DetailLine label="已退金额" value={formatMoney(preview.alreadyRefundedAmount, displayOrder.currency)} />
                    <DetailLine label="点数可退比例" value={formatPercent(previewPoints.refundRatio)} />
                    <DetailLine label="VIP 可退比例" value={formatPercent(previewVip.refundRatio)} />
                    <DetailLine label="VIP 剩余" value={Number(previewVip.remainingMs || 0) > 0 ? `${Math.ceil(Number(previewVip.remainingMs) / 86400000)} 天` : '-'} />
                  </DetailSection>
                ) : null}

                <DetailSection title="退款记录">
                  {refunds.length ? (
                    <Stack spacing={1}>
                      {refunds.map((item) => (
                        <RefundRecordCard
                          key={String(item.id)}
                          item={item}
                          syncing={syncingRefundId === String(item.id || '')}
                          onSync={onSyncRefund}
                        />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>暂无退款记录。</Typography>
                  )}
                </DetailSection>

                <DetailSection title="权益与点数流水">
                  {subscriptions.length ? (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>VIP 状态</TableCell>
                          <TableCell>开始</TableCell>
                          <TableCell>结束</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {subscriptions.map((item) => (
                          <TableRow key={String(item.id)}>
                            <TableCell>{statusLabel(item.status)}</TableCell>
                            <TableCell>{formatOrderTime(item.current_period_start || item.started_at)}</TableCell>
                            <TableCell>{formatOrderTime(item.current_period_end)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>暂无 VIP 权益记录。</Typography>
                  )}
                  {pointLedgers.length ? (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>时间</TableCell>
                          <TableCell>来源</TableCell>
                          <TableCell>变动</TableCell>
                          <TableCell>余额</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pointLedgers.map((item) => (
                          <TableRow key={String(item.id)}>
                            <TableCell>{formatOrderTime(item.created_at)}</TableCell>
                            <TableCell>{String(item.source_type || '-')}</TableCell>
                            <TableCell>
                              <Typography variant="body2" color={Number(item.amount || 0) < 0 ? 'error.main' : 'success.main'} sx={{ fontWeight: 900 }}>
                                {formatPoints(item.amount)}
                              </Typography>
                            </TableCell>
                            <TableCell>{formatPoints(item.balance_after)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>暂无点数流水。</Typography>
                  )}
                </DetailSection>
              </>
            ) : null}

            {deletable ? null : (
              <Alert severity="info" sx={{ mt: 0.5 }}>
                已支付或退款订单会关联权益、点数和财务记录，不能关闭或删除。
              </Alert>
            )}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', maxWidth: { xs: '100%', md: 'calc(100% - 96px)' } }}>
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
          {order && canSyncPayment ? (
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={busy}
              onClick={() => onSyncPayment(orderId)}
            >
              同步支付
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
          {displayOrder && isPaid && maxRefundAmount > 0 ? (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip size="small" color={String(displayOrder.payment_channel || '') === 'alipay' ? 'primary' : 'default'} label={String(displayOrder.payment_channel || '') === 'alipay' ? '支付宝自动退款' : '人工退款记录'} />
              <TextField
                size="small"
                label="退款金额"
                value={refundAmount}
                error={refundAmount !== '' && !canRefund}
                onChange={(event) => setRefundAmount(event.target.value)}
                sx={{ width: 128 }}
              />
              <TextField
                size="small"
                label="退款原因"
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                sx={{ width: { xs: '100%', sm: 180 } }}
              />
              <Button
                variant="contained"
                color="info"
                disabled={!canRefund}
                onClick={() => onRefund({ amount: refundAmountNumber, reason: refundReason.trim() || '管理员退款' })}
              >
                执行退款
              </Button>
            </Stack>
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
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Record<string, unknown> | null>(null);
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
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [syncingPaymentOrderId, setSyncingPaymentOrderId] = useState<string | null>(null);
  const [syncingRefundId, setSyncingRefundId] = useState<string | null>(null);
  const [closingExpiredOrders, setClosingExpiredOrders] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const selectedPlanId = planForm.id;

  const orderListAmount = useMemo(() => orders.reduce((total, item) => total + Number(item.amount || 0), 0), [orders]);

  const planSummary = useMemo(() => ({
    vip: plans.filter((item) => String(item.plan_kind || '') === 'vip').length,
    points: plans.filter((item) => Number(item.grant_points || 0) > 0).length,
    active: plans.filter((item) => String(item.status || '') === 'active').length,
  }), [plans]);
  const planMetrics = useMemo<AdminMetricItem[]>(() => [
    { key: 'vip', label: 'VIP 套餐', value: planSummary.vip, tone: 'primary' },
    { key: 'points', label: '含点数套餐', value: planSummary.points, tone: 'success' },
    { key: 'active', label: '启用中', value: planSummary.active, tone: 'warning' },
  ], [planSummary]);
  const orderMetrics = useMemo<AdminMetricItem[]>(() => [
    { key: 'total', label: '全部订单', value: Number(orderStatusSummary.total || 0), tone: 'primary' },
    { key: 'pending', label: '待支付', value: Number(orderStatusSummary.pending || 0), tone: 'warning' },
    { key: 'paid', label: '已支付', value: Number(orderStatusSummary.paid || 0), tone: 'success' },
    { key: 'refunded', label: '退款订单', value: Number(orderStatusSummary.refunded || 0) + Number(orderStatusSummary.partiallyRefunded || 0), tone: 'info' },
    { key: 'cancelled', label: '已关闭', value: Number(orderStatusSummary.cancelled || 0), tone: 'error' },
    { key: 'amount', label: '当前列表金额', value: orderListAmount.toFixed(2), helper: '按当前筛选汇总' },
  ], [orderListAmount, orderStatusSummary]);
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
        if (next) setSelectedOrder(next);
      }
    } catch (loadError) {
      setOrdersError(getAdminErrorMessage(loadError));
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadOrderDetail = async (orderId: string) => {
    if (!orderId) return;
    setOrderDetailLoading(true);
    setOrderDetailError(null);
    try {
      const detail = await adminApi.getOrderDetail(orderId);
      setSelectedOrderDetail(detail);
      const detailOrder = asRecord(detail.order);
      if (detailOrder.id) setSelectedOrder(detailOrder);
    } catch (loadError) {
      setOrderDetailError(getAdminErrorMessage(loadError));
    } finally {
      setOrderDetailLoading(false);
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
      await loadOrderDetail(orderId);
    } catch (actionError) {
      setOrdersError(getAdminErrorMessage(actionError));
    } finally {
      setActionLoadingId(null);
    }
  };

  const syncPayment = async (orderId: string) => {
    if (!orderId || syncingPaymentOrderId) return;
    setSyncingPaymentOrderId(orderId);
    setOrdersError(null);
    setOrderDetailError(null);
    try {
      const result = await adminApi.syncOrderPayment(orderId);
      const detail = asRecord(result.detail);
      if (Object.keys(detail).length) {
        setSelectedOrderDetail(detail);
        const detailOrder = asRecord(detail.order);
        if (detailOrder.id) setSelectedOrder(detailOrder);
      } else {
        await loadOrderDetail(orderId);
      }
      await loadOrders();
    } catch (syncError) {
      setOrderDetailError(getAdminErrorMessage(syncError));
    } finally {
      setSyncingPaymentOrderId(null);
    }
  };

  const syncRefund = async (refundId: string) => {
    const orderId = String(asRecord(selectedOrderDetail?.order).id || selectedOrder?.id || '');
    if (!orderId || !refundId || syncingRefundId) return;
    setSyncingRefundId(refundId);
    setOrdersError(null);
    setOrderDetailError(null);
    try {
      const result = await adminApi.syncOrderRefund(orderId, refundId);
      const detail = asRecord(result.detail);
      if (Object.keys(detail).length) {
        setSelectedOrderDetail(detail);
        const detailOrder = asRecord(detail.order);
        if (detailOrder.id) setSelectedOrder(detailOrder);
      } else {
        await loadOrderDetail(orderId);
      }
      await loadOrders();
    } catch (syncError) {
      setOrderDetailError(getAdminErrorMessage(syncError));
    } finally {
      setSyncingRefundId(null);
    }
  };

  const closeExpiredOrders = async () => {
    if (closingExpiredOrders) return;
    setClosingExpiredOrders(true);
    setOrdersError(null);
    try {
      await adminApi.closeExpiredOrders({ olderThanMinutes: 120, limit: 100 });
      await loadOrders();
      if (selectedOrder) await loadOrderDetail(String(selectedOrder.id || ''));
    } catch (closeError) {
      setOrdersError(getAdminErrorMessage(closeError));
    } finally {
      setClosingExpiredOrders(false);
    }
  };

  const refundOrder = async (payload: Record<string, unknown>) => {
    const orderId = String(asRecord(selectedOrderDetail?.order).id || selectedOrder?.id || '');
    if (!orderId || refundingOrderId) return;
    setRefundingOrderId(orderId);
    setOrdersError(null);
    setOrderDetailError(null);
    try {
      const detail = await adminApi.refundOrder(orderId, payload);
      setSelectedOrderDetail(detail);
      const detailOrder = asRecord(detail.order);
      if (detailOrder.id) setSelectedOrder(detailOrder);
      await loadOrders();
    } catch (refundError) {
      setOrderDetailError(getAdminErrorMessage(refundError));
    } finally {
      setRefundingOrderId(null);
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
      await loadOrderDetail(orderId);
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
      if (String(selectedOrder?.id || '') === orderId) {
        setSelectedOrder(null);
        setSelectedOrderDetail(null);
      }
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
      <AdminSection
        title="套餐订单"
        subtitle="管理用户可购买的权益套餐、点数套餐和支付订单。"
        bodySx={{ py: 0.75 }}
      >
        <Tabs value={tab} onChange={changeTab} variant="scrollable" allowScrollButtonsMobile sx={{ minWidth: 0, flex: '1 1 auto' }}>
          <Tab label="套餐" />
          <Tab label="订单" />
        </Tabs>
      </AdminSection>

      {tab === 0 ? (
        <Stack spacing={2}>
          <AdminRequestState loading={plansLoading} error={plansError} onRetry={() => void loadPlans()} />
          <AdminSection
            title="套餐概览"
            subtitle="套餐可以单独售卖 VIP、点数，也可以同时包含多种权益。"
            action={(
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openCreatePlanDialog}
                sx={{ flex: '0 0 auto' }}
              >
                新建套餐
              </Button>
            )}
          >
            <AdminMetricGrid items={planMetrics} compact minWidth={132} />
          </AdminSection>

          <AdminSection title="套餐列表" subtitle="点击套餐行可以进入编辑。" bodySx={{ p: 0 }}>
            <AdminTableFrame minWidth={900}>
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
            </AdminTableFrame>
          </AdminSection>

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
          <AdminSection title="订单概览">
            <AdminMetricGrid items={orderMetrics} compact minWidth={128} />
          </AdminSection>
          <AdminSection
            title="订单筛选"
            subtitle="筛选订单状态，或批量关闭超时待支付订单。"
            action={(
              <OrderStatusFilterButton active={status === ''} label="全部" count={Number(orderStatusSummary.total || 0)} onClick={() => setStatus('')} />
            )}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <OrderStatusFilterButton active={status === 'pending'} label="待支付" count={Number(orderStatusSummary.pending || 0)} color="warning" onClick={() => setStatus('pending')} />
              <OrderStatusFilterButton active={status === 'paid'} label="已支付" count={Number(orderStatusSummary.paid || 0)} color="success" onClick={() => setStatus('paid')} />
              <OrderStatusFilterButton active={status === 'partially_refunded'} label="部分退款" count={Number(orderStatusSummary.partiallyRefunded || 0)} color="info" onClick={() => setStatus('partially_refunded')} />
              <OrderStatusFilterButton active={status === 'refunded'} label="已退款" count={Number(orderStatusSummary.refunded || 0)} color="info" onClick={() => setStatus('refunded')} />
              <OrderStatusFilterButton active={status === 'cancelled'} label="已关闭" count={Number(orderStatusSummary.cancelled || 0)} color="error" onClick={() => setStatus('cancelled')} />
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadOrders()}>刷新</Button>
              <Button
                color="warning"
                variant="outlined"
                startIcon={<EventBusyIcon />}
                disabled={closingExpiredOrders}
                onClick={() => void closeExpiredOrders()}
              >
                关闭超时待支付
              </Button>
            </Stack>
          </AdminSection>
          <AdminRequestState loading={ordersLoading} error={ordersError} onRetry={() => void loadOrders()} />
          <AdminSection title="订单列表" subtitle="点击订单行可以查看支付、退款和权益详情。" bodySx={{ p: 0 }}>
            <AdminTableFrame minWidth={820}>
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
                    onClick={() => {
                      setSelectedOrder(item);
                      setSelectedOrderDetail(null);
                      void loadOrderDetail(String(item.id || ''));
                    }}
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
            </AdminTableFrame>
          </AdminSection>
          <OrderDetailDialog
            order={selectedOrder}
            detail={selectedOrderDetail}
            detailLoading={orderDetailLoading}
            detailError={orderDetailError}
            markingPaid={actionLoadingId === String(selectedOrder?.id || '')}
            cancelling={cancellingOrderId === String(selectedOrder?.id || '')}
            deleting={deletingOrderId === String(selectedOrder?.id || '')}
            refunding={refundingOrderId === String(selectedOrder?.id || '')}
            syncingPayment={syncingPaymentOrderId === String(selectedOrder?.id || '')}
            syncingRefundId={syncingRefundId}
            onClose={() => {
              if (!actionLoadingId && !cancellingOrderId && !deletingOrderId && !refundingOrderId && !syncingPaymentOrderId && !syncingRefundId) {
                setSelectedOrder(null);
                setSelectedOrderDetail(null);
                setOrderDetailError(null);
              }
            }}
            onReload={() => void loadOrderDetail(String(selectedOrder?.id || ''))}
            onMarkPaid={(orderId) => void markPaid(orderId)}
            onRefund={(payload) => void refundOrder(payload)}
            onSyncPayment={(orderId) => void syncPayment(orderId)}
            onSyncRefund={(refundId) => void syncRefund(refundId)}
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
