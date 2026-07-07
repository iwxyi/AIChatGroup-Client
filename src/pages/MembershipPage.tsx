import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BoltIcon from '@mui/icons-material/Bolt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PaymentIcon from '@mui/icons-material/Payment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLayoutHeaderActions } from '../components/layout/AppLayoutContext';
import { useAuthStore } from '../stores/useAuthStore';
import { api, ApiError, type BillingMembershipResponse, type BillingOrderItem, type BillingPaymentResponse, type BillingPlanItem } from '../services/api';
import { formatAiBalanceAmount } from '../utils/aiPoints';
import AppSnackbar from '../components/common/AppSnackbar';

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function parseMetadata(value: unknown) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function planGrantPoints(plan: BillingPlanItem) {
  return Math.max(0, toNumber(plan.grant_points));
}

function planIsVip(plan: BillingPlanItem) {
  return String(plan.plan_kind || '') === 'vip';
}

function planBenefits(plan: BillingPlanItem, isZh: boolean) {
  const benefits = [];
  if (planIsVip(plan)) benefits.push(isZh ? 'VIP' : 'VIP');
  if (planGrantPoints(plan) > 0) benefits.push(isZh ? '点数' : 'Points');
  return benefits;
}

function formatMoney(value: unknown, currency: unknown = 'CNY') {
  const amount = toNumber(value);
  const normalizedCurrency = String(currency || 'CNY').trim().toUpperCase();
  if (normalizedCurrency === 'CNY' || normalizedCurrency === 'RMB') return `¥${amount.toFixed(2)}`;
  if (normalizedCurrency === 'USD') return `$${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${normalizedCurrency || 'CNY'}`;
}

function formatPoints(value: unknown) {
  const amount = toNumber(value);
  if (!Number.isFinite(amount) || amount <= 0) return '0P';
  return `${Number.isInteger(amount) ? amount : Number(amount.toFixed(2))}P`;
}

function formatDateTime(value: unknown) {
  const parsed = toNumber(value);
  return parsed > 0 ? new Date(parsed).toLocaleString() : '-';
}

function formatDate(value: unknown) {
  const parsed = toNumber(value);
  return parsed > 0 ? new Date(parsed).toLocaleDateString() : '-';
}

function formatDaysLeft(value: unknown, isZh: boolean) {
  const end = toNumber(value);
  if (end <= 0) return '-';
  const days = Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  return isZh ? `${days} 天` : `${days}d`;
}

function orderNo(order: BillingOrderItem) {
  return String(order.orderNo || order.order_no || '');
}

function orderPlanName(order: BillingOrderItem) {
  return String(order.planName || order.plan_name || '-');
}

function orderCreatedAt(order: BillingOrderItem) {
  return order.createdAt ?? order.created_at;
}

function orderStatusLabel(value: unknown, isZh: boolean) {
  const status = String(value || '');
  if (status === 'paid') return isZh ? '已支付' : 'Paid';
  if (status === 'pending') return isZh ? '待支付' : 'Pending';
  if (status === 'cancelled') return isZh ? '已取消' : 'Cancelled';
  return status || '-';
}

function orderStatusColor(value: unknown): 'success' | 'warning' | 'default' {
  const status = String(value || '');
  if (status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  return 'default';
}

function getPlanFeatures(plan: BillingPlanItem, isZh: boolean) {
  const metadata = parseMetadata(plan.metadata);
  const features = Array.isArray(metadata.features)
    ? metadata.features.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (features.length) return features.slice(0, 4);
  const fallback = [];
  if (planIsVip(plan)) fallback.push(isZh ? '解锁会员功能权益' : 'Unlock member features');
  if (planGrantPoints(plan) > 0) fallback.push(isZh ? `到账 ${formatPoints(planGrantPoints(plan))} AI 点数` : `${formatPoints(planGrantPoints(plan))} AI points`);
  fallback.push(isZh ? '支付完成后自动履约' : 'Automatically fulfilled after payment');
  return fallback;
}

function formatAiPoints(balance: Record<string, unknown> | null, loading: boolean, isZh: boolean) {
  if (loading) return isZh ? '刷新中' : 'Refreshing';
  const raw = balance?.availableBalance ?? balance?.available_balance;
  if (typeof raw === 'number' && Number.isFinite(raw)) return formatAiBalanceAmount(balance);
  return isZh ? '未分配' : 'Not assigned';
}

function submitPaymentForm(payment: BillingPaymentResponse, targetWindow: Window | null) {
  const action = String(payment.formAction || '').trim();
  const fields = payment.formFields || {};
  if (action && Object.keys(fields).length > 0) {
    const doc = targetWindow?.document || window.document;
    if (targetWindow) {
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Redirecting...</title></head><body></body></html>');
      doc.close();
    }
    const form = doc.createElement('form');
    form.method = 'post';
    form.action = action;
    form.style.display = 'none';
    Object.entries(fields).forEach(([key, value]) => {
      const input = doc.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    });
    doc.body.appendChild(form);
    form.submit();
    return;
  }
  if (payment.paymentUrl) {
    if (targetWindow) targetWindow.location.href = payment.paymentUrl;
    else window.location.href = payment.paymentUrl;
    return;
  }
  throw new Error('支付参数缺失，无法跳转支付宝');
}

function LoadingLine({ loading }: { loading: boolean }) {
  return (
    <Box sx={{ height: 4 }}>
      {loading ? <LinearProgress sx={{ height: 4, borderRadius: 999 }} /> : null}
    </Box>
  );
}

export default function MembershipPage() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const navigate = useNavigate();
  const { setHeaderTitle, setHeaderBackAction, setHeaderActions } = useLayoutHeaderActions();
  const { authMode, isLoggedIn } = useAuthStore();
  const [plans, setPlans] = useState<BillingPlanItem[]>([]);
  const [membership, setMembership] = useState<BillingMembershipResponse | null>(null);
  const [aiBalance, setAiBalance] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiBalanceLoading, setAiBalanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchasingPlanCode, setPurchasingPlanCode] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    setHeaderTitle(t('nav.membership'));
    setHeaderBackAction(null);
    setHeaderActions(null);
    return () => {
      setHeaderTitle(null);
      setHeaderBackAction(null);
      setHeaderActions(null);
    };
  }, [setHeaderActions, setHeaderBackAction, setHeaderTitle, t]);

  const loadData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const planResult = await api.getBillingPlans();
      setPlans(planResult.items || []);
      if (authMode !== 'local' && isLoggedIn) {
        setAiBalanceLoading(true);
        const [membershipResult, balanceResult] = await Promise.all([
          api.getBillingMembership(),
          api.getAiBalance(undefined, { force }),
        ]);
        setMembership(membershipResult);
        setAiBalance(balanceResult);
      } else {
        setMembership(null);
        setAiBalance(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : (isZh ? '加载会员信息失败' : 'Failed to load membership'));
    } finally {
      setLoading(false);
      setAiBalanceLoading(false);
    }
  }, [authMode, isLoggedIn, isZh]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (authMode === 'local' || !isLoggedIn) return undefined;
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void loadData(true);
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [authMode, isLoggedIn, loadData]);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => {
    const featuredDiff = Number(toBoolean(b.featured)) - Number(toBoolean(a.featured));
    if (featuredDiff) return featuredDiff;
    const vipDiff = Number(planIsVip(b)) - Number(planIsVip(a));
    if (vipDiff) return vipDiff;
    return toNumber(a.price_amount) - toNumber(b.price_amount);
  }), [plans]);

  const vipPlans = sortedPlans.filter(planIsVip);
  const pointPlans = sortedPlans.filter((plan) => !planIsVip(plan) && planGrantPoints(plan) > 0);
  const activeSubscription = membership?.activeSubscription || null;
  const latestSubscription = membership?.latestSubscription || null;
  const recentOrders = membership?.recentOrders || [];
  const loggedInCloud = authMode !== 'local' && isLoggedIn;

  const handlePurchase = async (plan: BillingPlanItem) => {
    if (!loggedInCloud) {
      navigate('/login', { state: { from: { pathname: '/membership' } } });
      return;
    }
    const planCode = String(plan.code || '').trim();
    if (!planCode || purchasingPlanCode) return;
    const paymentWindow = window.open('', '_blank');
    if (paymentWindow) {
      paymentWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>支付宝支付</title></head><body style="font-family:system-ui,sans-serif;padding:24px">正在创建安全支付请求...</body></html>');
      paymentWindow.document.close();
    }
    setPurchasingPlanCode(planCode);
    setError(null);
    try {
      const order = await api.createBillingOrder(planCode, 'alipay');
      const payment = await api.initiateBillingPayment(String(order.id), 'alipay');
      if (payment.channel === 'manual') {
        paymentWindow?.close();
        setSnackbar({ open: true, message: payment.message || (isZh ? '订单已创建，等待后台确认支付' : 'Order created, waiting for manual confirmation'), severity: 'info' });
        await loadData(true);
        return;
      }
      submitPaymentForm(payment, paymentWindow);
      setSnackbar({ open: true, message: isZh ? '已打开支付宝收银台，完成支付后回到此页刷新状态。' : 'Alipay checkout opened. Return here and refresh after payment.', severity: 'success' });
      window.setTimeout(() => {
        void loadData(true);
      }, 2500);
    } catch (purchaseError) {
      paymentWindow?.close();
      const message = purchaseError instanceof ApiError || purchaseError instanceof Error
        ? purchaseError.message
        : (isZh ? '发起支付失败' : 'Payment failed');
      setSnackbar({ open: true, message, severity: 'error' });
      setError(message);
    } finally {
      setPurchasingPlanCode(null);
    }
  };

  const heroStatus = activeSubscription
    ? (isZh ? '会员生效中' : 'Membership active')
    : latestSubscription
      ? (isZh ? '会员已到期' : 'Membership expired')
      : (isZh ? '尚未开通会员' : 'No membership yet');

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, pt: { xs: 1, sm: 2 }, pb: { xs: 12, sm: 8 }, maxWidth: 1180, mx: 'auto' }}>
      <Stack spacing={2.25}>
        <LoadingLine loading={loading} />
        <Card
          variant="outlined"
          sx={{
            overflow: 'hidden',
            borderRadius: 2,
            borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.30 : 0.18),
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(18,18,18,0.96)' : 'rgba(255,255,255,0.94)',
            background: (theme) => theme.palette.mode === 'dark'
              ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.30)}, ${alpha(theme.palette.success.dark, 0.14)} 52%, ${alpha(theme.palette.warning.dark, 0.16)}), ${theme.palette.background.paper}`
              : `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.22)}, ${alpha(theme.palette.success.light, 0.16)} 52%, ${alpha(theme.palette.warning.light, 0.20)}), ${theme.palette.background.paper}`,
          }}
        >
          <CardContent sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.35fr 0.65fr' }, gap: 2.25, alignItems: 'stretch' }}>
            <Stack spacing={1.6} sx={{ justifyContent: 'center' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip icon={<WorkspacePremiumIcon />} label={isZh ? '会员中心' : 'Membership'} color="primary" size="small" />
                <Chip icon={<BoltIcon />} label={isZh ? '权益实时到账' : 'Instant fulfillment'} size="small" />
              </Stack>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: 0, fontSize: { xs: 28, sm: 36 } }}>
                  {isZh ? '让你的 AI 世界持续生长' : 'Keep your AI world growing'}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 680, lineHeight: 1.75 }}>
                  {isZh
                    ? '开通会员解锁产品能力，购买点数用于官方 AI 调用。支付成功后系统会自动记录订单、开通权益并发放点数。'
                    : 'Unlock product capabilities with membership and buy points for official AI calls. Orders, entitlements, and points are fulfilled automatically after payment.'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Button variant="contained" startIcon={<PaymentIcon />} onClick={() => document.getElementById('membership-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  {isZh ? '选择套餐' : 'Choose plan'}
                </Button>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadData(true)}>
                  {isZh ? '刷新状态' : 'Refresh'}
                </Button>
              </Stack>
            </Stack>
            <Box
              sx={{
                border: '1px solid',
                borderColor: (theme) => alpha(theme.palette.divider, 0.8),
                borderRadius: 2,
                p: 2,
                bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.62 : 0.74),
                backdropFilter: 'blur(16px)',
              }}
            >
              <Stack spacing={1.2}>
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0, fontWeight: 800 }}>
                  {isZh ? '当前权益' : 'Current benefits'}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>{heroStatus}</Typography>
                <Divider />
                <Stack spacing={0.9}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography color="text.secondary">{isZh ? '会员套餐' : 'Plan'}</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{activeSubscription?.planName || latestSubscription?.planName || '-'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography color="text.secondary">{isZh ? '有效期至' : 'Valid until'}</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{formatDate(activeSubscription?.currentPeriodEnd)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography color="text.secondary">{isZh ? 'AI点数' : 'AI points'}</Typography>
                    <Typography sx={{ fontWeight: 900 }}>{loggedInCloud ? formatAiPoints(aiBalance, aiBalanceLoading, isZh) : (isZh ? '登录后查看' : 'Sign in to view')}</Typography>
                  </Box>
                </Stack>
              </Stack>
            </Box>
          </CardContent>
        </Card>

        {error ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void loadData(true)}>{isZh ? '重试' : 'Retry'}</Button>}>{error}</Alert> : null}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.25 }}>
          {[
            { label: isZh ? '会员状态' : 'Membership', value: heroStatus, icon: <WorkspacePremiumIcon fontSize="small" /> },
            { label: isZh ? '剩余有效期' : 'Days left', value: activeSubscription ? formatDaysLeft(activeSubscription.currentPeriodEnd, isZh) : '-', icon: <AutoAwesomeIcon fontSize="small" /> },
            { label: isZh ? 'AI点数余额' : 'AI balance', value: loggedInCloud ? formatAiPoints(aiBalance, aiBalanceLoading, isZh) : (isZh ? '登录后查看' : 'Sign in'), icon: <BoltIcon fontSize="small" /> },
          ].map((item) => (
            <Card key={item.label} variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
                  {item.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography noWrap sx={{ fontWeight: 850 }}>{item.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>

        <Stack id="membership-plans" spacing={1.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>{isZh ? '会员与点数套餐' : 'Membership and point plans'}</Typography>
              <Typography variant="body2" color="text.secondary">{isZh ? 'VIP 和点数可以独立购买，也可以组合购买。' : 'VIP and points can be purchased independently or together.'}</Typography>
            </Box>
            {loading ? <CircularProgress size={22} /> : null}
          </Box>

          {plans.length === 0 && !loading ? <Alert severity="info">{isZh ? '暂无可购买套餐' : 'No plans available'}</Alert> : null}

          {vipPlans.length > 0 ? (
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 800 }}>{isZh ? 'VIP 套餐' : 'VIP plans'}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.min(vipPlans.length, 3)}, minmax(0, 1fr))` }, gap: 1.5 }}>
                {vipPlans.map((plan) => {
                  const featured = toBoolean(plan.featured);
                  const features = getPlanFeatures(plan, isZh);
                  const benefits = planBenefits(plan, isZh);
                  const purchasing = purchasingPlanCode === plan.code;
                  return (
                    <Card
                      key={plan.code}
                      variant="outlined"
                      sx={{
                        borderRadius: 2,
                        height: '100%',
                        borderColor: (theme) => featured ? alpha(theme.palette.primary.main, 0.55) : theme.palette.divider,
                        boxShadow: (theme) => featured ? `0 18px 42px ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.14)}` : 'none',
                      }}
                    >
                      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.4 }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography variant="h6" sx={{ fontWeight: 900 }}>{plan.name}</Typography>
                          {featured ? <Chip label={isZh ? '推荐' : 'Featured'} color="primary" size="small" /> : null}
                        </Stack>
                        <Typography color="text.secondary" sx={{ minHeight: 42 }}>{plan.description || (isZh ? '会员权益套餐' : 'Membership plan')}</Typography>
                        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                          {benefits.map((benefit) => <Chip key={benefit} size="small" label={benefit} />)}
                        </Stack>
                        <Box sx={{ mt: 0.5 }}>
                          <Typography component="span" sx={{ fontSize: 34, lineHeight: 1, fontWeight: 950 }}>{formatMoney(plan.price_amount, plan.currency)}</Typography>
                          {plan.duration_days ? <Typography component="span" color="text.secondary" sx={{ ml: 0.75 }}>/ {plan.duration_days}{isZh ? '天' : 'd'}</Typography> : null}
                        </Box>
                        <Stack spacing={0.9} sx={{ flex: 1 }}>
                          {features.map((feature) => (
                            <Stack key={feature} direction="row" spacing={0.8} sx={{ alignItems: 'flex-start' }}>
                              <CheckCircleIcon color="success" sx={{ fontSize: 18, mt: 0.15 }} />
                              <Typography variant="body2">{feature}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                        <Button variant={featured ? 'contained' : 'outlined'} startIcon={<PaymentIcon />} disabled={Boolean(purchasingPlanCode)} onClick={() => void handlePurchase(plan)}>
                          {purchasing ? (isZh ? '正在发起支付' : 'Starting payment') : (isZh ? '立即开通' : 'Subscribe')}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </Stack>
          ) : null}

          {pointPlans.length > 0 ? (
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 800 }}>{isZh ? '点数包' : 'Point packs'}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.min(pointPlans.length, 4)}, minmax(0, 1fr))` }, gap: 1.25 }}>
                {pointPlans.map((plan) => {
                  const purchasing = purchasingPlanCode === plan.code;
                  return (
                    <Card key={plan.code} variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, height: '100%' }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography sx={{ fontWeight: 900 }}>{plan.name}</Typography>
                          <Chip icon={<BoltIcon />} label={formatPoints(planGrantPoints(plan))} size="small" color="success" />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{plan.description || (isZh ? '补充官方 AI 调用点数' : 'Top up official AI points')}</Typography>
                        <Typography sx={{ fontSize: 26, fontWeight: 950 }}>{formatMoney(plan.price_amount, plan.currency)}</Typography>
                        <Button variant="outlined" startIcon={<PaymentIcon />} disabled={Boolean(purchasingPlanCode)} onClick={() => void handlePurchase(plan)}>
                          {purchasing ? (isZh ? '正在发起支付' : 'Starting payment') : (isZh ? '购买点数' : 'Buy points')}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </Stack>
          ) : null}
        </Stack>

        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <ReceiptLongIcon color="action" />
                <Typography variant="h6" sx={{ fontWeight: 900 }}>{isZh ? '最近订单' : 'Recent orders'}</Typography>
              </Stack>
              <Button size="small" startIcon={<RefreshIcon />} onClick={() => void loadData(true)}>{isZh ? '刷新' : 'Refresh'}</Button>
            </Stack>
            {!loggedInCloud ? (
              <Alert severity="info">{isZh ? '登录后可查看购买记录和会员状态。' : 'Sign in to view purchase history and membership status.'}</Alert>
            ) : recentOrders.length === 0 ? (
              <Typography color="text.secondary">{isZh ? '暂无订单' : 'No orders yet'}</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={0}>
                {recentOrders.map((order) => (
                  <Box key={String(order.id)} sx={{ py: 1.2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 0.8fr 0.8fr auto' }, gap: 1, alignItems: 'center' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 800 }}>{orderPlanName(order)}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{orderNo(order)}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">{formatDateTime(orderCreatedAt(order))}</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{formatMoney(order.amount, order.currency)}</Typography>
                    <Chip size="small" color={orderStatusColor(order.status)} label={orderStatusLabel(order.status, isZh)} />
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>

      <AppSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
