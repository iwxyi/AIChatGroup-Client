import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export type AdminMetricTone = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';

export type AdminMetricItem = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  tone?: AdminMetricTone;
  onClick?: () => void;
};

function metricColor(tone: AdminMetricTone = 'default') {
  if (tone === 'primary') return 'primary.main';
  if (tone === 'success') return 'success.main';
  if (tone === 'warning') return 'warning.main';
  if (tone === 'error') return 'error.main';
  if (tone === 'info') return 'info.main';
  return 'text.primary';
}

export function AdminSection({
  title,
  subtitle,
  action,
  children,
  sx,
  bodySx,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
  bodySx?: SxProps<Theme>;
}) {
  const sxList = Array.isArray(sx) ? sx : [sx];
  const bodySxList = Array.isArray(bodySx) ? bodySx : [bodySx];
  return (
    <Paper
      variant="outlined"
      sx={[
        {
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        },
        ...sxList,
      ]}
    >
      {(title || subtitle || action) ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            px: { xs: 1.25, md: 1.5 },
            py: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
            bgcolor: 'action.hover',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title ? <Typography sx={{ fontWeight: 900, lineHeight: 1.25 }}>{title}</Typography> : null}
            {subtitle ? <Typography variant="caption" color="text.secondary">{subtitle}</Typography> : null}
          </Box>
          {action}
        </Stack>
      ) : null}
      <Box sx={[{ p: { xs: 1.25, md: 1.5 } }, ...bodySxList]}>
        {children}
      </Box>
    </Paper>
  );
}

export function AdminMetricCard({
  item,
  compact = false,
}: {
  item: AdminMetricItem;
  compact?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      onClick={item.onClick}
      sx={{
        p: compact ? 1 : 1.25,
        borderRadius: 1.5,
        minHeight: compact ? 68 : 82,
        minWidth: 0,
        cursor: item.onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms ease, background-color 120ms ease',
        '&:hover': item.onClick ? { borderColor: 'primary.main', bgcolor: 'action.hover' } : undefined,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, lineHeight: 1.35 }}>
        {item.label}
      </Typography>
      <Typography
        variant={compact ? 'subtitle1' : 'h6'}
        sx={{
          mt: 0.25,
          fontWeight: 900,
          lineHeight: 1.15,
          wordBreak: 'break-all',
          color: metricColor(item.tone),
        }}
      >
        {item.value}
      </Typography>
      {item.helper ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{item.helper}</Typography> : null}
    </Paper>
  );
}

export function AdminMetricGrid({
  items,
  minWidth = 144,
  compact = false,
}: {
  items: AdminMetricItem[];
  minWidth?: number;
  compact?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: 1,
      }}
    >
      {items.map((item) => (
        <AdminMetricCard key={item.key} item={item} compact={compact} />
      ))}
    </Box>
  );
}

export function AdminTableFrame({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ minWidth }}>
        {children}
      </Box>
    </Box>
  );
}
