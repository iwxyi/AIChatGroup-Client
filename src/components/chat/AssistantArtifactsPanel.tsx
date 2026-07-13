import { Box, Stack, Typography } from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import FloatingSegmentedTabs from '../common/FloatingSegmentedTabs';
import { buildScrollableRegionSx } from '../../styles/interaction';

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

export default function AssistantArtifactsPanel() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <FloatingSegmentedTabs
          value="artifacts"
          items={[{ value: 'artifacts', label: '产物' }]}
          onChange={() => undefined}
          equalWidth={false}
          comfortable={false}
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: { xs: 0.25, md: 0.5 }, ...buildScrollableRegionSx() }}>
        <Stack spacing={2}>
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
                  后续生成的文档、表格、代码或结构化结果会收纳在这里。
                </Typography>
              </Stack>
            </Box>
          </AssistantPanelSurface>
        </Stack>
      </Box>
    </Box>
  );
}
