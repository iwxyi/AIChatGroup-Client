import { Box } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

export type AnimatedNavIconKind =
  | 'home'
  | 'chats'
  | 'characters'
  | 'moments'
  | 'market'
  | 'calendar'
  | 'letters'
  | 'models'
  | 'proxy'
  | 'membership'
  | 'settings'
  | 'intro';

interface AnimatedNavIconProps {
  kind: AnimatedNavIconKind;
  active?: boolean;
  size?: number;
}

const iconSx: SystemStyleObject<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--nav-icon-size)',
  height: 'var(--nav-icon-size)',
  color: 'inherit',
  pointerEvents: 'none',
  '--nav-icon-accent': (theme) => theme.palette.primary.main,
  '& svg': {
    display: 'block',
    overflow: 'visible',
    pointerEvents: 'none',
    transition: 'transform 160ms cubic-bezier(.2,0,0,1)',
  },
  '& path, & line, & circle, & rect, & polyline, & g': {
    pointerEvents: 'none',
    vectorEffect: 'non-scaling-stroke',
    transformBox: 'fill-box',
    transformOrigin: 'center',
    transition: [
      'fill-opacity 240ms ease',
      'opacity 240ms ease',
      'stroke-dashoffset 420ms cubic-bezier(.16,1,.3,1)',
      'transform 320ms cubic-bezier(.16,1,.3,1)',
    ].join(', '),
  },
  '& .surface, & .secondary-surface, & .detail-fill': {
    fill: 'none',
    fillOpacity: 0,
    stroke: 'currentColor',
    opacity: 1,
  },
  '& .accent-surface': {
    fill: 'none',
    fillOpacity: 0,
    stroke: 'var(--nav-icon-accent)',
    opacity: 1,
  },
  '& .accent': {
    stroke: 'var(--nav-icon-accent)',
    opacity: 0.84,
  },
  '& .muted': {
    opacity: 0.5,
  },
  '& .secondary': {
    opacity: 0.68,
  },
  '&.is-active .accent, .PneumataNavButton:hover & .accent': {
    opacity: 1,
  },
  '&.is-active .muted, .PneumataNavButton:hover & .muted': {
    opacity: 0.72,
  },
  '&.is-active .secondary, .PneumataNavButton:hover & .secondary': {
    opacity: 0.82,
  },
  '@keyframes navHomeRoof': {
    '0%, 100%': { transform: 'translateY(0)' },
    '48%': { transform: 'translateY(-1.7px)' },
  },
  '@keyframes navHomeDoor': {
    '0%, 100%': { transform: 'scaleX(1)' },
    '48%': { transform: 'scaleX(0.76)' },
  },
  '@keyframes navTypingDot': {
    '0%, 100%': { transform: 'translateY(0)', opacity: 0.64 },
    '42%': { transform: 'translateY(-2px)', opacity: 1 },
  },
  '@keyframes navPersonStep': {
    '0%, 100%': { transform: 'translate(0, 0)' },
    '52%': { transform: 'translate(-1px, -0.7px)' },
  },
  '@keyframes navFocus': {
    '0%, 100%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.16)' },
  },
  '@keyframes navAwning': {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%': { transform: 'translateY(-1.4px)' },
  },
  '@keyframes navMarketHandle': {
    '0%, 100%': { transform: 'translateY(0)' },
    '45%': { transform: 'translateY(-1px)' },
  },
  '@keyframes navMarkDraw': {
    '0%, 100%': { strokeDashoffset: 8, opacity: 0.5 },
    '45%, 70%': { strokeDashoffset: 0, opacity: 1 },
  },
  '@keyframes navEnvelopeOpen': {
    '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
    '45%, 62%': { transform: 'translateY(-2px) rotate(-5deg)' },
  },
  '@keyframes navModelFlow': {
    '0%, 100%': { strokeDashoffset: 9, opacity: 0.48 },
    '52%': { strokeDashoffset: 0, opacity: 1 },
  },
  '@keyframes navCorePulse': {
    '0%, 100%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.13)' },
  },
  '@keyframes navProxyFlow': {
    '0%, 100%': { strokeDashoffset: 10, opacity: 0.48 },
    '50%': { strokeDashoffset: 0, opacity: 1 },
  },
  '@keyframes navPortPulse': {
    '0%, 100%': { transform: 'scale(1)', opacity: 0.62 },
    '50%': { transform: 'scale(1.12)', opacity: 1 },
  },
  '@keyframes navCrownShine': {
    '0%, 100%': { transform: 'translateY(0)', opacity: 0.72 },
    '52%': { transform: 'translateY(-1.4px)', opacity: 1 },
  },
  '@keyframes navCrownLift': {
    '0%, 100%': { transform: 'translateY(0) scale(1)' },
    '48%': { transform: 'translateY(-1.8px) scale(1.04)' },
  },
  '@keyframes navGemPulse': {
    '0%, 100%': { transform: 'scale(1)', opacity: 0.78 },
    '45%, 68%': { transform: 'scale(1.22)', opacity: 1 },
  },
  '@keyframes navSliderA': {
    '0%, 100%': { transform: 'translateX(0)' },
    '36%': { transform: 'translateX(2.1px)' },
    '72%': { transform: 'translateX(-0.8px)' },
  },
  '@keyframes navSliderB': {
    '0%, 100%': { transform: 'translateX(0)' },
    '40%': { transform: 'translateX(-2.1px)' },
    '76%': { transform: 'translateX(1px)' },
  },
  '@keyframes navSliderC': {
    '0%, 100%': { transform: 'translateX(0)' },
    '38%': { transform: 'translateX(1.4px)' },
    '74%': { transform: 'translateX(-2.2px)' },
  },
  '@keyframes navSettingTrack': {
    '0%, 100%': { opacity: 0.48 },
    '50%': { opacity: 0.76 },
  },
  '@keyframes navNeedle': {
    '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.78 },
    '38%': { transform: 'translate(1.2px, -1.2px) scale(1.16)', opacity: 1 },
    '70%': { transform: 'translate(-0.4px, 0.5px) scale(0.96)', opacity: 0.86 },
  },
  '@keyframes navIntroPath': {
    '0%, 100%': { strokeDashoffset: 10, opacity: 0.5 },
    '42%, 72%': { strokeDashoffset: 0, opacity: 1 },
  },
  '.PneumataNavButton:hover & .home-roof, &.is-active .home-roof': {
    animation: 'navHomeRoof 1.8s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .home-door, &.is-active .home-door': {
    animation: 'navHomeDoor 1.8s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .typing-a': { animation: 'navTypingDot 960ms ease-in-out infinite' },
  '.PneumataNavButton:hover & .typing-b': { animation: 'navTypingDot 960ms ease-in-out 120ms infinite' },
  '.PneumataNavButton:hover & .typing-c': { animation: 'navTypingDot 960ms ease-in-out 240ms infinite' },
  '.PneumataNavButton:hover & .person-step, &.is-active .person-step': {
    animation: 'navPersonStep 1.55s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .focus-core, &.is-active .focus-core': {
    animation: 'navFocus 1.45s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .awning, &.is-active .awning': {
    animation: 'navAwning 1.55s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .market-handle, &.is-active .market-handle': {
    animation: 'navMarketHandle 1.45s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .mark-draw, &.is-active .mark-draw': {
    animation: 'navMarkDraw 1.45s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .letter-flap, &.is-active .letter-flap': {
    animation: 'navEnvelopeOpen 1.55s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .model-flow, &.is-active .model-flow': {
    animation: 'navModelFlow 1.35s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .core-pulse, &.is-active .core-pulse': {
    animation: 'navCorePulse 1.45s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .proxy-flow, &.is-active .proxy-flow': {
    animation: 'navProxyFlow 1.25s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .port-pulse, &.is-active .port-pulse': {
    animation: 'navPortPulse 1.35s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .crown-shine, &.is-active .crown-shine': {
    animation: 'navCrownShine 1.55s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .crown-lift, &.is-active .crown-lift': {
    animation: 'navCrownLift 1.45s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .gem-pulse, &.is-active .gem-pulse': {
    animation: 'navGemPulse 1.2s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .setting-track': {
    animation: 'navSettingTrack 1.45s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .setting-a': {
    animation: 'navSliderA 1.35s cubic-bezier(.37,0,.2,1) infinite',
  },
  '.PneumataNavButton:hover & .setting-b': {
    animation: 'navSliderB 1.45s cubic-bezier(.37,0,.2,1) infinite',
  },
  '.PneumataNavButton:hover & .setting-c': {
    animation: 'navSliderC 1.55s cubic-bezier(.37,0,.2,1) infinite',
  },
  '.PneumataNavButton:hover & .intro-needle, &.is-active .intro-needle': {
    animation: 'navNeedle 1.6s ease-in-out infinite',
  },
  '.PneumataNavButton:hover & .intro-path, &.is-active .intro-path': {
    animation: 'navIntroPath 1.6s ease-in-out infinite',
  },
  '.PneumataNavButton:active & svg': {
    transform: 'scale(0.92)',
  },
  '.PneumataNavButton:active &.PneumataNavIcon-settings svg': {
    transform: 'scale(0.88) rotate(-4deg)',
  },
  '.PneumataNavButton:active &.PneumataNavIcon-settings .setting-a': {
    transform: 'translateX(2.6px) scale(0.9)',
  },
  '.PneumataNavButton:active &.PneumataNavIcon-settings .setting-b': {
    transform: 'translateX(-2.6px) scale(0.9)',
  },
  '.PneumataNavButton:active &.PneumataNavIcon-settings .setting-c': {
    transform: 'translateX(1.8px) scale(0.9)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '& path, & line, & circle, & rect, & polyline, & g, & svg': {
      animation: 'none !important',
      transition: 'none',
    },
  },
};

function iconPaths(kind: AnimatedNavIconKind) {
  switch (kind) {
    case 'home':
      return (
        <>
          <path className="surface" d="M6.5 11.2 12 6.4l5.5 4.8v6.4c0 .9-.6 1.5-1.5 1.5H8c-.9 0-1.5-.6-1.5-1.5Z" />
          <path className="home-roof" d="M4.8 11 12 5l7.2 6" />
          <path d="M6.7 10.8v6.8c0 .8.6 1.4 1.4 1.4h7.8c.8 0 1.4-.6 1.4-1.4v-6.8" />
          <path className="accent home-door" d="M10.1 19v-4.3c0-.4.3-.7.7-.7h2.4c.4 0 .7.3.7.7V19" />
        </>
      );
    case 'chats':
      return (
        <>
          <path className="surface" d="M5.2 8.2c0-1.3 1-2.3 2.3-2.3h9c1.3 0 2.3 1 2.3 2.3v4.7c0 1.3-1 2.3-2.3 2.3h-6.1l-4.3 3 1-3.2c-1.1-.2-1.9-1.1-1.9-2.2Z" />
          <path d="M5.2 8.2c0-1.3 1-2.3 2.3-2.3h9c1.3 0 2.3 1 2.3 2.3v4.7c0 1.3-1 2.3-2.3 2.3h-6.1l-4.3 3 1-3.2c-1.1-.2-1.9-1.1-1.9-2.2Z" />
          <circle className="typing-a" cx="8.7" cy="10.8" r="0.78" />
          <circle className="accent typing-b" cx="12" cy="10.8" r="0.78" />
          <circle className="typing-c" cx="15.3" cy="10.8" r="0.78" />
        </>
      );
    case 'characters':
      return (
        <>
          <circle className="secondary-surface" cx="8.1" cy="9.3" r="2.45" />
          <circle className="secondary" cx="8.1" cy="9.3" r="2.45" />
          <path className="secondary" d="M4.7 18.4c.6-2.4 1.8-3.6 3.6-3.6 1.2 0 2.3.6 3 1.8" />
          <circle className="accent-surface" cx="15.1" cy="8.5" r="2.9" />
          <circle className="person-step" cx="15.1" cy="8.5" r="2.9" />
          <path className="accent person-step" d="M10.3 18.4c.8-2.9 2.4-4.3 4.8-4.3s4 1.4 4.8 4.3" />
        </>
      );
    case 'moments':
      return (
        <>
          <path className="surface" d="M5 12s2.4-4.6 7-4.6 7 4.6 7 4.6-2.4 4.6-7 4.6S5 12 5 12Z" />
          <path d="M5 12s2.4-4.6 7-4.6 7 4.6 7 4.6-2.4 4.6-7 4.6S5 12 5 12Z" />
          <circle className="accent-surface focus-core" cx="12" cy="12" r="2.45" />
          <circle className="accent focus-core" cx="12" cy="12" r="2.45" />
          <path className="muted" d="M8.5 6.2c.9-.5 2.1-.8 3.5-.8s2.6.3 3.5.8" />
        </>
      );
    case 'market':
      return (
        <>
          <path className="surface" d="M6.4 9.5h11.2l-.8 8.3c-.1.8-.7 1.4-1.5 1.4H8.7c-.8 0-1.4-.6-1.5-1.4Z" />
          <path d="M6.4 9.5h11.2l-.8 8.3c-.1.8-.7 1.4-1.5 1.4H8.7c-.8 0-1.4-.6-1.5-1.4Z" />
          <path className="accent market-handle" d="M9 9.5V8.2c0-1.6 1.3-2.9 3-2.9s3 1.3 3 2.9v1.3" />
          <path className="muted" d="M9.2 13.5h5.6" />
        </>
      );
    case 'calendar':
      return (
        <>
          <rect className="surface" x="5.1" y="6.5" width="13.8" height="12.2" rx="2.2" />
          <rect x="5.1" y="6.5" width="13.8" height="12.2" rx="2.2" />
          <path className="accent" d="M8.3 4.8v3M15.7 4.8v3M5.3 10h13.4" />
          <rect className="accent-surface" x="8.1" y="12.5" width="3.2" height="3.2" rx="0.75" />
          <path className="mark-draw accent" d="M8.8 14.1 9.6 14.9 11 13.4" strokeDasharray="8" strokeDashoffset="8" />
          <path className="muted" d="M13.2 13.1h3.2M13.2 16h2.2" />
        </>
      );
    case 'letters':
      return (
        <>
          <rect className="surface" x="4.9" y="7.1" width="14.2" height="10.6" rx="2" />
          <rect x="4.9" y="7.1" width="14.2" height="10.6" rx="2" />
          <path className="accent letter-flap" d="M8.3 6.2h7.4" />
          <path className="accent letter-flap" d="M5.9 8.6 12 13l6.1-4.4" />
          <path className="muted" d="m5.9 16.7 4.2-3.3M18.1 16.7l-4.2-3.3" />
        </>
      );
    case 'models':
      return (
        <>
          <path className="accent model-flow" d="M8.4 8.4 12 12.1l3.6-3.7M12 12.1v4.8" strokeDasharray="9" strokeDashoffset="9" />
          <circle className="surface" cx="8.4" cy="8.4" r="2.5" />
          <circle cx="8.4" cy="8.4" r="2.5" />
          <circle className="surface" cx="15.6" cy="8.4" r="2.5" />
          <circle cx="15.6" cy="8.4" r="2.5" />
          <circle className="accent-surface core-pulse" cx="12" cy="16.9" r="2.55" />
          <circle className="accent core-pulse" cx="12" cy="16.9" r="2.55" />
          <circle className="muted" cx="12" cy="12.1" r="0.9" />
        </>
      );
    case 'proxy':
      return (
        <>
          <rect className="surface" x="5.2" y="6.4" width="13.6" height="11.2" rx="2.7" />
          <rect x="5.2" y="6.4" width="13.6" height="11.2" rx="2.7" />
          <path className="accent proxy-flow" d="M8 10.2h6.1l-1.5-1.5M16 13.8H9.9l1.5 1.5" strokeDasharray="10" strokeDashoffset="10" />
          <circle className="accent-surface port-pulse" cx="7.7" cy="12" r="1.05" />
          <circle className="accent port-pulse" cx="7.7" cy="12" r="1.05" />
          <circle className="surface" cx="16.3" cy="12" r="1.05" />
          <circle cx="16.3" cy="12" r="1.05" />
        </>
      );
    case 'membership':
      return (
        <>
          <path className="accent-surface crown-lift" d="M5.8 9.9 8.9 6.2l3.1 4 3.1-4 3.1 3.7-1 7H6.8Z" />
          <path className="crown-lift" d="M5.8 9.9 8.9 6.2l3.1 4 3.1-4 3.1 3.7-1 7H6.8Z" />
          <circle className="accent gem-pulse" cx="12" cy="12.7" r="1.15" />
          <path className="accent crown-shine" d="M8.4 18.4h7.2" />
        </>
      );
    case 'settings':
      return (
        <>
          <path className="muted setting-track" d="M5.6 7.3h12.8M5.6 12h12.8M5.6 16.7h12.8" />
          <circle className="accent-surface setting-a" cx="9.1" cy="7.3" r="1.7" />
          <circle className="accent setting-a" cx="9.1" cy="7.3" r="1.7" />
          <circle className="surface setting-b" cx="14.9" cy="12" r="1.7" />
          <circle className="setting-b" cx="14.9" cy="12" r="1.7" />
          <circle className="accent-surface setting-c" cx="11.3" cy="16.7" r="1.7" />
          <circle className="accent setting-c" cx="11.3" cy="16.7" r="1.7" />
        </>
      );
    case 'intro':
      return (
        <>
          <path className="surface" d="M6.2 7.3c0-.9.7-1.6 1.6-1.6h8.4c.9 0 1.6.7 1.6 1.6v9.4c0 .9-.7 1.6-1.6 1.6H7.8c-.9 0-1.6-.7-1.6-1.6Z" />
          <path d="M6.2 7.3c0-.9.7-1.6 1.6-1.6h8.4c.9 0 1.6.7 1.6 1.6v9.4c0 .9-.7 1.6-1.6 1.6H7.8c-.9 0-1.6-.7-1.6-1.6Z" />
          <path className="accent intro-path" d="M8.9 13.5c1.8-3.1 4.1-3.7 6.4-2" strokeDasharray="10" strokeDashoffset="10" />
          <circle className="accent-surface intro-needle" cx="15.3" cy="11.5" r="1.45" />
          <circle className="accent intro-needle" cx="15.3" cy="11.5" r="0.78" />
          <path className="muted" d="M9 8.7h4.7M9 16h3.2" />
        </>
      );
    default:
      return null;
  }
}

export default function AnimatedNavIcon({ kind, active = false, size = 28 }: AnimatedNavIconProps) {
  return (
    <Box
      className={`PneumataNavIcon PneumataNavIcon-${kind}${active ? ' is-active' : ''}`}
      sx={{ ...iconSx, '--nav-icon-size': `${size}px` }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {iconPaths(kind)}
      </svg>
    </Box>
  );
}
