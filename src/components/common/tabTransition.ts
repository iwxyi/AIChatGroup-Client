export function resolveTabTransitionDirection(
  order: readonly (string | number)[],
  currentValue: string | number,
  nextValue: string | number,
): -1 | 1 {
  const currentIndex = order.indexOf(currentValue);
  const nextIndex = order.indexOf(nextValue);
  if (currentIndex < 0 || nextIndex < 0) return 1;
  return nextIndex >= currentIndex ? 1 : -1;
}
