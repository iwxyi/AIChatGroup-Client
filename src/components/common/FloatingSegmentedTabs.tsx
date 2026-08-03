import { Box, ButtonBase } from '@mui/material';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { motion, reducedMotionSx, transition } from '../../styles/motion';
import { buildFloatingTabGroupSx } from './FloatingSegmentedTabs.styles';

type FloatingSegmentedTab<T extends string | number> = {
  value: T;
  label: ReactNode;
};

const POINTER_Y_TOLERANCE_PX = 52;
const POINTER_X_TOLERANCE_PX = 44;
const TOUCH_SCROLL_INTENT_PX = 8;
const TOUCH_POINTER_Y_TOLERANCE_PX = 68;
const TOUCH_POINTER_X_TOLERANCE_PX = 58;

export type FloatingSegmentedTabsProps<T extends string | number> = {
  value: T;
  items: FloatingSegmentedTab<T>[];
  onChange: (value: T) => void;
  equalWidth?: boolean;
  comfortable?: boolean;
};

export default function FloatingSegmentedTabs<T extends string | number>({ value, items, onChange, equalWidth = true, comfortable = true }: FloatingSegmentedTabsProps<T>) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const pointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    pointerType: string;
    allowDragPreview: boolean;
    scrollIntent: boolean;
  } | null>(null);
  const previewValueRef = useRef<T | null>(null);
  const latestPointerTypeRef = useRef<string>('mouse');
  const suppressClickRef = useRef(false);
  const [previewValue, setPreviewValue] = useState<T | null>(null);
  const visualValue = previewValue ?? value;

  const setVisualPreview = useCallback((nextValue: T | null) => {
    if (previewValueRef.current === nextValue) return;
    previewValueRef.current = nextValue;
    setPreviewValue(nextValue);
  }, []);

  const updateIndicator = useCallback(() => {
    const group = groupRef.current;
    const target = itemRefs.current.get(String(visualValue));
    const indicator = indicatorRef.current;
    if (!indicator) return;
    if (!group || !target) {
      indicator.style.opacity = '0';
      return;
    }

    const groupBounds = group.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const currentLeft = Number(indicator.dataset.left || '0');
    const nextLeft = targetBounds.left - groupBounds.left + group.scrollLeft;
    const distance = Math.abs(nextLeft - currentLeft);
    const previewDuration = Math.max(
      motion.durations.fast,
      Math.min(motion.durations.settle, Math.round(distance * 0.58)),
    );
    const settledDuration = Math.max(
      motion.durations.navTrack,
      Math.min(motion.durations.settle, Math.round(distance * 0.72)),
    );
    const duration = previewValueRef.current !== null ? previewDuration : settledDuration;
    const easing = previewValueRef.current !== null ? motion.navTrack : motion.gentleSpring;
    indicator.style.opacity = '1';
    indicator.style.transition = transition(['transform', 'width', 'opacity', 'background-color', 'box-shadow'], duration, easing);
    indicator.style.transform = `translateX(${nextLeft}px)`;
    indicator.style.width = `${targetBounds.width}px`;
    indicator.dataset.left = String(nextLeft);
  }, [visualValue]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [items, updateIndicator]);

  useEffect(() => {
    if (previewValue !== null && previewValue === value) {
      const timer = window.setTimeout(() => setVisualPreview(null), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [previewValue, setVisualPreview, value]);

  useEffect(() => {
    const handleResize = () => updateIndicator();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateIndicator]);

  useEffect(() => {
    const handleWindowBlur = () => {
      pointerRef.current = null;
      suppressClickRef.current = false;
      setVisualPreview(null);
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [setVisualPreview]);

  const itemValues = useMemo(() => items.map((item) => item.value), [items]);

  const isHorizontallyScrollable = useCallback(() => {
    const group = groupRef.current;
    return Boolean(group && group.scrollWidth > group.clientWidth + 1);
  }, []);

  const resolveValueAtPoint = useCallback((clientX: number, clientY: number) => {
    const group = groupRef.current;
    if (!group) return null;
    const groupBounds = group.getBoundingClientRect();
    const xTolerance = latestPointerTypeRef.current === 'touch' ? TOUCH_POINTER_X_TOLERANCE_PX : POINTER_X_TOLERANCE_PX;
    if (clientX < groupBounds.left - xTolerance || clientX > groupBounds.right + xTolerance) {
      return null;
    }
    const yTolerance = latestPointerTypeRef.current === 'touch' ? TOUCH_POINTER_Y_TOLERANCE_PX : POINTER_Y_TOLERANCE_PX;
    if (clientY < groupBounds.top - yTolerance || clientY > groupBounds.bottom + yTolerance) {
      return null;
    }

    let closestValue: T | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const item of itemValues) {
      const node = itemRefs.current.get(String(item));
      if (!node) continue;
      const bounds = node.getBoundingClientRect();
      if (clientX >= bounds.left && clientX <= bounds.right) return item;
      const centerX = bounds.left + bounds.width / 2;
      const distance = Math.abs(clientX - centerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestValue = item;
      }
    }
    return closestValue;
  }, [itemValues]);

  const handlePointerDown = (itemValue: T, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerType: event.pointerType,
      allowDragPreview: event.pointerType !== 'touch' || !isHorizontallyScrollable(),
      scrollIntent: false,
    };
    latestPointerTypeRef.current = event.pointerType;
    suppressClickRef.current = true;
    setVisualPreview(itemValue);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer) return;

    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    if (
      pointer.pointerType === 'touch'
      && !pointer.allowDragPreview
      && Math.abs(deltaX) > TOUCH_SCROLL_INTENT_PX
      && Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      pointer.scrollIntent = true;
      setVisualPreview(null);
      if (event.currentTarget.hasPointerCapture(pointer.pointerId)) {
        event.currentTarget.releasePointerCapture(pointer.pointerId);
      }
      return;
    }
    if (pointer.scrollIntent || !pointer.allowDragPreview) return;

    const nextValue = resolveValueAtPoint(event.clientX, event.clientY);
    setVisualPreview(nextValue);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer) return;

    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(pointer.pointerId)) {
      event.currentTarget.releasePointerCapture(pointer.pointerId);
    }

    if (pointer.scrollIntent) {
      setVisualPreview(null);
      return;
    }

    const targetValue = previewValueRef.current;
    if (targetValue === null) {
      setVisualPreview(null);
      return;
    }

    if (targetValue === value) {
      setVisualPreview(null);
      return;
    }

    setVisualPreview(targetValue);
    onChange(targetValue);
  };

  const handleKeyDown = (itemValue: T, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = itemValues.findIndex((candidate) => candidate === itemValue);
    if (currentIndex < 0) return;

    const moveFocus = (nextIndex: number) => {
      const nextValue = itemValues[nextIndex];
      const nextNode = nextValue === undefined ? null : itemRefs.current.get(String(nextValue));
      nextNode?.focus();
      if (nextValue !== undefined) setVisualPreview(nextValue);
    };

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(Math.max(0, currentIndex - 1));
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(Math.min(itemValues.length - 1, currentIndex + 1));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      moveFocus(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      moveFocus(itemValues.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (itemValue !== value) onChange(itemValue);
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    pointerRef.current = null;
    suppressClickRef.current = false;
    setVisualPreview(null);
    if (pointer && event.currentTarget.hasPointerCapture(pointer.pointerId)) {
      event.currentTarget.releasePointerCapture(pointer.pointerId);
    }
  };

  return (
    <Box sx={buildFloatingTabGroupSx()}>
      <Box
        ref={groupRef}
        sx={{
          position: 'relative',
          display: 'flex',
          gap: comfortable ? { xs: 0.25, sm: 0.4 } : { xs: 0.25, sm: 0.35 },
          minWidth: 0,
        }}
      >
        <Box
          aria-hidden
          ref={indicatorRef}
          sx={{
            position: 'absolute',
            zIndex: 0,
            top: 0,
            bottom: 0,
            left: 0,
            width: 0,
            opacity: 0,
            transform: 'translateX(0)',
            borderRadius: { xs: '10px', sm: '11px' },
            pointerEvents: 'none',
            bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.12)' : 'rgba(120,156,220,0.18)',
            boxShadow: (theme) => theme.palette.mode === 'light'
              ? '0 8px 18px rgba(49,90,156,0.12), 0 1px 0 rgba(255,255,255,0.72) inset'
              : '0 10px 22px rgba(0,0,0,0.24), 0 1px 0 rgba(255,255,255,0.06) inset',
            transition: transition(['transform', 'width', 'opacity', 'background-color', 'box-shadow'], motion.durations.navTrack, motion.navTrack),
            willChange: 'transform, width',
            '@media (prefers-reduced-motion: reduce)': {
              transition: transition(['transform', 'width', 'opacity'], motion.durations.fast, motion.softOut),
            },
          }}
        />
        {items.map((item) => {
          const selected = item.value === visualValue;
          return (
            <ButtonBase
              key={String(item.value)}
              disableRipple
              ref={(node) => {
                const key = String(item.value);
                if (node) itemRefs.current.set(key, node);
                else itemRefs.current.delete(key);
              }}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onChange(item.value);
              }}
              onPointerDown={(event) => handlePointerDown(item.value, event)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onKeyDown={(event) => handleKeyDown(item.value, event)}
              onBlur={() => {
                if (!pointerRef.current) setVisualPreview(null);
              }}
              aria-pressed={item.value === value}
              sx={{
                position: 'relative',
                zIndex: 1,
                minHeight: { xs: 36, sm: 38 },
                minWidth: equalWidth
                  ? comfortable ? { xs: 58, sm: 74, md: 88 } : { xs: 58, sm: 68 }
                  : 'max-content',
                flex: equalWidth ? '1 1 auto' : '0 1 auto',
                px: comfortable ? { xs: 1.2, sm: 1.8, md: 2.2 } : { xs: 1.35, sm: 1.75 },
                borderRadius: { xs: '10px', sm: '11px' },
                color: selected ? 'primary.main' : 'text.secondary',
                bgcolor: 'transparent',
                boxShadow: 'none',
                touchAction: 'pan-x pan-y',
                fontWeight: 760,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                whiteSpace: 'nowrap',
                opacity: selected ? 1 : 0.78,
                overflow: 'hidden',
                outline: '1px solid transparent',
                transition: transition(['background-color', 'color', 'opacity', 'box-shadow', 'outline-color', 'transform'], motion.durations.base, selected ? motion.gentleSpring : motion.softOut),
                '&:hover': {
                  opacity: 1,
                  bgcolor: selected
                    ? 'transparent'
                    : (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.045)' : 'rgba(226,232,240,0.07)',
                  outlineColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.045)' : 'rgba(226,232,240,0.06)',
                },
                '&:active': {
                  transform: 'scale(0.986)',
                  transitionTimingFunction: motion.navDrag,
                  transitionDuration: `${motion.durations.fast}ms`,
                  bgcolor: 'transparent',
                },
                '&:focus-visible': {
                  outlineColor: 'primary.main',
                  boxShadow: (theme) => theme.palette.mode === 'light'
                    ? '0 0 0 3px rgba(49,90,156,0.13)'
                    : '0 0 0 3px rgba(120,156,220,0.18)',
                },
                ...reducedMotionSx,
              }}
            >
              <Box component="span" sx={{ display: 'block', minWidth: 0, whiteSpace: 'nowrap' }}>
                {item.label}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
