export const STREAMING_DISPLAY_TICK_MS = 33;

const MIN_REVEAL_GRAPHEMES = 2;
const MAX_REVEAL_GRAPHEMES = 8;

function revealStepSize(remaining: number) {
  if (remaining <= MIN_REVEAL_GRAPHEMES) return remaining;
  if (remaining >= 80) return MAX_REVEAL_GRAPHEMES;
  if (remaining >= 32) return 6;
  if (remaining >= 12) return 4;
  return MIN_REVEAL_GRAPHEMES;
}

export function getNextStreamingDisplayContent(displayContent: string, targetContent: string) {
  if (!targetContent || displayContent === targetContent) return targetContent;
  if (!displayContent) {
    const targetChars = Array.from(targetContent);
    return targetChars.slice(0, revealStepSize(targetChars.length)).join('');
  }
  if (!targetContent.startsWith(displayContent)) return targetContent;
  const displayChars = Array.from(displayContent);
  const targetChars = Array.from(targetContent);
  const remaining = targetChars.length - displayChars.length;
  if (remaining <= 0) return targetContent;
  return targetChars.slice(0, displayChars.length + revealStepSize(remaining)).join('');
}
