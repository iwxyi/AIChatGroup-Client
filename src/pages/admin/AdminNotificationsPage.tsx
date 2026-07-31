import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AdminInlineGroup from '../../components/admin/AdminInlineGroup';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminMetricGrid, AdminSection, AdminTableFrame, type AdminMetricItem } from '../../components/admin/AdminSurface';
import { adminApi, type AdminNotificationJobPayload, type AdminSystemAnnouncement, type AdminSystemAnnouncementPayload } from '../../services/adminApi';

type NotificationChannel = 'in_app' | 'email' | 'sms';

type AnnouncementForm = {
  id: string;
  title: string;
  body: string;
  severity: string;
  status: string;
  audienceType: string;
  audienceUserIdsText: string;
  audienceInactiveMonths: string;
  startsAt: string;
  endsAt: string;
  pinnedEnabled: boolean;
  popupEnabled: boolean;
  sortOrder: string;
};

type DeliveryForm = {
  recipient: string;
  userId: string;
  scheduledAt: string;
  subject: string;
  body: string;
  code: string;
  purpose: string;
};

const EMPTY_ANNOUNCEMENT_FORM: AnnouncementForm = {
  id: '',
  title: '',
  body: '',
  severity: 'warning',
  status: 'active',
  audienceType: 'all',
  audienceUserIdsText: '',
  audienceInactiveMonths: '3',
  startsAt: '',
  endsAt: '',
  pinnedEnabled: true,
  popupEnabled: true,
  sortOrder: '0',
};

const EMPTY_DELIVERY_FORM: DeliveryForm = {
  recipient: '',
  userId: '',
  scheduledAt: '',
  subject: '',
  body: '',
  code: '',
  purpose: 'login',
};

function parsePayload(value: unknown) {
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

function formatTime(value: unknown) {
  const timestamp = Number(value || 0);
  return timestamp > 0 ? new Date(timestamp).toLocaleString() : '-';
}

function toDateTimeInputValue(value: number | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeInputValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = new Date(trimmed).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function announcementToForm(item: AdminSystemAnnouncement): AnnouncementForm {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    severity: item.severity || 'warning',
    status: item.status || 'active',
    audienceType: item.audienceType || 'all',
    audienceUserIdsText: (item.audienceUserIds || []).join('\n'),
    audienceInactiveMonths: String(item.audienceInactiveMonths || 3),
    startsAt: toDateTimeInputValue(item.startsAt),
    endsAt: toDateTimeInputValue(item.endsAt),
    pinnedEnabled: item.pinnedEnabled !== false,
    popupEnabled: item.popupEnabled !== false,
    sortOrder: String(item.sortOrder || 0),
  };
}

function announcementPayloadFromForm(form: AnnouncementForm): AdminSystemAnnouncementPayload {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    severity: form.severity,
    status: form.status,
    audienceType: form.audienceType,
    audienceUserIds: form.audienceUserIdsText.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean),
    audienceInactiveMonths: form.audienceType === 'inactive' && Number.isFinite(Number(form.audienceInactiveMonths)) ? Math.floor(Number(form.audienceInactiveMonths)) : null,
    startsAt: fromDateTimeInputValue(form.startsAt),
    endsAt: fromDateTimeInputValue(form.endsAt),
    pinnedEnabled: form.pinnedEnabled,
    popupEnabled: form.popupEnabled,
    sortOrder: Number.isFinite(Number(form.sortOrder)) ? Math.floor(Number(form.sortOrder)) : 0,
  };
}

function deliveryPayloadFromForm(channel: 'email' | 'sms', form: DeliveryForm): AdminNotificationJobPayload {
  return {
    channel,
    recipient: form.recipient.trim(),
    userId: form.userId.trim() || null,
    scheduledAt: fromDateTimeInputValue(form.scheduledAt),
    subject: form.subject.trim(),
    body: form.body.trim(),
    code: form.code.trim(),
    purpose: form.purpose.trim(),
  };
}

function announcementStatusLabel(status: string) {
  if (status === 'active') return '生效';
  if (status === 'archived') return '归档';
  return '草稿';
}

function announcementSeverityLabel(severity: string) {
  if (severity === 'error') return '紧急';
  if (severity === 'warning') return '重点';
  if (severity === 'success') return '完成';
  return '普通';
}

function announcementAudienceLabel(item: AdminSystemAnnouncement) {
  if (item.audienceType === 'authenticated') return '已登录用户';
  if (item.audienceType === 'free') return '免费用户';
  if (item.audienceType === 'member') return '会员用户';
  if (item.audienceType === 'inactive') return `长期未使用 ${item.audienceInactiveMonths || '-'} 个月`;
  if (item.audienceType === 'users') return `指定用户 ${item.audienceUserIds?.length || 0}`;
  return '全用户';
}

function AnnouncementFormBlock({
  form,
  onChange,
}: {
  form: AnnouncementForm;
  onChange: (patch: Partial<AnnouncementForm>) => void;
}) {
  return (
    <Stack spacing={2.25}>
      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>基础信息</Typography>
        <TextField label="标题" value={form.title} onChange={(event) => onChange({ title: event.target.value })} size="small" fullWidth autoFocus />
        <TextField label="站内信内容" value={form.body} onChange={(event) => onChange({ body: event.target.value })} multiline minRows={4} maxRows={10} fullWidth />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
          <TextField select label="重要程度" value={form.severity} onChange={(event) => onChange({ severity: event.target.value })} size="small">
            <MenuItem value="info">普通</MenuItem>
            <MenuItem value="warning">重点</MenuItem>
            <MenuItem value="error">紧急</MenuItem>
            <MenuItem value="success">完成</MenuItem>
          </TextField>
          <TextField select label="状态" value={form.status} onChange={(event) => onChange({ status: event.target.value })} size="small">
            <MenuItem value="draft">草稿</MenuItem>
            <MenuItem value="active">生效</MenuItem>
            <MenuItem value="archived">归档</MenuItem>
          </TextField>
        </Box>
      </Stack>

      <Divider />

      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>发送范围</Typography>
        <TextField select label="发送给" value={form.audienceType} onChange={(event) => onChange({ audienceType: event.target.value })} size="small" sx={{ maxWidth: { sm: 220 } }}>
          <MenuItem value="all">全用户</MenuItem>
          <MenuItem value="authenticated">已登录用户</MenuItem>
          <MenuItem value="free">免费用户</MenuItem>
          <MenuItem value="member">会员用户</MenuItem>
          <MenuItem value="inactive">长期未使用用户</MenuItem>
          <MenuItem value="users">指定用户</MenuItem>
        </TextField>
        {form.audienceType === 'users' ? (
          <TextField
            label="指定用户 ID"
            value={form.audienceUserIdsText}
            onChange={(event) => onChange({ audienceUserIdsText: event.target.value })}
            placeholder="每行一个用户 ID，或用逗号分隔"
            size="small"
            multiline
            minRows={3}
            maxRows={6}
            helperText="只有这些用户登录后会收到该站内信。"
          />
        ) : form.audienceType === 'inactive' ? (
          <TextField
            label="未使用时长（月）"
            type="number"
            value={form.audienceInactiveMonths}
            onChange={(event) => onChange({ audienceInactiveMonths: event.target.value })}
            size="small"
            helperText="按账号最近更新时间估算，填写 1-120。"
            sx={{ maxWidth: { sm: 220 } }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {form.audienceType === 'all'
              ? '全用户站内信会对未登录访客和所有登录用户可见。'
              : '该范围需要用户登录后才能匹配。'}
          </Typography>
        )}
      </Stack>

      <Divider />

      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>时间与展示</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 120px' }, gap: 1.25 }}>
          <TextField label="开始时间" type="datetime-local" value={form.startsAt} onChange={(event) => onChange({ startsAt: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} helperText="留空表示立即开始" />
          <TextField label="结束时间/过期时间" type="datetime-local" value={form.endsAt} onChange={(event) => onChange({ endsAt: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} helperText="留空表示长期有效" />
          <TextField label="排序" type="number" value={form.sortOrder} onChange={(event) => onChange({ sortOrder: event.target.value })} size="small" helperText="越大越靠前" />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Switch checked={form.pinnedEnabled} onChange={(event) => onChange({ pinnedEnabled: event.target.checked })} size="small" />
            <Typography variant="body2">首页置顶</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Switch checked={form.popupEnabled} onChange={(event) => onChange({ popupEnabled: event.target.checked })} size="small" />
            <Typography variant="body2">首次弹窗</Typography>
          </Box>
        </Box>
      </Stack>
    </Stack>
  );
}

function DeliveryFormBlock({
  channel,
  form,
  onChange,
}: {
  channel: 'email' | 'sms';
  form: DeliveryForm;
  onChange: (patch: Partial<DeliveryForm>) => void;
}) {
  return (
    <Stack spacing={2.25}>
      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>接收方</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 180px' }, gap: 1.25 }}>
          <TextField
            label={channel === 'email' ? '收件邮箱' : '手机号'}
            value={form.recipient}
            onChange={(event) => onChange({ recipient: event.target.value })}
            size="small"
            fullWidth
            autoFocus
          />
          <TextField label="关联用户 ID（可选）" value={form.userId} onChange={(event) => onChange({ userId: event.target.value })} size="small" />
        </Box>
      </Stack>

      <Divider />

      {channel === 'email' ? (
        <Stack spacing={1.25}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>邮件内容</Typography>
          <TextField label="主题" value={form.subject} onChange={(event) => onChange({ subject: event.target.value })} size="small" fullWidth />
          <TextField label="正文" value={form.body} onChange={(event) => onChange({ body: event.target.value })} multiline minRows={5} maxRows={10} fullWidth />
        </Stack>
      ) : (
        <Stack spacing={1.25}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>短信内容</Typography>
          <Alert severity="info">当前短信渠道对接的是验证码模板能力，需填写验证码和用途，不能直接发送任意营销短信正文。</Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
            <TextField label="验证码" value={form.code} onChange={(event) => onChange({ code: event.target.value })} size="small" />
            <TextField label="用途" value={form.purpose} onChange={(event) => onChange({ purpose: event.target.value })} size="small" helperText="例如 login、change-phone" />
          </Box>
        </Stack>
      )}

      <Divider />

      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>投递时间</Typography>
        <TextField
          label="计划投递时间"
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(event) => onChange({ scheduledAt: event.target.value })}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
          helperText="留空表示立即进入投递队列"
          sx={{ maxWidth: { sm: 320 } }}
        />
      </Stack>
    </Stack>
  );
}

function payloadMessage(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function NotificationDetail({ item }: { item: Record<string, unknown> | null }) {
  const payload = item ? parsePayload(item.payload) : {};
  return (
    <AdminSection title="投递任务详情">
      {item ? (
        <Stack spacing={0.5}>
          <Typography variant="body2">渠道：{String(item.channel || '')}</Typography>
          <Typography variant="body2">接收方：{String(item.recipient || '')}</Typography>
          <Typography variant="body2">模板：{String(item.template_code || '')}</Typography>
          <Typography variant="body2">状态：{String(item.status || '')}</Typography>
          <Typography variant="body2">次数：{String(item.attempt_count || 0)}</Typography>
          <Typography variant="body2">计划投递：{formatTime(item.scheduled_at)}</Typography>
          <Typography variant="body2">更新时间：{formatTime(item.updated_at)}</Typography>
          <Typography variant="body2">用户：{String(item.user_nickname || item.user_phone || '')}</Typography>
          {payload.lastError ? <Alert severity="error">{payloadMessage(payload.lastError)}</Alert> : null}
          {payload.nextRetryAt ? <Alert severity="warning">下次自动重试：{formatTime(payload.nextRetryAt)}</Alert> : null}
          {payload.lastResult ? <Alert severity="success">最近一次投递成功</Alert> : null}
        </Stack>
      ) : <Alert severity="info">点击邮件/短信投递任务行查看详情</Alert>}
    </AdminSection>
  );
}

function buildMetricItems(stats: {
  queued: number;
  due: number;
  processing: number;
  staleProcessing: number;
  sent: number;
  failed: number;
  maxAttempts: number;
}): AdminMetricItem[] {
  return [
    { key: 'queued', label: '排队中', value: stats.queued, helper: `${stats.due} 条到期可投递`, tone: stats.due > 0 ? 'warning' : 'default' },
    { key: 'processing', label: '处理中', value: stats.processing, helper: `${stats.staleProcessing} 条卡住`, tone: stats.staleProcessing > 0 ? 'warning' : 'default' },
    { key: 'sent', label: '已发送', value: stats.sent, helper: '累计成功', tone: 'success' },
    { key: 'failed', label: '失败', value: stats.failed, helper: `最多重试 ${stats.maxAttempts || '-'}`, tone: stats.failed > 0 ? 'error' : 'default' },
  ];
}

export default function AdminNotificationsPage() {
  const [announcements, setAnnouncements] = useState<AdminSystemAnnouncement[]>([]);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(EMPTY_ANNOUNCEMENT_FORM);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(EMPTY_DELIVERY_FORM);
  const [notificationChannel, setNotificationChannel] = useState<NotificationChannel>('in_app');
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [editingInAppId, setEditingInAppId] = useState('');
  const [savingNotification, setSavingNotification] = useState(false);
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState('');
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [queueSummary, setQueueSummary] = useState<Record<string, unknown> | null>(null);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const selectedItemId = selectedItem?.id;
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [deliveringId, setDeliveringId] = useState('');
  const [requeueingId, setRequeueingId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const stats = useMemo(() => ({
    queued: Number(queueSummary?.queued || 0),
    due: Number(queueSummary?.due || 0),
    processing: Number(queueSummary?.processing || 0),
    staleProcessing: Number(queueSummary?.staleProcessing || 0),
    sent: Number(queueSummary?.sent || 0),
    failed: Number(queueSummary?.failed || 0),
    maxAttempts: Number(queueSummary?.maxAttempts || 0),
  }), [queueSummary]);
  const inactiveMonths = Number(announcementForm.audienceInactiveMonths);
  const announcementAudienceReady = (announcementForm.audienceType !== 'users' || announcementForm.audienceUserIdsText.trim().length > 0)
    && (announcementForm.audienceType !== 'inactive' || (Number.isFinite(inactiveMonths) && inactiveMonths >= 1 && inactiveMonths <= 120));
  const announcementFormReady = announcementForm.title.trim().length > 0 && announcementForm.body.trim().length > 0 && announcementAudienceReady;
  const deliveryFormReady = notificationChannel === 'email'
    ? deliveryForm.recipient.trim().length > 0 && deliveryForm.subject.trim().length > 0 && deliveryForm.body.trim().length > 0
    : deliveryForm.recipient.trim().length > 0 && deliveryForm.code.trim().length > 0 && deliveryForm.purpose.trim().length > 0;
  const notificationFormReady = notificationChannel === 'in_app' ? announcementFormReady : deliveryFormReady;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsResult, templatesResult, summaryResult, announcementsResult] = await Promise.all([
        adminApi.getNotificationJobs({ status: status || undefined, channel: channel || undefined }),
        adminApi.getNotificationTemplates(),
        adminApi.getNotificationJobSummary(),
        adminApi.getSystemAnnouncements(),
      ]);
      setItems(jobsResult.items);
      setTemplates(templatesResult.items);
      setQueueSummary(summaryResult);
      setAnnouncements(announcementsResult.items);
      if (selectedItemId != null) {
        const next = jobsResult.items.find((item) => String(item.id) === String(selectedItemId));
        setSelectedItem(next || null);
      }
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [channel, selectedItemId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const deliverQueued = async () => {
    setDelivering(true);
    setError(null);
    try {
      await adminApi.deliverNotificationJobs({ limit: 20 });
      await load();
    } catch (deliverError) {
      setError(getAdminErrorMessage(deliverError));
    } finally {
      setDelivering(false);
    }
  };

  const deliverOne = async (item: Record<string, unknown>) => {
    const id = String(item.id || '');
    if (!id) return;
    setDeliveringId(id);
    setError(null);
    try {
      await adminApi.deliverNotificationJob(id);
      await load();
    } catch (deliverError) {
      setError(getAdminErrorMessage(deliverError));
    } finally {
      setDeliveringId('');
    }
  };

  const requeueOne = async (item: Record<string, unknown>) => {
    const id = String(item.id || '');
    if (!id) return;
    setRequeueingId(id);
    setError(null);
    try {
      await adminApi.requeueNotificationJob(id);
      await load();
    } catch (requeueError) {
      setError(getAdminErrorMessage(requeueError));
    } finally {
      setRequeueingId('');
    }
  };

  const saveNotification = async () => {
    setSavingNotification(true);
    setError(null);
    try {
      if (notificationChannel === 'in_app') {
        const payload = announcementPayloadFromForm(announcementForm);
        if (editingInAppId) {
          await adminApi.updateSystemAnnouncement(editingInAppId, payload);
        } else {
          await adminApi.createSystemAnnouncement(payload);
        }
      } else {
        const label = notificationChannel === 'email' ? '邮件' : '短信';
        if (!window.confirm(`确定创建这条${label}投递任务吗？创建后会进入外部渠道发送队列。`)) return;
        await adminApi.createNotificationJob(deliveryPayloadFromForm(notificationChannel, deliveryForm));
      }
      setAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM);
      setDeliveryForm(EMPTY_DELIVERY_FORM);
      setEditingInAppId('');
      setNotificationDialogOpen(false);
      await load();
    } catch (saveError) {
      setError(getAdminErrorMessage(saveError));
    } finally {
      setSavingNotification(false);
    }
  };

  const deleteAnnouncement = async (item: AdminSystemAnnouncement) => {
    if (!window.confirm(`确定删除站内信“${item.title}”吗？`)) return;
    setDeletingAnnouncementId(item.id);
    setError(null);
    try {
      await adminApi.deleteSystemAnnouncement(item.id);
      if (editingInAppId === item.id) {
        setAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM);
        setEditingInAppId('');
      }
      await load();
    } catch (deleteError) {
      setError(getAdminErrorMessage(deleteError));
    } finally {
      setDeletingAnnouncementId('');
    }
  };

  const openCreateNotificationDialog = () => {
    setNotificationChannel('in_app');
    setAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM);
    setDeliveryForm(EMPTY_DELIVERY_FORM);
    setEditingInAppId('');
    setNotificationDialogOpen(true);
  };

  const openEditInAppDialog = (item: AdminSystemAnnouncement) => {
    setNotificationChannel('in_app');
    setAnnouncementForm(announcementToForm(item));
    setDeliveryForm(EMPTY_DELIVERY_FORM);
    setEditingInAppId(item.id);
    setNotificationDialogOpen(true);
  };

  const closeNotificationDialog = () => {
    if (savingNotification) return;
    setNotificationDialogOpen(false);
  };

  return (
    <Stack spacing={1.5}>
      <AdminSection
        title="站内信"
        subtitle="站内信渠道：在生效时间段内显示在首页顶部；弹窗只对同一条站内信首次接收时显示一次"
        action={<Button variant="contained" size="small" onClick={openCreateNotificationDialog}>新建通知</Button>}
        bodySx={{ p: 0 }}
      >
        <AdminTableFrame minWidth={980}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>标题</TableCell>
                <TableCell>级别</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>范围</TableCell>
                <TableCell>生效时间段</TableCell>
                <TableCell>展示</TableCell>
                <TableCell>触达统计</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {announcements.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Typography>
                  </TableCell>
                  <TableCell>{announcementSeverityLabel(item.severity)}</TableCell>
                  <TableCell>{announcementStatusLabel(item.status)}</TableCell>
                  <TableCell>{announcementAudienceLabel(item)}</TableCell>
                  <TableCell>{item.startsAt ? formatTime(item.startsAt) : '立即'} - {item.endsAt ? formatTime(item.endsAt) : '长期'}</TableCell>
                  <TableCell>{[item.pinnedEnabled ? '置顶' : '', item.popupEnabled ? '弹窗' : ''].filter(Boolean).join('、') || '不展示'}</TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary">
                        曝光 {Math.round(Number(item.exposureUsers || 0))} 人 / {Math.round(Number(item.exposureCount || 0))} 次
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        确认 {Math.round(Number(item.popupAckUsers || 0))} 人 / {Math.round(Number(item.popupAckCount || 0))} 次
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={() => openEditInAppDialog(item)}>编辑</Button>
                      <Button size="small" color="error" disabled={deletingAnnouncementId === item.id} onClick={() => void deleteAnnouncement(item)}>删除</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!announcements.length ? <Alert severity="info" sx={{ m: 1 }}>暂无站内信</Alert> : null}
        </AdminTableFrame>
      </AdminSection>

      <Dialog open={notificationDialogOpen} onClose={closeNotificationDialog} fullWidth maxWidth="md">
        <DialogTitle>{editingInAppId ? '编辑站内信' : '新建通知'}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Stack spacing={2.25}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>通知渠道</Typography>
              <TextField
                select
                label="渠道"
                value={notificationChannel}
                onChange={(event) => setNotificationChannel(event.target.value as NotificationChannel)}
                size="small"
                disabled={Boolean(editingInAppId)}
                sx={{ maxWidth: { sm: 240 } }}
              >
                <MenuItem value="in_app">站内信</MenuItem>
                <MenuItem value="email">邮件</MenuItem>
                <MenuItem value="sms">短信</MenuItem>
              </TextField>
            </Stack>
            <Divider />
            {notificationChannel === 'in_app' ? (
              <AnnouncementFormBlock
                form={announcementForm}
                onChange={(patch) => setAnnouncementForm((prev) => ({ ...prev, ...patch }))}
              />
            ) : (
              <DeliveryFormBlock
                channel={notificationChannel}
                form={deliveryForm}
                onChange={(patch) => setDeliveryForm((prev) => ({ ...prev, ...patch }))}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeNotificationDialog} disabled={savingNotification}>取消</Button>
          <Button variant="contained" disabled={savingNotification || !notificationFormReady} onClick={() => void saveNotification()}>
            {savingNotification ? '保存中' : editingInAppId ? '保存修改' : notificationChannel === 'in_app' ? '创建站内信' : '创建投递任务'}
          </Button>
        </DialogActions>
      </Dialog>

      <AdminSection
        title="邮件/短信投递队列"
        subtitle="邮件和短信渠道的发送任务、自动重试与失败处理；站内信不进入这个队列"
        action={<Button variant="outlined" size="small" disabled={delivering} onClick={() => void deliverQueued()}>{delivering ? '投递中' : '投递队列'}</Button>}
      >
        <AdminMetricGrid items={buildMetricItems(stats)} minWidth={132} compact />
      </AdminSection>

      <AdminSection title="投递队列筛选">
        <AdminInlineGroup gap={1}>
          <Button size="small" variant={status === '' ? 'contained' : 'outlined'} onClick={() => setStatus('')}>全部状态</Button>
          <Button size="small" variant={status === 'queued' ? 'contained' : 'outlined'} onClick={() => setStatus('queued')}>排队</Button>
          <Button size="small" variant={status === 'sent' ? 'contained' : 'outlined'} onClick={() => setStatus('sent')}>已发送</Button>
          <Button size="small" variant={status === 'failed' ? 'contained' : 'outlined'} onClick={() => setStatus('failed')}>失败</Button>
          <Button size="small" variant={channel === '' ? 'contained' : 'outlined'} onClick={() => setChannel('')}>全部渠道</Button>
          <Button size="small" variant={channel === 'email' ? 'contained' : 'outlined'} onClick={() => setChannel('email')}>邮件</Button>
          <Button size="small" variant={channel === 'sms' ? 'contained' : 'outlined'} onClick={() => setChannel('sms')}>短信</Button>
        </AdminInlineGroup>
      </AdminSection>

      <AdminRequestState loading={loading} error={error} onRetry={() => void load()} />

      <AdminSection title={`模板数量：${templates.length}`}>
        <Stack spacing={0.75}>
          {templates.map((item) => (
            <Typography key={String(item.id)} variant="body2">{String(item.channel || '')} · {String(item.code || '')} · {String(item.status || '')}</Typography>
          ))}
          {!templates.length ? <Alert severity="info">暂无通知模板</Alert> : null}
        </Stack>
      </AdminSection>

      <AdminSection title="邮件/短信投递任务" subtitle="点击任务行查看外部渠道的发送详情" bodySx={{ p: 0 }}>
        <AdminTableFrame minWidth={900}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>渠道</TableCell>
                <TableCell>接收方</TableCell>
                <TableCell>模板</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>次数</TableCell>
                <TableCell>计划投递</TableCell>
                <TableCell>创建时间</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={String(item.id)} hover selected={String(selectedItem?.id || '') === String(item.id)} onClick={() => setSelectedItem(item)}>
                  <TableCell>{String(item.channel || '')}</TableCell>
                  <TableCell>{String(item.recipient || '')}</TableCell>
                  <TableCell>{String(item.template_code || '')}</TableCell>
                  <TableCell>{String(item.status || '')}</TableCell>
                  <TableCell>{String(item.attempt_count || 0)}</TableCell>
                  <TableCell>{formatTime(item.scheduled_at)}</TableCell>
                  <TableCell>{formatTime(item.created_at)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {String(item.status || '') === 'failed' ? (
                        <Button
                          size="small"
                          disabled={requeueingId === String(item.id || '')}
                          onClick={(event) => {
                            event.stopPropagation();
                            void requeueOne(item);
                          }}
                        >
                          重新排队
                        </Button>
                      ) : null}
                      <Button
                        size="small"
                        disabled={deliveringId === String(item.id || '') || String(item.status || '') === 'sent'}
                        onClick={(event) => {
                          event.stopPropagation();
                          void deliverOne(item);
                        }}
                      >
                        {String(item.status || '') === 'failed' ? '立即投递' : '投递'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTableFrame>
      </AdminSection>
      <NotificationDetail item={selectedItem} />
    </Stack>
  );
}
