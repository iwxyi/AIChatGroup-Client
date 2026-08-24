import { describe, expect, it } from 'vitest';
import { getPromptAdapter } from './promptContextAssembler';
import { studyPromptAdapter } from './enginePromptAdapters/studyPromptAdapter';
import { interviewPromptAdapter } from './enginePromptAdapters/interviewPromptAdapter';

describe('promptContextAssembler', () => {
  it('registers adapters by scenarioId aliases', () => {
    expect(getPromptAdapter('open-chat')).toBeTruthy();
    expect(getPromptAdapter('direct-chat')).toBeTruthy();
    expect(getPromptAdapter('ai-private-thread')).toBeTruthy();
    expect(getPromptAdapter('panel-interview')).toBeTruthy();
    expect(getPromptAdapter('learning-progress')).toBe(studyPromptAdapter);
    expect(getPromptAdapter('panel-interview')).toBe(interviewPromptAdapter);
    expect(getPromptAdapter('werewolf-classic')).toBeTruthy();
  });
});
