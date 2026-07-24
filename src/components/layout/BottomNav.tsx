import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AnimatedNavIcon, { type AnimatedNavIconKind } from './AnimatedNavIcon';

const pathToIndex: Record<string, number> = {
  '/': 0,
  '/chats': 1,
  '/characters': 2,
  '/settings': 3,
};

const mobileItems: Array<{ path: string; labelKey: string; iconKind: AnimatedNavIconKind }> = [
  { path: '/', labelKey: 'nav.home', iconKind: 'home' },
  { path: '/chats', labelKey: 'nav.chats', iconKind: 'chats' },
  { path: '/characters', labelKey: 'nav.characters', iconKind: 'characters' },
  { path: '/settings', labelKey: 'nav.settings', iconKind: 'settings' },
];

type NavPreview = {
  index: number;
  originPath: string;
  originKey: string;
  phase: 'pointer' | 'commit';
};

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [preview, setPreview] = useState<NavPreview | null>(null);
  const navigationRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ index: number; x: number; y: number; pointerId: number } | null>(null);
  const draggedRef = useRef(false);
  const suppressNextChangeRef = useRef(false);

  const currentIndex = Object.entries(pathToIndex).reduce((acc, [path, idx]) => {
    if (path === '/') {
      return location.pathname === '/' ? idx : acc;
    }
    return location.pathname.startsWith(path) ? idx : acc;
  }, 0);
  const isPressPreviewing = preview !== null
    && preview.originPath === location.pathname
    && preview.originKey === location.key;
  const visualIndex = isPressPreviewing && preview !== null ? preview.index : currentIndex;

  useEffect(() => {
    const handleWindowBlur = () => {
      pointerRef.current = null;
      draggedRef.current = false;
      suppressNextChangeRef.current = false;
      setPreview(null);
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, []);

  const handlePointerDown = (index: number, event: ReactPointerEvent) => {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    pointerRef.current = {
      index,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    draggedRef.current = false;
    setPreview({
      index,
      originPath: location.pathname,
      originKey: location.key,
      phase: 'pointer',
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent) => {
    const pointer = pointerRef.current;
    if (!pointer) return;

    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (Math.abs(deltaY) > 20 && Math.abs(deltaY) > Math.abs(deltaX)) {
      handlePointerCancel();
      return;
    }

    if (distance > 8) {
      draggedRef.current = true;
    }

    if (!draggedRef.current) return;

    const navigation = navigationRef.current;
    if (!navigation) return;

    const bounds = navigation.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(bounds.width - 1, event.clientX - bounds.left));
    const nextIndex = Math.max(
      0,
      Math.min(mobileItems.length - 1, Math.floor((relativeX / bounds.width) * mobileItems.length)),
    );
    if (
      preview?.index !== nextIndex
      || preview?.originPath !== location.pathname
      || preview?.originKey !== location.key
      || preview?.phase !== 'pointer'
    ) {
      setPreview({
        index: nextIndex,
        originPath: location.pathname,
        originKey: location.key,
        phase: 'pointer',
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent) => {
    const pointer = pointerRef.current;
    if (!pointer) return;

    pointerRef.current = null;
    const releasePointerCapture = () => {
      if (event.currentTarget.hasPointerCapture(pointer.pointerId)) {
        event.currentTarget.releasePointerCapture(pointer.pointerId);
      }
    };
    const commitSelection = (targetIndex: number) => {
      if (targetIndex !== currentIndex) {
        const nextPath = mobileItems[targetIndex]?.path;
        if (nextPath && nextPath !== location.pathname) {
          suppressNextChangeRef.current = true;
          setPreview({
            index: targetIndex,
            originPath: location.pathname,
            originKey: location.key,
            phase: 'commit',
          });
          navigate(nextPath);
          window.setTimeout(() => {
            suppressNextChangeRef.current = false;
          }, 0);
          return;
        }
      }

      setPreview(null);
    };

    if (draggedRef.current) {
      const targetIndex = preview?.originPath === location.pathname ? preview.index : currentIndex;
      draggedRef.current = false;
      releasePointerCapture();
      commitSelection(targetIndex);
      return;
    }

    releasePointerCapture();
    commitSelection(pointer.index);
  };

  const handlePointerCancel = () => {
    pointerRef.current = null;
    draggedRef.current = false;
    suppressNextChangeRef.current = false;
    setPreview(null);
  };

  return (
    <Paper
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1200,
        px: 1.25,
        pt: 0.5,
        pb: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        borderRadius: 0,
        overflow: 'hidden',
        borderTop: '1px solid',
        borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.10)',
        bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(245,245,247,0.70)' : 'rgba(10,10,15,0.42)',
        backdropFilter: (theme) => theme.palette.mode === 'light' ? 'blur(22px) saturate(0.96) brightness(1.015) contrast(0.92)' : 'blur(20px) saturate(0.90) brightness(0.84)',
        WebkitBackdropFilter: (theme) => theme.palette.mode === 'light' ? 'blur(22px) saturate(0.96) brightness(1.015) contrast(0.92)' : 'blur(20px) saturate(0.90) brightness(0.84)',
        boxShadow: (theme) => theme.palette.mode === 'light'
          ? '0 -10px 24px rgba(15,23,42,0.035), 0 1px 0 rgba(255,255,255,0.54) inset'
          : '0 -12px 30px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.08) inset',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          top: -42,
          height: 42,
          pointerEvents: 'none',
          backdropFilter: (theme) => theme.palette.mode === 'light' ? 'blur(32px) saturate(0.74) brightness(1.18) contrast(0.66)' : 'blur(20px) saturate(0.92) brightness(0.84)',
          WebkitBackdropFilter: (theme) => theme.palette.mode === 'light' ? 'blur(32px) saturate(0.74) brightness(1.18) contrast(0.66)' : 'blur(20px) saturate(0.92) brightness(0.84)',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0.20) 62%, transparent)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0.20) 62%, transparent)',
          background: (theme) => theme.palette.mode === 'light'
            ? 'linear-gradient(rgba(245,245,247,0), rgba(245,245,247,0.18))'
            : 'linear-gradient(rgba(10,10,15,0), rgba(10,10,15,0.12))',
        },
      }}
      elevation={0}
    >
      <BottomNavigation
        ref={navigationRef}
        value={visualIndex}
        onChange={(_, newValue) => {
          if (suppressNextChangeRef.current) {
            suppressNextChangeRef.current = false;
            return;
          }
          const nextPath = mobileItems[newValue]?.path;
          if (nextPath !== location.pathname) navigate(nextPath);
        }}
        showLabels
        sx={{
          height: 54,
          position: 'relative',
          bgcolor: 'transparent',
          borderRadius: 1.5,
          '&::before': {
            content: '""',
            position: 'absolute',
            zIndex: 0,
            top: 2,
            bottom: 2,
            left: `calc(${visualIndex * 25}% + 0.5%)`,
            width: '24%',
            borderRadius: 1.25,
            pointerEvents: 'none',
            background: (theme) => theme.palette.mode === 'light'
              ? 'rgba(255,255,255,0.72)'
              : 'rgba(255,255,255,0.075)',
            border: '1px solid',
            borderColor: (theme) => theme.palette.mode === 'light'
              ? 'rgba(15,23,42,0.055)'
              : 'rgba(226,232,240,0.09)',
            boxShadow: (theme) => theme.palette.mode === 'light'
              ? '0 4px 14px rgba(15,23,42,0.06)'
              : '0 4px 16px rgba(0,0,0,0.16)',
            transition: !isPressPreviewing
              ? 'left 260ms cubic-bezier(.22,1.28,.36,1), background-color 220ms ease, box-shadow 220ms ease'
              : 'left 120ms cubic-bezier(.22,.8,.26,1), background-color 220ms ease, box-shadow 220ms ease',
            transform: isPressPreviewing ? 'scaleX(0.965)' : 'scaleX(1)',
            transformOrigin: 'center',
            willChange: 'left',
          },
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            color: 'text.secondary',
            position: 'relative',
            zIndex: 1,
            borderRadius: 1,
            mx: 0.2,
            my: 0.25,
            py: 0.25,
            backgroundColor: 'transparent',
            touchAction: 'pan-y',
            transition: 'color 220ms ease, opacity 220ms ease',
            '&:hover': {
              bgcolor: 'transparent',
            },
            '& .MuiTouchRipple-root': {
              display: 'none',
            },
            '& .PneumataNavIcon': {
              transition: 'transform 200ms cubic-bezier(.22,1.28,.36,1)',
            },
            '&.Mui-selected .PneumataNavIcon': {
              transform: 'translateY(-0.5px)',
            },
          },
          '& .Mui-selected': {
            color: 'primary.main',
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: 10.5,
            fontWeight: 650,
            lineHeight: 1.15,
            transform: 'none',
            transition: 'color 180ms ease, opacity 180ms ease',
            '&.Mui-selected': {
              fontSize: 10.5,
              transform: 'none',
              transitionDelay: '45ms',
            },
          },
        }}
      >
        {mobileItems.map((item, index) => (
          <BottomNavigationAction
            key={item.path}
            className="PneumataNavButton"
            disableRipple
            label={t(item.labelKey)}
            icon={<AnimatedNavIcon kind={item.iconKind} active={visualIndex === index} size={24} />}
            onPointerDown={(event) => handlePointerDown(index, event)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
