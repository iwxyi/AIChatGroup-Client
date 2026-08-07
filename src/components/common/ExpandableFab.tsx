import { Fab, useMediaQuery } from '@mui/material';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { motion, transition } from '../../styles/motion';

const fabSpring = 'linear(0, 0.01 1%, 0.042 2.1%, 0.161 4.7%, 0.353 7.9%, 0.616 12%, 0.986 17.9%, 1.179 22.8%, 1.276 28.2%, 1.237 34.4%, 1.118 44.8%, 1.028 56.4%, 0.982 69.2%, 0.998 84%, 1)';
const fabSettle = 'cubic-bezier(0.22, 1, 0.36, 1)';

interface ExpandableFabProps {
  icon: ReactNode;
  label: ReactNode;
  ariaLabel: string;
  onClick: () => void;
  color?: 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  disabled?: boolean;
  sx?: SxProps<Theme>;
  expandedWidth?: number;
}

export default function ExpandableFab({ icon, label, ariaLabel, onClick, color = 'primary', disabled = false, sx, expandedWidth = 132 }: ExpandableFabProps) {
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');

  return (
    <Fab
      color={color}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      sx={[
        {
          zIndex: 1300,
          width: 56,
          minWidth: 56,
          maxWidth: expandedWidth + 20,
          height: 56,
          minHeight: 56,
          p: 0,
          overflow: 'hidden',
          justifyContent: 'flex-start',
          borderRadius: '999px',
          border: '1px solid',
          borderColor: (theme) => {
            const main = theme.palette[color]?.main || theme.palette.primary.main;
            return alpha(main, theme.palette.mode === 'light' ? 0.26 : 0.34);
          },
          color: (theme) => theme.palette[color]?.main || theme.palette.primary.main,
          bgcolor: (theme) => {
            const main = theme.palette[color]?.main || theme.palette.primary.main;
            return alpha(main, theme.palette.mode === 'light' ? 0.13 : 0.18);
          },
          backdropFilter: 'blur(18px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
          boxShadow: (theme) => theme.palette.mode === 'light'
            ? `0 16px 34px ${alpha(theme.palette[color]?.main || theme.palette.primary.main, 0.18)}`
            : `0 18px 42px ${alpha(theme.palette.common.black, 0.42)}`,
          transformOrigin: 'right center',
          transition: [
            transition(['width', 'min-width'], 420, fabSettle),
            transition(['background-color', 'border-color', 'box-shadow', 'color'], 320, fabSettle),
          ].join(', '),
          '&:not(.Mui-disabled):hover, &:not(.Mui-disabled):focus-visible': canHover ? {
            width: expandedWidth,
            minWidth: expandedWidth,
            borderRadius: '999px',
            borderColor: (theme) => {
              const main = theme.palette[color]?.main || theme.palette.primary.main;
              return alpha(main, theme.palette.mode === 'light' ? 0.34 : 0.46);
            },
            bgcolor: (theme) => {
              const main = theme.palette[color]?.main || theme.palette.primary.main;
              return alpha(main, theme.palette.mode === 'light' ? 0.19 : 0.25);
            },
            transition: [
              transition(['width', 'min-width'], 820, fabSpring),
              transition(['background-color', 'border-color', 'box-shadow', 'color'], 540, fabSpring),
            ].join(', '),
            boxShadow: (theme) => theme.palette.mode === 'light'
              ? `0 20px 42px ${alpha(theme.palette[color]?.main || theme.palette.primary.main, 0.24)}`
              : `0 22px 52px ${alpha(theme.palette.common.black, 0.50)}`,
          } : undefined,
          '&.Mui-disabled': {
            pointerEvents: 'auto',
            cursor: 'not-allowed',
            borderColor: (theme) => {
              const main = theme.palette[color]?.main || theme.palette.primary.main;
              return alpha(main, theme.palette.mode === 'light' ? 0.18 : 0.24);
            },
            color: (theme) => alpha(theme.palette[color]?.main || theme.palette.primary.main, theme.palette.mode === 'light' ? 0.44 : 0.52),
            bgcolor: (theme) => {
              const main = theme.palette[color]?.main || theme.palette.primary.main;
              return theme.palette.mode === 'light'
                ? alpha(main, 0.075)
                : alpha(main, 0.11);
            },
            backdropFilter: 'blur(18px) saturate(1.28)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.28)',
            boxShadow: (theme) => theme.palette.mode === 'light'
              ? `0 14px 30px ${alpha(theme.palette[color]?.main || theme.palette.primary.main, 0.10)}`
              : `0 16px 36px ${alpha(theme.palette.common.black, 0.30)}`,
          },
          '&:not(.Mui-disabled):active': {
            transform: 'translateY(1px) scale(0.985)',
            transitionTimingFunction: motion.press,
            transitionDuration: `${motion.durations.instant}ms`,
          },
          '& .ExpandableFab-icon': {
            width: 56,
            minWidth: 56,
            height: 56,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transform: 'translateX(0) scale(1)',
            transition: transition(['transform'], 360, fabSettle),
          },
          '& .ExpandableFab-label': {
            minWidth: 0,
            width: expandedWidth - 68,
            pr: 2,
            ml: -0.25,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            opacity: 0,
            transform: 'translate3d(8px, 0, 0)',
            transformOrigin: 'left center',
            transition: `opacity 150ms ease, transform 300ms ${fabSettle}`,
          },
          '&:not(.Mui-disabled):hover .ExpandableFab-label, &:not(.Mui-disabled):focus-visible .ExpandableFab-label': canHover ? {
            opacity: 1,
            transform: 'translate3d(0, 0, 0)',
            transition: `opacity 220ms ease 120ms, transform 420ms ${fabSettle} 80ms`,
          } : undefined,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <span
        aria-hidden
        className="ExpandableFab-icon"
      >
        {icon}
      </span>
      <span
        className="ExpandableFab-label"
      >
        {label}
      </span>
    </Fab>
  );
}
