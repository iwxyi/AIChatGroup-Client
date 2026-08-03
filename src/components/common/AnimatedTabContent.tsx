import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import { motion } from '../../styles/motion';

type AnimatedTabContentProps<T extends string | number> = {
  value: T;
  direction?: -1 | 1;
  children: ReactNode;
  sx?: SxProps<Theme>;
};

export default function AnimatedTabContent<T extends string | number>({ value, direction = 1, children, sx }: AnimatedTabContentProps<T>) {
  const animationName = 'animatedTabContentIn';
  return (
    <Box
      key={String(value)}
      sx={{
        minWidth: 0,
        animation: `${animationName} ${motion.durations.navTrack}ms ${motion.navTrack} both`,
        '@keyframes animatedTabContentIn': {
          from: {
            opacity: 0,
            transform: `translate3d(${direction >= 0 ? 18 : -18}px, 0, 0) scale(0.995)`,
            filter: 'blur(1.5px)',
          },
          to: {
            opacity: 1,
            transform: 'translate3d(0, 0, 0) scale(1)',
            filter: 'blur(0)',
          },
        },
        '@media (prefers-reduced-motion: reduce)': {
          animation: `${animationName} ${motion.durations.fast}ms ${motion.softOut} both`,
          '@keyframes animatedTabContentIn': {
            from: { opacity: 0.72 },
            to: { opacity: 1 },
          },
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
