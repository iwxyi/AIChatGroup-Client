import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useLayoutHeaderActions } from '../components/layout/AppLayoutContext';
import { Box, Button, Alert, IconButton, Menu, MenuItem, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Typography, Divider, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreIcon from '@mui/icons-material/MoreVert';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SortIcon from '@mui/icons-material/Sort';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../stores/useCharacterStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAuthStore } from '../stores/useAuthStore';
import CharacterCard from '../components/character/CharacterCard';
import CharacterGroupFilterBar from '../components/character/CharacterGroupFilterBar';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/common/EmptyState';
import ListSkeletonGrid from '../components/common/ListSkeletonGrid';
import { buildFloatingTabContainerSx } from '../components/common/FloatingSegmentedTabs';
import AppSnackbar from '../components/common/AppSnackbar';
import ExpandableFab from '../components/common/ExpandableFab';
import VipLimitDialog from '../components/common/VipLimitDialog';
import { usePaneLayout } from '../components/layout/PaneLayoutContext';
import { canDeleteCharacterGroup, getCharacterGroupList, getCharactersInGroup, normalizeCharacterGroup, normalizeCharacterName, getDuplicateCharacterBannerText, getDuplicateCharacterCount, getDuplicateCharacters } from '../types/character';
import { enqueueAvatarGenerationForCharacters } from '../services/avatarGeneration';
import { generateCharacterProfile } from '../services/characterGenerator';
import { createCharacterBubbleStyleId } from '../utils/bubbleStyle';
import { getPreferredAIProfile, isAIProfileUsable } from '../types/settings';
import { useChatStore } from '../stores/useChatStore';
import { buildDirectChatDraft } from '../services/chatDraftBuilder';
import { api, type BillingMembershipResponse, type VipEntitlementInfo } from '../services/api';
import type { AICharacter } from '../types/character';
import { readPersistentUiValue, writePersistentUiValue } from '../utils/persistentUiState';
import { buildListGridSx } from '../styles/interaction';

type CharacterSortField = 'name' | 'createdAt';
type CharacterSortDirection = 'asc' | 'desc';
const CHARACTER_LIBRARY_GROUP_KEY = 'character-library-group';
const CHARACTER_LIBRARY_SORT_FIELD_KEY = 'character-library-sort-field';
const CHARACTER_LIBRARY_SORT_DIRECTION_KEY = 'character-library-sort-direction';
const CHARACTER_LIBRARY_SORT_GROUP_FIRST_KEY = 'character-library-sort-group-first';
const isCharacterLibraryGroup = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isCharacterSortField = (value: unknown): value is CharacterSortField => value === 'name' || value === 'createdAt';
const isCharacterSortDirection = (value: unknown): value is CharacterSortDirection => value === 'asc' || value === 'desc';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

function getActiveCharacterId(pathname: string) {
  return pathname.match(/^\/characters\/([^/]+)\/edit$/)?.[1] || null;
}

function compareCharacterByField(a: AICharacter, b: AICharacter, field: CharacterSortField) {
  if (field === 'createdAt') {
    return (a.createdAt || 0) - (b.createdAt || 0);
  }
  return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
}

function getSortableGroupName(character: AICharacter) {
  return normalizeCharacterGroup(character.group) || '\uffff';
}

function sortCharactersForLibrary(
  characters: AICharacter[],
  field: CharacterSortField,
  direction: CharacterSortDirection,
  groupFirst: boolean,
) {
  const directionMultiplier = direction === 'asc' ? 1 : -1;
  return [...characters].sort((a, b) => {
    if (groupFirst) {
      const groupDiff = getSortableGroupName(a).localeCompare(getSortableGroupName(b), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
      if (groupDiff !== 0) return groupDiff;
    }
    const fieldDiff = compareCharacterByField(a, b, field);
    if (fieldDiff !== 0) return fieldDiff * directionMultiplier;
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  });
}

function buildDuplicateCharacterGroups(characters: AICharacter[], language: string) {
  const groups = new Map<string, { name: string; items: AICharacter[] }>();
  getDuplicateCharacters(characters).forEach((character) => {
    const key = normalizeCharacterName(character.name);
    const current = groups.get(key) || { name: character.name, items: [] };
    current.items.push(character);
    groups.set(key, current);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    description: group.items
      .map((character) => {
        const characterGroup = normalizeCharacterGroup(character.group) || (language.startsWith('zh') ? '未分组' : 'Ungrouped');
        const createdAt = character.createdAt ? new Date(character.createdAt).toLocaleDateString(language.startsWith('zh') ? 'zh-CN' : undefined) : '';
        return createdAt ? `${characterGroup} · ${createdAt}` : characterGroup;
      })
      .join('、'),
  }));
}

function CharacterLibraryHeaderActions({
  customCount,
  sortField,
  sortDirection,
  sortGroupFirst,
  onSortFieldChange,
  onSortDirectionChange,
  onToggleSortGroupFirst,
  onImport,
  onExport,
}: {
  customCount: number;
  sortField: CharacterSortField;
  sortDirection: CharacterSortDirection;
  sortGroupFirst: boolean;
  onSortFieldChange: (value: CharacterSortField) => void;
  onSortDirectionChange: (value: CharacterSortDirection) => void;
  onToggleSortGroupFirst: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [sortMenuAnchorEl, setSortMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isZh = i18n.language.startsWith('zh');
  const sortFieldLabel = sortField === 'name'
    ? (isZh ? '名称' : 'Name')
    : (isZh ? '创建时间' : 'Created time');
  const sortDirectionLabel = sortDirection === 'asc'
    ? (isZh ? '正序' : 'Ascending')
    : (isZh ? '逆序' : 'Descending');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Chip
        size="small"
        label={`${sortFieldLabel} · ${sortDirectionLabel}${sortGroupFirst ? ` · ${isZh ? '分组优先' : 'Group first'}` : ''}`}
        sx={{ display: { xs: 'none', md: 'inline-flex' } }}
      />
      <Tooltip title={isZh ? '排序' : 'Sort'}>
        <IconButton
          onClick={(event) => {
            setSortMenuAnchorEl(event.currentTarget);
            setMenuAnchorEl(null);
          }}
          aria-label={isZh ? '排序' : 'Sort'}
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            border: '1px solid',
            borderColor: sortMenuAnchorEl ? 'primary.main' : 'transparent',
            bgcolor: sortMenuAnchorEl
              ? (theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.10)' : 'rgba(120,156,220,0.14)'
              : 'transparent',
            transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
            '&:hover': {
              borderColor: sortMenuAnchorEl
                ? 'primary.main'
                : (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.10)',
              bgcolor: sortMenuAnchorEl
                ? (theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.12)' : 'rgba(120,156,220,0.16)'
                : (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.035)' : 'rgba(226,232,240,0.06)',
            },
          }}
        >
          <SortIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={sortMenuAnchorEl}
        open={Boolean(sortMenuAnchorEl)}
        onClose={() => setSortMenuAnchorEl(null)}
      >
        <MenuItem selected={sortField === 'name'} onClick={() => { onSortFieldChange('name'); setSortMenuAnchorEl(null); }}>
          {sortField === 'name' ? '✓ ' : ''}{isZh ? '名称' : 'Name'}
        </MenuItem>
        <MenuItem selected={sortField === 'createdAt'} onClick={() => { onSortFieldChange('createdAt'); setSortMenuAnchorEl(null); }}>
          {sortField === 'createdAt' ? '✓ ' : ''}{isZh ? '创建时间' : 'Created time'}
        </MenuItem>
        <Divider />
        <MenuItem selected={sortDirection === 'asc'} onClick={() => { onSortDirectionChange('asc'); setSortMenuAnchorEl(null); }}>
          {sortDirection === 'asc' ? '✓ ' : ''}{isZh ? '正序' : 'Ascending'}
        </MenuItem>
        <MenuItem selected={sortDirection === 'desc'} onClick={() => { onSortDirectionChange('desc'); setSortMenuAnchorEl(null); }}>
          {sortDirection === 'desc' ? '✓ ' : ''}{isZh ? '逆序' : 'Descending'}
        </MenuItem>
        <Divider />
        <MenuItem selected={sortGroupFirst} onClick={() => { onToggleSortGroupFirst(); setSortMenuAnchorEl(null); }}>
          {sortGroupFirst ? '✓ ' : ''}{isZh ? '分组优先' : 'Group first'}
        </MenuItem>
      </Menu>
      <Tooltip title={isZh ? '更多' : 'More'}>
        <IconButton
          aria-label={isZh ? '更多' : 'More'}
          onClick={(event) => {
            setMenuAnchorEl(event.currentTarget);
            setSortMenuAnchorEl(null);
          }}
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            border: '1px solid',
            borderColor: menuAnchorEl ? 'primary.main' : 'transparent',
            bgcolor: menuAnchorEl
              ? (theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.10)' : 'rgba(120,156,220,0.14)'
              : 'transparent',
            transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
            '&:hover': {
              borderColor: menuAnchorEl
                ? 'primary.main'
                : (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.10)',
              bgcolor: menuAnchorEl
                ? (theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.12)' : 'rgba(120,156,220,0.16)'
                : (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.035)' : 'rgba(226,232,240,0.06)',
            },
          }}
        >
          <MoreIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={() => setMenuAnchorEl(null)}>
        <MenuItem onClick={() => {
          setMenuAnchorEl(null);
          navigate('/characters/batch-generate');
        }}>
          批量生成角色
        </MenuItem>
        <MenuItem onClick={() => {
          setMenuAnchorEl(null);
          onImport();
        }}>
          {t('character.import')}
        </MenuItem>
        <MenuItem onClick={() => {
          setMenuAnchorEl(null);
          onExport();
        }} disabled={customCount === 0}>
          {t('character.exportAll')}
        </MenuItem>
      </Menu>
    </Box>
  );
}

export default function CharacterLibraryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderActions, setHeaderTitle, setHeaderBackAction, setHideMobileBottomNav } = useLayoutHeaderActions();
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const authMode = useAuthStore((state) => state.authMode);
  const { aiProfiles, avatarGeneration } = useSettingsStore(useShallow((state) => ({
    aiProfiles: state.aiProfiles,
    avatarGeneration: state.avatarGeneration,
  })));
  const pane = usePaneLayout();
  const isMasterPane = pane.role === 'master';
  const { chats, addChat } = useChatStore(useShallow((state) => ({
    chats: state.chats,
    addChat: state.addChat,
  })));
  const { characters, loadCharacters, markCharactersWarm, prefetchCharacters, deleteCharacter, deleteCharacters, updateCharactersGroup, importCharacters, isLoading } = useCharacterStore(useShallow((state) => ({
    characters: state.characters,
    loadCharacters: state.loadCharacters,
    markCharactersWarm: state.markCharactersWarm,
    prefetchCharacters: state.prefetchCharacters,
    deleteCharacter: state.deleteCharacter,
    deleteCharacters: state.deleteCharacters,
    updateCharactersGroup: state.updateCharactersGroup,
    importCharacters: state.importCharacters,
    isLoading: state.isLoading,
  })));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>(() => readPersistentUiValue(CHARACTER_LIBRARY_GROUP_KEY, 'all', isCharacterLibraryGroup));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkGroupDialogOpen, setBulkGroupDialogOpen] = useState(false);
  const [bulkGroupValue, setBulkGroupValue] = useState('');
  const [groupActionTarget, setGroupActionTarget] = useState<string | null>(null);
  const [groupActionDialogOpen, setGroupActionDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<CharacterSortField>(() => readPersistentUiValue(CHARACTER_LIBRARY_SORT_FIELD_KEY, 'name', isCharacterSortField));
  const [sortDirection, setSortDirection] = useState<CharacterSortDirection>(() => readPersistentUiValue(CHARACTER_LIBRARY_SORT_DIRECTION_KEY, 'asc', isCharacterSortDirection));
  const [sortGroupFirst, setSortGroupFirst] = useState(() => readPersistentUiValue(CHARACTER_LIBRARY_SORT_GROUP_FIRST_KEY, false, isBoolean));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectionMenuAnchorEl, setSelectionMenuAnchorEl] = useState<null | HTMLElement>(null);
  const groupPressTimerRef = useRef<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [freeEntitlement, setFreeEntitlement] = useState<VipEntitlementInfo | null>(null);
  const [freeEntitlementLoaded, setFreeEntitlementLoaded] = useState(false);
  const [membership, setMembership] = useState<BillingMembershipResponse | null>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(authMode !== 'cloud' || !isLoggedIn);
  const [vipLimitDialog, setVipLimitDialog] = useState<{ title: string; description: string; current?: number | null; limit?: number | null; helperText?: string } | null>(null);
  const activeCharacterId = isMasterPane && !selectionMode ? getActiveCharacterId(location.pathname) : null;
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

  useEffect(() => {
    markCharactersWarm();
    setLoadError(null);
    void prefetchCharacters();
  }, [markCharactersWarm, prefetchCharacters]);

  useEffect(() => {
    writePersistentUiValue(CHARACTER_LIBRARY_GROUP_KEY, selectedGroup);
  }, [selectedGroup]);

  useEffect(() => {
    writePersistentUiValue(CHARACTER_LIBRARY_SORT_FIELD_KEY, sortField);
  }, [sortField]);

  useEffect(() => {
    writePersistentUiValue(CHARACTER_LIBRARY_SORT_DIRECTION_KEY, sortDirection);
  }, [sortDirection]);

  useEffect(() => {
    writePersistentUiValue(CHARACTER_LIBRARY_SORT_GROUP_FIRST_KEY, sortGroupFirst);
  }, [sortGroupFirst]);

  useEffect(() => {
    let active = true;
    setFreeEntitlementLoaded(false);
    api.getBillingMembershipConfig()
      .then((result) => {
        if (active) {
          setFreeEntitlement(result.entitlements?.free || null);
          setFreeEntitlementLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setFreeEntitlement(null);
          setFreeEntitlementLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (authMode !== 'cloud' || !isLoggedIn) {
      setMembership(null);
      setMembershipLoaded(true);
      return () => {
        active = false;
      };
    }
    setMembershipLoaded(false);
    api.getBillingMembership()
      .then((result) => {
        if (active) {
          setMembership(result);
          setMembershipLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setMembership(null);
          setMembershipLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [authMode, isLoggedIn]);

  const custom = useMemo(() => characters.filter((c) => !c.isPreset), [characters]);
  const entitlementReady = freeEntitlementLoaded && (authMode !== 'cloud' || !isLoggedIn || membershipLoaded);
  const maxCharacters = entitlementReady
    ? membership?.vipEntitlement?.entitlement.maxCharacters ?? freeEntitlement?.maxCharacters ?? null
    : null;
  const characterLimitReached = maxCharacters != null && custom.length >= maxCharacters;
  const customGroups = useMemo(() => getCharacterGroupList(custom), [custom]);
  const customGroupOptions = useMemo(() => customGroups.map((group) => ({
    value: group,
    label: group,
    count: custom.filter((character) => normalizeCharacterGroup(character.group) === group).length,
  })), [custom, customGroups]);
  const duplicateCharacterCount = useMemo(() => getDuplicateCharacterCount(custom), [custom]);
  const duplicateCharacterBannerText = useMemo(() => getDuplicateCharacterBannerText(custom, i18n.language), [custom, i18n.language]);
  const duplicateCharacterGroups = useMemo(() => buildDuplicateCharacterGroups(custom, i18n.language), [custom, i18n.language]);
  const filteredCustom = useMemo(() => (
    selectedGroup === 'all' ? custom : getCharactersInGroup(custom, selectedGroup)
  ), [custom, selectedGroup]);
  const displayChars = useMemo(
    () => sortCharactersForLibrary(filteredCustom, sortField, sortDirection, sortGroupFirst),
    [filteredCustom, sortDirection, sortField, sortGroupFirst]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCustomCharacters = useMemo(
    () => custom.filter((character) => selectedIdSet.has(character.id)),
    [custom, selectedIdSet],
  );

  useEffect(() => {
    if (selectedGroup === 'all') return;
    const normalizedSelectedGroup = normalizeCharacterGroup(selectedGroup);
    if (!normalizedSelectedGroup || (custom.length > 0 && !customGroups.includes(normalizedSelectedGroup))) {
      setSelectedGroup('all');
    }
  }, [custom.length, customGroups, selectedGroup]);

  const resetSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const enterSelectionMode = (id: string) => {
    setSelectionMode(true);
    setSelectedIds((prev) => prev.includes(id) ? prev : [...prev, id]);
  };

  const handleGroupAction = async (mode: 'clear' | 'delete') => {
    const normalizedTarget = normalizeCharacterGroup(groupActionTarget);
    if (!normalizedTarget) return;
    const targetCharacters = custom.filter((character) => normalizeCharacterGroup(character.group) === normalizedTarget);
    const ids = targetCharacters.map((character) => character.id);
    if (!ids.length) return;
    if (mode === 'clear') {
      await updateCharactersGroup(ids, null);
    } else {
      await deleteCharacters(ids);
    }
    setGroupActionDialogOpen(false);
    setGroupActionTarget(null);
    if (selectedGroup === normalizedTarget) setSelectedGroup('all');
    resetSelection();
  };

  const applyBulkGroup = async () => {
    await updateCharactersGroup(selectedIds, normalizeCharacterGroup(bulkGroupValue));
    setBulkGroupDialogOpen(false);
    setBulkGroupValue('');
    resetSelection();
  };

  const applyBulkDelete = async () => {
    await deleteCharacters(selectedIds);
    setBulkDeleteOpen(false);
    resetSelection();
  };

  const handleBulkGenerateAvatars = () => {
    try {
      const queued = enqueueAvatarGenerationForCharacters(
        selectedCustomCharacters,
        aiProfiles,
        i18n.language.startsWith('zh') ? 'zh' : 'en',
        avatarGeneration,
      );
      setSnackbar({
        open: true,
        message: i18n.language.startsWith('zh')
          ? `已为 ${queued.length} 个角色加入头像生成队列`
          : `Queued avatar generation for ${queued.length} characters`,
        severity: queued.length > 0 ? 'success' : 'error',
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : (i18n.language.startsWith('zh') ? '头像生成入队失败' : 'Failed to queue avatar generation'),
        severity: 'error',
      });
    }
  };

  const handleBulkGenerateBubbles = async () => {
    const profile = getPreferredAIProfile(aiProfiles, 'text');
    if (!isAIProfileUsable(profile)) {
      setSnackbar({ open: true, message: i18n.language.startsWith('zh') ? '请先配置AI模型' : 'Configure AI model first', severity: 'error' });
      return;
    }

    let successCount = 0;
    for (const character of selectedCustomCharacters) {
      try {
        const generated = await generateCharacterProfile(profile, character.name, i18n.language.startsWith('zh') ? 'zh' : 'en', character.group || null);
        await useCharacterStore.getState().updateCharacter(character.id, {
          bubbleStyle: { ...generated.bubbleStyle, id: createCharacterBubbleStyleId() },
        });
        successCount += 1;
      } catch (error) {
        setSnackbar({
          open: true,
          message: error instanceof Error ? error.message : (i18n.language.startsWith('zh') ? '批量生成气泡失败' : 'Failed to generate bubbles'),
          severity: 'error',
        });
        return;
      }
    }

    setSnackbar({
      open: true,
      message: i18n.language.startsWith('zh') ? `已为 ${successCount} 个角色生成气泡` : `Generated bubbles for ${successCount} characters`,
      severity: successCount > 0 ? 'success' : 'error',
    });
  };

  const handleSelectionMoreMenu = (event: MouseEvent<HTMLElement>) => {
    setSelectionMenuAnchorEl(event.currentTarget);
  };

  const closeSelectionMoreMenu = () => {
    setSelectionMenuAnchorEl(null);
  };

  const handleStartDirectChat = async (characterId: string, characterName: string) => {
    const existing = chats.find((chat) => chat.type === 'direct' && chat.memberIds.length === 1 && chat.memberIds[0] === characterId);
    if (existing) {
      navigate(`/chats/${existing.id}?fromTab=1`);
      return;
    }
    const chat = await addChat(buildDirectChatDraft(characterId, characterName));
    navigate(`/chats/${chat.id}?fromTab=1`);
  };

  const clearGroupPressTimer = () => {
    if (groupPressTimerRef.current !== null) {
      window.clearTimeout(groupPressTimerRef.current);
      groupPressTimerRef.current = null;
    }
  };

  const startGroupLongPress = (group: string) => {
    clearGroupPressTimer();
    groupPressTimerRef.current = window.setTimeout(() => {
      setGroupActionTarget(group);
      setGroupActionDialogOpen(true);
      clearGroupPressTimer();
    }, 450);
  };

  const handleBulkDeleteConfirm = async () => {
    try {
      await applyBulkDelete();
      setSnackbar({ open: true, message: i18n.language.startsWith('zh') ? '已删除' : 'Deleted', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : t('common.error'), severity: 'error' });
    }
  };

  const handleSingleDeleteConfirm = async () => {
    if (!deleteId) return;
    try {
      await deleteCharacter(deleteId);
      setSnackbar({ open: true, message: i18n.language.startsWith('zh') ? '已删除' : 'Deleted', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : t('common.error'), severity: 'error' });
    } finally {
      setDeleteId(null);
    }
  };

  const openCreateForm = () => {
    if (characterLimitReached) {
      setVipLimitDialog({
        title: '角色数量已达上限',
        description: '当前会员的角色数量已经达到上限。升级 VIP 后可以创建更多角色，也可以先删除不需要的角色。',
        current: custom.length,
        limit: maxCharacters,
      });
      return;
    }
    navigate('/characters/create');
  };

  const handleExport = useCallback(() => {
    const data = JSON.stringify(custom, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pneumata-characters.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [custom]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const chars = Array.isArray(data) ? data : [data];
        if (maxCharacters != null && custom.length + chars.length > maxCharacters) {
          setVipLimitDialog({
            title: '导入会超过角色上限',
            description: `本次准备导入 ${chars.length} 个角色，导入后会超过当前会员的角色数量上限。请减少导入数量，或升级 VIP 后继续导入。`,
            current: custom.length + chars.length,
            limit: maxCharacters,
            helperText: `当前已有 ${custom.length} 个角色。`,
          });
          return;
        }
        await importCharacters(chars);
        setSnackbar({ open: true, message: t('character.importSuccess'), severity: 'success' });
      } catch (error) {
        setSnackbar({ open: true, message: error instanceof Error ? error.message : t('character.importError'), severity: 'error' });
      }
    };
    input.click();
  }, [custom, importCharacters, maxCharacters, t]);

  useEffect(() => {
    setHideMobileBottomNav(false);
    setHeaderBackAction(null);
    setHeaderTitle(null);
    setHeaderActions(
      <CharacterLibraryHeaderActions
        customCount={custom.length}
        sortField={sortField}
        sortDirection={sortDirection}
        sortGroupFirst={sortGroupFirst}
        onSortFieldChange={setSortField}
        onSortDirectionChange={setSortDirection}
        onToggleSortGroupFirst={() => setSortGroupFirst((value) => !value)}
        onImport={handleImport}
        onExport={handleExport}
      />
    );

    return () => {
      setHeaderActions(null);
      setHeaderTitle(null);
      setHeaderBackAction(null);
      setHideMobileBottomNav(false);
    };
  }, [custom.length, handleExport, handleImport, i18n.language, setHeaderActions, setHeaderBackAction, setHeaderTitle, setHideMobileBottomNav, sortDirection, sortField, sortGroupFirst]);

  return (
    <Box sx={{ position: 'relative', containerType: 'inline-size', p: 3, pt: { xs: 1, sm: 1, md: 3 }, pb: { xs: 'calc(env(safe-area-inset-bottom, 0px) + 82px)', sm: 12 } }}>
      {loadError || duplicateCharacterCount > 0 ? (
        <Box sx={buildFloatingTabContainerSx()}>
          {loadError ? (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={<Button color="inherit" size="small" onClick={() => {
                void loadCharacters()
                  .then(() => setLoadError(null))
                  .catch((error) => setLoadError(error instanceof Error ? error.message : (i18n.language.startsWith('zh') ? '角色加载失败' : 'Failed to load characters')));
              }}>{i18n.language.startsWith('zh') ? '重试' : 'Retry'}</Button>}
            >
              {loadError}
            </Alert>
          ) : null}
          {duplicateCharacterCount > 0 ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">{duplicateCharacterBannerText}</Typography>
              {duplicateCharacterGroups.length ? (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                  {duplicateCharacterGroups.map((group) => (
                    <Chip
                      key={normalizeCharacterName(group.name)}
                      size="small"
                      variant="outlined"
                      color="warning"
                      label={`${group.name}：${group.description}`}
                      sx={{ maxWidth: '100%', '& .MuiChip-label': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }}
                    />
                  ))}
                </Box>
              ) : null}
            </Alert>
          ) : null}
        </Box>
      ) : null}

      <CharacterGroupFilterBar
        allLabel={i18n.language.startsWith('zh') ? '全部' : 'All'}
        allValue="all"
        allCount={custom.length}
        options={customGroupOptions}
        selectedValue={selectedGroup}
        onSelect={(value) => setSelectedGroup(value || 'all')}
        onGroupPointerDown={(group) => {
          if (canDeleteCharacterGroup(group)) {
            startGroupLongPress(group);
          }
        }}
        onGroupPointerUp={clearGroupPressTimer}
        onGroupPointerLeave={clearGroupPressTimer}
        onGroupPointerCancel={clearGroupPressTimer}
        sx={{ mb: 2 }}
      />
      {selectionMode ? (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <Typography variant="body2" color="text.secondary">{selectedIds.length} {i18n.language.startsWith('zh') ? '已选择' : 'selected'}</Typography>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" startIcon={<ClearAllIcon />} onClick={resetSelection}>{i18n.language.startsWith('zh') ? '取消选择' : 'Cancel'}</Button>
            <Button size="small" color="error" variant="outlined" startIcon={<DeleteSweepIcon />} onClick={() => setBulkDeleteOpen(true)} disabled={selectedIds.length === 0}>{i18n.language.startsWith('zh') ? '批量删除' : 'Delete selected'}</Button>
            <IconButton size="small" onClick={handleSelectionMoreMenu} disabled={selectedIds.length === 0}>
              <MoreIcon fontSize="small" />
            </IconButton>
          </Box>
          <Menu anchorEl={selectionMenuAnchorEl} open={Boolean(selectionMenuAnchorEl) && selectionMode} onClose={closeSelectionMoreMenu}>
            <MenuItem onClick={() => {
              closeSelectionMoreMenu();
              handleBulkGenerateAvatars();
            }}>
              {i18n.language.startsWith('zh') ? '批量生成头像' : 'Generate avatars'}
            </MenuItem>
            <MenuItem onClick={async () => {
              closeSelectionMoreMenu();
              await handleBulkGenerateBubbles();
            }}>
              {i18n.language.startsWith('zh') ? '批量生成气泡' : 'Generate bubbles'}
            </MenuItem>
            <MenuItem onClick={() => {
              closeSelectionMoreMenu();
              setBulkGroupDialogOpen(true);
            }}>
              {i18n.language.startsWith('zh') ? '更改分组' : 'Change group'}
            </MenuItem>
          </Menu>
        </Box>
      ) : null}

      <Box sx={{ pr: 0.5 }}>
      {characterLimitReached ? (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {i18n.language.startsWith('zh') ? `角色数量已达当前会员上限（${custom.length}/${maxCharacters}），升级会员后可创建更多角色。` : `Character limit reached (${custom.length}/${maxCharacters}). Upgrade membership to create more characters.`}
        </Alert>
      ) : null}
      {isLoading && characters.length === 0 ? (
        <ListSkeletonGrid />
      ) : displayChars.length === 0 ? (
        <EmptyState
          variant="plain"
          message={t('character.empty')}
          action={
            <Button variant="outlined" onClick={openCreateForm}>
              {t('character.create')}
            </Button>
          }
        />
      ) : (
        <Box
          sx={{
            ...buildListGridSx(),
            alignItems: 'stretch',
          }}
        >
          {displayChars.map((char) => {
            return (
              <CharacterCard
                key={char.id}
                character={char}
                selected={selectedIdSet.has(char.id) || activeCharacterId === char.id}
                selectable
                selectionMode={selectionMode}
                onLongPress={() => enterSelectionMode(char.id)}
                onEdit={() => navigate(`/characters/${char.id}/edit`)}
                onDelete={() => setDeleteId(char.id)}
                onStartDirectChat={!selectionMode ? () => void handleStartDirectChat(char.id, char.name) : undefined}
                onClick={() => {
                  if (selectionMode) {
                    toggleSelection(char.id);
                    return;
                  }
                  navigate(`/characters/${char.id}/edit`);
                }}
              />
            );
          })}
        </Box>
      )}

      </Box>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('character.delete')}
        message={t('character.deleteConfirm')}
        onConfirm={handleSingleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
        destructive
      />

      <Dialog open={bulkGroupDialogOpen} onClose={() => setBulkGroupDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{i18n.language.startsWith('zh') ? '更改分组' : 'Change group'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 1.5, pt: 1 }}>
            <TextField label={i18n.language.startsWith('zh') ? '分组名' : 'Group'} value={bulkGroupValue} onChange={(e) => setBulkGroupValue(e.target.value)} fullWidth />
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {customGroups.map((group) => <Chip key={group} label={group} size="small" variant={normalizeCharacterGroup(bulkGroupValue) === group ? 'filled' : 'outlined'} color={normalizeCharacterGroup(bulkGroupValue) === group ? 'primary' : 'default'} onClick={() => setBulkGroupValue(group)} />)}
              <Chip label={i18n.language.startsWith('zh') ? '清空分组' : 'Clear group'} size="small" variant="outlined" onClick={() => setBulkGroupValue('')} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkGroupDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={applyBulkGroup} variant="contained">{t('common.confirm')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={groupActionDialogOpen} onClose={() => setGroupActionDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{groupActionTarget}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">{i18n.language.startsWith('zh') ? '请选择如何处理这个分组。' : 'Choose how to handle this group.'}</Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Button onClick={() => handleGroupAction('clear')}>{i18n.language.startsWith('zh') ? '清空分组' : 'Clear group'}</Button>
          <Button color="error" variant="contained" onClick={() => handleGroupAction('delete')}>{i18n.language.startsWith('zh') ? '删除该组角色' : 'Delete characters'}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={i18n.language.startsWith('zh') ? '批量删除角色' : 'Delete selected characters'}
        message={i18n.language.startsWith('zh') ? `确认删除 ${selectedCustomCharacters.length} 个角色吗？` : `Delete ${selectedCustomCharacters.length} selected characters?`}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setBulkDeleteOpen(false)}
        destructive
      />

      <AppSnackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        severity={snackbar.severity}
        message={snackbar.message}
      />
      <VipLimitDialog
        open={Boolean(vipLimitDialog)}
        title={vipLimitDialog?.title || ''}
        description={vipLimitDialog?.description || ''}
        current={vipLimitDialog?.current}
        limit={vipLimitDialog?.limit}
        helperText={vipLimitDialog?.helperText}
        onClose={() => setVipLimitDialog(null)}
      />

      <ExpandableFab
        icon={<AddIcon />}
        label={t('character.create')}
        ariaLabel={t('character.create')}
        onClick={openCreateForm}
        sx={floatingActionPositionSx}
      />
    </Box>
  );
}
