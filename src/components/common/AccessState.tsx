import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { Box, Button, Stack, Typography, type ButtonProps, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

type AccessStateKind = 'forbidden' | 'not-found' | 'unavailable';

export type AccessStateAction = {
  label: string;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  startIcon?: ReactNode;
};

interface AccessStateProps {
  kind?: AccessStateKind;
  title: string;
  description?: string;
  actions?: AccessStateAction[];
  compact?: boolean;
  sx?: SxProps<Theme>;
}

const stateMeta: Record<AccessStateKind, { code: string; icon: React.ReactNode }> = {
  forbidden: { code: '403', icon: <LockOutlinedIcon fontSize="small" /> },
  'not-found': { code: '404', icon: <SearchOffOutlinedIcon fontSize="small" /> },
  unavailable: { code: 'UNAVAILABLE', icon: <WarningAmberOutlinedIcon fontSize="small" /> },
};

export const accessStateActions = {
  back(label: string, onClick: () => void): AccessStateAction {
    return { label, onClick, variant: 'outlined', startIcon: <ArrowBackIcon fontSize="small" /> };
  },
  home(label: string, onClick: () => void): AccessStateAction {
    return { label, onClick, variant: 'contained', startIcon: <HomeOutlinedIcon fontSize="small" /> };
  },
};

export default function AccessState({
  kind = 'forbidden',
  title,
  description,
  actions = [],
  compact = false,
  sx,
}: AccessStateProps) {
  const meta = stateMeta[kind];
  return (
    <Box
      sx={{
        minHeight: compact ? 220 : { xs: 'calc(100vh - 180px)', md: 'calc(100vh - 220px)' },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: { xs: 2, sm: 3 },
        py: compact ? 3 : { xs: 4, md: 6 },
        ...sx,
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 560,
          border: 1,
          borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.10)',
          borderRadius: 1,
          bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.74)' : 'rgba(18,20,28,0.74)',
          boxShadow: (theme) => theme.palette.mode === 'light'
            ? '0 1px 2px rgba(15,23,42,0.03), 0 18px 52px rgba(15,23,42,0.06)'
            : '0 1px 0 rgba(255,255,255,0.035) inset, 0 20px 56px rgba(0,0,0,0.30)',
          backdropFilter: 'blur(22px) saturate(1.16)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.16)',
          p: { xs: 2.25, sm: 3 },
        }}
      >
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.5,
              borderRadius: 999,
              border: 1,
              borderColor: 'divider',
              color: 'text.secondary',
              bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.03)' : 'rgba(226,232,240,0.06)',
            }}
          >
            {meta.icon}
            <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 0 }}>
              {meta.code}
            </Typography>
          </Box>
          <Stack spacing={0.75}>
            <Typography variant={compact ? 'h6' : 'h5'} sx={{ fontWeight: 900, letterSpacing: 0 }}>
              {title}
            </Typography>
            {description ? (
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460, lineHeight: 1.75 }}>
                {description}
              </Typography>
            ) : null}
          </Stack>
          {actions.length ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.variant || 'outlined'}
                  startIcon={action.startIcon}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
