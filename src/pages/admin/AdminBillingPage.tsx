import { useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
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
import AdminDetailCard from '../../components/admin/AdminDetailCard';
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
  return status || '-';
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

function OrderDetailCard({ selectedOrder }: { selectedOrder: Record<string, unknown> | null }) {
  return (
    <AdminDetailCard title="订单详情">
      {selectedOrder ? (
        <Stack spacing={0.5}>
          <Typography variant="body2">订单号：{String(selectedOrder.order_no || '')}</Typography>
          <Typography variant="body2">用户：{String(selectedOrder.user_nickname || selectedOrder.user_phone || '')}</Typography>
          <Typography variant="body2">套餐：{String(selectedOrder.plan_name || '')}</Typography>
          <Typography variant="body2">状态：{statusLabel(selectedOrder.status)}</Typography>
          <Typography variant="body2">金额：{formatMoney(selectedOrder.amount, selectedOrder.currency)}</Typography>
          <Typography variant="body2">支付渠道：{String(selectedOrder.payment_channel || '')}</Typography>
          <Typography variant="body2">创建时间：{formatOrderTime(selectedOrder.created_at)}</Typography>
          <Typography variant="body2">支付时间：{formatOrderTime(selectedOrder.paid_at)}</Typography>
        </Stack>
      ) : <Alert severity="info">点击订单行查看详情</Alert>}
    </AdminDetailCard>
  );
}

export default function AdminBillingPage() {
  const [tab, setTab] = useState(() => readPersistentUiValue<number>(BILLING_TAB_STORAGE_KEY, 0, isBillingTab));
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN_FORM);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const selectedPlanId = planForm.id;

  const orderSummary = useMemo(() => ({
    pending: orders.filter((item) => String(item.status || '') === 'pending').length,
    paid: orders.filter((item) => String(item.status || '') === 'paid').length,
    amount: orders.reduce((total, item) => total + Number(item.amount || 0), 0),
  }), [orders]);

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
          <AdminInlineGroup gap={1.25}>
            <Button variant={status === '' ? 'contained' : 'outlined'} onClick={() => setStatus('')}>全部</Button>
            <Button variant={status === 'pending' ? 'contained' : 'outlined'} onClick={() => setStatus('pending')}>待支付</Button>
            <Button variant={status === 'paid' ? 'contained' : 'outlined'} onClick={() => setStatus('paid')}>已支付</Button>
            <Button startIcon={<RefreshIcon />} onClick={() => void loadOrders()}>刷新</Button>
          </AdminInlineGroup>
          <AdminRequestState loading={ordersLoading} error={ordersError} onRetry={() => void loadOrders()} />
          <AdminInlineGroup gap={1.25}>
            <Alert severity="info">待支付：{orderSummary.pending}</Alert>
            <Alert severity="success">已支付：{orderSummary.paid}</Alert>
            <Alert severity="warning">当前列表金额：{orderSummary.amount.toFixed(2)}</Alert>
          </AdminInlineGroup>
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
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((item) => (
                  <TableRow key={String(item.id)} hover selected={String(selectedOrder?.id || '') === String(item.id)} onClick={() => setSelectedOrder(item)}>
                    <TableCell>{String(item.order_no || '')}</TableCell>
                    <TableCell>{String(item.user_nickname || item.user_phone || '')}</TableCell>
                    <TableCell>{String(item.plan_name || '')}</TableCell>
                    <TableCell>{planBenefitsLabel(item.order_type || item.plan_kind, item.grant_points)}</TableCell>
                    <TableCell>{formatMoney(item.amount, item.currency)}</TableCell>
                    <TableCell>{statusLabel(item.status)}</TableCell>
                    <TableCell align="right">
                      {String(item.status || '') !== 'paid' ? (
                        <Button size="small" disabled={actionLoadingId === String(item.id)} onClick={(event) => { event.stopPropagation(); void markPaid(String(item.id)); }}>确认支付</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminResponsiveTable>
          <OrderDetailCard selectedOrder={selectedOrder} />
        </Stack>
      )}
    </Stack>
  );
}
