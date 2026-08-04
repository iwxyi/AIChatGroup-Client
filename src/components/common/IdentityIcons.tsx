import { useId, useMemo, type CSSProperties } from 'react';
import { alpha, useTheme } from '@mui/material/styles';

interface IdentityIconProps {
  title?: string;
}

interface AvatarSmokePath {
  d: string;
  from: number;
  to: number;
}

type AvatarSmokeStyle = CSSProperties & {
  '--smoke-from': number;
  '--smoke-to': number;
};

const DEFAULT_USER_AVATAR_SMOKE_PATHS: AvatarSmokePath[] = [
  { d: 'M23.7 31.2c-2.6-2.3-1-4.7 1.2-6.8 2.8-2.6 2.1-5.2-.2-7.7', from: 18, to: -34 },
  { d: 'M31.6 30.4c-3.5-3.5 1.5-6.1 1.6-10.2.1-2.4-1.2-4.3-2.9-5.8', from: 5, to: -47 },
  { d: 'M39.8 29.1c3.1-3.1.8-5.3-.8-7.5-1.9-2.6-.5-5 1.8-7.2', from: 13, to: -39 },
  { d: 'M25.4 30.8c-3-2.7.2-5.1 1.1-7.7.7-2-.4-3.9-2.4-5.6', from: 21, to: -31 },
  { d: 'M30.1 31.1c-2.1-3.2 2.9-5.4 2.6-9.2-.2-2.1-2-3.4-3.4-5.1', from: 9, to: -42 },
  { d: 'M37.3 30.6c2.7-2.6-1.4-5.1-.6-8.4.5-2.1 2.3-3.5 3.4-5.3', from: 16, to: -36 },
  { d: 'M22.3 29.7c-1.8-2.5 1.7-4 2.4-6.6.6-2.3-1.2-4.3-2.7-5.9', from: 11, to: -41 },
  { d: 'M28.8 29.4c-3.1-2.8.7-5.6 1.1-8.3.3-2-.9-3.8-2.7-5.4', from: 24, to: -28 },
  { d: 'M34.4 30.9c-2.7-3.5 2.5-5.5 2.3-9.3-.1-2.3-1.7-4-3.2-5.6', from: 7, to: -45 },
  { d: 'M41.2 29.6c2.2-2.6-1.5-4.7-1.4-7.8.1-2.3 1.8-4 3.6-5.7', from: 19, to: -33 },
  { d: 'M24.8 32c-3.4-2.2.5-4.9 1.7-7.1 1.3-2.4.4-4.7-1.8-6.6', from: 14, to: -38 },
  { d: 'M32.8 30.7c-3.9-3.1 1.8-5.7 1.3-9.6-.3-2.4-2.3-3.7-3.9-5.1', from: 3, to: -49 },
  { d: 'M38.6 31c3-2.4-.7-5.4-1.4-7.6-.8-2.5.9-4.6 3-6.3', from: 22, to: -32 },
  { d: 'M27.2 30.1c-2.5-3.1 2.4-5 2.2-8.5-.1-2.2-1.9-3.8-3.8-5.2', from: 6, to: -44 },
];

function pickDefaultUserAvatarSmokePaths() {
  const paths = [...DEFAULT_USER_AVATAR_SMOKE_PATHS];
  for (let index = paths.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [paths[index], paths[swapIndex]] = [paths[swapIndex], paths[index]];
  }
  return paths.slice(0, 3);
}

export function AppMarkIcon({ title = 'Sense Murmur' }: IdentityIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label={title}>
      <defs>
        <linearGradient id="app-mark-bg" x1="9" y1="7" x2="58" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B6BFF" />
          <stop offset="0.48" stopColor="#596DFF" />
          <stop offset="1" stopColor="#35BED0" />
        </linearGradient>
        <linearGradient id="app-mark-thread" x1="17" y1="18" x2="47" y2="49" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D5FAFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#app-mark-bg)" />
      <path d="M18 24c5.7-7.4 17.2-8.6 25.2-2.8 5.2 3.8 4.5 10.2-1.7 12.2l-17.1 5.4c-6.4 2-7.1 8.6-1.6 12.3 7.4 5 18.1 3.4 23.2-3.5" fill="none" stroke="url(#app-mark-thread)" strokeWidth="5.2" strokeLinecap="round" />
      <path d="M20.2 30.6c6.2-3.1 14.7-3.1 21 0M22.8 36.2c4.6-2.1 11.2-2.1 15.8 0" fill="none" stroke="#121225" strokeOpacity="0.22" strokeWidth="3.8" strokeLinecap="round" />
      <circle cx="19" cy="24" r="4.2" fill="#FAF8FF" />
      <circle cx="45" cy="47" r="4.2" fill="#FAF8FF" />
      <circle cx="32" cy="34" r="3.5" fill="#FFC76D" />
    </svg>
  );
}

export function DefaultUserAvatarIcon({ title = 'User' }: IdentityIconProps) {
  const theme = useTheme();
  const id = useId().replace(/:/g, '');
  const smokePaths = useMemo(() => pickDefaultUserAvatarSmokePaths(), []);
  const dark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const paper = theme.palette.background.paper;
  const text = theme.palette.text.primary;
  const bgGradientId = `user-avatar-bg-${id}`;
  const cupGradientId = `user-avatar-cup-${id}`;
  const smokeGradientId = `user-avatar-smoke-${id}`;
  const portraitGradientId = `user-avatar-portrait-${id}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label={title} width="100%" height="100%">
      <defs>
        <style>
          {`
            .default-user-avatar__saucer {
              transition: transform 220ms ease;
              transform-box: fill-box;
              transform-origin: center;
            }

            .default-user-avatar__portrait {
              transition: opacity 180ms ease;
              transform-box: fill-box;
              transform-origin: center bottom;
            }

            .default-user-avatar__smoke {
              opacity: 0.44;
              stroke-dasharray: 7 22;
              stroke-dashoffset: var(--smoke-from);
              transition: opacity 180ms ease, stroke-width 180ms ease;
              transform-box: fill-box;
              transform-origin: center bottom;
              --smoke-from: 18;
              --smoke-to: -34;
            }

            .default-user-avatar__smoke--middle {
              opacity: 0.56;
              stroke-dasharray: 9 24;
              --smoke-from: 5;
              --smoke-to: -47;
            }

            .default-user-avatar__smoke--right {
              opacity: 0.36;
              stroke-dasharray: 6 23;
              --smoke-from: 13;
              --smoke-to: -39;
            }

            .default-user-avatar__tea-surface {
              stroke-dasharray: 15 9;
              stroke-dashoffset: 0;
              transition: opacity 180ms ease, stroke-width 180ms ease;
            }

            svg:hover .default-user-avatar__saucer {
              transform: scaleX(1.09);
            }

            svg:hover .default-user-avatar__portrait {
              animation: default-user-avatar-portrait-drift 8.6s linear infinite;
              opacity: 0.96;
            }

            svg:hover .default-user-avatar__smoke {
              animation: default-user-avatar-smoke-flow 3.2s linear infinite, default-user-avatar-smoke-sway 5.4s ease-in-out infinite, default-user-avatar-smoke-breathe 4.2s ease-in-out infinite;
              opacity: 0.86;
              stroke-width: 2.1px;
            }

            svg:hover .default-user-avatar__smoke--middle {
              animation-duration: 3.7s, 5.9s, 4.7s;
              animation-delay: 0s, -1.2s, -1.7s;
              stroke-width: 2.2px;
            }

            svg:hover .default-user-avatar__smoke--right {
              animation-duration: 3.4s, 5.1s, 3.9s;
              animation-delay: 0s, -2.2s, -0.8s;
              stroke-width: 2px;
            }

            svg:hover .default-user-avatar__tea-surface {
              animation: default-user-avatar-tea-surface 2.8s linear infinite;
              opacity: 0.78;
              stroke-width: 1.9px;
            }

            @keyframes default-user-avatar-smoke-flow {
              0% {
                stroke-dashoffset: var(--smoke-from);
              }
              100% {
                stroke-dashoffset: var(--smoke-to);
              }
            }

            @keyframes default-user-avatar-smoke-sway {
              0%, 100% {
                transform: translateX(-0.3px) translateY(0.1px) scaleY(0.98);
              }
              45% {
                transform: translateX(0.9px) translateY(-0.5px) scaleY(1.04);
              }
              72% {
                transform: translateX(-0.1px) translateY(-0.2px) scaleY(1.01);
              }
            }

            @keyframes default-user-avatar-smoke-breathe {
              0%, 100% {
                opacity: 0.24;
              }
              18% {
                opacity: 0.82;
              }
              52% {
                opacity: 0.5;
              }
              76% {
                opacity: 0.7;
              }
            }

            @keyframes default-user-avatar-portrait-drift {
              0% {
                transform: translateX(0) translateY(0) rotate(-1.1deg);
              }
              12% {
                transform: translateX(0.25px) translateY(-0.55px) rotate(-0.24deg);
              }
              25% {
                transform: translateX(0.45px) translateY(-1.15px) rotate(0.92deg);
              }
              38% {
                transform: translateX(0.2px) translateY(-0.7px) rotate(1.14deg);
              }
              50% {
                transform: translateX(-0.15px) translateY(0.05px) rotate(0.68deg);
              }
              63% {
                transform: translateX(-0.45px) translateY(0.75px) rotate(-0.2deg);
              }
              76% {
                transform: translateX(-0.28px) translateY(1.05px) rotate(-0.94deg);
              }
              88% {
                transform: translateX(-0.08px) translateY(0.42px) rotate(-1.18deg);
              }
              100% {
                transform: translateX(0) translateY(0) rotate(-1.1deg);
              }
            }

            @keyframes default-user-avatar-tea-surface {
              0% {
                stroke-dashoffset: 0;
              }
              100% {
                stroke-dashoffset: -24;
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .default-user-avatar__portrait,
              .default-user-avatar__saucer,
              .default-user-avatar__smoke,
              .default-user-avatar__tea-surface {
                animation: none;
                transition: none;
              }
            }
          `}
        </style>
        <linearGradient id={bgGradientId} x1="12" y1="7" x2="51" y2="57" gradientUnits="userSpaceOnUse">
          <stop stopColor={dark ? alpha(primary, 0.24) : alpha(primary, 0.09)} />
          <stop offset="1" stopColor={dark ? alpha('#050610', 0.92) : alpha(secondary, 0.08)} />
        </linearGradient>
        <linearGradient id={cupGradientId} x1="17" y1="32" x2="47" y2="53" gradientUnits="userSpaceOnUse">
          <stop stopColor={dark ? alpha(paper, 0.96) : '#FFFFFF'} />
          <stop offset="1" stopColor={dark ? alpha(paper, 0.72) : alpha(paper, 0.92)} />
        </linearGradient>
        <linearGradient id={smokeGradientId} x1="22" y1="10" x2="43" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor={alpha(primary, dark ? 0.76 : 0.52)} />
          <stop offset="1" stopColor={alpha(secondary, dark ? 0.62 : 0.42)} />
        </linearGradient>
        <linearGradient id={portraitGradientId} x1="24" y1="14" x2="42" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor={dark ? alpha('#FFFFFF', 0.96) : '#FFFFFF'} />
          <stop offset="1" stopColor={dark ? alpha(paper, 0.74) : alpha(paper, 0.96)} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#${bgGradientId})`} />
      <circle cx="32" cy="32" r="29.5" fill="none" stroke={alpha(text, dark ? 0.14 : 0.08)} />
      <g fill="none" stroke={`url(#${smokeGradientId})`} strokeWidth="1.7" strokeLinecap="round">
        <path
          className="default-user-avatar__smoke"
          d={smokePaths[0].d}
          style={{ '--smoke-from': smokePaths[0].from, '--smoke-to': smokePaths[0].to } as AvatarSmokeStyle}
        />
      </g>
      <path
        className="default-user-avatar__portrait"
        d="M27.7 20.8c5.8-4.6 14.8-.6 14.8 7.5 0 6-4.3 10.5-9.7 10.5-2.3 0-4.5-.8-6.2-2.1 3.8-.7 6.3-3.4 6.4-7.2.1-3.3-1.8-6.3-5.3-8.7Z"
        fill={`url(#${portraitGradientId})`}
        opacity={dark ? 0.84 : 0.88}
      />
      <g fill="none" stroke={`url(#${smokeGradientId})`} strokeWidth="1.8" strokeLinecap="round">
        <path
          className="default-user-avatar__smoke default-user-avatar__smoke--middle"
          d={smokePaths[1].d}
          style={{ '--smoke-from': smokePaths[1].from, '--smoke-to': smokePaths[1].to } as AvatarSmokeStyle}
        />
        <path
          className="default-user-avatar__smoke default-user-avatar__smoke--right"
          d={smokePaths[2].d}
          style={{ '--smoke-from': smokePaths[2].from, '--smoke-to': smokePaths[2].to } as AvatarSmokeStyle}
        />
      </g>
      <g className="default-user-avatar__cup">
        <path
          d="M17.8 37.5h28.4c-.5 7.5-5.5 12.9-14.2 12.9s-13.7-5.4-14.2-12.9Z"
          fill={`url(#${cupGradientId})`}
          stroke={alpha(text, dark ? 0.2 : 0.12)}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M46.2 39.2h2.2c3 0 4.9 1.6 4.9 4s-2 4.1-5.2 4.1h-3" fill="none" stroke={alpha(text, dark ? 0.34 : 0.2)} strokeWidth="1.8" strokeLinecap="round" />
        <path className="default-user-avatar__tea-surface" d="M22.1 42.1c2.2-1.4 4.2.9 6.6-.1 2.2-.9 4.2-.9 6.4 0 2.4 1 4.5-1.3 6.8.1" fill="none" stroke={alpha(primary, dark ? 0.42 : 0.28)} strokeWidth="1.7" strokeLinecap="round" />
      </g>
      <path className="default-user-avatar__saucer" d="M20.4 53.3h23.2" fill="none" stroke={alpha(text, dark ? 0.22 : 0.13)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function TopicGuideAvatarIcon({ title = 'Topic guide' }: IdentityIconProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const accent = theme.palette.warning.main;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label={title} width="100%" height="100%">
      <rect width="64" height="64" rx="32" fill={dark ? alpha(secondary, 0.28) : alpha(secondary, 0.13)} />
      <path d="M17 25.5c8.7 0 12 12.9 20.8 12.9 4.2 0 7.3-2.2 10.2-6.5" fill="none" stroke={alpha(primary, dark ? 0.82 : 0.68)} strokeWidth="5.2" strokeLinecap="round" />
      <path d="M17 38.5c6.8 0 10.1-4.1 15.5-10.4 4.2-4.9 8.8-5.9 16.5 3.7" fill="none" stroke={alpha(accent, dark ? 0.9 : 0.82)} strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="17" cy="25.5" r="4.6" fill={primary} />
      <circle cx="17" cy="38.5" r="4.2" fill={secondary} />
      <circle cx="49" cy="31.8" r="7.2" fill={accent} />
      <circle cx="49" cy="31.8" r="2.7" fill={dark ? '#121225' : '#fffdf8'} />
    </svg>
  );
}
