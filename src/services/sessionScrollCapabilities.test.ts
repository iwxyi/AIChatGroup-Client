import { describe, expect, it } from 'vitest';
import { resolveSessionScrollCapabilities } from './sessionScrollCapabilities';

describe('sessionScrollCapabilities', () => {
  it('keeps chat-like rooms sticky to the latest tail by default', () => {
    expect(resolveSessionScrollCapabilities({
      sessionKind: { family: 'conversation', scenarioId: 'open-chat', surfaceProfile: 'text' },
    })).toEqual({
      autoStickToBottom: true,
      autoContinueFromTail: true,
    });
  });

  it('never sticks a story-reader viewport to newly appended chapters', () => {
    expect(resolveSessionScrollCapabilities({
      sessionKind: { family: 'conversation', scenarioId: 'story-reader', surfaceProfile: 'hybrid' },
      explicitContinuationPending: true,
    })).toEqual({
      autoStickToBottom: false,
      autoContinueFromTail: false,
    });
  });

  it('keeps story generation available when no continuation is suspended', () => {
    expect(resolveSessionScrollCapabilities({
      sessionKind: { family: 'conversation', scenarioId: 'story-reader', surfaceProfile: 'hybrid' },
      restoringReaderPosition: false,
    })).toEqual({
      autoStickToBottom: false,
      autoContinueFromTail: true,
    });
  });

  it('does not make story-reader view sticky after continuation resumes', () => {
    expect(resolveSessionScrollCapabilities({
      sessionKind: { family: 'conversation', scenarioId: 'story-reader', surfaceProfile: 'hybrid' },
      explicitContinuationPending: false,
    })).toEqual({
      autoStickToBottom: false,
      autoContinueFromTail: true,
    });
  });
});
