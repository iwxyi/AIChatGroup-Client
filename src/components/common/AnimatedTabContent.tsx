import { Box } from '@mui/material';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import { motion } from '../../styles/motion';

type AnimatedTabContentProps<T extends string | number> = {
  value: T;
  direction?: -1 | 1;
  children: ReactNode;
  sx?: SxProps<Theme>;
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotionChange(onStoreChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => undefined;
  }
  const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQueryList.addEventListener('change', onStoreChange);
  return () => mediaQueryList.removeEventListener('change', onStoreChange);
}

function getReducedMotionSnapshot() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotionChange,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

export default function AnimatedTabContent<T extends string | number>({ value, direction = 1, children, sx }: AnimatedTabContentProps<T>) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const previousValueRef = useRef(value);
  const previousChildrenRef = useRef<ReactNode>(children);
  const [transition, setTransition] = useState<{
    key: number;
    from: ReactNode;
    direction: -1 | 1;
  } | null>(null);
  const transitionKeyRef = useRef(0);
  const transitionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (Object.is(previousValueRef.current, value)) {
      previousChildrenRef.current = children;
      return;
    }

    if (prefersReducedMotion) {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      transitionTimeoutRef.current = window.setTimeout(() => {
        setTransition(null);
        transitionTimeoutRef.current = null;
      }, 0);
      previousValueRef.current = value;
      previousChildrenRef.current = children;
      return;
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    transitionKeyRef.current += 1;
    setTransition({
      key: transitionKeyRef.current,
      from: previousChildrenRef.current,
      direction,
    });
    previousValueRef.current = value;
    previousChildrenRef.current = children;

    transitionTimeoutRef.current = window.setTimeout(() => {
      setTransition((current) => (current?.key === transitionKeyRef.current ? null : current));
      transitionTimeoutRef.current = null;
    }, motion.durations.navTrack + 40);
  }, [children, direction, prefersReducedMotion, value]);

  useEffect(() => () => {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
  }, []);

  const enteringAnimation = `animatedTabContentEnter ${motion.durations.navTrack}ms ${motion.standard} both`;
  const exitingAnimation = `animatedTabContentExit ${motion.durations.navTrack}ms ${motion.standard} both`;
  const visibleTransition = prefersReducedMotion ? null : transition;
  const effectiveDirection = visibleTransition?.direction ?? direction;

  return (
    <Box
      sx={{
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
        '--tab-enter-offset': effectiveDirection >= 0 ? '100%' : '-100%',
        '--tab-exit-offset': effectiveDirection >= 0 ? '-100%' : '100%',
        '@keyframes animatedTabContentEnter': {
          from: {
            transform: 'translate3d(var(--tab-enter-offset), 0, 0)',
          },
          to: {
            transform: 'translate3d(0, 0, 0)',
          },
        },
        '@keyframes animatedTabContentExit': {
          from: {
            transform: 'translate3d(0, 0, 0)',
          },
          to: {
            transform: 'translate3d(var(--tab-exit-offset), 0, 0)',
          },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '@keyframes animatedTabContentEnter': {
            from: { opacity: 0.72 },
            to: { opacity: 1 },
          },
          '@keyframes animatedTabContentExit': {
            from: { opacity: 1 },
            to: { opacity: 0 },
          },
        },
        ...sx,
      }}
    >
      {visibleTransition ? (
        <Box
          key={`from-${visibleTransition.key}`}
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            pointerEvents: 'none',
            animation: prefersReducedMotion ? undefined : exitingAnimation,
          }}
        >
          {visibleTransition.from}
        </Box>
      ) : null}
      <Box
        key={String(value)}
        sx={{
          minWidth: 0,
          position: 'relative',
          animation: visibleTransition ? enteringAnimation : undefined,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
