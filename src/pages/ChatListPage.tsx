import { useEffect, useMemo, useState } from 'react';
import { useLayoutHeaderActions } from '../components/layout/AppLayoutContext';
import { Box, TextField, Button, InputAdornment, Stack, IconButton, Tooltip, Collapse, useMediaQuery } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import VerticalSplitIcon from '@mui/icons-material/VerticalSplit';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/useChatStore';
import { useCharacterStore } from '../stores/useCharacterStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useMessageStore } from '../stores/useMessageStore';
import ChatCard from '../components/chat/ChatCard';
import EmptyState from '../components/common/EmptyState';
import NoCharactersDialog from '../components/common/NoCharactersDialog';
import ListSkeletonGrid from '../components/common/ListSkeletonGrid';
import ConfirmDialog from '../components/common/ConfirmDialog';
import AppSnackbar from '../components/common/AppSnackbar';
import FloatingSegmentedTabs from '../components/common/FloatingSegmentedTabs';
import { buildFloatingTabContainerSx } from '../components/common/FloatingSegmentedTabs.styles';
import AnimatedTabContent from '../components/common/AnimatedTabContent';
import { resolveTabTransitionDirection } from '../components/common/tabTransition';
import ExpandableFab from '../components/common/ExpandableFab';
import { usePaneLayout } from '../components/layout/PaneLayoutContext';
import { DETAIL_COLLAPSED_CHANGE_EVENT, DETAIL_COLLAPSED_STORAGE_KEY, readDetailCollapsedState, writeDetailCollapsedState } from '../components/layout/masterDetailState';
import { readPersistentUiValue, writePersistentUiValue } from '../utils/persistentUiState';
import { motion, transition } from '../styles/motion';
import { buildListGridSx } from '../styles/interaction';
import { buildAssistantChatDraft } from '../services/chatDraftBuilder';
import { getLatestChatPreviewMessage, sanitizeChatLatestMessage } from '../services/chatLatestMessage';
import { MIN_MEMBERS } from '../constants/defaults';

const CHAT_LIST_TAB_KEY = 'chat-list-tab';
const ASSISTANT_TAB = 3;
const CHAT_LIST_TAB_ORDER = [ASSISTANT_TAB, 0, 1, 2] as const;
const isChatListTab = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= ASSISTANT_TAB;

type ChatListLocationState = {
  deletedAssistantChat?: {
    id?: string;
    name?: string;
  };
} | null;

function getActiveChatId(pathname: string) {
  return pathname.match(/^\/chats\/([^/]+)(?:\/edit)?$/)?.[1] || null;
}

export default function ChatListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderActions, setHeaderBackAction } = useLayoutHeaderActions();
  const isThreeColumn = useMediaQuery('(min-width:1280px)');
  const pane = usePaneLayout();
  const isMasterPane = pane.role === 'master';
  const { chats, addChat, deleteChat, restoreChats, prefetchChats, restoreLocalChats, markChatsWarm, isLoading } = useChatStore(useShallow((state) => ({
    chats: state.chats,
    addChat: state.addChat,
    deleteChat: state.deleteChat,
    restoreChats: state.restoreChats,
    prefetchChats: state.prefetchChats,
    restoreLocalChats: state.restoreLocalChats,
    markChatsWarm: state.markChatsWarm,
    isLoading: state.isLoading,
  })));
  const { characters, prefetchCharacters, markCharactersWarm } = useCharacterStore(useShallow((state) => ({
    characters: state.characters,
    prefetchCharacters: state.prefetchCharacters,
    markCharactersWarm: state.markCharactersWarm,
  })));
  const authMode = useAuthStore((state) => state.authMode);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const messageWindowsByChatId = useMessageStore((state) => state.messageWindowsByChatId);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(readDetailCollapsedState);
  const [creatingAssistant, setCreatingAssistant] = useState(false);
  const initialTab = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const parsed = Number(tabParam);
    return tabParam != null && isChatListTab(parsed) ? parsed : readPersistentUiValue(CHAT_LIST_TAB_KEY, 0, isChatListTab);
  }, [location.search]);
  const [tab, setTab] = useState(initialTab);
  const [tabTransitionDirection, setTabTransitionDirection] = useState<-1 | 1>(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletedAssistantNotice, setDeletedAssistantNotice] = useState<{ id: string; name: string } | null>(null);
  const [assistantDeleteError, setAssistantDeleteError] = useState('');
  const activeChatId = isMasterPane ? getActiveChatId(location.pathname) : null;


  useEffect(() => {
    const syncDetailCollapsed = () => setDetailCollapsed(readDetailCollapsedState());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DETAIL_COLLAPSED_STORAGE_KEY) syncDetailCollapsed();
    };
    window.addEventListener(DETAIL_COLLAPSED_CHANGE_EVENT, syncDetailCollapsed);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(DETAIL_COLLAPSED_CHANGE_EVENT, syncDetailCollapsed);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    setHeaderBackAction(null);
    setHeaderActions(
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Tooltip title={searchOpen ? '收起搜索' : t('chat.search')}>
          <IconButton
            aria-label={searchOpen ? '收起搜索' : t('chat.search')}
            color={searchOpen ? 'primary' : 'default'}
            onClick={() => {
              setSearchOpen((open) => {
                if (open) setSearch('');
                return !open;
              });
            }}
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              border: '1px solid',
              borderColor: (theme) => searchOpen
                ? theme.palette.primary.main
                : 'transparent',
              bgcolor: (theme) => searchOpen
                ? theme.palette.mode === 'light' ? 'rgba(49,90,156,0.10)' : 'rgba(120,156,220,0.14)'
                : 'transparent',
              transition: transition(['background-color', 'border-color', 'color', 'transform'], motion.durations.base, motion.softOut),
              '&:hover': {
                transform: 'scale(1.03)',
                borderColor: (theme) => searchOpen
                  ? theme.palette.primary.main
                  : theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.10)',
                bgcolor: (theme) => searchOpen
                  ? theme.palette.mode === 'light' ? 'rgba(49,90,156,0.12)' : 'rgba(120,156,220,0.16)'
                  : theme.palette.mode === 'light' ? 'rgba(15,23,42,0.035)' : 'rgba(226,232,240,0.06)',
              },
              '&:active': {
                transform: 'scale(0.94)',
                transitionTimingFunction: motion.press,
                transitionDuration: `${motion.durations.instant}ms`,
              },
            }}
          >
            {searchOpen ? <CloseIcon fontSize="small" /> : <SearchIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        {isThreeColumn ? (
          <Tooltip title={detailCollapsed ? '显示分栏' : '隐藏分栏'}>
            <IconButton
              aria-label={detailCollapsed ? '显示分栏' : '隐藏分栏'}
              color={detailCollapsed ? 'default' : 'primary'}
              onClick={() => writeDetailCollapsedState(!detailCollapsed)}
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1,
                border: '1px solid',
                borderColor: (theme) => detailCollapsed
                  ? 'transparent'
                  : theme.palette.primary.main,
                bgcolor: (theme) => detailCollapsed
                  ? 'transparent'
                  : theme.palette.mode === 'light' ? 'rgba(49,90,156,0.10)' : 'rgba(120,156,220,0.14)',
                transition: transition(['background-color', 'border-color', 'color', 'transform'], motion.durations.base, motion.softOut),
                '&:hover': {
                  transform: 'scale(1.03)',
                  borderColor: (theme) => detailCollapsed
                    ? theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.10)'
                    : theme.palette.primary.main,
                  bgcolor: (theme) => detailCollapsed
                    ? theme.palette.mode === 'light' ? 'rgba(15,23,42,0.035)' : 'rgba(226,232,240,0.06)'
                    : theme.palette.mode === 'light' ? 'rgba(49,90,156,0.12)' : 'rgba(120,156,220,0.16)',
                },
                '&:active': {
                  transform: 'scale(0.94)',
                  transitionTimingFunction: motion.press,
                  transitionDuration: `${motion.durations.instant}ms`,
                },
              }}
            >
              <VerticalSplitIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    );

    return () => {
      setHeaderActions(null);
      setHeaderBackAction(null);
    };
  }, [detailCollapsed, isThreeColumn, searchOpen, setHeaderActions, setHeaderBackAction, t]);

  useEffect(() => {
    markChatsWarm();
    markCharactersWarm();
    void restoreLocalChats();
    void prefetchChats();
    void prefetchCharacters();
  }, [authMode, isLoggedIn, markCharactersWarm, markChatsWarm, prefetchCharacters, prefetchChats, restoreLocalChats]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const state = location.state as ChatListLocationState;
    const deleted = state?.deletedAssistantChat;
    if (!deleted?.id) return;
    setDeletedAssistantNotice({
      id: deleted.id,
      name: deleted.name?.trim() || '助手会话',
    });
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    writePersistentUiValue(CHAT_LIST_TAB_KEY, tab);
    if (String(tab) === params.get('tab')) return;
    params.set('tab', String(tab));
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }, [location.pathname, location.search, navigate, tab]);
  const filteredChats = useMemo(() => chats.filter((c) => {
    const summary = (c.layeredMemories || []).slice(-3).map((item) => item.text).join(' ').toLowerCase();
    const recentEvent = (c.worldState?.recentEvent || '').toLowerCase();
    const query = search.toLowerCase();
    return c.name.toLowerCase().includes(query) || c.topic.toLowerCase().includes(query) || recentEvent.includes(query) || summary.includes(query);
  }), [chats, search]);
  const groupedChats = useMemo(() => filteredChats.filter((chat) => chat.type === 'group'), [filteredChats]);
  const userDirectChats = useMemo(() => filteredChats.filter((chat) => chat.type === 'direct'), [filteredChats]);
  const privateChats = useMemo(() => filteredChats.filter((chat) => chat.type === 'ai_direct'), [filteredChats]);
  const assistantChats = useMemo(() => filteredChats.filter((chat) => chat.type === 'assistant'), [filteredChats]);
  const visibleChats = tab === ASSISTANT_TAB ? assistantChats : tab === 0 ? groupedChats : tab === 1 ? userDirectChats : privateChats;
  const visibleChatsWithLatestPreview = useMemo(() => visibleChats.map((chat) => {
    const cachedLatest = getLatestChatPreviewMessage(messageWindowsByChatId[chat.id]?.messages || []);
    const resolvedLatest = cachedLatest || sanitizeChatLatestMessage(chat.latestMessage);
    return resolvedLatest === chat.latestMessage ? chat : { ...chat, latestMessage: resolvedLatest };
  }), [messageWindowsByChatId, visibleChats]);
  const customCharacterCount = useMemo(() => characters.filter((character) => !character.isPreset && !character.deletedAt).length, [characters]);
  const [noCharactersDialogOpen, setNoCharactersDialogOpen] = useState(false);
  const [noCharactersReturnTo, setNoCharactersReturnTo] = useState('/chats/create');
  const [noCharactersRequiredCount, setNoCharactersRequiredCount] = useState(MIN_MEMBERS);
  const emptyMessage = tab === ASSISTANT_TAB ? '还没有助手会话' : tab === 0 ? t('chat.noGroups') : tab === 1 ? '还没有单聊' : '还没有 AI私聊';
  const createPath = tab === 0 ? '/chats/create' : '/direct/create';
  const createLabel = tab === ASSISTANT_TAB ? '创建助手' : tab === 0 ? t('chat.create') : '创建单聊';
  const showCreateFab = tab !== 2;
  const openCreateWithCharacterGuard = (path: string) => {
    const requiredCount = path.startsWith('/chats/create') ? MIN_MEMBERS : 1;
    if (customCharacterCount < requiredCount) {
      setNoCharactersReturnTo(path);
      setNoCharactersRequiredCount(requiredCount);
      setNoCharactersDialogOpen(true);
      return;
    }
    navigate(path);
  };
  const noCharactersDialogTitle = customCharacterCount === 0 ? '还没有AI角色' : 'AI角色不足';
  const noCharactersDialogMessage = noCharactersRequiredCount > 1
    ? customCharacterCount === 0
      ? `创建群聊至少需要 ${noCharactersRequiredCount} 个AI角色。可以先去角色库创建角色，或根据主题批量生成。`
      : `当前只有 ${customCharacterCount} 个AI角色，群聊至少需要 ${noCharactersRequiredCount} 个AI角色。请再创建 ${noCharactersRequiredCount - customCharacterCount} 个角色，或根据主题批量生成。`
    : '创建单聊前，需要先在角色库中创建至少一个AI角色。也可以根据主题或故事批量生成角色。';
  const createAssistantChat = async () => {
    if (creatingAssistant) return;
    setCreatingAssistant(true);
    try {
      const chat = await addChat(buildAssistantChatDraft());
      navigate(`/chats/${chat.id}?fromTab=${ASSISTANT_TAB}`);
    } finally {
      setCreatingAssistant(false);
    }
  };
  const handleUndoAssistantDelete = async () => {
    if (!deletedAssistantNotice?.id) return;
    const targetId = deletedAssistantNotice.id;
    setDeletedAssistantNotice(null);
    try {
      await restoreChats([targetId]);
      await prefetchChats();
    } catch (error) {
      setAssistantDeleteError(error instanceof Error ? error.message : '撤销删除失败');
    }
  };
  const floatingActionPositionSx = isMasterPane ? {
    position: 'fixed' as const,
    right: pane.bounds ? `calc(100vw - ${pane.bounds.right}px + 28px)` : 28,
    bottom: pane.bounds ? `calc(100vh - ${pane.bounds.bottom}px + 32px)` : 32,
    visibility: pane.bounds ? 'visible' as const : 'hidden' as const,
  } : {
    position: 'fixed' as const,
    right: { xs: 20, sm: 28, md: 36 },
    bottom: { xs: 'calc(env(safe-area-inset-bottom, 0px) + 76px)', sm: 32, md: 36 },
  };

  return (
    <Box sx={{ position: 'relative', containerType: 'inline-size', p: 3, pt: { xs: 1, sm: 1, md: 3 }, pb: { xs: 'calc(env(safe-area-inset-bottom, 0px) + 82px)', sm: 12 } }}>
      <Stack
        spacing={1.25}
        sx={buildFloatingTabContainerSx()}
      >
        <Collapse in={searchOpen} timeout={220} unmountOnExit sx={{ width: { xs: '100%', sm: 420 }, maxWidth: '100%' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('chat.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
              }
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
                bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.07)',
                backdropFilter: 'blur(18px) saturate(1.12)',
                WebkitBackdropFilter: 'blur(18px) saturate(1.12)',
                boxShadow: (theme) => theme.palette.mode === 'light'
                  ? '0 10px 26px rgba(15,23,42,0.055)'
                  : '0 14px 30px rgba(0,0,0,0.22)',
              },
            }}
          />
        </Collapse>

        <FloatingSegmentedTabs
          value={tab}
          scrollContentToTopOnChange
          onChange={(nextTab) => {
            setTabTransitionDirection(resolveTabTransitionDirection(CHAT_LIST_TAB_ORDER, tab, nextTab));
            setTab(nextTab);
          }}
          items={[
            { value: ASSISTANT_TAB, label: `助手 ${assistantChats.length}` },
            { value: 0, label: `群聊 ${groupedChats.length}` },
            { value: 1, label: `单聊 ${userDirectChats.length}` },
            { value: 2, label: `AI私聊 ${privateChats.length}` },
          ]}
        />
      </Stack>

      <AnimatedTabContent value={tab} direction={tabTransitionDirection}>
        {isLoading && chats.length === 0 ? (
          <ListSkeletonGrid />
        ) : visibleChatsWithLatestPreview.length === 0 ? (
          <EmptyState
            variant="plain"
            message={emptyMessage}
            action={
              tab === ASSISTANT_TAB ? (
                <Button variant="outlined" onClick={() => void createAssistantChat()} disabled={creatingAssistant}>
                  创建助手
                </Button>
              ) : showCreateFab ? (
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => openCreateWithCharacterGuard('/chats/create')}>
                    {t('chat.create')}
                  </Button>
                  <Button variant="outlined" onClick={() => openCreateWithCharacterGuard('/direct/create')}>
                    创建单聊
                  </Button>
                </Stack>
              ) : undefined
            }
          />
        ) : (
          <Box
            sx={{
              ...buildListGridSx(),
            }}
          >
            {visibleChatsWithLatestPreview.map((chat) => (
              <ChatCard
                key={chat.id}
                chat={chat}
                characters={characters}
                selected={activeChatId === chat.id}
                onClick={() => navigate(`/chats/${chat.id}?fromTab=${tab}`)}
              />
            ))}
          </Box>
        )}
      </AnimatedTabContent>


      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('chat.delete')}
        message={t('chat.deleteConfirm')}
        onConfirm={() => {
          if (deleteId) deleteChat(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
        destructive
      />

      {showCreateFab ? (
        <ExpandableFab
          icon={<AddIcon />}
          label={createLabel}
          ariaLabel={createLabel}
          onClick={() => {
            if (tab === ASSISTANT_TAB) {
              void createAssistantChat();
              return;
            }
            openCreateWithCharacterGuard(createPath);
          }}
          disabled={creatingAssistant}
          sx={floatingActionPositionSx}
        />
      ) : null}
      <NoCharactersDialog
        open={noCharactersDialogOpen}
        onClose={() => setNoCharactersDialogOpen(false)}
        returnTo={noCharactersReturnTo}
        title={noCharactersDialogTitle}
        message={noCharactersDialogMessage}
      />
      <AppSnackbar
        open={Boolean(deletedAssistantNotice)}
        message={deletedAssistantNotice ? `已删除「${deletedAssistantNotice.name}」` : ''}
        severity="success"
        onClose={() => setDeletedAssistantNotice(null)}
        offset="navigation"
        action={(
          <Button
            color="inherit"
            size="small"
            onClick={() => void handleUndoAssistantDelete()}
          >
            撤销
          </Button>
        )}
      />
      <AppSnackbar
        open={Boolean(assistantDeleteError)}
        message={assistantDeleteError}
        severity="error"
        onClose={() => setAssistantDeleteError('')}
        offset="navigation"
      />
    </Box>
  );
}
