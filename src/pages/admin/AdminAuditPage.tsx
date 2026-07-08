import { useEffect, useState } from 'react';
import { Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminSection, AdminTableFrame } from '../../components/admin/AdminSurface';
import { adminApi } from '../../services/adminApi';

export default function AdminAuditPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getAuditLogs({ result: result || undefined });
      setItems(response.items);
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [result]);

  return (
    <Stack spacing={2}>
      <AdminSection title="审计日志" subtitle="查看管理员操作记录和结果。">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant={result === '' ? 'contained' : 'outlined'} onClick={() => setResult('')}>全部</Button>
          <Button variant={result === 'success' ? 'contained' : 'outlined'} onClick={() => setResult('success')}>成功</Button>
          <Button variant={result === 'failed' ? 'contained' : 'outlined'} onClick={() => setResult('failed')}>失败</Button>
        </Stack>
      </AdminSection>
      <AdminRequestState loading={loading} error={error} onRetry={() => void load()} />
      <AdminSection title="日志列表" subtitle="点击日志行查看详情。" bodySx={{ p: 0 }}>
        <AdminTableFrame minWidth={760}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>时间</TableCell>
                <TableCell>管理员</TableCell>
                <TableCell>动作</TableCell>
                <TableCell>资源</TableCell>
                <TableCell>结果</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={String(item.id)} hover selected={String(selectedItem?.id || '') === String(item.id)} onClick={() => setSelectedItem(item)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{new Date(Number(item.created_at || 0)).toLocaleString()}</TableCell>
                  <TableCell>{String(item.admin_display_name || item.admin_email || '')}</TableCell>
                  <TableCell>{String(item.action || '')}</TableCell>
                  <TableCell>{`${String(item.resource_type || '')} ${String(item.resource_id || '')}`}</TableCell>
                  <TableCell>{String(item.result || '')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTableFrame>
      </AdminSection>
      <AdminSection title="审计详情">
        {selectedItem ? (
          <Stack spacing={0.5}>
            <Typography variant="body2">动作：{String(selectedItem.action || '')}</Typography>
            <Typography variant="body2">管理员：{String(selectedItem.admin_display_name || selectedItem.admin_email || '')}</Typography>
            <Typography variant="body2">资源：{String(selectedItem.resource_type || '')} {String(selectedItem.resource_id || '')}</Typography>
            <Typography variant="body2">结果：{String(selectedItem.result || '')}</Typography>
            <Typography variant="body2">时间：{new Date(Number(selectedItem.created_at || 0)).toLocaleString()}</Typography>
          </Stack>
        ) : <Typography variant="body2" color="text.secondary">点击日志行查看详情</Typography>}
      </AdminSection>
    </Stack>
  );
}
