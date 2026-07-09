import { useCallback, useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { marketApi, type MarketItem, type MarketItemKind } from '../services/marketApi';

const kindLabels: Record<MarketItemKind, string> = {
  character_template: '角色模板',
  chat_template: '聊天模板',
  bundle_template: '组合包',
};

const personalityLabels: Record<string, string> = {
  openness: '开放',
  extroversion: '外向',
  agreeableness: '亲和',
  neuroticism: '敏感',
  humor: '幽默',
  creativity: '创造',
  assertiveness: '主见',
  empathy: '共情',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactText(value: unknown, max = 240) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function isImageValue(value: unknown) {
  const text = compactText(value, 5000);
  return text.startsWith('data:image/') || /^https?:\/\//i.test(text);
}

function getCharacterFromItem(item: MarketItem | null) {
  return asRecord(item?.payload?.character);
}

function getPreviewPayload(item: MarketItem | null) {
  return asRecord(item?.previewPayload || item?.payload);
}

function getPreviewCharacter(item: MarketItem | null) {
  return asRecord(getPreviewPayload(item).character);
}

function getPreviewChat(item: MarketItem | null) {
  return asRecord(getPreviewPayload(item).chat);
}

function getPreviewCharacters(item: MarketItem | null) {
  return asArray(getPreviewPayload(item).characters).map(asRecord);
}

function getCharacterReferenceImages(character: Record<string, unknown>) {
  const visualIdentity = asRecord(character.visualIdentity);
  return [...asArray(visualIdentity.referenceImages), ...asArray(character.visualReferenceImages)]
    .map(asRecord)
    .filter((image) => isImageValue(image.url));
}

function getCardImage(item: MarketItem) {
  if (isImageValue(item.coverImage)) return item.coverImage || '';
  const previewCharacter = getPreviewCharacter(item);
  if (isImageValue(previewCharacter.coverImage)) return compactText(previewCharacter.coverImage, 5000);
  const character = getCharacterFromItem(item);
  return compactText(getCharacterReferenceImages(character)[0]?.url, 5000);
}

function getAvatarValue(item: MarketItem) {
  const previewCharacter = getPreviewCharacter(item);
  if (compactText(previewCharacter.avatar, 5000)) return compactText(previewCharacter.avatar, 5000);
  const character = getCharacterFromItem(item);
  return compactText(character.avatar, 5000) || (isImageValue(item.coverImage) ? item.coverImage || '' : '');
}

function getCardDescription(item: MarketItem) {
  const preview = getPreviewPayload(item);
  if (item.kind === 'character_template') {
    const character = asRecord(preview.character);
    return compactText(character.visualDescription || character.coreDesire || character.speakingStyle || character.background || item.summary, 180);
  }
  const chat = asRecord(preview.chat);
  return compactText(chat.topic || item.summary, 180);
}

function getChatTitle(item: MarketItem) {
  const chat = getPreviewChat(item);
  return compactText(chat.name || chat.topic || item.title, 80) || item.title;
}

function renderTextBlock(label: string, value: unknown, max?: number) {
  const text = compactText(value, max);
  if (!text) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Typography>
    </Box>
  );
}

function MarketItemDetail({ item }: { item: MarketItem }) {
  if (item.kind === 'character_template') {
    const character = getCharacterFromItem(item);
    const visualIdentity = asRecord(character.visualIdentity);
    const coreProfile = asRecord(character.coreProfile);
    const personality = asRecord(character.personality);
    const images = getCharacterReferenceImages(character);
    const avatar = getAvatarValue(item);
    return (
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Avatar src={isImageValue(avatar) ? avatar : undefined} sx={{ width: 56, height: 56, fontSize: 24 }}>
            {isImageValue(avatar) ? undefined : avatar.slice(0, 2) || item.title.slice(0, 1)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }} noWrap>{item.title}</Typography>
            <Chip size="small" label={kindLabels[item.kind]} />
          </Box>
        </Stack>
        {images.length ? (
          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
            {images.slice(0, 8).map((image, index) => (
              <Box
                key={String(image.id || image.assetId || index)}
                component="img"
                src={compactText(image.url, 5000)}
                alt={String(image.label || '形象图')}
                sx={{ width: 96, height: 128, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: image.isPrimary ? 'primary.main' : 'divider', flex: '0 0 auto' }}
              />
            ))}
          </Stack>
        ) : null}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
          {renderTextBlock('视觉形象', visualIdentity.description, 420)}
          {renderTextBlock('风格提示', visualIdentity.styleHint, 260)}
          {renderTextBlock('核心欲望', coreProfile.coreDesire, 220)}
          {renderTextBlock('核心恐惧', coreProfile.coreFear, 220)}
          {renderTextBlock('社交面具', coreProfile.socialMask, 220)}
          {renderTextBlock('说话风格', character.speakingStyle, 280)}
        </Box>
        {Object.keys(personality).length ? (
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {Object.entries(personality).map(([key, value]) => <Chip key={key} size="small" variant="outlined" label={`${personalityLabels[key] || key} ${String(value)}`} />)}
          </Stack>
        ) : null}
        {renderTextBlock('背景', character.background || item.summary, 560)}
      </Stack>
    );
  }
  const chat = asRecord(item.payload?.chat);
  const bundledCharacters = asArray(item.payload?.characters);
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        <Chip size="small" label={kindLabels[item.kind]} />
        {chat.type ? <Chip size="small" variant="outlined" label={`类型 ${String(chat.type)}`} /> : null}
        {bundledCharacters.length ? <Chip size="small" variant="outlined" label={`角色 ${bundledCharacters.length}`} /> : null}
      </Stack>
      {renderTextBlock('主题', chat.topic || chat.topicSeed || item.summary || item.title, 520)}
      {renderTextBlock('风格', chat.style, 260)}
      {item.kind === 'bundle_template' && bundledCharacters.length ? (
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {bundledCharacters.slice(0, 12).map((entry, index) => {
            const template = asRecord(asRecord(entry).template);
            return <Chip key={String(asRecord(entry).localId || index)} size="small" label={String(template.name || '未命名角色')} />;
          })}
        </Stack>
      ) : null}
    </Stack>
  );
}

function AvatarToken({ name, avatar }: { name: string; avatar?: string }) {
  const avatarValue = compactText(avatar, 5000);
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Avatar src={isImageValue(avatarValue) ? avatarValue : undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
        {isImageValue(avatarValue) ? undefined : avatarValue.slice(0, 1) || name.slice(0, 1)}
      </Avatar>
      <Typography variant="caption" noWrap>{name}</Typography>
    </Stack>
  );
}

function MarketTemplateCard({ item, onOpen }: { item: MarketItem; onOpen: (item: MarketItem) => void }) {
  const cardImage = getCardImage(item);
  const avatar = getAvatarValue(item);
  const description = getCardDescription(item);
  const preview = getPreviewPayload(item);
  const chat = getPreviewChat(item);
  const bundledCharacters = getPreviewCharacters(item);
  const characterCount = Number(preview.characterCount || bundledCharacters.length || 0);
  const relationshipCount = Number(preview.relationshipCount || 0);
  const memoryCount = Number(preview.memoryCount || 0);
  const cardTitle = item.kind === 'character_template' ? item.title : getChatTitle(item);
  const metaChips = [
    chat.type ? `类型 ${String(chat.type)}` : '',
    chat.mode ? `模式 ${String(chat.mode)}` : '',
    characterCount ? `角色 ${characterCount}` : '',
    relationshipCount ? `关系 ${relationshipCount}` : '',
    memoryCount ? `记忆 ${memoryCount}` : '',
  ].filter(Boolean);

  return (
    <Paper
      variant="outlined"
      onClick={() => onOpen(item)}
      sx={{
        p: 1.25,
        borderRadius: 2,
        display: 'grid',
        gap: 1,
        alignContent: 'start',
        cursor: 'pointer',
        transition: 'border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease',
        '&:hover': { borderColor: 'primary.main', transform: 'translateY(-1px)', boxShadow: 2 },
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
        <Avatar src={isImageValue(avatar) ? avatar : undefined}>
          {isImageValue(avatar) ? undefined : avatar.slice(0, 2) || item.title.slice(0, 1)}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 900 }} noWrap>{cardTitle}</Typography>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mt: 0.25 }}>
            <Chip size="small" label={kindLabels[item.kind]} />
            {item.kind !== 'character_template' && compactText(chat.sessionKind) ? <Chip size="small" variant="outlined" label={String(chat.sessionKind)} /> : null}
          </Stack>
        </Box>
      </Stack>

      {item.kind === 'character_template' && cardImage ? (
        <Box
          component="img"
          src={cardImage}
          alt={item.title}
          sx={{
            width: '100%',
            aspectRatio: '3 / 4',
            objectFit: 'cover',
            borderRadius: 1,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
          }}
        />
      ) : null}

      {item.kind !== 'character_template' ? (
        <Box
          sx={{
            p: 1.25,
            minHeight: 118,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover',
            display: 'grid',
            gap: 1,
            alignContent: 'start',
          }}
        >
          {description ? <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{description}</Typography> : null}
          {metaChips.length ? (
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {metaChips.slice(0, 5).map((label) => <Chip key={label} size="small" variant="outlined" label={label} />)}
            </Stack>
          ) : null}
          {bundledCharacters.length ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
              {bundledCharacters.slice(0, 6).map((entry, index) => (
                <AvatarToken
                  key={String(entry.localId || entry.name || index)}
                  name={compactText(entry.name, 40) || `角色 ${index + 1}`}
                  avatar={compactText(entry.avatar, 5000)}
                />
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}

      {item.kind === 'character_template' && description ? (
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42, wordBreak: 'break-word' }}>{description}</Typography>
      ) : null}

      {item.kind === 'character_template' ? (
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {asArray(getPreviewCharacter(item).expertise).slice(0, 4).map((entry) => <Chip key={String(entry)} size="small" variant="outlined" label={String(entry)} />)}
        </Stack>
      ) : null}

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">导入 {item.importedCount}</Typography>
        <Button
          size="small"
          variant="contained"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(item);
          }}
        >
          查看
        </Button>
      </Stack>
    </Paper>
  );
}

export default function MarketPage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<MarketItemKind | ''>('');
  const [items, setItems] = useState<MarketItem[]>([]);
  const [selected, setSelected] = useState<MarketItem | null>(null);
  const [detail, setDetail] = useState<MarketItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await marketApi.list({ kind: kind || undefined, limit: 80 });
      setItems(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载市场失败');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const openImport = async (item: MarketItem) => {
    setSelected(item);
    setDetail(null);
    setError('');
    try {
      const result = await marketApi.detail(item.id);
      setDetail(result.item);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : '加载模板详情失败');
    }
  };

  const importSelected = async () => {
    if (!detail?.payload) return;
    setImporting(true);
    setError('');
    try {
      if (detail.kind === 'character_template') {
        setSelected(null);
        navigate('/characters/create', { state: { marketImportDraft: { item: detail } } });
        return;
      }
      setSelected(null);
      navigate('/chats/create', { state: { marketImportDraft: { item: detail } } });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const closeDialog = () => {
    if (importing) return;
    setSelected(null);
    setDetail(null);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>市场</Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>类型</InputLabel>
            <Select label="类型" value={kind} onChange={(event) => setKind(event.target.value as MarketItemKind | '')}>
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="character_template">角色模板</MenuItem>
              <MenuItem value="chat_template">聊天模板</MenuItem>
              <MenuItem value="bundle_template">组合包</MenuItem>
            </Select>
          </FormControl>
          <Button onClick={() => void load()} disabled={loading}>刷新</Button>
        </Stack>
      </Paper>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }}>
        {items.map((item) => (
          <MarketTemplateCard key={item.id} item={item} onOpen={(nextItem) => void openImport(nextItem)} />
        ))}
      </Box>
      {!items.length && !loading ? <Alert severity="info">暂无已审核市场模板</Alert> : null}

      <Dialog open={Boolean(selected)} onClose={closeDialog} maxWidth="md" fullWidth>
        <DialogTitle>{selected?.title || '模板详情'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {detail ? <MarketItemDetail item={detail} /> : <Typography variant="body2" color="text.secondary">加载中</Typography>}
            {detail ? <Divider /> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={importing}>关闭</Button>
          <Button variant="contained" onClick={() => void importSelected()} disabled={importing || !detail}>
            {importing ? '打开中' : '进入编辑'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
