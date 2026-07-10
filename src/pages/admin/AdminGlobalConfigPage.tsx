import { useEffect, useState } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Button, Stack, Tab, Tabs, TextField } from '@mui/material';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminSection } from '../../components/admin/AdminSurface';
import { ADMIN_PERMISSION_CODES, adminHasPermission } from '../../constants/adminPermissions';
import { adminApi } from '../../services/adminApi';
import type { SitePublicConfig } from '../../services/api';
import { useAdminAuthStore } from '../../stores/useAdminAuthStore';
import AdminConfigMigrationPage from './AdminConfigMigrationPage';

const DEFAULT_SITE_CONFIG: SitePublicConfig = {
  siteName: 'Pneumata',
  siteTitle: '生息：Pneumata',
  siteDescription: 'Pneumata - AI Multi-Agent Social World Simulation Platform',
  faviconUrl: '/favicon.svg',
  themeColor: '#6750A4',
};

export default function AdminGlobalConfigPage() {
  const admin = useAdminAuthStore((s) => s.admin);
  const canManage = adminHasPermission(admin, ADMIN_PERMISSION_CODES.platformManage);
  const [tab, setTab] = useState<'site' | 'migration'>('site');
  const [site, setSite] = useState<SitePublicConfig>(DEFAULT_SITE_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getPlatformGlobalConfig();
      setSite({ ...DEFAULT_SITE_CONFIG, ...(result.site || {}) });
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateSiteField = (field: keyof SitePublicConfig, value: string) => {
    setSite((prev) => ({ ...prev, [field]: value }));
    setSuccess(null);
  };

  const saveSite = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await adminApi.updatePlatformGlobalConfig({ site });
      setSite({ ...DEFAULT_SITE_CONFIG, ...(result.site || {}) });
      setSuccess('站点配置已保存。刷新前台页面后生效。');
    } catch (saveError) {
      setError(getAdminErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Tabs
        value={tab}
        onChange={(_event, value) => {
          setTab(value);
          setError(null);
          setSuccess(null);
        }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab value="site" label="站点配置" />
        <Tab value="migration" label="配置迁移" />
      </Tabs>

      {tab === 'site' ? (
        <Stack spacing={2}>
          <AdminRequestState loading={loading} error={error} onRetry={() => void load()} />
          {success ? <Alert severity="success">{success}</Alert> : null}
          <AdminSection title="站点配置" subtitle="控制浏览器标题、站点描述、favicon 和移动端主题色。">
            <Stack spacing={1.5}>
              <TextField
                label="站点名称"
                required
                value={site.siteName}
                disabled={!canManage || saving}
                onChange={(event) => updateSiteField('siteName', event.target.value)}
                fullWidth
              />
              <TextField
                label="浏览器标题"
                required
                value={site.siteTitle}
                disabled={!canManage || saving}
                onChange={(event) => updateSiteField('siteTitle', event.target.value)}
                fullWidth
              />
              <TextField
                label="站点描述"
                required
                value={site.siteDescription}
                disabled={!canManage || saving}
                onChange={(event) => updateSiteField('siteDescription', event.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="Favicon 地址"
                  value={site.faviconUrl}
                  disabled={!canManage || saving}
                  onChange={(event) => updateSiteField('faviconUrl', event.target.value)}
                  placeholder="/favicon.svg"
                  fullWidth
                />
                <TextField
                  label="主题色"
                  value={site.themeColor}
                  disabled={!canManage || saving}
                  onChange={(event) => updateSiteField('themeColor', event.target.value)}
                  placeholder="#6750A4"
                  sx={{ minWidth: { sm: 180 } }}
                />
              </Stack>
              {!canManage ? <Alert severity="info">当前管理员只有查看权限，不能保存全局配置。</Alert> : null}
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button variant="outlined" startIcon={<RefreshIcon />} disabled={loading || saving} onClick={() => void load()}>
                  刷新
                </Button>
                <Button variant="contained" startIcon={<SaveIcon />} disabled={!canManage || loading || saving} onClick={() => void saveSite()}>
                  保存站点配置
                </Button>
              </Stack>
            </Stack>
          </AdminSection>
        </Stack>
      ) : (
        canManage ? <AdminConfigMigrationPage /> : <Alert severity="warning">当前管理员没有配置迁移权限。</Alert>
      )}
    </Stack>
  );
}
