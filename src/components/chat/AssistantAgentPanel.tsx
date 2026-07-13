import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Chip, Divider, IconButton, Stack, Switch, Tooltip, Typography } from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import FloatingSegmentedTabs from '../common/FloatingSegmentedTabs';
import MarkdownText from '../common/MarkdownText';
import { buildScrollableRegionSx } from '../../styles/interaction';
import type { GroupChat } from '../../types/chat';
import type { AssistantArtifactItem, AssistantArtifactKind } from '../../types/assistantArtifact';
import { copyTextToClipboard } from '../../utils/clipboard';
import { ensureAssistantArtifactStoreHydrated, getAssistantArtifactCurrentContent, useAssistantArtifactStore } from '../../stores/useAssistantArtifactStore';

interface AssistantAgentPanelProps {
  chat: GroupChat;
  updateChat: (id: string, patch: Partial<GroupChat>) => Promise<void>;
  selectedArtifactId?: string | null;
}

function AssistantPanelSurface({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{
      p: 1.25,
      borderRadius: 1,
      bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.060)',
      border: '1px solid',
      borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.075)' : 'rgba(226,232,240,0.105)',
      boxShadow: (theme) => theme.palette.mode === 'light'
        ? '0 1px 0 rgba(255,255,255,0.82) inset, 0 12px 28px rgba(15,23,42,0.055)'
        : '0 1px 0 rgba(255,255,255,0.08) inset, 0 14px 32px rgba(0,0,0,0.24)',
      backdropFilter: 'blur(18px) saturate(1.18)',
      WebkitBackdropFilter: 'blur(18px) saturate(1.18)',
    }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>{title}</Typography>
      {children}
    </Box>
  );
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

function ArtifactPreview({ item }: { item: AssistantArtifactItem }) {
  const content = getAssistantArtifactCurrentContent(item);
  if (!content) {
    return <Typography variant="body2" color="text.secondary">当前版本为空。</Typography>;
  }
  if (item.kind === 'document') {
    return <MarkdownText text={content} forceRich />;
  }
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        maxHeight: 320,
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
  const artifacts = useAssistantArtifactStore((state) => state.items
    .filter((item) => item.chatId === chatId && item.deletedAt == null)
    .sort((a, b) => b.updatedAt - a.updatedAt));
  const deleteArtifact = useAssistantArtifactStore((state) => state.deleteArtifact);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <Stack spacing={1.25}>
      <Stack spacing={0} divider={<Divider flexItem />}>
        {artifacts.map((item) => {
          const active = selected?.id === item.id;
          return (
            <Box
              key={item.id}
              component="button"
              type="button"
              onClick={() => setSelectedId(item.id)}
              sx={{
                width: '100%',
                p: 1,
                border: 0,
                bgcolor: active ? 'action.selected' : 'transparent',
                color: 'text.primary',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
                <Box sx={{ color: active ? 'primary.main' : 'text.secondary', pt: 0.15 }}>
                  <ArtifactKindIcon kind={item.kind} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.45, flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Chip size="small" label={artifactKindLabels[item.kind]} sx={{ height: 20 }} />
                    {item.language ? <Chip size="small" label={item.language} variant="outlined" sx={{ height: 20 }} /> : null}
                    {item.versions.length > 1 ? <Chip size="small" label={`${item.versions.length} 版`} variant="outlined" sx={{ height: 20 }} /> : null}
                  </Stack>
                  {item.summary ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.summary}
                    </Typography>
                  ) : null}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', pt: 0.2 }}>
                  {formatArtifactTime(item.updatedAt)}
                </Typography>
              </Stack>
            </Box>
          );
        })}
      </Stack>

      {selected ? (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.title}
            </Typography>
            <Stack direction="row" spacing={0.25}>
              <Tooltip title="复制当前版本">
                <IconButton size="small" onClick={() => void copyTextToClipboard(getAssistantArtifactCurrentContent(selected))}>
                  <ContentCopyOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="下载当前版本">
                <IconButton size="small" onClick={() => downloadArtifact(selected, getAssistantArtifactCurrentContent(selected))}>
                  <DownloadOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="删除产物">
                <IconButton size="small" color="error" onClick={() => deleteArtifact(selected.id)}>
                  <DeleteOutlineOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <ArtifactPreview item={selected} />
        </Box>
      ) : null}
    </Stack>
  );
}

export default function AssistantAgentPanel({ chat, updateChat, selectedArtifactId = null }: AssistantAgentPanelProps) {
  const capabilities = chat.modeState.assistantCapabilities || {};
  const agentEnabled = Boolean(capabilities.agent);

  const handleAgentToggle = (enabled: boolean) => {
    void updateChat(chat.id, {
      modeState: {
        ...chat.modeState,
        assistantCapabilities: {
          ...capabilities,
          agent: enabled,
          artifacts: enabled,
          updatedAt: Date.now(),
        },
      },
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%', minHeight: 0 }}>
      {agentEnabled ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
          <FloatingSegmentedTabs
            value="artifacts"
            items={[{ value: 'artifacts', label: '产物' }]}
            onChange={() => undefined}
            equalWidth={false}
            comfortable={false}
          />
        </Box>
      ) : null}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: { xs: 0.25, md: 0.5 }, ...buildScrollableRegionSx() }}>
        <Stack spacing={2}>
          <AssistantPanelSurface title="能力">
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                <ExtensionOutlinedIcon color={agentEnabled ? 'primary' : 'disabled'} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Agent 能力</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.55 }}>
                    开启后支持产物、工具和后续文件能力；关闭时助手只保留普通聊天。
                  </Typography>
                </Box>
              </Stack>
              <Switch
                checked={agentEnabled}
                onChange={(event) => handleAgentToggle(event.target.checked)}
                slotProps={{ input: { 'aria-label': '开启 Agent 能力' } }}
              />
            </Stack>
          </AssistantPanelSurface>

          {agentEnabled ? (
            <AssistantPanelSurface title="产物">
              <AssistantArtifactList chatId={chat.id} selectedArtifactId={selectedArtifactId} />
            </AssistantPanelSurface>
          ) : (
            <AssistantPanelSurface title="纯聊天模式">
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                当前助手不会创建产物，也不会加载 Office、图表、网页运行等重型能力。
              </Typography>
            </AssistantPanelSurface>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
