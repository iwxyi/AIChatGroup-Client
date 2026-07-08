import { useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import LockResetIcon from '@mui/icons-material/LockReset';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AdminInlineGroup from '../../components/admin/AdminInlineGroup';
import AdminResponsiveTable from '../../components/admin/AdminResponsiveTable';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { adminApi, type AdminLoginRecord, type AdminManagedUser, type AdminRole } from '../../services/adminApi';

type AdminForm = {
  id: string;
  email: string;
  displayName: string;
  password: string;
  status: string;
  roleCodes: string[];
};

const EMPTY_FORM: AdminForm = {
  id: '',
  email: '',
  displayName: '',
  password: '',
  status: 'active',
  roleCodes: ['ops_admin'],
};

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  ops_admin: '运营管理员',
  reviewer: '审核员',
  senior_reviewer: '高级审核员',
  customer_support: '客服',
  finance_admin: '财务管理员',
  security_admin: '安全管理员',
  ai_ops: 'AI 运维',
};

const permissionLabels: Record<string, string> = {
  'admin.all': '全部后台权限',
  'users.read': '查看用户',
  'users.manage': '管理用户',
  'shares.review': '分享审核',
  'shares.moderate': '内容处置',
  'ai.read': '查看 AI',
  'ai.manage': '管理 AI',
  'billing.read': '查看套餐订单',
  'billing.manage': '管理套餐订单',
  'platform.read': '查看平台配置',
  'platform.manage': '管理平台配置',
  'market.read': '查看市场',
  'market.manage': '管理市场',
  'notifications.read': '查看通知',
  'notifications.manage': '管理通知',
  'risk.read': '查看风控',
  'risk.manage': '管理风控',
  'audit.read': '查看审计',
};

function statusLabel(status: unknown) {
  const value = String(status || '');
  if (value === 'active') return '启用';
  if (value === 'inactive') return '停用';
  if (value === 'locked') return '锁定';
  return value || '-';
}

function statusColor(status: unknown): 'default' | 'error' | 'success' | 'warning' {
  const value = String(status || '');
  if (value === 'active') return 'success';
  if (value === 'locked') return 'warning';
  if (value === 'inactive') return 'error';
  return 'default';
}

function formatTime(value: unknown) {
  const parsed = Number(value || 0);
  return parsed > 0 ? new Date(parsed).toLocaleString() : '-';
}

function toForm(admin: AdminManagedUser | null): AdminForm {
  if (!admin) return EMPTY_FORM;
  return {
    id: admin.id,
    email: admin.email || '',
    displayName: admin.displayName || '',
    password: '',
    status: admin.status || 'active',
    roleCodes: admin.roleCodes?.length ? admin.roleCodes : [],
  };
}

function roleName(code: string) {
  return roleLabels[code] || code;
}

function roleDescription(role: AdminRole) {
  const permissions = role.permissions || [];
  if (!permissions.length) return role.description || '';
  return permissions
    .map((item) => permissionLabels[String(item.code || '')] || String(item.code || ''))
    .filter(Boolean)
    .join('、');
}

function AdminSummaryCards({ items }: { items: AdminManagedUser[] }) {
  const summary = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.status === 'active').length,
    locked: items.filter((item) => item.status === 'locked').length,
    inactive: items.filter((item) => item.status === 'inactive').length,
  }), [items]);
  return (
    <AdminInlineGroup gap={1}>
      <Alert severity="info">管理员：{summary.total}</Alert>
      <Alert severity="success">启用：{summary.active}</Alert>
      <Alert severity="warning">锁定：{summary.locked}</Alert>
      <Alert severity="error">停用：{summary.inactive}</Alert>
    </AdminInlineGroup>
  );
}

function LoginRecordTable({ items }: { items: AdminLoginRecord[] }) {
  return (
    <AdminResponsiveTable minWidth={680}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>结果</TableCell>
            <TableCell>IP</TableCell>
            <TableCell>设备</TableCell>
            <TableCell>时间</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Chip size="small" label={item.result === 'success' ? '成功' : '失败'} color={item.result === 'success' ? 'success' : 'error'} variant="outlined" />
              </TableCell>
              <TableCell>{item.ip || '-'}</TableCell>
              <TableCell sx={{ maxWidth: 280, wordBreak: 'break-all' }}>{item.userAgent || '-'}</TableCell>
              <TableCell>{formatTime(item.createdAt)}</TableCell>
            </TableRow>
          ))}
          {!items.length ? (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>暂无登录记录</Typography>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </AdminResponsiveTable>
  );
}

export default function AdminAdminsPage() {
  const [items, setItems] = useState<AdminManagedUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminManagedUser | null>(null);
  const [loginRecords, setLoginRecords] = useState<AdminLoginRecord[]>([]);
  const [form, setForm] = useState<AdminForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const selectedAdminId = form.id;
  const canSave = Boolean(form.email.trim() && form.displayName.trim() && form.roleCodes.length)
    && (Boolean(form.id) || form.password.length >= 8)
    && !saving;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getAdminUsers({ search: search.trim() || undefined });
      setItems(result.items || []);
      setRoles(result.roles || []);
      if (selectedAdminId) {
        const next = result.items.find((item) => item.id === selectedAdminId) || null;
        if (next) setSelectedAdmin(next);
      }
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (adminUserId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const result = await adminApi.getManagedAdminUser(adminUserId);
      setSelectedAdmin(result.admin);
      setForm(toForm(result.admin));
      setRoles(result.roles || roles);
      setLoginRecords(result.loginRecords || []);
      setDialogOpen(true);
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setDetailLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        status: form.status,
        roleCodes: form.roleCodes,
      };
      if (form.id) await adminApi.updateManagedAdminUser(form.id, payload);
      else await adminApi.createManagedAdminUser({ ...payload, password: form.password });
      setDialogOpen(false);
      setSelectedAdmin(null);
      setLoginRecords([]);
      setForm(EMPTY_FORM);
      await load();
    } catch (saveError) {
      setError(getAdminErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!form.id || newPassword.length < 8) return;
    setResettingPassword(true);
    setError(null);
    try {
      await adminApi.resetManagedAdminPassword(form.id, { password: newPassword });
      setPasswordDialogOpen(false);
      setNewPassword('');
      await loadDetail(form.id);
    } catch (resetError) {
      setError(getAdminErrorMessage(resetError));
    } finally {
      setResettingPassword(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleRole = (roleCode: string) => {
    setForm((prev) => ({
      ...prev,
      roleCodes: prev.roleCodes.includes(roleCode)
        ? prev.roleCodes.filter((code) => code !== roleCode)
        : [...prev.roleCodes, roleCode],
    }));
  };

  const openCreateDialog = () => {
    setSelectedAdmin(null);
    setLoginRecords([]);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, flex: '1 1 360px' }}>
          <ManageAccountsIcon color="primary" />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>管理员</Typography>
            <Typography variant="body2" color="text.secondary">管理后台账号、角色和最近登录记录。</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Button startIcon={<RefreshIcon />} onClick={() => void load()} disabled={loading}>刷新</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>新建管理员</Button>
        </Stack>
      </Stack>

      <AdminRequestState loading={loading || detailLoading} error={error} onRetry={() => void load()} />
      <AdminSummaryCards items={items} />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          size="small"
          label="搜索管理员"
          placeholder="邮箱或显示名"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ width: { xs: '100%', sm: 320 } }}
        />
        <Button variant="outlined" onClick={() => void load()} disabled={loading}>查询</Button>
      </Stack>

      <AdminResponsiveTable minWidth={920}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>管理员</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>最近登录</TableCell>
              <TableCell>创建时间</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                hover
                onClick={() => void loadDetail(item.id)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>{item.displayName || item.email}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.email}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {(item.roleCodes || []).map((code) => <Chip key={code} size="small" label={roleName(code)} />)}
                  </Stack>
                </TableCell>
                <TableCell><Chip size="small" label={statusLabel(item.status)} color={statusColor(item.status)} variant="outlined" /></TableCell>
                <TableCell>{formatTime(item.lastLoginAt)}</TableCell>
                <TableCell>{formatTime(item.createdAt)}</TableCell>
              </TableRow>
            ))}
            {!items.length && !loading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>暂无管理员</Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </AdminResponsiveTable>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{form.id ? '编辑管理员' : '新建管理员'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <TextField label="邮箱" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} fullWidth required />
                <TextField label="显示名" value={form.displayName} onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))} fullWidth required />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 1.25 }}>
                <TextField select label="状态" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} fullWidth>
                  <MenuItem value="active">启用</MenuItem>
                  <MenuItem value="locked">锁定</MenuItem>
                  <MenuItem value="inactive">停用</MenuItem>
                </TextField>
                {!form.id ? (
                  <TextField
                    label="初始密码"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    error={Boolean(form.password && form.password.length < 8)}
                    helperText="至少 8 位"
                    fullWidth
                    required
                  />
                ) : (
                  <Button
                    variant="outlined"
                    startIcon={<LockResetIcon />}
                    onClick={() => setPasswordDialogOpen(true)}
                    sx={{ minWidth: 160 }}
                  >
                    重置密码
                  </Button>
                )}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1 }}>角色</Typography>
              <Stack spacing={1}>
                {roles.map((role) => (
                  <Box key={role.code}>
                    <FormControlLabel
                      control={<Checkbox checked={form.roleCodes.includes(role.code)} onChange={() => toggleRole(role.code)} />}
                      label={<Typography variant="body2" sx={{ fontWeight: 800 }}>{roleName(role.code)}</Typography>}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 4, mt: -0.5 }}>
                      {roleDescription(role) || role.description || role.code}
                    </Typography>
                  </Box>
                ))}
              </Stack>
              {!form.roleCodes.length ? <Alert severity="warning" sx={{ mt: 1 }}>至少选择一个角色。</Alert> : null}
            </Paper>

            {form.id ? (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1 }}>最近登录</Typography>
                <LoginRecordTable items={loginRecords} />
              </Paper>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
          <Button variant="contained" startIcon={<SaveIcon />} disabled={!canSave} onClick={() => void save()}>
            {form.id ? '保存管理员' : '创建管理员'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={passwordDialogOpen}
        onClose={() => {
          if (!resettingPassword) {
            setPasswordDialogOpen(false);
            setNewPassword('');
          }
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>重置管理员密码</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ pt: 1 }}>
            <Typography variant="body2">为“{selectedAdmin?.displayName || selectedAdmin?.email || form.email}”设置新密码。</Typography>
            <TextField
              autoFocus
              type="password"
              label="新密码"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              error={Boolean(newPassword && newPassword.length < 8)}
              helperText="至少 8 位。重置后对方需要使用新密码登录。"
              fullWidth
            />
            <Divider />
            <Alert severity="warning">这是敏感操作，会写入后台审计日志。</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (!resettingPassword) {
                setPasswordDialogOpen(false);
                setNewPassword('');
              }
            }}
            disabled={resettingPassword}
          >
            取消
          </Button>
          <Button color="error" variant="contained" disabled={newPassword.length < 8 || resettingPassword} onClick={() => void resetPassword()}>
            重置密码
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
