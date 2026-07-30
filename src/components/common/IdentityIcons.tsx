import { alpha, useTheme } from '@mui/material/styles';

interface IdentityIconProps {
  title?: string;
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
  const dark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const paper = theme.palette.background.paper;
  const text = theme.palette.text.primary;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label={title} width="100%" height="100%">
      <rect width="64" height="64" rx="32" fill={dark ? alpha(primary, 0.24) : alpha(primary, 0.12)} />
      <path d="M20 49.5c2.6-8.3 8.2-12.6 12-12.6s9.4 4.3 12 12.6" fill={alpha(paper, dark ? 0.9 : 0.98)} />
      <circle cx="32" cy="26" r="9.3" fill={alpha(paper, dark ? 0.92 : 1)} />
      <path d="M20 49.5c2.6-8.3 8.2-12.6 12-12.6s9.4 4.3 12 12.6" fill="none" stroke={alpha(text, dark ? 0.48 : 0.22)} strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="32" cy="26" r="6.2" fill={alpha(primary, dark ? 0.78 : 0.66)} />
      <path d="M45.6 24.3c1.3 2.2 2 4.8 2 7.7s-.7 5.5-2 7.7M49.8 20c2.2 3.3 3.4 7.4 3.4 12s-1.2 8.7-3.4 12M18.4 39.7c-1.3-2.2-2-4.8-2-7.7s.7-5.5 2-7.7M14.2 44c-2.2-3.3-3.4-7.4-3.4-12s1.2-8.7 3.4-12" fill="none" stroke={alpha(secondary, dark ? 0.68 : 0.52)} strokeWidth="2.8" strokeLinecap="round" />
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
