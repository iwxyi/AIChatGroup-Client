import { Box, Stack, Switch, Typography } from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import FloatingSegmentedTabs from '../common/FloatingSegmentedTabs';
import { buildScrollableRegionSx } from '../../styles/interaction';
import type { GroupChat } from '../../types/chat';

interface AssistantAgentPanelProps {
  chat: GroupChat;
  updateChat: (id: string, patch: Partial<GroupChat>) => Promise<void>;
}

function AssistantPanelSurface({ title, children }: { title: string; children: React.ReactNode }) {
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

export default function AssistantAgentPanel({ chat, updateChat }: AssistantAgentPanelProps) {
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
                    后续生成的文档、表格、网页或结构化结果会收纳在这里。
                  </Typography>
                </Stack>
              </Box>
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
