import type { SessionKind } from '../types/chat';

export interface SessionScrollCapabilityInput {
  sessionKind?: Pick<SessionKind, 'scenarioId' | 'family' | 'surfaceProfile'> | null;
  explicitContinuationPending?: boolean;
  restoringReaderPosition?: boolean;
}

export interface SessionScrollCapabilities {
  autoStickToBottom: boolean;
  autoContinueFromTail: boolean;
}

export function resolveSessionScrollCapabilities(params: SessionScrollCapabilityInput): SessionScrollCapabilities {
  if (params.sessionKind?.scenarioId === 'story-reader') {
    return {
      autoStickToBottom: false,
      // Story generation may continue when the reader is at the tail, but
      // appending new chapters must never move the reader's viewport.
      autoContinueFromTail: !(params.explicitContinuationPending || params.restoringReaderPosition),
    };
  }

  return {
    autoStickToBottom: true,
    autoContinueFromTail: true,
  };
}
