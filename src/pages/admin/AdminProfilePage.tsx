import { useEffect, useMemo, useState } from 'react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import HistoryIcon from '@mui/icons-material/History';
import LockResetIcon from '@mui/icons-material/LockReset';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import ShieldIcon from '@mui/icons-material/Shield';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
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
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import AdminResponsiveTable from '../../components/admin/AdminResponsiveTable';
import { adminApi, type AdminLoginRecord, type AdminUser } from '../../services/adminApi';
import { useAdminAuthStore } from '../../stores/useAdminAuthStore';

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  ops_admin: '运营管理员',
  reviewer: '审核员',
  senior_reviewer: '高级审核员',
  customer_support: '客服支持',
  finance_admin: '财务管理员',
  security_admin: '安全管理员',
  ai_ops: 'AI 运维',
};

const permissionLabels: Record<string, string> = {
  'admin.all': '全部权限',
  'users.read': '用户查看',
  'users.manage': '用户管理',
  'shares.review': '分享审核',
  'shares.moderate': '分享处置',
  'ai.read': 'AI 查看',
  'ai.manage': 'AI 管理',
  'billing.read': '套餐订单查看',
  'billing.manage': '套餐订单管理',
  'platform.read': '平台配置查看',
  'platform.manage': '平台配置管理',
  'market.read': '市场查看',
  'market.manage': '市场管理',
  'notifications.read': '通知查看',
  'notifications.manage': '通知管理',
  'risk.read': '风控查看',
  'risk.manage': '风控管理',
  'audit.read': '审计查看',
};

function formatTime(value: unknown) {
  const parsed = Number(value || 0);
  return parsed > 0 ? new Date(parsed).toLocaleString() : '-';
}

function statusLabel(status: string) {
  if (status === 'active') return '正常';
  if (status === 'disabled') return '停用';
  return status || '-';
}

function loginResultLabel(result: string) {
  return result === 'failed' ? '失败' : '成功';
}

function loginReasonLabel(record: AdminLoginRecord) {
  const reason = String(record.details?.reason || '');
  if (reason === 'invalid_password') return '密码错误';
  return reason || '-';
}

function compactUserAgent(value: string | null) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.length <= 72) return text;
  return `${text.slice(0, 72)}...`;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5, height: '100%' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ mt: 0.5, fontWeight: 900, wordBreak: 'break-word' }}>{value}</Typography>
    </Paper>
  );
}

export default function AdminProfilePage() {
  const storeAdmin = useAdminAuthStore((s) => s.admin);
  const checkAuth = useAdminAuthStore((s) => s.checkAuth);
  const [profile, setProfile] = useState<AdminUser | null>(storeAdmin);
  const [records, setRecords] = useState<AdminLoginRecord[]>([]);
  const [profileForm, setProfileForm] = useState({ email: '', displayName: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const roleNames = useMemo(() => {
    const roles = profile?.roleCodes || [];
    return roles.length ? roles.map((role) => roleLabels[role] || role) : ['未分配角色'];
  }, [profile]);

  const permissionNames = useMemo(() => {
    const permissions = profile?.permissions || [];
    return permissions.map((permission) => permissionLabels[permission] || permission);
  }, [profile]);

  const emailChanged = profileForm.email.trim().toLowerCase() !== String(profile?.email || '').toLowerCase();
  const canSaveProfile = Boolean(profileForm.email.trim() && profileForm.displayName.trim()) && (!emailChanged || Boolean(profileForm.currentPassword));
  const canSavePassword = Boolean(passwordForm.currentPassword && passwordForm.newPassword && passwordForm.confirmPassword)
    && passwordForm.newPassword === passwordForm.confirmPassword
    && passwordForm.newPassword.length >= 8;

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getAdminProfile();
      setProfile(result.admin);
      setProfileForm({
        email: result.admin.email || '',
        displayName: result.admin.displayName || '',
        currentPassword: '',
      });
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const result = await adminApi.getAdminLoginRecords({ limit: 20 });
      setRecords(result.items);
    } catch (loadError) {
      setRecordsError(getAdminErrorMessage(loadError));
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
    void loadRecords();
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage(null);
    setError(null);
    try {
      const result = await adminApi.updateAdminProfile({
        email: profileForm.email.trim(),
        displayName: profileForm.displayName.trim(),
        currentPassword: profileForm.currentPassword || undefined,
      });
      setProfile(result.admin);
      setProfileForm({
        email: result.admin.email || '',
        displayName: result.admin.displayName || '',
        currentPassword: '',
      });
      await checkAuth();
      setProfileMessage('账号信息已更新');
    } catch (saveError) {
      setError(getAdminErrorMessage(saveError));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setSavingPassword(true);
    setPasswordMessage(null);
    setError(null);
    try {
      await adminApi.updateAdminPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage('密码已更新，下次登录请使用新密码');
    } catch (saveError) {
      setError(getAdminErrorMessage(saveError));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Stack spacing={2.25}>
      <Paper
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Avatar sx={{ width: 58, height: 58, bgcolor: 'primary.main', fontWeight: 900 }}>
              {(profile?.displayName || profile?.email || 'A').slice(0, 1).toUpperCase()}
            </Avatar>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              <AdminInlineGroup gap={0.75}>
                <Typography variant="h5" sx={{ fontWeight: 900, wordBreak: 'break-word' }}>
                  {profile?.displayName || '管理员'}
                </Typography>
                <Chip size="small" color={profile?.status === 'active' ? 'success' : 'default'} label={statusLabel(profile?.status || '')} />
              </AdminInlineGroup>
              <Typography color="text.secondary" sx={{ wordBreak: 'break-word' }}>{profile?.email || '-'}</Typography>
            </Stack>
          </Stack>
          <AdminInlineGroup gap={1}>
            <Chip icon={<ShieldIcon />} label={`${roleNames.length} 个角色`} variant="outlined" />
            <Chip icon={<HistoryIcon />} label={`最近登录 ${formatTime(profile?.lastLoginAt)}`} variant="outlined" />
            <Button startIcon={<RefreshIcon />} onClick={() => { void loadProfile(); void loadRecords(); }}>刷新</Button>
          </AdminInlineGroup>
        </Stack>
      </Paper>

      <AdminRequestState loading={loading || recordsLoading} error={error || recordsError} onRetry={() => { void loadProfile(); void loadRecords(); }} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <InfoTile label="最近登录 IP" value={String(profile?.lastLoginIp || '-')} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <InfoTile label="账号创建时间" value={formatTime(profile?.createdAt)} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <InfoTile label="资料更新时间" value={formatTime(profile?.updatedAt)} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, height: '100%' }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <AccountCircleIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 900 }}>账号信息</Typography>
              </Stack>
              {profileMessage ? <Alert severity="success">{profileMessage}</Alert> : null}
              <Box component="form" onSubmit={(event) => { event.preventDefault(); if (canSaveProfile) void saveProfile(); }}>
                <Stack spacing={1.75}>
                  <TextField
                    label="显示名"
                    value={profileForm.displayName}
                    required
                    fullWidth
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  />
                  <TextField
                    label="登录邮箱"
                    type="email"
                    value={profileForm.email}
                    required
                    fullWidth
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                    helperText="邮箱是后台登录账号。修改邮箱需要校验当前密码。"
                  />
                  {emailChanged ? (
                    <TextField
                      label="当前密码"
                      type="password"
                      value={profileForm.currentPassword}
                      required
                      fullWidth
                      autoComplete="current-password"
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                    />
                  ) : null}
                  <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                    <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={!canSaveProfile || savingProfile}>
                      保存账号信息
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, height: '100%' }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <LockResetIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 900 }}>修改密码</Typography>
              </Stack>
              {passwordMessage ? <Alert severity="success">{passwordMessage}</Alert> : null}
              <Box component="form" onSubmit={(event) => { event.preventDefault(); if (canSavePassword) void savePassword(); }}>
                <Stack spacing={1.75}>
                  <TextField
                    label="当前密码"
                    type="password"
                    value={passwordForm.currentPassword}
                    required
                    fullWidth
                    autoComplete="current-password"
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                  />
                  <TextField
                    label="新密码"
                    type="password"
                    value={passwordForm.newPassword}
                    required
                    fullWidth
                    autoComplete="new-password"
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                    helperText="至少 8 位，不能与当前密码相同。"
                  />
                  <TextField
                    label="确认新密码"
                    type="password"
                    value={passwordForm.confirmPassword}
                    required
                    fullWidth
                    error={Boolean(passwordForm.confirmPassword && passwordForm.confirmPassword !== passwordForm.newPassword)}
                    helperText={passwordForm.confirmPassword && passwordForm.confirmPassword !== passwordForm.newPassword ? '两次输入的新密码不一致' : ' '}
                    autoComplete="new-password"
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                  />
                  <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                    <Button type="submit" variant="contained" startIcon={<LockResetIcon />} disabled={!canSavePassword || savingPassword}>
                      更新密码
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
        <Stack spacing={1.75}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <ShieldIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 900 }}>角色与权限</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">{permissionNames.length} 项权限</Typography>
          </Stack>
          <Divider />
          <Stack spacing={1.25}>
            <AdminInlineGroup gap={0.75}>
              {roleNames.map((role) => <Chip key={role} label={role} color="primary" variant="outlined" />)}
            </AdminInlineGroup>
            <AdminInlineGroup gap={0.75}>
              {permissionNames.map((permission) => <Chip key={permission} size="small" label={permission} />)}
            </AdminInlineGroup>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
        <Stack spacing={1.75}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <HistoryIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 900 }}>最近登录记录</Typography>
            </Stack>
            <Button size="small" startIcon={<RefreshIcon />} onClick={() => void loadRecords()}>刷新记录</Button>
          </Stack>
          {!records.length && !recordsLoading ? <Alert severity="info">暂无登录记录</Alert> : null}
          {records.length ? (
            <AdminResponsiveTable minWidth={760}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>时间</TableCell>
                    <TableCell>结果</TableCell>
                    <TableCell>IP</TableCell>
                    <TableCell>说明</TableCell>
                    <TableCell>设备信息</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id} hover>
                      <TableCell>{formatTime(record.createdAt)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={record.result === 'failed' ? 'error' : 'success'}
                          label={loginResultLabel(record.result)}
                        />
                      </TableCell>
                      <TableCell>{record.ip || '-'}</TableCell>
                      <TableCell>{loginReasonLabel(record)}</TableCell>
                      <TableCell title={record.userAgent || ''}>{compactUserAgent(record.userAgent)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminResponsiveTable>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
