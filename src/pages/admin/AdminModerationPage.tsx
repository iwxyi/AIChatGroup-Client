import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminMetricGrid, AdminSection, AdminTableFrame, type AdminMetricItem } from '../../components/admin/AdminSurface';
import { adminApi } from '../../services/adminApi';

function ModerationCaseDetail({ item }: { item: Record<string, unknown> | null }) {
  return (
    <AdminSection title="Case 详情">
      {item ? (
        <Stack spacing={0.5}>
          <Typography variant="body2">Case：{String(item.id || '')}</Typography>
          <Typography variant="body2">内容类型：{String(item.content_type || '')}</Typography>
          <Typography variant="body2">创建者：{String(item.owner_nickname || item.owner_phone || '')}</Typography>
          <Typography variant="body2">状态：{String(item.status || '')}</Typography>
          <Typography variant="body2">可见性：{String(item.visibility || '')}</Typography>
          <Typography variant="body2">最新结论：{String(item.latest_decision || '')}</Typography>
          <Typography variant="body2">原因：{String(item.latest_reason || '')}</Typography>
        </Stack>
      ) : <Alert severity="info">点击审核行查看详情</Alert>}
    </AdminSection>
  );
}

export default function AdminModerationPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stats = useMemo(() => ({
    pending: items.filter((item) => String(item.status || '') === 'pending').length,
    inReview: items.filter((item) => String(item.status || '') === 'in_review').length,
    escalated: items.filter((item) => String(item.status || '') === 'escalated').length,
  }), [items]);
  const metricItems = useMemo<AdminMetricItem[]>(() => [
    { key: 'pending', label: '待领取', value: stats.pending, tone: 'warning' },
    { key: 'in-review', label: '处理中', value: stats.inReview, tone: 'info' },
    { key: 'escalated', label: '已升级', value: stats.escalated, tone: 'error' },
  ], [stats.escalated, stats.inReview, stats.pending]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getShareReviewCases({ status: status || undefined });
      setItems(result.items);
      if (selectedItem) {
        const next = result.items.find((item) => String(item.id) === String(selectedItem.id));
        setSelectedItem(next || null);
      }
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  const runCaseAction = async (caseId: string, action: () => Promise<unknown>) => {
    setActionLoadingId(caseId);
    setError(null);
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(getAdminErrorMessage(actionError));
    } finally {
      setActionLoadingId(null);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <Stack spacing={2}>
      <AdminSection title="内容审核" subtitle="处理分享内容审核 Case，支持领取、通过和拒绝。">
        <AdminMetricGrid items={metricItems} compact minWidth={132} />
      </AdminSection>
      <AdminSection title="筛选与备注">
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant={status === '' ? 'contained' : 'outlined'} onClick={() => setStatus('')}>全部</Button>
            <Button variant={status === 'pending' ? 'contained' : 'outlined'} onClick={() => setStatus('pending')}>待领取</Button>
            <Button variant={status === 'in_review' ? 'contained' : 'outlined'} onClick={() => setStatus('in_review')}>处理中</Button>
            <Button variant={status === 'escalated' ? 'contained' : 'outlined'} onClick={() => setStatus('escalated')}>已升级</Button>
          </Stack>
          <TextField value={reason} onChange={(e) => setReason(e.target.value)} label="审核备注" />
        </Stack>
      </AdminSection>
      <AdminRequestState loading={loading} error={error} onRetry={() => void load()} />
      <AdminSection title="审核列表" subtitle="点击行查看 Case 详情。" bodySx={{ p: 0 }}>
        <AdminTableFrame minWidth={860}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Case</TableCell>
                <TableCell>内容类型</TableCell>
                <TableCell>创建者</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>最新结论</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={String(item.id)} hover selected={String(selectedItem?.id || '') === String(item.id)} onClick={() => setSelectedItem(item)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{String(item.id || '')}</TableCell>
                  <TableCell>{String(item.content_type || '')}</TableCell>
                  <TableCell>{String(item.owner_nickname || item.owner_phone || '')}</TableCell>
                  <TableCell>{String(item.status || '')}</TableCell>
                  <TableCell>{String(item.latest_decision || '')}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {String(item.status || '') === 'pending' ? <Button size="small" disabled={actionLoadingId === String(item.id)} onClick={(event) => { event.stopPropagation(); void runCaseAction(String(item.id), () => adminApi.claimShareReviewCase(String(item.id))); }}>领取</Button> : null}
                      <Button size="small" color="success" disabled={actionLoadingId === String(item.id)} onClick={(event) => { event.stopPropagation(); void runCaseAction(String(item.id), () => adminApi.decideShareReviewCase(String(item.id), 'approved', reason)); }}>通过</Button>
                      <Button size="small" color="error" disabled={actionLoadingId === String(item.id)} onClick={(event) => { event.stopPropagation(); void runCaseAction(String(item.id), () => adminApi.decideShareReviewCase(String(item.id), 'rejected', reason)); }}>拒绝</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTableFrame>
      </AdminSection>
      <ModerationCaseDetail item={selectedItem} />
    </Stack>
  );
}
