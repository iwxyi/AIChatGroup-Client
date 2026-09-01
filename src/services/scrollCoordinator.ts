export type ScrollIntentKind = 'userScroll' | 'explicitJump' | 'initialRestore' | 'prependPreserve' | 'appendPreserve' | 'tailFollow' | 'resizePreserve';

export const SCROLL_INTENT_PRIORITY: Record<ScrollIntentKind, number> = {
  userScroll: 100,
  explicitJump: 90,
  initialRestore: 80,
  prependPreserve: 70,
  appendPreserve: 70,
  tailFollow: 50,
  resizePreserve: 40,
};

export interface ScrollWriteContext {
  intent: ScrollIntentKind;
  startedAt: number;
  priority: number;
}

export interface ScrollTransaction {
  id: string;
  intent: ScrollIntentKind;
  startedAt: number;
}

export function shouldBlockScrollWrite(params: {
  intent: ScrollIntentKind;
  now: number;
  active: ScrollWriteContext | null;
  userMomentum: boolean;
  allowDuringUserScroll?: boolean;
  settleMs: number;
  transaction?: ScrollTransaction | null;
}) {
  const priority = SCROLL_INTENT_PRIORITY[params.intent];
  if (params.transaction && params.transaction.intent !== params.intent
    && priority < SCROLL_INTENT_PRIORITY[params.transaction.intent]) {
    return 'transaction-active' as const;
  }
  if (!params.allowDuringUserScroll && params.userMomentum && priority < SCROLL_INTENT_PRIORITY.explicitJump) return 'user-scroll-active' as const;
  if (params.active && params.active.priority > priority && params.now - params.active.startedAt <= params.settleMs && !(params.active.intent === 'userScroll' && params.allowDuringUserScroll)) return 'higher-priority-active' as const;
  return null;
}
