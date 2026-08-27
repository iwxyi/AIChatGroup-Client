/**
 * Shared avatar feedback for cards that open or edit an entity.
 *
 * Motion is intentionally removed when the operating system requests reduced
 * motion; the card's normal hover/focus colour state remains as the cue.
 */
export function buildCardAvatarHoverMotionSx(avatarSelector: string) {
  const activeSelector = `&:is(:hover, :focus-within) ${avatarSelector}`;
  return {
    [`& ${avatarSelector}`]: {
      transform: 'translateY(0) scale(1) rotate(0deg)',
      transformOrigin: '50% 58%',
      transition: 'transform 520ms cubic-bezier(0.16, 1, 0.3, 1), filter 520ms cubic-bezier(0.16, 1, 0.3, 1)',
      willChange: 'transform',
    },
    [activeSelector]: {
      transform: 'translateY(-2px) scale(1.065) rotate(1.8deg)',
      filter: 'saturate(1.06) drop-shadow(0 5px 8px rgba(15,23,42,0.18))',
    },
    '@media (prefers-reduced-motion: reduce)': buildCardAvatarReducedMotionSx(avatarSelector),
  };
}

export function buildCardAvatarReducedMotionSx(avatarSelector: string) {
  const activeSelector = `&:is(:hover, :focus-within) ${avatarSelector}`;
  return {
    [`& ${avatarSelector}`]: {
      transition: 'none !important',
      willChange: 'auto',
    },
    [activeSelector]: {
      transform: 'none !important',
      filter: 'none !important',
    },
  };
}

export function buildAvatarDirectHoverSx() {
  return {
    transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 420ms cubic-bezier(0.16, 1, 0.3, 1)',
    '@media (hover: hover)': {
      '&:hover': {
        transform: 'translateY(-2px) scale(1.1)',
        boxShadow: '0 5px 12px rgba(15,23,42,0.2)',
      },
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none !important',
      '&:hover': { transform: 'none !important', boxShadow: 'none !important' },
    },
  };
}
