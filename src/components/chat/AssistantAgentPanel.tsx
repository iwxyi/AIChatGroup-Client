import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import KeyboardArrowDownOutlinedIcon from '@mui/icons-material/KeyboardArrowDownOutlined';
import KeyboardArrowUpOutlinedIcon from '@mui/icons-material/KeyboardArrowUpOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import NavigateBeforeOutlinedIcon from '@mui/icons-material/NavigateBeforeOutlined';
import NavigateNextOutlinedIcon from '@mui/icons-material/NavigateNextOutlined';
import OpenInFullOutlinedIcon from '@mui/icons-material/OpenInFullOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import FloatingSegmentedTabs from '../common/FloatingSegmentedTabs';
import MarkdownText from '../common/MarkdownText';
import MermaidDiagram from '../common/MermaidDiagram';
import { buildScrollableRegionSx } from '../../styles/interaction';
import type { GroupChat } from '../../types/chat';
import type { AssistantArtifactItem, AssistantArtifactKind, AssistantArtifactVersion } from '../../types/assistantArtifact';
import { copyTextToClipboard } from '../../utils/clipboard';
import { ensureAssistantArtifactStoreHydrated, getAssistantArtifactCurrentContent, useAssistantArtifactStore } from '../../stores/useAssistantArtifactStore';

interface AssistantAgentPanelProps {
  chat: GroupChat;
  selectedArtifactId?: string | null;
}

const artifactKindLabels: Record<AssistantArtifactKind, string> = {
  document: '文档',
  code: '代码',
  diagram: '图表',
  html: '网页',
  table: '表格',
  json: 'JSON',
  text: '文本',
};

function ArtifactKindIcon({ kind }: { kind: AssistantArtifactKind }) {
  if (kind === 'diagram') return <AccountTreeOutlinedIcon fontSize="small" />;
  if (kind === 'code') return <CodeOutlinedIcon fontSize="small" />;
  if (kind === 'json') return <DataObjectOutlinedIcon fontSize="small" />;
  if (kind === 'html') return <LanguageOutlinedIcon fontSize="small" />;
  if (kind === 'table') return <TableChartOutlinedIcon fontSize="small" />;
  if (kind === 'document') return <DescriptionOutlinedIcon fontSize="small" />;
  return <ArticleOutlinedIcon fontSize="small" />;
}

function formatArtifactTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'assistant-artifact';
}

function artifactFileExtension(item: AssistantArtifactItem) {
  const language = (item.language || '').toLowerCase();
  if (item.kind === 'html') return 'html';
  if (item.kind === 'json') return 'json';
  if (item.kind === 'table') return language === 'tsv' ? 'tsv' : 'csv';
  if (item.kind === 'diagram') {
    if (language === 'plantuml') return 'puml';
    if (language === 'dot' || language === 'graphviz') return 'dot';
    return 'mmd';
  }
  if (item.kind === 'document') return 'md';
  if (language === 'typescript' || language === 'ts') return 'ts';
  if (language === 'javascript' || language === 'js') return 'js';
  if (language === 'python' || language === 'py') return 'py';
  return language || 'txt';
}

function artifactMimeType(item: AssistantArtifactItem) {
  if (item.kind === 'html') return 'text/html;charset=utf-8';
  if (item.kind === 'json') return 'application/json;charset=utf-8';
  if (item.kind === 'table') return 'text/csv;charset=utf-8';
  if (item.kind === 'document') return 'text/markdown;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

function downloadArtifact(item: AssistantArtifactItem, content: string) {
  const blob = new Blob([content], { type: artifactMimeType(item) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFileName(item.title)}.${artifactFileExtension(item)}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getArtifactVersionContent(version: AssistantArtifactVersion | null | undefined) {
  if (!version) return '';
  if (version.files?.length) {
    return version.files
      .map((file) => `// ${file.path}\n${file.content}`)
      .join('\n\n');
  }
  return version.content || '';
}

function getArtifactCurrentVersion(item: AssistantArtifactItem) {
  const fallbackVersion = item.versions.length ? item.versions[item.versions.length - 1] : null;
  return item.versions.find((entry) => entry.id === item.currentVersionId) || fallbackVersion;
}

function getArtifactVersionLabel(item: AssistantArtifactItem, version: AssistantArtifactVersion | null) {
  if (!version) return '';
  const index = item.versions.findIndex((entry) => entry.id === version.id);
  return index >= 0 ? `${index + 1} / ${item.versions.length}` : '';
}

type ArtifactViewMode = 'list' | 'icons' | 'gallery';
type ArtifactSortMode = 'manual' | 'updated' | 'created' | 'title' | 'kind';

const artifactViewItems: Array<{ value: ArtifactViewMode; title: string; icon: ReactNode }> = [
  { value: 'list', title: '列表', icon: <ViewListOutlinedIcon fontSize="small" /> },
  { value: 'icons', title: '图标', icon: <GridViewOutlinedIcon fontSize="small" /> },
  { value: 'gallery', title: '画廊', icon: <ViewAgendaOutlinedIcon fontSize="small" /> },
];

function artifactSortValue(item: AssistantArtifactItem) {
  return typeof item.sortOrder === 'number' ? item.sortOrder : Number.MAX_SAFE_INTEGER;
}

function sortArtifacts(items: AssistantArtifactItem[], mode: ArtifactSortMode) {
  return [...items].sort((a, b) => {
    if (mode === 'manual') {
      const order = artifactSortValue(a) - artifactSortValue(b);
      if (order !== 0) return order;
      return b.updatedAt - a.updatedAt;
    }
    if (mode === 'created') return b.createdAt - a.createdAt;
    if (mode === 'title') return a.title.localeCompare(b.title, 'zh-CN');
    if (mode === 'kind') {
      const kindOrder = artifactKindLabels[a.kind].localeCompare(artifactKindLabels[b.kind], 'zh-CN');
      return kindOrder || b.updatedAt - a.updatedAt;
    }
    return b.updatedAt - a.updatedAt;
  });
}

function isRenderableMermaid(item: AssistantArtifactItem, content: string) {
  if (item.kind !== 'diagram') return false;
  const language = (item.language || '').toLowerCase();
  if (language && language !== 'mermaid') return false;
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i.test(content.trim());
}

function artifactPreviewText(item: AssistantArtifactItem) {
  const content = getAssistantArtifactCurrentContent(item).trim();
  if (!content) return '当前版本为空。';
  return content.replace(/\s+/g, ' ').slice(0, 420);
}

function ThumbnailFade() {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 34,
        pointerEvents: 'none',
        background: (theme) => theme.palette.mode === 'light'
          ? 'linear-gradient(to bottom, rgba(248,250,252,0), rgba(248,250,252,0.96))'
          : 'linear-gradient(to bottom, rgba(15,23,42,0), rgba(15,23,42,0.96))',
      }}
    />
  );
}

function ArtifactThumbnail({ item, mode }: { item: AssistantArtifactItem; mode: ArtifactViewMode }) {
  const content = getAssistantArtifactCurrentContent(item);
  const renderMermaid = isRenderableMermaid(item, content);
  const previewHeight = mode === 'list'
    ? 'clamp(240px, 46vh, 380px)'
    : mode === 'gallery'
      ? 220
      : 128;

  return (
    <Box
      sx={{
        position: 'relative',
        height: previewHeight,
        overflow: 'hidden',
        borderRadius: 1,
        border: '1px solid',
        borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.12)',
        bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(248,250,252,0.86)' : 'rgba(15,23,42,0.46)',
      }}
    >
      {renderMermaid ? (
        <Box sx={{ p: 0.5, transform: mode === 'list' ? 'scale(0.92)' : mode === 'gallery' ? 'scale(0.84)' : 'scale(0.58)', transformOrigin: 'top left', width: mode === 'list' ? '108%' : mode === 'gallery' ? '119%' : '172%' }}>
          <MermaidDiagram source={content} />
        </Box>
      ) : item.kind === 'html' ? (
        <Box component="iframe" title={item.title} srcDoc={content} sandbox="" sx={{ width: '100%', height: '100%', border: 0, bgcolor: '#fff' }} />
      ) : item.kind === 'document' ? (
        <Box sx={{ p: 1, height: '100%', overflow: 'hidden', bgcolor: (theme) => theme.palette.mode === 'light' ? '#fff' : 'rgba(2,6,23,0.52)' }}>
          <MarkdownText text={content} forceRich />
        </Box>
      ) : (
        <Box sx={{ p: 1, height: '100%', display: 'grid', alignContent: 'start', gap: 0.75 }}>
          <Box sx={{ color: 'text.secondary' }}>
            <ArtifactKindIcon kind={item.kind} />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: mode === 'list' ? 13 : 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {artifactPreviewText(item)}
          </Typography>
        </Box>
      )}
      <ThumbnailFade />
    </Box>
  );
}

function ArtifactPreview({ item, version, expanded = false }: { item: AssistantArtifactItem; version?: AssistantArtifactVersion | null; expanded?: boolean }) {
  const content = version ? getArtifactVersionContent(version) : getAssistantArtifactCurrentContent(item);
  if (!content) {
    return <Typography variant="body2" color="text.secondary">当前版本为空。</Typography>;
  }
  if (isRenderableMermaid(item, content)) {
    return <MermaidDiagram source={content} />;
  }
  if (item.kind === 'document') {
    return <MarkdownText text={content} forceRich />;
  }
  if (item.kind === 'html') {
    return (
      <Box component="iframe" title={item.title} srcDoc={content} sandbox="" sx={{ width: '100%', minHeight: expanded ? '72vh' : 360, border: 0, borderRadius: 1, bgcolor: '#fff' }} />
    );
  }
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        maxHeight: expanded ? 'none' : 320,
        overflow: 'auto',
        p: 1,
        borderRadius: 1,
        bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.92)' : 'rgba(2,6,23,0.82)',
        color: '#e5e7eb',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12.5,
        lineHeight: 1.7,
        whiteSpace: 'pre',
      }}
    >
      {content}
    </Box>
  );
}

function AssistantArtifactList({ chatId, selectedArtifactId }: { chatId: string; selectedArtifactId?: string | null }) {
  const artifactItems = useAssistantArtifactStore((state) => state.items);
  const [viewMode, setViewMode] = useState<ArtifactViewMode>('list');
  const [sortMode, setSortMode] = useState<ArtifactSortMode>('manual');
  const artifacts = useMemo(() => sortArtifacts(artifactItems
    .filter((item) => item.chatId === chatId && item.deletedAt == null), sortMode), [artifactItems, chatId, sortMode]);
  const deleteArtifact = useAssistantArtifactStore((state) => state.deleteArtifact);
  const moveArtifact = useAssistantArtifactStore((state) => state.moveArtifact);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [fullscreenVersionId, setFullscreenVersionId] = useState<string | null>(null);

  useEffect(() => {
    void ensureAssistantArtifactStoreHydrated();
  }, []);

  useEffect(() => {
    if (selectedArtifactId && artifacts.some((item) => item.id === selectedArtifactId)) {
      setSelectedId(selectedArtifactId);
    }
  }, [artifacts, selectedArtifactId]);

  const selected = useMemo(() => (
    artifacts.find((item) => item.id === selectedId) || artifacts[0] || null
  ), [artifacts, selectedId]);

  useEffect(() => {
    if (selectedId && !artifacts.some((item) => item.id === selectedId)) setSelectedId(null);
  }, [artifacts, selectedId]);

  const fullscreenItem = useMemo(() => (
    artifacts.find((item) => item.id === fullscreenId) || null
  ), [artifacts, fullscreenId]);
  const fullscreenVersion = useMemo(() => {
    if (!fullscreenItem) return null;
    return fullscreenItem.versions.find((version) => version.id === fullscreenVersionId) || getArtifactCurrentVersion(fullscreenItem);
  }, [fullscreenItem, fullscreenVersionId]);
  const fullscreenVersionIndex = fullscreenItem && fullscreenVersion
    ? fullscreenItem.versions.findIndex((version) => version.id === fullscreenVersion.id)
    : -1;
  const openFullscreen = (item: AssistantArtifactItem) => {
    setFullscreenId(item.id);
    setFullscreenVersionId(getArtifactCurrentVersion(item)?.id || null);
  };
  const stepFullscreenVersion = (direction: -1 | 1) => {
    if (!fullscreenItem || fullscreenVersionIndex < 0) return;
    const next = fullscreenItem.versions[fullscreenVersionIndex + direction];
    if (next) setFullscreenVersionId(next.id);
  };

  const toggleExpanded = (artifactId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(artifactId)) next.delete(artifactId);
      else next.add(artifactId);
      return next;
    });
  };

  if (!artifacts.length) {
    return (
      <Box sx={{
        minHeight: 180,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        px: 2,
        py: 3,
        color: 'text.secondary',
      }}>
        <Stack spacing={1} sx={{ alignItems: 'center', maxWidth: 280 }}>
          <ArticleOutlinedIcon color="disabled" sx={{ fontSize: 34 }} />
          <Typography variant="body2" sx={{ fontWeight: 650, color: 'text.primary' }}>
            暂无产物
          </Typography>
          <Typography variant="caption" sx={{ lineHeight: 1.6 }}>
            Agent 会把文档、代码、图表、网页、表格等可沉淀结果收纳在这里。
          </Typography>
        </Stack>
      </Box>
    );
  }

  const renderActions = (item: AssistantArtifactItem, index: number) => (
    <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
      {sortMode === 'manual' ? (
        <>
          <Tooltip title="上移">
            <span>
              <IconButton size="small" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveArtifact(chatId, item.id, 'up'); }}>
                <KeyboardArrowUpOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="下移">
            <span>
              <IconButton size="small" disabled={index === artifacts.length - 1} onClick={(event) => { event.stopPropagation(); moveArtifact(chatId, item.id, 'down'); }}>
                <KeyboardArrowDownOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </>
      ) : null}
      {viewMode === 'list' ? (
        <Tooltip title="全屏查看">
          <IconButton size="small" onClick={(event) => { event.stopPropagation(); openFullscreen(item); }}>
            <OpenInFullOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
      <Tooltip title="复制当前版本">
        <IconButton size="small" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(getAssistantArtifactCurrentContent(item)); }}>
          <ContentCopyOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="下载当前版本">
        <IconButton size="small" onClick={(event) => { event.stopPropagation(); downloadArtifact(item, getAssistantArtifactCurrentContent(item)); }}>
          <DownloadOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="删除产物">
        <IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); deleteArtifact(item.id); }}>
          <DeleteOutlineOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  const renderMeta = (item: AssistantArtifactItem) => (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      <Chip size="small" label={artifactKindLabels[item.kind]} sx={{ height: 20 }} />
      {item.language ? <Chip size="small" label={item.language} variant="outlined" sx={{ height: 20 }} /> : null}
      {item.versions.length > 1 ? <Chip size="small" label={`${item.versions.length} 版`} variant="outlined" sx={{ height: 20 }} /> : null}
      <Typography variant="caption" color="text.secondary">{formatArtifactTime(item.updatedAt)}</Typography>
    </Stack>
  );

  const renderArtifactCard = (item: AssistantArtifactItem, index: number) => {
    const active = selected?.id === item.id;
    const expanded = expandedIds.has(item.id);
    const content = getAssistantArtifactCurrentContent(item);
    const canExpand = content.length > 360 || item.kind === 'document' || item.kind === 'diagram' || item.kind === 'html';
    return (
      <Box
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (viewMode === 'icons' || viewMode === 'gallery') openFullscreen(item);
          else setSelectedId(item.id);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (viewMode === 'icons' || viewMode === 'gallery') openFullscreen(item);
            else setSelectedId(item.id);
          }
        }}
        sx={{
          width: '100%',
          p: 1,
          border: '1px solid',
          borderColor: active ? 'primary.main' : ((theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.12)'),
          bgcolor: active ? 'action.selected' : 'background.paper',
          color: 'text.primary',
          textAlign: 'left',
          cursor: 'pointer',
          borderRadius: 1,
          boxShadow: 'none',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
            <Box sx={{ color: active ? 'primary.main' : 'text.secondary', pt: 0.15, flexShrink: 0 }}>
              <ArtifactKindIcon kind={item.kind} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </Typography>
              <Box sx={{ mt: 0.5 }}>{renderMeta(item)}</Box>
            </Box>
          </Stack>
          {item.summary ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: viewMode === 'list' ? 2 : 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.55,
              }}
            >
              {item.summary}
            </Typography>
          ) : null}
          <ArtifactThumbnail item={item} mode={viewMode} />
          {viewMode === 'list' ? (
            <Box>
              {expanded && item.kind !== 'diagram' && item.kind !== 'html' ? <ArtifactPreview item={item} /> : null}
              {canExpand ? (
                <Button
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (item.kind === 'diagram' || item.kind === 'html') openFullscreen(item);
                    else toggleExpanded(item.id);
                  }}
                  sx={{ mt: expanded ? 1 : 0, px: 0 }}
                >
                  {item.kind === 'diagram' || item.kind === 'html' ? '查看' : expanded ? '收起' : '展开'}
                </Button>
              ) : null}
            </Box>
          ) : null}
          {renderActions(item, index)}
        </Stack>
      </Box>
    );
  };

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <FloatingSegmentedTabs
          value={viewMode}
          items={artifactViewItems.map((item) => ({
            value: item.value,
            label: (
              <Tooltip title={item.title}>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>
                  {item.icon}
                </Box>
              </Tooltip>
            ),
          }))}
          onChange={(value) => setViewMode(value as ArtifactViewMode)}
          equalWidth={false}
          comfortable={false}
        />
        <Select
          size="small"
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as ArtifactSortMode)}
          sx={{ minWidth: 96, '& .MuiSelect-select': { py: 0.6, fontSize: 13 } }}
        >
          <MenuItem value="manual">自定义</MenuItem>
          <MenuItem value="updated">最近更新</MenuItem>
          <MenuItem value="created">创建时间</MenuItem>
          <MenuItem value="title">标题</MenuItem>
          <MenuItem value="kind">类型</MenuItem>
        </Select>
      </Stack>

      {viewMode === 'list' ? (
        <Stack spacing={1}>
          {artifacts.map(renderArtifactCard)}
        </Stack>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: viewMode === 'gallery'
              ? 'repeat(auto-fill, minmax(220px, 1fr))'
              : 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 1,
          }}
        >
          {artifacts.map(renderArtifactCard)}
        </Box>
      )}

      <Dialog open={Boolean(fullscreenItem)} onClose={() => setFullscreenId(null)} fullScreen>
        {fullscreenItem ? (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fullscreenItem.title}
                </Typography>
                {renderMeta(fullscreenItem)}
              </Box>
              <Stack direction="row" spacing={0.25}>
                <IconButton onClick={() => stepFullscreenVersion(-1)} disabled={fullscreenVersionIndex <= 0}>
                  <NavigateBeforeOutlinedIcon />
                </IconButton>
                <Box sx={{ minWidth: 54, display: 'grid', placeItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    {getArtifactVersionLabel(fullscreenItem, fullscreenVersion)}
                  </Typography>
                </Box>
                <IconButton onClick={() => stepFullscreenVersion(1)} disabled={fullscreenVersionIndex < 0 || fullscreenVersionIndex >= fullscreenItem.versions.length - 1}>
                  <NavigateNextOutlinedIcon />
                </IconButton>
                <IconButton onClick={() => void copyTextToClipboard(getArtifactVersionContent(fullscreenVersion))}>
                  <ContentCopyOutlinedIcon />
                </IconButton>
                <IconButton onClick={() => downloadArtifact(fullscreenItem, getArtifactVersionContent(fullscreenVersion))}>
                  <DownloadOutlinedIcon />
                </IconButton>
                <IconButton onClick={() => setFullscreenId(null)} aria-label="关闭产物详情">
                  <CloseOutlinedIcon />
                </IconButton>
              </Stack>
            </DialogTitle>
            <DialogContent dividers sx={{ bgcolor: (theme) => theme.palette.mode === 'light' ? '#f8fafc' : '#020617' }}>
              <ArtifactPreview item={fullscreenItem} version={fullscreenVersion} expanded />
            </DialogContent>
          </>
        ) : null}
      </Dialog>
    </Stack>
  );
}

export default function AssistantAgentPanel({ chat, selectedArtifactId = null }: AssistantAgentPanelProps) {
  const capabilities = chat.modeState.assistantCapabilities || {};
  const agentEnabled = Boolean(capabilities.agent);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: { xs: 0.25, md: 0.5 }, ...buildScrollableRegionSx() }}>
        <Stack spacing={2}>
          {agentEnabled ? (
            <AssistantArtifactList chatId={chat.id} selectedArtifactId={selectedArtifactId} />
          ) : (
            <Box sx={{ minHeight: 160, display: 'grid', placeItems: 'center', px: 2, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                Agent 能力已关闭。可在右上角设置中开启产物面板。
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
