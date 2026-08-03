import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Box, Typography, Button, Divider, IconButton, Chip } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChatIcon from '@mui/icons-material/Chat';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeveloperModeIcon from '@mui/icons-material/DeveloperMode';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PersonIcon from '@mui/icons-material/Person';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';
import { useCharacterStore } from '../stores/useCharacterStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useMessageStore } from '../stores/useMessageStore';
import type { SyncScopeSnapshot } from '../stores/syncScopeMetadata';
import { hasUsableDefaultTextAI } from '../types/settings';
import ChatCard from '../components/chat/ChatCard';
import EmptyState from '../components/common/EmptyState';
import NoCharactersDialog from '../components/common/NoCharactersDialog';
import SurfaceCard from '../components/common/SurfaceCard';
import PageSection from '../components/common/PageSection';
import { buildSettingsPath } from '../routes/settingsRoute';
import SectionHeader from '../components/common/SectionHeader';
import HomeCommandLauncher from '../features/homeCommand/HomeCommandLauncher';
import { MIN_MEMBERS } from '../constants/defaults';
import { avatarGenerationQueue, type AvatarGenerationQueueSummary } from '../services/avatarGenerationQueue';
import type { HomeCompanionshipSnapshot } from '../services/companionshipProjection';
import { shouldShowCompanionshipStatusHints } from '../services/companionshipStatusVisibility';
import { isCloudSyncEnabled } from '../services/cloudSyncPreference';
import { buildHomeSyncOverview } from '../services/homeSyncOverview';
import { buildLocalOutboxProjection, type LocalOutboxArtifactJobLike } from '../services/localOutboxProjection';
import { mirrorLocalOutboxQueues } from '../services/localOutboxMirror';
import { projectWorldCalendar, type WorldCalendarItem } from '../services/worldRuntimeProjection';
import { api, type OfficialAiProviderInfo } from '../services/api';
import { formatInAppNotificationWindow, notificationAlertSeverity, useInAppNotificationStore } from '../services/inAppNotifications';
import { getRegisteredSyncWorkerEntries } from '../stores/storeSyncScheduler';
import { motion, transition } from '../styles/motion';
import { formatAiAmount } from '../utils/aiPoints';

interface HomeOverviewCard {
  label: string;
  value: string | number;
  icon: ReactNode;
  color: string;
  onOpen: () => void | Promise<void>;
  onCreate?: () => void | Promise<void>;
  createLabel?: string;
  attention?: boolean;
}

const AI_POINT_PLACEHOLDER_VALUE = '--';

type OfficialBalanceProvider = string;

interface ArtifactHomeState {
  jobs: LocalOutboxArtifactJobLike[];
  syncScopes: SyncScopeSnapshot[];
}

interface ArtifactStoreSnapshotLike {
  jobs: Array<{
    id: string;
    kind: string;
    characterId: string;
    dateKey?: string | null;
    sourceKey?: string | null;
    createdAt: number;
    status: string;
    attempts: number;
    error?: string | null;
    updatedAt: number;
  }>;
  getSyncScopeStates: () => SyncScopeSnapshot[];
}

const EMPTY_ARTIFACT_HOME_STATE: ArtifactHomeState = {
  jobs: [],
  syncScopes: [],
};

type OfficialBalanceProviderInfo = {
  key: OfficialBalanceProvider;
  publicProvider: string;
  label: string;
  accessAllowed: boolean;
};

function normalizeOfficialBalanceProvider(provider: string): OfficialBalanceProvider | null {
  if (provider === 'official') return 'official-2';
  if (provider === 'official-deepseek') return 'official-1';
  if (provider === 'official-moacode') return 'official-2';
  if (provider === 'official-moacode-team') return 'official-team';
  if (provider === 'official-gpt') return 'official-4';
  if (provider.startsWith('official-')) return provider;
  return null;
}

function buildStatGridSx() {
  return {
    display: 'grid',
    gridTemplateColumns: {
      xs: 'repeat(auto-fit, minmax(104px, 1fr))',
      sm: 'repeat(auto-fit, minmax(116px, 142px))',
    },
    columnGap: { xs: 0.75, sm: 1 },
    rowGap: { xs: 1, sm: 1.25 },
    mt: 1,
    px: 0,
    pb: 0.75,
    alignItems: 'stretch',
    justifyContent: { xs: 'stretch', sm: 'start' },
  };
}

function buildStatCellSx() {
  return {
    minWidth: 0,
    display: 'flex',
    justifyContent: 'stretch',
    overflow: 'visible',
  };
}

function formatHomeCalendarTime(timestamp: number | null | undefined) {
  if (typeof timestamp !== 'number') return '';
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatOngoingActivityWindow(item: WorldCalendarItem) {
  const start = formatHomeCalendarTime(item.startAt);
  const end = formatHomeCalendarTime(item.endAt);
  if (start && end) return `${start} - ${end}`;
  if (start && typeof item.durationMinutes === 'number') return `${start} · 约${item.durationMinutes}分钟`;
  if (start) return start;
  return item.timeHint || '时间未定';
}

function formatOngoingActivityProgress(item: WorldCalendarItem, now: number) {
  if (typeof item.endAt === 'number') {
    const remainingMinutes = Math.max(0, Math.ceil((item.endAt - now) / 60_000));
    if (remainingMinutes > 0) return `预计还剩 ${remainingMinutes} 分钟`;
    return '即将结束';
  }
  if (typeof item.startAt === 'number') {
    const elapsedMinutes = Math.max(0, Math.floor((now - item.startAt) / 60_000));
    return elapsedMinutes > 0 ? `已进行 ${elapsedMinutes} 分钟` : '刚刚开始';
  }
  return '进行中';
}

function buildOngoingActivityRowSx() {
  return {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
    gap: { xs: 1, sm: 1.5 },
    alignItems: { xs: 'stretch', sm: 'center' },
    p: { xs: 1.25, sm: 1.5 },
    borderRadius: 1.5,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.045)' : 'rgba(120,156,220,0.075)',
    cursor: 'pointer',
    transition: transition(['border-color', 'background-color'], motion.durations.base, motion.gentleSpring),
    '&:hover': {
      borderColor: 'primary.main',
      bgcolor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.075)' : 'rgba(120,156,220,0.11)',
    },
  };
}

function buildStatCardSx() {
  return {
    width: '100%',
    height: '100%',
    maxWidth: { xs: 'none', sm: 142 },
    minWidth: 0,
    position: 'relative',
    overflow: 'visible',
    cursor: 'pointer',
    transition: transition(['transform', 'box-shadow', 'border-color'], motion.durations.base, motion.gentleSpring),
    '&:hover': {
      boxShadow: (theme: Theme) => theme.palette.mode === 'light' ? '0 16px 36px rgba(15,23,42,0.08)' : '0 18px 42px rgba(0,0,0,0.34)',
      borderColor: 'primary.main',
    },
    '&:active': {
      transform: 'scale(0.992)',
      transitionTimingFunction: motion.press,
      transitionDuration: `${motion.durations.instant}ms`,
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderTop: '1px solid',
      borderColor: (theme: Theme) => `${theme.palette.primary.main}24`,
      pointerEvents: 'none',
      borderRadius: 'inherit',
    },
  };
}

function buildAttentionCardSx() {
  return {
    ...buildStatCardSx(),
    borderColor: (theme: Theme) => `${theme.palette.primary.main}42`,
    bgcolor: (theme: Theme) => theme.palette.mode === 'light'
      ? 'rgba(49,90,156,0.065)'
      : 'rgba(120,156,220,0.095)',
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderTop: '1px solid',
      borderColor: (theme: Theme) => `${theme.palette.primary.main}40`,
      pointerEvents: 'none',
      borderRadius: 'inherit',
    },
  };
}

function buildStatContentSx() {
  return {
    width: '100%',
    textAlign: 'center',
    p: 0,
    '&:last-child': { pb: 0 },
    minHeight: { xs: 78, sm: 88 },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  };
}

function buildStatCenterSx() {
  return {
    width: '100%',
    minHeight: { xs: 78, sm: 88 },
    py: { xs: 1.15, sm: 1.35 },
    px: { xs: 0.55, sm: 0.9 },
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: { xs: 0.35, sm: 0.45 },
    overflow: 'visible',
  };
}

function buildCreateButtonSx() {
  return {
    position: 'absolute',
    right: -6,
    bottom: -6,
    zIndex: 1,
    width: { xs: 28, sm: 30 },
    height: { xs: 28, sm: 30 },
    bgcolor: 'primary.main',
    color: 'primary.contrastText',
    boxShadow: (theme: Theme) => theme.palette.mode === 'light'
      ? '0 10px 24px rgba(15,23,42,0.20)'
      : '0 12px 28px rgba(0,0,0,0.42)',
    border: 2,
    borderColor: 'background.default',
    borderRadius: '50%',
    transition: transition(['transform', 'box-shadow', 'background-color'], motion.durations.base, motion.spring),
    '&:hover': {
      bgcolor: 'primary.dark',
      transform: 'translateY(-1px) scale(1.08)',
      boxShadow: 4,
    },
    '&:active': {
      transform: 'scale(0.93)',
      transitionTimingFunction: motion.press,
      transitionDuration: `${motion.durations.instant}ms`,
    },
    '& .MuiTouchRipple-root': {
      borderRadius: '50%',
    },
  };
}

function buildStatLabelSx() {
  return {
    width: '100%',
    lineHeight: 1.25,
    textAlign: 'center',
    minHeight: { xs: '2.2em', sm: '2.3em' },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    color: 'text.secondary',
    fontSize: { xs: '0.7rem', sm: '0.78rem' },
    '& > span': {
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    },
  };
}

function buildStatValueSx() {
  return {
    fontWeight: 700,
    lineHeight: 1,
    fontSize: { xs: '1rem', sm: '1.16rem' },
  };
}

function buildStatIconSx(color: string) {
  return {
    color,
    fontSize: { xs: '0.9rem', sm: '1rem' },
    lineHeight: 1,
  };
}

function buildGridSx(columns?: { xs: string; sm: string; lg?: string; xl?: string }) {
  return {
    display: 'grid',
    gridTemplateColumns: columns || {
      xs: '1fr',
      sm: 'repeat(2, minmax(0, 1fr))',
      lg: 'repeat(3, minmax(0, 1fr))',
    },
    gap: 1.5,
  };
}

function projectArtifactHomeState(state: ArtifactStoreSnapshotLike): ArtifactHomeState {
  return {
    jobs: state.jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      characterId: job.characterId,
      dateKey: job.dateKey,
      sourceKey: job.sourceKey,
      createdAt: job.createdAt,
      status: job.status,
      attempts: job.attempts,
      error: job.error,
      updatedAt: job.updatedAt,
    })),
    syncScopes: state.getSyncScopeStates(),
  };
}

function areArtifactJobsEqual(a: LocalOutboxArtifactJobLike[], b: LocalOutboxArtifactJobLike[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return Boolean(other)
      && item.id === other.id
      && item.kind === other.kind
      && item.characterId === other.characterId
      && item.dateKey === other.dateKey
      && item.sourceKey === other.sourceKey
      && item.createdAt === other.createdAt
      && item.status === other.status
      && item.attempts === other.attempts
      && item.error === other.error
      && item.updatedAt === other.updatedAt;
  });
}

function areSyncScopeSnapshotsEqual(a: SyncScopeSnapshot[], b: SyncScopeSnapshot[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return Boolean(other)
      && item.scope === other.scope
      && item.lastCheckedAt === other.lastCheckedAt
      && item.lastAppliedAt === other.lastAppliedAt
      && item.cursor === other.cursor
      && item.revision === other.revision
      && item.lastError === other.lastError
      && item.errorCount === other.errorCount
      && item.retryAt === other.retryAt
      && item.inflight === other.inflight;
  });
}

function areArtifactHomeStatesEqual(a: ArtifactHomeState, b: ArtifactHomeState) {
  return areArtifactJobsEqual(a.jobs, b.jobs) && areSyncScopeSnapshotsEqual(a.syncScopes, b.syncScopes);
}

function scheduleIdleTask(callback: () => void, timeout = 1200) {
  const scheduler = (window as typeof window & {
    requestIdleCallback?: (idleCallback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;
  if (typeof scheduler === 'function') {
    const idleHandle = scheduler(callback, { timeout });
    return () => window.cancelIdleCallback?.(idleHandle);
  }
  const timeoutHandle = window.setTimeout(callback, Math.min(timeout, 400));
  return () => window.clearTimeout(timeoutHandle);
}

function useDeferredArtifactHomeState() {
  const [artifactState, setArtifactState] = useState<ArtifactHomeState>(EMPTY_ARTIFACT_HOME_STATE);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const cancelScheduled = scheduleIdleTask(() => {
      void import('../stores/useCharacterArtifactStore').then(({ useCharacterArtifactStore }) => {
        if (cancelled) return;
        const applyNextState = (nextState: ArtifactHomeState) => {
          setArtifactState((prev) => areArtifactHomeStatesEqual(prev, nextState) ? prev : nextState);
        };
        applyNextState(projectArtifactHomeState(useCharacterArtifactStore.getState()));
        unsubscribe = useCharacterArtifactStore.subscribe((state) => {
          applyNextState(projectArtifactHomeState(state));
        });
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      cancelScheduled();
    };
  }, []);

  return artifactState;
}

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { chats, prefetchChats, markChatsWarm, pendingOperations: chatPendingOperations, getSyncScopeStates: getChatSyncScopeStates } = useChatStore(useShallow((state) => ({
    chats: state.chats,
    prefetchChats: state.prefetchChats,
    markChatsWarm: state.markChatsWarm,
    pendingOperations: state.pendingOperations,
    getSyncScopeStates: state.getSyncScopeStates,
  })));
  const { characters, prefetchCharacters, markCharactersWarm, pendingOperations: characterPendingOperations, getSyncScopeStates: getCharacterSyncScopeStates } = useCharacterStore(useShallow((state) => ({
    characters: state.characters,
    prefetchCharacters: state.prefetchCharacters,
    markCharactersWarm: state.markCharactersWarm,
    pendingOperations: state.pendingOperations,
    getSyncScopeStates: state.getSyncScopeStates,
  })));
  const aiProfiles = useSettingsStore((state) => state.aiProfiles);
  const usageStats = useSettingsStore((state) => state.usageStats);
  const messagePendingOperations = useMessageStore((state) => state.pendingOperations);
  const getMessageSyncScopeStates = useMessageStore((state) => state.getSyncScopeStates);
  const developerMode = useSettingsStore((state) => state.developerMode);
  const { jobs: artifactJobs, syncScopes: artifactSyncScopes } = useDeferredArtifactHomeState();
  const getSettingsSyncScopeStates = useSettingsStore((state) => state.getSyncScopeStates);
  const activeDiaryJobs = artifactJobs.filter((job) => job.kind === 'diary' && (job.status === 'pending' || job.status === 'running')).length;
  const authMode = useAuthStore((state) => state.authMode);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const user = useAuthStore((state) => state.user);
  const [avatarQueueSummary, setAvatarQueueSummary] = useState<AvatarGenerationQueueSummary>(() => avatarGenerationQueue.getSummary());
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState(() => isCloudSyncEnabled());
  const [workerEntries, setWorkerEntries] = useState(() => getRegisteredSyncWorkerEntries());
  const [aiPointBalance, setAiPointBalance] = useState<number | null | undefined>(undefined);
  const [officialProviderAccess, setOfficialProviderAccess] = useState<Record<string, OfficialBalanceProviderInfo> | null>(null);
  const [companionshipSnapshot, setCompanionshipSnapshot] = useState<HomeCompanionshipSnapshot | null>(null);
  const [calendarNow, setCalendarNow] = useState(() => Date.now());
  const inAppNotifications = useInAppNotificationStore((state) => state.items);
  const recentChats = useMemo(() => chats.slice(0, 10), [chats]);
  const recentChatIds = useMemo(() => new Set(recentChats.map((chat) => chat.id)), [recentChats]);
  const recentActiveMessages = useMessageStore(useShallow((state) => (
    state.messages.filter((message) => recentChatIds.has(message.chatId)).slice(-60)
  )));
  const recentWindowMessages = useMessageStore(useShallow((state) => (
    recentChats.flatMap((chat) => (state.messageWindowsByChatId[chat.id]?.messages || []).slice(-20))
  )));

  useEffect(() => {
    markChatsWarm();
    markCharactersWarm();
    void prefetchChats();
    void prefetchCharacters();
  }, [markCharactersWarm, markChatsWarm, prefetchCharacters, prefetchChats]);

  useEffect(() => avatarGenerationQueue.subscribeSummary(setAvatarQueueSummary), []);

  useEffect(() => {
    const timer = window.setInterval(() => setCalendarNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void mirrorLocalOutboxQueues({
      chatOperations: chatPendingOperations,
      characterOperations: characterPendingOperations,
      messageOperations: messagePendingOperations,
      artifactJobs,
    }).catch((error) => {
      console.warn('[local-outbox] failed to mirror home queues', error);
    });
  }, [artifactJobs, characterPendingOperations, chatPendingOperations, messagePendingOperations]);

  useEffect(() => {
    const update = () => {
      setCloudSyncEnabledState(isCloudSyncEnabled());
      setWorkerEntries(getRegisteredSyncWorkerEntries());
    };
    update();
    const timer = window.setInterval(update, 2500);
    window.addEventListener('pneumata-cloud-sync-preference-changed', update);
    window.addEventListener('pneumata-cloud-sync-bootstrap-lock-changed', update);
    window.addEventListener('online', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pneumata-cloud-sync-preference-changed', update);
      window.removeEventListener('pneumata-cloud-sync-bootstrap-lock-changed', update);
      window.removeEventListener('online', update);
    };
  }, []);

  const customCharacters = characters.filter((character) => !character.isPreset && !character.deletedAt);
  const [noCharactersDialogOpen, setNoCharactersDialogOpen] = useState(false);
  const [noCharactersReturnTo, setNoCharactersReturnTo] = useState('/chats/create');
  const [noCharactersRequiredCount, setNoCharactersRequiredCount] = useState(MIN_MEMBERS);
  const totalDirectChats = chats.filter((chat) => chat.type === 'direct' || chat.type === 'ai_direct').length;
  const totalGroupChats = chats.filter((chat) => chat.type === 'group').length;
  const resolveChatListTab = (chat: typeof chats[number]) => chat.type === 'assistant' ? 3 : chat.type === 'group' ? 0 : chat.type === 'ai_direct' ? 2 : 1;
  const openChatFromHome = (chat: typeof chats[number]) => navigate(`/chats/${chat.id}?fromTab=${resolveChatListTab(chat)}`);
  const openCreateChatWithCharacterGuard = (path: string) => {
    const requiredCount = path.startsWith('/chats/create') ? MIN_MEMBERS : 1;
    if (customCharacters.length < requiredCount) {
      setNoCharactersReturnTo(path);
      setNoCharactersRequiredCount(requiredCount);
      setNoCharactersDialogOpen(true);
      return;
    }
    navigate(path);
  };
  const noCharactersDialogTitle = customCharacters.length === 0 ? '还没有AI角色' : 'AI角色不足';
  const noCharactersDialogMessage = noCharactersRequiredCount > 1
    ? customCharacters.length === 0
      ? `创建群聊至少需要 ${noCharactersRequiredCount} 个AI角色。可以先去角色库创建角色，或根据主题批量生成。`
      : `当前只有 ${customCharacters.length} 个AI角色，群聊至少需要 ${noCharactersRequiredCount} 个AI角色。请再创建 ${noCharactersRequiredCount - customCharacters.length} 个角色，或根据主题批量生成。`
    : '创建单聊前，需要先在角色库中创建至少一个AI角色。也可以根据主题或故事批量生成角色。';
  const recentChatsTitle = '最近会话';
  const recentChatsActionTab = recentChats[0] ? resolveChatListTab(recentChats[0]) : 0;
  const needsAIModelSetup = !hasUsableDefaultTextAI(aiProfiles);
  const needsLogin = authMode === 'local' || !isLoggedIn;
  useEffect(() => {
    if (needsLogin) {
      setOfficialProviderAccess(null);
      return;
    }
    setOfficialProviderAccess(null);
    let cancelled = false;
    api.getOfficialAiProviders()
      .then((result) => {
        if (cancelled) return;
        setOfficialProviderAccess(Object.fromEntries((result.items || []).map((provider: OfficialAiProviderInfo) => {
          const publicProvider = String(provider.officialProvider || provider.code || '').toLowerCase();
          return [publicProvider, {
            key: publicProvider,
            publicProvider,
            label: provider.label || provider.name || 'AI点数',
            accessAllowed: provider.accessAllowed !== false,
          }];
        })));
      })
      .catch(() => {
        if (!cancelled) setOfficialProviderAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsLogin]);
  const enabledOfficialBalanceProviders = useMemo(() => {
    if (!officialProviderAccess) return [];
    const providerKeys = new Set<OfficialBalanceProvider>();
    aiProfiles.forEach((profile) => {
      const normalized = normalizeOfficialBalanceProvider(profile.provider);
      if (!normalized) return;
      if (officialProviderAccess[normalized]?.accessAllowed === false) return;
      providerKeys.add(normalized);
    });
    return Array.from(providerKeys)
      .map((key) => officialProviderAccess[key])
      .filter((provider): provider is OfficialBalanceProviderInfo => Boolean(provider));
  }, [aiProfiles, officialProviderAccess]);
  const primaryOfficialBalanceProvider = enabledOfficialBalanceProviders[0] || null;
  const canQueryAiPoints = !needsLogin && Boolean(primaryOfficialBalanceProvider);
  const shouldReserveAiPointsCard = !needsLogin;
  const aiPointCardValue = primaryOfficialBalanceProvider && typeof aiPointBalance === 'number'
    ? formatAiAmount(aiPointBalance, primaryOfficialBalanceProvider.publicProvider, { compact: true })
    : aiPointBalance === null
      ? '未分配'
      : AI_POINT_PLACEHOLDER_VALUE;
  const needsNicknameSetup = !needsLogin && !String(user?.nickname || '').trim();
  const needsOwnCharacter = characters.length > 0 && customCharacters.length === 0;
  const hasActiveAvatarTasks = avatarQueueSummary.active > 0;
  const knownMessages = useMemo(() => [
    ...recentActiveMessages,
    ...recentWindowMessages,
  ], [recentActiveMessages, recentWindowMessages]);
  const recentKnownAiMessageCount = useMemo(() => {
    const keys = new Set<string>();
    const collect = (message: typeof knownMessages[number]) => {
      if (message.type !== 'ai' || message.isDeleted) return;
      keys.add(message.clientKey || message.serverId || message.id);
    };
    knownMessages.forEach(collect);
    return keys.size;
  }, [knownMessages]);
  const aiMessageCount = Math.max(usageStats?.aiMessageCount || 0, recentKnownAiMessageCount);
  const companionshipSettings = useSettingsStore((state) => state.companionship);
  const showCompanionshipStatusHints = shouldShowCompanionshipStatusHints(companionshipSettings);
  useEffect(() => {
    if (!showCompanionshipStatusHints) {
      setCompanionshipSnapshot(null);
      return undefined;
    }
    let cancelled = false;
    const now = Date.now();
    const buildSnapshot = () => {
      void import('../services/companionshipProjection').then(({ buildHomeCompanionshipSnapshot }) => {
        if (cancelled) return;
        setCompanionshipSnapshot(buildHomeCompanionshipSnapshot({
          chats: recentChats,
          characters,
          messages: knownMessages,
          now,
        }));
      });
    };
    const scheduler = (window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    const idleHandle = typeof scheduler === 'function' ? scheduler(buildSnapshot, { timeout: 1800 }) : null;
    const timeoutHandle = idleHandle == null ? window.setTimeout(buildSnapshot, 900) : null;
    return () => {
      cancelled = true;
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
    };
  }, [characters, knownMessages, recentChats, showCompanionshipStatusHints]);
  const syncOverview = useMemo(() => buildHomeSyncOverview({
    cloudSyncAvailable: !needsLogin,
    cloudSyncEnabled,
    operations: buildLocalOutboxProjection({
      chatOperations: chatPendingOperations,
      characterOperations: characterPendingOperations,
      messageOperations: messagePendingOperations,
      artifactJobs,
    }),
    artifactJobs: [],
    syncScopes: [
      ...getCharacterSyncScopeStates(),
      ...getChatSyncScopeStates(),
      ...getMessageSyncScopeStates(),
      ...artifactSyncScopes,
      ...getSettingsSyncScopeStates(),
    ],
    workerEntries,
  }), [
    artifactJobs,
    characterPendingOperations,
    chatPendingOperations,
    cloudSyncEnabled,
    artifactSyncScopes,
    getCharacterSyncScopeStates,
    getChatSyncScopeStates,
    getMessageSyncScopeStates,
    getSettingsSyncScopeStates,
    messagePendingOperations,
    needsLogin,
    workerEntries,
  ]);
  const syncUploadingCount = syncOverview.uploading + syncOverview.pendingUpload;
  const syncDownloadingCount = syncOverview.checkingDownloads + syncOverview.pendingDownload;
  const syncExceptionCount = syncOverview.failedUpload + syncOverview.failedScopes + syncOverview.backoffScopes;
  const ongoingActivities = useMemo(() => projectWorldCalendar(chats, characters, { now: calendarNow }).items
    .filter((item) => item.status === 'in_progress')
    .sort((left, right) => (left.endAt || Number.MAX_SAFE_INTEGER) - (right.endAt || Number.MAX_SAFE_INTEGER))
    .slice(0, 4), [calendarNow, characters, chats]);
  const pinnedAnnouncements = useMemo(() => inAppNotifications.filter((item) => item.pinnedEnabled).slice(0, 3), [inAppNotifications]);
  useEffect(() => {
    if (!canQueryAiPoints || !primaryOfficialBalanceProvider) {
      setAiPointBalance(undefined);
      return;
    }
    let cancelled = false;
    setAiPointBalance(undefined);
    const loadBalances = () => {
      api.getAiBalance(primaryOfficialBalanceProvider.publicProvider)
        .then((balance) => {
          const raw = balance.availableBalance ?? balance.available_balance;
          if (!cancelled) setAiPointBalance(typeof raw === 'number' && Number.isFinite(raw) ? raw : null);
        })
        .catch(() => {
          if (!cancelled) setAiPointBalance(null);
        });
    };
    const scheduler = (window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    const idleHandle = typeof scheduler === 'function' ? scheduler(loadBalances, { timeout: 2400 }) : null;
    const timeoutHandle = idleHandle == null ? window.setTimeout(loadBalances, 1200) : null;
    return () => {
      cancelled = true;
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
    };
  }, [canQueryAiPoints, primaryOfficialBalanceProvider]);

  const syncStatusStats: HomeOverviewCard[] = (!needsLogin && cloudSyncEnabled) ? [
    ...(syncUploadingCount > 0 ? [{
      label: syncOverview.uploading > 0 ? `${syncOverview.uploading} 正在上传` : '等待上传',
      value: syncUploadingCount,
      icon: <CloudUploadIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/account/sync-status'),
      attention: syncOverview.uploading > 0,
    }] : []),
    ...(syncDownloadingCount > 0 ? [{
      label: syncOverview.checkingDownloads > 0 ? `${syncOverview.checkingDownloads} 正在下载` : '等待下载',
      value: syncDownloadingCount,
      icon: <CloudDownloadIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/account/sync-status'),
      attention: syncOverview.checkingDownloads > 0,
    }] : []),
    ...(syncExceptionCount > 0 ? [{
      label: '未读同步异常',
      value: syncExceptionCount,
      icon: <SyncProblemIcon />,
      color: 'warning.main',
      onOpen: () => navigate('/account/sync-status'),
      attention: true,
    }] : []),
  ].slice(0, 3) : [];

  const attentionStats: HomeOverviewCard[] = [
    ...(needsLogin ? [{
      label: t('nav.signInSync'),
      value: t('nav.localMode'),
      icon: <PersonIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/login'),
      attention: true,
    }] : []),
    ...(needsAIModelSetup ? [{
      label: '默认文本模型',
      value: '待设置',
      icon: <SettingsSuggestIcon />,
      color: 'primary.main',
      onOpen: () => navigate(buildSettingsPath({ tab: 'models', card: 'models' })),
      attention: true,
    }] : []),
    ...(developerMode ? [{
      label: '开发者模式',
      value: '已开启',
      icon: <DeveloperModeIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/settings'),
      attention: true,
    }] : []),
    ...(needsOwnCharacter ? [{
      label: '自定义角色',
      value: '暂无',
      icon: <PersonIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/characters'),
      attention: true,
    }] : []),
    ...(hasActiveAvatarTasks ? [{
      label: avatarQueueSummary.running > 0
        ? `头像生成中，队列 ${avatarQueueSummary.queued}`
        : '头像等待生成',
      value: avatarQueueSummary.active,
      icon: <AutoAwesomeIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/characters'),
      attention: true,
    }] : []),
    ...(activeDiaryJobs > 0 ? [{
      label: '生成日记',
      value: activeDiaryJobs,
      icon: <MenuBookIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/letters?tab=diary'),
      attention: true,
    }] : []),
  ];

  const stats: HomeOverviewCard[] = [
    ...attentionStats,
    ...(needsNicknameSetup ? [{
      label: '未设置用户昵称',
      value: '待设置',
      icon: <PersonIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/account'),
      attention: true,
    }] : []),
    {
      label: t('home.totalCharacters'),
      value: customCharacters.length,
      icon: <PersonIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/characters'),
      onCreate: () => navigate('/characters/create'),
      createLabel: t('character.create'),
    },
    {
      label: t('home.totalChats'),
      value: totalGroupChats,
      icon: <ChatIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/chats?tab=0'),
      onCreate: () => openCreateChatWithCharacterGuard('/chats/create'),
      createLabel: t('chat.create'),
    },
    {
      label: '单聊数量',
      value: totalDirectChats,
      icon: <ChatIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/chats?tab=1'),
      onCreate: () => openCreateChatWithCharacterGuard('/direct/create'),
      createLabel: '创建单聊',
    },
    {
      label: '角色消息',
      value: aiMessageCount,
      icon: <ChatIcon />,
      color: 'primary.main',
      onOpen: () => navigate('/chats?tab=0'),
    },
    ...(shouldReserveAiPointsCard ? [{
        label: 'AI点数',
        value: aiPointCardValue,
        icon: <AutoAwesomeIcon />,
        color: 'primary.main',
        onOpen: () => navigate(buildSettingsPath({ tab: 'models', card: 'models' })),
      }] : []),
    ...syncStatusStats,
  ];

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2.5, sm: 3, md: 3.5 }, pt: { xs: 1, sm: 1, md: 3 }, pb: { xs: 'calc(env(safe-area-inset-bottom, 0px) + 82px)', sm: 3, md: 3.5 } }}>
      <PageSection spacing={3}>
        {pinnedAnnouncements.length ? (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {pinnedAnnouncements.map((item) => (
              <Alert
                key={item.id}
                severity={notificationAlertSeverity(item.severity)}
                sx={{
                  alignItems: 'flex-start',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  '& .MuiAlert-message': { minWidth: 0, width: '100%' },
                }}
              >
                <Box sx={{ display: 'grid', gap: 0.35, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{item.title}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.body}</Typography>
                  <Typography variant="caption" color="text.secondary">生效时间：{formatInAppNotificationWindow(item)}</Typography>
                </Box>
              </Alert>
            ))}
          </Box>
        ) : null}

        <SurfaceCard>
          <SectionHeader title="工作台概览" />
          <Box sx={buildStatGridSx()}>
            {stats.map((stat) => (
              <Box key={stat.label} sx={buildStatCellSx()}>
                <SurfaceCard
                  sx={stat.attention ? buildAttentionCardSx() : buildStatCardSx()}
                  contentSx={buildStatContentSx()}
                  onClick={stat.onOpen}
                  aria-label={`${stat.label}快捷入口`}
                >
                  {stat.onCreate ? (
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        stat.onCreate?.();
                      }}
                      aria-label={stat.createLabel}
                      sx={buildCreateButtonSx()}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                  <Box sx={buildStatCenterSx()}>
                    <Box sx={buildStatIconSx(stat.color)}>{stat.icon}</Box>
                    <Typography variant="h5" sx={buildStatValueSx()}>{stat.value}</Typography>
                    <Typography variant="body2" sx={buildStatLabelSx()}><span>{stat.label}</span></Typography>
                  </Box>
                </SurfaceCard>
              </Box>
            ))}
          </Box>
        </SurfaceCard>

        <HomeCommandLauncher />

        {ongoingActivities.length ? (
          <SurfaceCard>
            <SectionHeader
              title="正在进行的活动"
              action={<Button size="small" variant="outlined" onClick={() => navigate('/calendar')}>打开日历</Button>}
            />
            <Box sx={{ display: 'grid', gap: 1.25, mt: 1 }}>
              {ongoingActivities.map((item) => {
                const sourceRef = item.sourceRefs[0];
                return (
                  <Box
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/calendar')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') navigate('/calendar');
                    }}
                    sx={buildOngoingActivityRowSx()}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mb: 0.75 }}>
                        <Box sx={buildStatIconSx('primary.main')}>
                          <EventAvailableIcon fontSize="small" />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 780, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </Typography>
                        <Chip size="small" color="primary" label="进行中" sx={{ height: 22, borderRadius: 999, flexShrink: 0 }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                        {[
                          formatOngoingActivityWindow(item),
                          item.locationHint ? `地点 ${item.locationHint}` : '',
                          sourceRef?.conversationName ? `来自 ${sourceRef.conversationName}` : '',
                        ].filter(Boolean).join(' · ')}
                      </Typography>
                      {item.participantNames.length ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.participantNames.join('、')}
                        </Typography>
                      ) : null}
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, alignItems: 'center' }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={formatOngoingActivityProgress(item, calendarNow)}
                        sx={{ height: 26, borderRadius: 999, maxWidth: '100%' }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </SurfaceCard>
        ) : null}

        <Divider />

        <SurfaceCard>
          <SectionHeader title={recentChatsTitle} action={<Button size="small" variant="outlined" onClick={() => navigate(`/chats?tab=${recentChatsActionTab}`)}>查看全部</Button>} />
          {companionshipSnapshot ? (
            <Box
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/chats/${companionshipSnapshot.chatId}?fromTab=1`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') navigate(`/chats/${companionshipSnapshot.chatId}?fromTab=1`);
              }}
              sx={{
                mb: 1.5,
                px: 1.5,
                py: 1.25,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.045)' : 'rgba(120,156,220,0.075)',
                cursor: 'pointer',
                transition: transition(['border-color', 'background-color'], motion.durations.base, motion.gentleSpring),
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.075)' : 'rgba(120,156,220,0.11)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Chip size="small" label={companionshipSnapshot.characterName} variant="outlined" sx={{ height: 22, borderRadius: 999 }} />
                <Typography variant="caption" color="text.secondary">回来以后</Typography>
              </Box>
              <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.55 }}>
                {companionshipSnapshot.text}
              </Typography>
            </Box>
          ) : null}
          {recentChats.length === 0 ? (
            <EmptyState
              icon="🍵"
              message={t('home.noChats')}
              action={<Button variant="outlined" onClick={() => openCreateChatWithCharacterGuard('/chats/create')}>{t('chat.create')}</Button>}
            />
          ) : (
            <Box sx={buildGridSx()}>
              {recentChats.map((chat) => (
                <ChatCard key={chat.id} chat={chat} characters={characters} onClick={() => openChatFromHome(chat)} />
              ))}
            </Box>
          )}
        </SurfaceCard>
      </PageSection>
      <NoCharactersDialog
        open={noCharactersDialogOpen}
        onClose={() => setNoCharactersDialogOpen(false)}
        returnTo={noCharactersReturnTo}
        title={noCharactersDialogTitle}
        message={noCharactersDialogMessage}
      />
    </Box>
  );
}
