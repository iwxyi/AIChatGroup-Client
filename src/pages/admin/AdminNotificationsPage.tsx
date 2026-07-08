import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import AdminInlineGroup from '../../components/admin/AdminInlineGroup';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminMetricGrid, AdminSection, AdminTableFrame, type AdminMetricItem } from '../../components/admin/AdminSurface';
import { adminApi } from '../../services/adminApi';

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
    <AdminSection title="通知任务详情">
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
      ) : <Alert severity="info">点击任务行查看详情</Alert>}
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
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [queueSummary, setQueueSummary] = useState<Record<string, unknown> | null>(null);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsResult, templatesResult, summaryResult] = await Promise.all([
        adminApi.getNotificationJobs({ status: status || undefined, channel: channel || undefined }),
        adminApi.getNotificationTemplates(),
        adminApi.getNotificationJobSummary(),
      ]);
      setItems(jobsResult.items);
      setTemplates(templatesResult.items);
      setQueueSummary(summaryResult);
      if (selectedItem) {
        const next = jobsResult.items.find((item) => String(item.id) === String(selectedItem.id));
        setSelectedItem(next || null);
      }
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status, channel]);

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

  return (
    <Stack spacing={1.5}>
      <AdminSection
        title="通知队列"
        subtitle="短信和邮件任务的自动投递、重试与失败处理"
        action={<Button variant="outlined" size="small" disabled={delivering} onClick={() => void deliverQueued()}>{delivering ? '投递中' : '投递队列'}</Button>}
      >
        <AdminMetricGrid items={buildMetricItems(stats)} minWidth={132} compact />
      </AdminSection>

      <AdminSection title="筛选">
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

      <AdminSection title="通知任务" subtitle="点击任务行查看详情" bodySx={{ p: 0 }}>
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
