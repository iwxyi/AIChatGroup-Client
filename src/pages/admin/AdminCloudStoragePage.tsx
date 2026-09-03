import { useEffect, useState } from 'react';
import { Alert, Box, Card, CardContent, Dialog, DialogContent, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { adminApi } from '../../services/adminApi';

const size = (n: number) => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
export default function AdminCloudStoragePage() {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]); const [files, setFiles] = useState<Array<Record<string, unknown>>>([]); const [user, setUser] = useState<Record<string, unknown> | null>(null); const [error, setError] = useState('');
  const load = async () => { try { const result = await adminApi.getCloudStorageOverview(); setUsers(result.items); } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); } };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);
  const open = async (item: Record<string, unknown>) => { setUser(item); const result = await adminApi.getCloudStorageUserFiles(String(item.id)); setFiles(result.items); };
  const remove = async (id: string) => { await adminApi.deleteCloudStorageFile(id); if (user) await open(user); await load(); };
  return <Box sx={{ p: { xs: 2, md: 3 } }}><Typography variant="h5" sx={{ fontWeight: 850, mb: 2 }}>云空间</Typography>{error && <Alert severity="error">{error}</Alert>}<Card><CardContent sx={{ p: 0 }}><Table><TableHead><TableRow><TableCell>用户</TableCell><TableCell>账号</TableCell><TableCell>已用空间</TableCell></TableRow></TableHead><TableBody>{users.map((item) => <TableRow hover key={String(item.id)} onClick={() => void open(item)} sx={{ cursor: 'pointer' }}><TableCell>{String(item.nickname || '未命名')}</TableCell><TableCell>{String(item.phone || '')}</TableCell><TableCell>{size(Number(item.usedBytes || 0))}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Dialog open={Boolean(user)} onClose={() => setUser(null)} maxWidth="md" fullWidth><DialogContent><Typography variant="h6" sx={{ mb: 2 }}>用户文件</Typography><Stack spacing={1}>{files.map((file) => <Stack key={String(file.id)} direction="row" spacing={2} alignItems="center"><Box sx={{ flex: 1 }}><Typography noWrap>{String(file.kind || '文件')}</Typography><Typography variant="caption" color="text.secondary">{size(Number(file.sizeBytes || 0))}</Typography></Box><IconButton color="error" onClick={() => void remove(String(file.id))}><DeleteOutlineIcon /></IconButton></Stack>)}</Stack></DialogContent></Dialog></Box>;
}
