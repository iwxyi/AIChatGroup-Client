import { useEffect, useRef } from 'react';
import type { GroupChat } from '../types/chat';

const AUTO_SOCIAL_EVENT_KINDS = new Set([
  'pair_private_thread',
  'post_moment',
  'status_update',
  'check_in',
  'react_to_moment',
  'social_outing',
  'gift_exchange',
  'conflict_expression',
]);

const PENDING_AUTO_SOCIAL_DELAY_MS = 8_000;
const WORLD_SOCIAL_TICK_MIN_IDLE_MS = 2 * 60 * 60_000;
const WORLD_SOCIAL_TICK_READY_DELAY_MS = 12_000;

interface UseChatAutoSocialFlowParams {
  chat: GroupChat | undefined;
  runAutoSocialEventFlow: (chat: GroupChat) => Promise<unknown>;
}

function hasHandledSocialEventMarker(chat: GroupChat, eventId: string) {
  return (chat.runtimeEventsV2 || []).some((event) => (
    event.kind === 'artifact'
    && event.summary === `handled_social_event:${eventId}`
  ));
}

export function hasPendingAutoSocialEventCandidate(chat: GroupChat) {
  return (chat.runtimeEventsV2 || []).some((event) => {
    if (event.kind !== 'event_candidate' || !event.id || hasHandledSocialEventMarker(chat, event.id)) return false;
    const eventKind = (event.payload as { eventKind?: unknown } | null | undefined)?.eventKind;
    return typeof eventKind === 'string' && AUTO_SOCIAL_EVENT_KINDS.has(eventKind);
  });
}

export function getAutoSocialFlowDelayMs(chat: GroupChat, now = Date.now()) {
  if (hasPendingAutoSocialEventCandidate(chat)) return PENDING_AUTO_SOCIAL_DELAY_MS;
  const updatedAt = typeof chat.updatedAt === 'number' ? chat.updatedAt : now;
  const idleMs = Math.max(0, now - updatedAt);
  if (idleMs >= WORLD_SOCIAL_TICK_MIN_IDLE_MS) return WORLD_SOCIAL_TICK_READY_DELAY_MS;
  return WORLD_SOCIAL_TICK_MIN_IDLE_MS - idleMs;
}

export function useChatAutoSocialFlow(params: UseChatAutoSocialFlowParams) {
  const lastAutoThreadCandidateIdRef = useRef<string | null>(null);

  useEffect(() => {
    const chat = params.chat;
    if (!chat || chat.type !== 'group') return;
    if (!chat.isActive) return;
    const delayMs = getAutoSocialFlowDelayMs(chat);
    const latestEventId = chat.runtimeEventsV2?.at(-1)?.id || null;
    const autoFlowKey = `${chat.id}:${chat.updatedAt}:${latestEventId}:${delayMs <= WORLD_SOCIAL_TICK_READY_DELAY_MS ? 'world-ready' : 'scheduled'}`;
    if (lastAutoThreadCandidateIdRef.current === autoFlowKey) return;
    lastAutoThreadCandidateIdRef.current = autoFlowKey;
    let cancelled = false;
    let idleHandle: number | null = null;
    const run = () => {
      if (cancelled) return;
      void params.runAutoSocialEventFlow(chat);
    };
    const handle = window.setTimeout(() => {
      const scheduler = (window as typeof window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      }).requestIdleCallback;
      if (typeof scheduler === 'function') {
        idleHandle = scheduler(run, { timeout: 4000 });
        return;
      }
      run();
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
    };
  }, [params.chat, params.runAutoSocialEventFlow]);
}
