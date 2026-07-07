import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { AICharacter } from '../../types/character';
import { getCharacterGroupList, normalizeCharacterGroup } from '../../types/character';
import { isImageAvatar } from '../../utils/avatar';
import { buildInteractiveSurfaceSx } from '../../styles/interaction';

interface MemberSelectionDialogProps {
  open: boolean;
  customCharacters: AICharacter[];
  presetCharacters: AICharacter[];
  selectedMembers: string[];
  hasCustomCharacters?: boolean;
  hasPresetCharacters?: boolean;
  title: string;
  presetLabel: string;
  confirmLabel: string;
  cancelLabel?: string;
  searchPlaceholder?: string;
  allGroupsLabel?: string;
  customSectionLabel?: string;
  presetSectionLabel?: string;
  selectedCountLabel?: (count: number) => string;
  emptyLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  onToggleMember: (memberId: string) => void;
  onStartLongPress?: (characterId: string) => void;
  onClearPressTimer?: () => void;
  onContextMenu?: (event: MouseEvent, characterId: string) => void;
}

function matchesQuery(character: AICharacter, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    character.name,
    character.group || '',
    character.background || '',
    character.speakingStyle || '',
    ...(character.expertise || []),
  ].some((value) => value.toLowerCase().includes(normalized));
}

function MemberOption({
  char,
  checked,
  presetLabel,
  onToggle,
  onStartLongPress,
  onClearPressTimer,
  onContextMenu,
}: {
  char: AICharacter;
  checked: boolean;
  presetLabel?: string;
  onToggle: () => void;
  onStartLongPress?: () => void;
  onClearPressTimer?: () => void;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  const group = normalizeCharacterGroup(char.group);
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      onPointerDown={onStartLongPress}
      onPointerUp={onClearPressTimer}
      onPointerLeave={onClearPressTimer}
      onPointerCancel={onClearPressTimer}
      onContextMenu={onContextMenu}
      sx={{
        ...buildInteractiveSurfaceSx({ selected: checked }),
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        minHeight: 68,
        cursor: 'pointer',
      }}
    >
      <Checkbox checked={checked} size="small" onClick={(event) => { event.stopPropagation(); onToggle(); }} />
      <Avatar src={isImageAvatar(char.avatar) ? char.avatar : undefined} sx={{ width: 40, height: 40, fontSize: '1rem', bgcolor: 'primary.light' }}>
        {isImageAvatar(char.avatar) ? undefined : char.avatar}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{char.name}</Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, minWidth: 0, overflow: 'hidden' }}>
          {group ? <Chip label={group} size="small" variant="outlined" sx={{ height: 20, maxWidth: 132 }} /> : null}
          {presetLabel ? <Chip label={presetLabel} size="small" variant="outlined" sx={{ height: 20 }} /> : null}
        </Stack>
      </Box>
    </Box>
  );
}

export default function MemberSelectionDialog(props: MemberSelectionDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const allCharacters = useMemo(
    () => [...props.customCharacters, ...props.presetCharacters],
    [props.customCharacters, props.presetCharacters],
  );
  const groups = useMemo(() => getCharacterGroupList(allCharacters), [allCharacters]);
  const groupFiltered = useMemo(() => {
    const normalizedGroup = normalizeCharacterGroup(selectedGroup);
    return {
      custom: props.customCharacters.filter((character) => (
        (!normalizedGroup || normalizeCharacterGroup(character.group) === normalizedGroup) && matchesQuery(character, search)
      )),
      preset: props.presetCharacters.filter((character) => (
        (!normalizedGroup || normalizeCharacterGroup(character.group) === normalizedGroup) && matchesQuery(character, search)
      )),
    };
  }, [props.customCharacters, props.presetCharacters, search, selectedGroup]);
  const hasVisibleCustom = groupFiltered.custom.length > 0;
  const hasVisiblePreset = groupFiltered.preset.length > 0;
  const empty = !hasVisibleCustom && !hasVisiblePreset;
  const selectedCount = props.selectedMembers.length;

  useEffect(() => {
    if (!props.open) return;
    setSearch('');
    setSelectedGroup(null);
  }, [props.open]);

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1.25 }}>{props.title}</DialogTitle>
      <DialogContent sx={{ pt: '12px !important', pb: 1 }}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={props.searchPlaceholder || '搜索角色'}
              size="small"
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Chip
              label={props.selectedCountLabel ? props.selectedCountLabel(selectedCount) : `已选 ${selectedCount}`}
              color={selectedCount ? 'primary' : 'default'}
              variant={selectedCount ? 'filled' : 'outlined'}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
            />
          </Stack>

          {groups.length ? (
            <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.25 }}>
              <Chip
                label={props.allGroupsLabel || '全部分组'}
                onClick={() => setSelectedGroup(null)}
                color={!selectedGroup ? 'primary' : 'default'}
                variant={!selectedGroup ? 'filled' : 'outlined'}
              />
              {groups.map((group) => (
                <Chip
                  key={group}
                  label={group}
                  onClick={() => setSelectedGroup(group)}
                  color={selectedGroup === group ? 'primary' : 'default'}
                  variant={selectedGroup === group ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          ) : null}

          {empty ? (
            <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">{props.emptyLabel || '没有匹配的角色'}</Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {hasVisibleCustom ? (
                <Box>
                  {props.hasPresetCharacters ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      {props.customSectionLabel || '自定义角色'}
                    </Typography>
                  ) : null}
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                    gap: 1,
                  }}>
                    {groupFiltered.custom.map((char) => (
                      <MemberOption
                        key={char.id}
                        char={char}
                        checked={props.selectedMembers.includes(char.id)}
                        onToggle={() => props.onToggleMember(char.id)}
                        onStartLongPress={() => props.onStartLongPress?.(char.id)}
                        onClearPressTimer={props.onClearPressTimer}
                        onContextMenu={(event) => props.onContextMenu?.(event, char.id)}
                      />
                    ))}
                  </Box>
                </Box>
              ) : null}

              {hasVisiblePreset ? (
                <Box>
                  {props.hasCustomCharacters ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      {props.presetSectionLabel || props.presetLabel}
                    </Typography>
                  ) : null}
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                    gap: 1,
                  }}>
                    {groupFiltered.preset.map((char) => (
                      <MemberOption
                        key={char.id}
                        char={char}
                        checked={props.selectedMembers.includes(char.id)}
                        onToggle={() => props.onToggleMember(char.id)}
                        presetLabel={props.presetLabel}
                      />
                    ))}
                  </Box>
                </Box>
              ) : null}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={props.onClose}>{props.cancelLabel || '取消'}</Button>
        <Button variant="contained" onClick={props.onConfirm}>{props.confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
