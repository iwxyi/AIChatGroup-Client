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
  if (params.sessionKind?.scenarioId === 'story-reader' && (params.explicitContinuationPending || params.restoringReaderPosition)) {
    return {
      autoStickToBottom: false,
      autoContinueFromTail: false,
    };
  }

  return {
    autoStickToBottom: true,
    autoContinueFromTail: true,
  };
}
