import { lazy, Suspense, useMemo, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, ThemeProvider, CssBaseline, Typography, useMediaQuery } from '@mui/material';
import { createAppTheme } from './theme';
import { useSettingsStore } from './stores/useSettingsStore';
import { useAuthStore } from './stores/useAuthStore';
import AppLayout from './components/layout/AppLayout';
import MasterDetailLayout from './components/layout/MasterDetailLayout';
import AdminPermissionGate from './components/admin/AdminPermissionGate';
import { useAdminAuthStore } from './stores/useAdminAuthStore';
import { ADMIN_DASHBOARD_PERMISSIONS, ADMIN_PERMISSION_CODES } from './constants/adminPermissions';
import { ADMIN_LOGIN_EVENT } from './services/adminApi';
import { api } from './services/api';
import { AUTH_SESSION_EXPIRED_EVENT, type AuthSessionExpiredDetail } from './services/authSession';
import { APP_DESCRIPTION, APP_TITLE } from './constants/brand';
import DevUpdatePrompt from './components/common/DevUpdatePrompt';
import PwaUpdatePrompt from './components/common/PwaUpdatePrompt';
import { hasGuestImportData, importGuestDataToCurrentAccount, readGuestImportSnapshot, type GuestImportSnapshot } from './services/guestDataImport';
import { isCloudSyncEnabled } from './services/cloudSyncPreference';
import { useChatStore } from './stores/useChatStore';
import { useCharacterStore } from './stores/useCharacterStore';
import './i18n';

const routePreloaders = [
  () => import('./pages/HomePage'),
  () => import('./pages/ChatListPage'),
  () => import('./pages/CreateChatPage'),
  () => import('./pages/ChatDetailPage'),
  () => import('./pages/CreateDirectChatPage'),
  () => import('./pages/CharacterLibraryPage'),
  () => import('./pages/CharacterEditorPage'),
  () => import('./pages/SettingsPage'),
  () => import('./pages/RecycleBinPage'),
  () => import('./pages/AIModelsPage'),
  () => import('./pages/AIProxyPage'),
  () => import('./pages/MembershipPage'),
  () => import('./pages/AccountPage'),
  () => import('./pages/SyncStatusPage'),
  () => import('./pages/BatchGenerateCharactersPage'),
  () => import('./pages/LettersPage'),
  () => import('./pages/CalendarPage'),
  () => import('./pages/MomentsPage'),
  () => import('./pages/MarketPage'),
  () => import('./pages/IntroPage'),
  () => import('./pages/LoginPage'),
  () => import('./pages/PublicSharedChatPage'),
  () => import('./components/admin/AdminLayout'),
  () => import('./pages/admin/AdminLoginPage'),
  () => import('./pages/admin/AdminDashboardPage'),
  () => import('./pages/admin/AdminUsersPage'),
  () => import('./pages/admin/AdminAdminsPage'),
  () => import('./pages/admin/AdminGlobalConfigPage'),
  () => import('./pages/admin/AdminAIProviderPage'),
  () => import('./pages/admin/AdminPlatformPage'),
  () => import('./pages/admin/AdminBillingPage'),
  () => import('./pages/admin/AdminModerationPage'),
  () => import('./pages/admin/AdminMarketPage'),
  () => import('./pages/admin/AdminRiskPage'),
  () => import('./pages/admin/AdminAuditPage'),
  () => import('./pages/admin/AdminNotificationsPage'),
  () => import('./pages/admin/AdminSendRecordsPage'),
  () => import('./pages/admin/AdminProfilePage'),
];

const [
  loadHomePage,
  loadChatListPage,
  loadCreateChatPage,
  loadChatDetailPage,
  loadCreateDirectChatPage,
  loadCharacterLibraryPage,
  loadCharacterEditorPage,
  loadSettingsPage,
  loadRecycleBinPage,
  loadAIModelsPage,
  loadAIProxyPage,
  loadMembershipPage,
  loadAccountPage,
  loadSyncStatusPage,
  loadBatchGenerateCharactersPage,
  loadLettersPage,
  loadCalendarPage,
  loadMomentsPage,
  loadMarketPage,
  loadIntroPage,
  loadLoginPage,
  loadPublicSharedChatPage,
  loadAdminLayout,
  loadAdminLoginPage,
  loadAdminDashboardPage,
  loadAdminUsersPage,
  loadAdminAdminsPage,
  loadAdminGlobalConfigPage,
  loadAdminAIProviderPage,
  loadAdminPlatformPage,
  loadAdminBillingPage,
  loadAdminModerationPage,
  loadAdminMarketPage,
  loadAdminRiskPage,
  loadAdminAuditPage,
  loadAdminNotificationsPage,
  loadAdminSendRecordsPage,
  loadAdminProfilePage,
] = routePreloaders;

const HomePage = lazy(loadHomePage);
const ChatListPage = lazy(loadChatListPage);
const CreateChatPage = lazy(loadCreateChatPage);
const ChatDetailPage = lazy(loadChatDetailPage);
const CreateDirectChatPage = lazy(loadCreateDirectChatPage);
const CharacterLibraryPage = lazy(loadCharacterLibraryPage);
const CharacterEditorPage = lazy(loadCharacterEditorPage);
const SettingsPage = lazy(loadSettingsPage);
const RecycleBinPage = lazy(loadRecycleBinPage);
const AIModelsPage = lazy(loadAIModelsPage);
const AIProxyPage = lazy(loadAIProxyPage);
const MembershipPage = lazy(loadMembershipPage);
const AccountPage = lazy(loadAccountPage);
const SyncStatusPage = lazy(loadSyncStatusPage);
const BatchGenerateCharactersPage = lazy(loadBatchGenerateCharactersPage);
const LettersPage = lazy(loadLettersPage);
const CalendarPage = lazy(loadCalendarPage);
const MomentsPage = lazy(loadMomentsPage);
const MarketPage = lazy(loadMarketPage);
const IntroPage = lazy(loadIntroPage);
const LoginPage = lazy(loadLoginPage);
const PublicSharedChatPage = lazy(loadPublicSharedChatPage);
const AdminLayout = lazy(loadAdminLayout);
const AdminLoginPage = lazy(loadAdminLoginPage);
const AdminDashboardPage = lazy(loadAdminDashboardPage);
const AdminUsersPage = lazy(loadAdminUsersPage);
const AdminAdminsPage = lazy(loadAdminAdminsPage);
const AdminGlobalConfigPage = lazy(loadAdminGlobalConfigPage);
const AdminAIProviderPage = lazy(loadAdminAIProviderPage);
const AdminPlatformPage = lazy(loadAdminPlatformPage);
const AdminBillingPage = lazy(loadAdminBillingPage);
const AdminModerationPage = lazy(loadAdminModerationPage);
const AdminMarketPage = lazy(loadAdminMarketPage);
const AdminRiskPage = lazy(loadAdminRiskPage);
const AdminAuditPage = lazy(loadAdminAuditPage);
const AdminNotificationsPage = lazy(loadAdminNotificationsPage);
const AdminSendRecordsPage = lazy(loadAdminSendRecordsPage);
const AdminProfilePage = lazy(loadAdminProfilePage);

function RouteFallback() {
  return (
    <Box sx={{ px: 2.5, pt: 1.5 }}>
      <LinearProgress sx={{ borderRadius: 999 }} />
    </Box>
  );
}

function RouteElement({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function ChatDetailRouteElement() {
  return <RouteElement><ChatDetailPage /></RouteElement>;
}

function ChatMasterDetailRouteElement({ detail, fallback = 'detail', detailTitle = '会话' }: { detail: React.ReactNode; fallback?: 'master' | 'detail'; detailTitle?: React.ReactNode | null }) {
  return (
    <MasterDetailLayout
      master={<RouteElement><ChatListPage /></RouteElement>}
      detail={detail}
      masterTitle="聊天"
      detailTitle={detail ? detailTitle : null}
      fallback={fallback}
    />
  );
}

function CharacterMasterDetailRouteElement({ detail, fallback = 'detail' }: { detail: React.ReactNode; fallback?: 'master' | 'detail' }) {
  return (
    <MasterDetailLayout
      master={<RouteElement><CharacterLibraryPage /></RouteElement>}
      detail={detail}
      masterTitle="角色库"
      detailTitle={detail ? '角色' : null}
      fallback={fallback}
    />
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const authMode = useAuthStore((s) => s.authMode);
  const location = useLocation();

  if (!isLoggedIn && authMode !== 'local') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function RequireAdminAuth() {
  const isLoggedIn = useAdminAuthStore((s) => s.isLoggedIn);
  const isLoading = useAdminAuthStore((s) => s.isLoading);
  const location = useLocation();
  if (isLoading) {
    return <RouteFallback />;
  }
  if (!isLoggedIn) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

function AdminAuthRedirectHandler() {
  const logout = useAdminAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const from = (event as CustomEvent<{ from?: string }>).detail?.from || `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (!from.startsWith('/admin')) return;
      logout();
      setRedirect(from);
    };
    window.addEventListener(ADMIN_LOGIN_EVENT, handler);
    return () => window.removeEventListener(ADMIN_LOGIN_EVENT, handler);
  }, [logout]);

  useEffect(() => {
    if (!redirect) return;
    navigate('/admin/login', { replace: true, state: { from: { pathname: redirect } } });
    setRedirect(null);
  }, [navigate, redirect]);

  return null;
}

function AdminAuthBootstrap() {
  const checkAdminAuth = useAdminAuthStore((s) => s.checkAuth);
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!isAdminRoute) return;
    void checkAdminAuth();
  }, [checkAdminAuth, isAdminRoute]);

  return null;
}

function LegacyAdminAIProviderRedirect() {
  const { providerCode = '' } = useParams();
  return (
    <Navigate
      to={providerCode ? `/admin/platform/ai/providers/${encodeURIComponent(providerCode)}` : '/admin/platform?tab=ai'}
      replace
    />
  );
}

function AuthBootstrap() {
  const token = useAuthStore((s) => s.token);
  const authMode = useAuthStore((s) => s.authMode);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (isAdminRoute) return;
    if (authMode !== 'cloud' || !token) return;
    void checkAuth();
  }, [authMode, checkAuth, isAdminRoute, token]);

  return null;
}

function AuthSessionRedirectHandler() {
  const expireCloudSession = useAuthStore((s) => s.expireCloudSession);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AuthSessionExpiredDetail>).detail || {};
      expireCloudSession();
      navigate('/login', {
        replace: true,
        state: {
          from: detail.from,
          reason: 'expired',
        },
      });
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handler);
  }, [expireCloudSession, navigate]);

  return null;
}

function DataLoader({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const authMode = useAuthStore((s) => s.authMode);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    if (isLoggedIn || authMode === 'local') {
      void loadSettings();
    }
  }, [authMode, isLoggedIn, loadSettings]);

  return <>{children}</>;
}

function startPostImportCloudRefresh() {
  if (!isCloudSyncEnabled()) return;
  void Promise.allSettled([
    useSettingsStore.getState().refreshSettingsFromCloud(),
    useChatStore.getState().refreshChatSummaryFromCloud(),
    useCharacterStore.getState().refreshCharacterSummaryFromCloud(),
  ]);
}

function GuestImportPrompt() {
  const authMode = useAuthStore((s) => s.authMode);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userId = useAuthStore((s) => s.user?.id || null);
  const [snapshot, setSnapshot] = useState<GuestImportSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn || authMode !== 'cloud' || !userId) {
      setSnapshot(null);
      return () => {
        cancelled = true;
      };
    }
    const dismissedKey = `pneumata-guest-import-dismissed:${userId}`;
    if (sessionStorage.getItem(dismissedKey) === '1') return undefined;
    void readGuestImportSnapshot().then((nextSnapshot) => {
      if (cancelled) return;
      setSnapshot(hasGuestImportData(nextSnapshot) ? nextSnapshot : null);
    });
    return () => {
      cancelled = true;
    };
  }, [authMode, isLoggedIn, userId]);

  const closeAndRefresh = () => {
    if (userId) sessionStorage.setItem(`pneumata-guest-import-dismissed:${userId}`, '1');
    setSnapshot(null);
    startPostImportCloudRefresh();
  };

  const handleImport = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      await importGuestDataToCurrentAccount(snapshot);
      closeAndRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(snapshot)} maxWidth="xs" fullWidth>
      <DialogTitle>导入未登录数据</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          检测到此设备上有未登录时创建的本地数据。你可以导入到当前账号；不导入时，这些数据会保留在未登录本地空间，退出账号后仍可看到。
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closeAndRefresh} disabled={busy}>暂不导入</Button>
        <Button variant="contained" onClick={handleImport} disabled={busy}>导入到当前账号</Button>
      </DialogActions>
    </Dialog>
  );
}

function SiteConfigBootstrap({ onThemeColor }: { onThemeColor: (value: string | null) => void }) {
  useEffect(() => {
    let cancelled = false;
    const fallbackTitle = document.title || APP_TITLE;
    const ensureMeta = (name: string) => {
      let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = name;
        document.head.appendChild(meta);
      }
      return meta;
    };
    const ensureFavicon = () => {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      return link;
    };
    void api.getPlatformPublicConfig()
      .then(({ site }) => {
        if (cancelled) return;
        document.title = site.siteTitle || APP_TITLE;
        ensureMeta('description').content = site.siteDescription || APP_DESCRIPTION;
        onThemeColor(site.themeColor || null);
        if (site.faviconUrl) ensureFavicon().href = site.faviconUrl;
      })
      .catch(() => {
        if (cancelled) return;
        document.title = fallbackTitle;
        ensureMeta('description').content = APP_DESCRIPTION;
        onThemeColor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [onThemeColor]);

  return null;
}

function RoutedApp() {
  return (
    <Routes>
      <Route path="/login" element={<RouteElement><LoginPage /></RouteElement>} />
      <Route path="/admin/login" element={<RouteElement><AdminLoginPage /></RouteElement>} />
      <Route path="/intro" element={<RouteElement><IntroPage /></RouteElement>} />
      <Route path="/shared/:token" element={<RouteElement><PublicSharedChatPage /></RouteElement>} />
      <Route path="/shared/chats/:token" element={<RouteElement><PublicSharedChatPage /></RouteElement>} />
      <Route element={<RequireAdminAuth />}>
        <Route path="/admin" element={<RouteElement><AdminLayout /></RouteElement>}>
          <Route index element={<RouteElement><AdminPermissionGate permissions={ADMIN_DASHBOARD_PERMISSIONS}><AdminDashboardPage /></AdminPermissionGate></RouteElement>} />
          <Route path="users" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.usersRead]}><AdminUsersPage /></AdminPermissionGate></RouteElement>} />
          <Route path="admins" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.adminAll]}><AdminAdminsPage /></AdminPermissionGate></RouteElement>} />
          <Route path="global-config" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.platformRead]}><AdminGlobalConfigPage /></AdminPermissionGate></RouteElement>} />
          <Route path="ai" element={<Navigate to="/admin/platform?tab=ai" replace />} />
          <Route path="ai/providers/:providerCode" element={<LegacyAdminAIProviderRedirect />} />
          <Route path="platform/ai/providers/:providerCode" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.aiRead]}><AdminAIProviderPage /></AdminPermissionGate></RouteElement>} />
          <Route path="platform" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.platformRead, ADMIN_PERMISSION_CODES.aiRead]}><AdminPlatformPage /></AdminPermissionGate></RouteElement>} />
          <Route path="billing" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.billingRead]}><AdminBillingPage /></AdminPermissionGate></RouteElement>} />
          <Route path="moderation" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.sharesReview]}><AdminModerationPage /></AdminPermissionGate></RouteElement>} />
          <Route path="market" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.marketRead]}><AdminMarketPage /></AdminPermissionGate></RouteElement>} />
          <Route path="notifications" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.notificationsRead]}><AdminNotificationsPage /></AdminPermissionGate></RouteElement>} />
          <Route path="send-records" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.notificationsRead]}><AdminSendRecordsPage /></AdminPermissionGate></RouteElement>} />
          <Route path="config-migration" element={<Navigate to="/admin/global-config" replace />} />
          <Route path="risk" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.riskRead]}><AdminRiskPage /></AdminPermissionGate></RouteElement>} />
          <Route path="audit" element={<RouteElement><AdminPermissionGate permissions={[ADMIN_PERMISSION_CODES.auditRead]}><AdminAuditPage /></AdminPermissionGate></RouteElement>} />
          <Route path="me" element={<RouteElement><AdminProfilePage /></RouteElement>} />
        </Route>
      </Route>
      <Route element={<AppLayout />}>
        <Route path="/" element={<RouteElement><HomePage /></RouteElement>} />
        <Route path="/chats" element={<ChatMasterDetailRouteElement detail={null} fallback="master" />} />
        <Route path="/chats/create" element={<ChatMasterDetailRouteElement detail={<RouteElement><CreateChatPage /></RouteElement>} />} />
        <Route path="/direct/create" element={<ChatMasterDetailRouteElement detail={<RouteElement><CreateDirectChatPage /></RouteElement>} />} />
        <Route path="/chats/:id/edit" element={<ChatMasterDetailRouteElement detail={<RouteElement><CreateChatPage /></RouteElement>} />} />
        <Route path="/chats/:id" element={<ChatMasterDetailRouteElement detail={<ChatDetailRouteElement />} detailTitle={null} />} />
        <Route path="/characters" element={<CharacterMasterDetailRouteElement detail={null} fallback="master" />} />
        <Route path="/characters/create" element={<CharacterMasterDetailRouteElement detail={<RouteElement><CharacterEditorPage /></RouteElement>} />} />
        <Route path="/characters/:id/edit" element={<CharacterMasterDetailRouteElement detail={<RouteElement><CharacterEditorPage /></RouteElement>} />} />
        <Route path="/characters/batch-generate" element={<RouteElement><BatchGenerateCharactersPage /></RouteElement>} />
        <Route path="/letters" element={<RouteElement><LettersPage /></RouteElement>} />
        <Route path="/calendar" element={<RouteElement><CalendarPage /></RouteElement>} />
        <Route path="/moments" element={<RouteElement><MomentsPage /></RouteElement>} />
        <Route path="/market" element={<RouteElement><MarketPage /></RouteElement>} />
        <Route path="/ai-models" element={<RouteElement><AIModelsPage /></RouteElement>} />
        <Route path="/ai-proxy" element={<RouteElement><AIProxyPage /></RouteElement>} />
        <Route path="/membership" element={<RouteElement><MembershipPage /></RouteElement>} />
        <Route path="/account" element={<RouteElement><AccountPage /></RouteElement>} />
        <Route path="/account/sync-status" element={<RouteElement><SyncStatusPage /></RouteElement>} />
        <Route path="/settings" element={<RouteElement><SettingsPage /></RouteElement>} />
        <Route path="/settings/recycle-bin" element={<RouteElement><RecycleBinPage /></RouteElement>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const themeMode = useSettingsStore((s) => s.theme);
  const themePreset = useSettingsStore((s) => s.themePreset);
  const themeColor = useSettingsStore((s) => s.themeColor);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [settingsHydrated, setSettingsHydrated] = useState(() => useSettingsStore.persist.hasHydrated());
  const [siteThemeColor, setSiteThemeColor] = useState<string | null>(null);

  useEffect(() => {
    if (settingsHydrated) return;
    let cancelled = false;
    Promise.resolve(useSettingsStore.persist.rehydrate()).finally(() => {
      if (!cancelled) setSettingsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [settingsHydrated]);

  const resolvedMode = themeMode === 'system' ? (prefersDark ? 'dark' : 'light') : themeMode;

  const theme = useMemo(
    () => createAppTheme(resolvedMode, themeColor, themePreset),
    [resolvedMode, themeColor, themePreset]
  );

  useEffect(() => {
    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.content = siteThemeColor || theme.palette.primary.main;
  }, [siteThemeColor, theme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DevUpdatePrompt />
      <PwaUpdatePrompt />
      {settingsHydrated ? (
        <BrowserRouter>
          <SiteConfigBootstrap onThemeColor={setSiteThemeColor} />
          <AuthBootstrap />
          <AuthSessionRedirectHandler />
          <AdminAuthRedirectHandler />
          <AdminAuthBootstrap />
          <GuestImportPrompt />
          <DataLoader>
            <RoutedApp />
          </DataLoader>
        </BrowserRouter>
      ) : (
        <RouteFallback />
      )}
    </ThemeProvider>
  );
}
