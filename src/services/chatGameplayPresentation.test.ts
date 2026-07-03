import { describe, expect, it } from 'vitest';
import { normalizeConversation } from '../types/chat';
import { getChatGameplayShortLabel } from './chatGameplayPresentation';

function baseChat(overrides: Partial<Parameters<typeof normalizeConversation>[0]>) {
  return normalizeConversation({
    id: 'chat-gameplay-label',
    type: 'group',
    mode: 'open_chat',
    modeConfig: { freeSpeaking: true, allowInterruptions: true, allowPrivateThreads: true, allowDirectorInterventions: true, showRoleActions: true },
    modeState: { phase: 'free', currentSpeakerId: null, currentTopicFocus: '', lastRelationshipEventAt: null },
    name: '测试群聊',
    topic: '测试',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: ['char-a', 'char-b'],
    speed: 1,
    isActive: true,
    allowIntervention: true,
    topicSeed: '',
    governance: { ownerCharacterId: null, adminCharacterIds: [], autoModeration: false, allowMute: true, allowPrivateThreads: true },
    dramaRules: { allowCliques: false, allowMockery: false, allowAlliances: true, allowContempt: false },
    worldState: { phase: 'idle', mood: '', focus: '', recentEvent: '', conflictAxes: [] },
    directorControls: { allowSpeakAs: true, allowDirectorMode: true, allowEventInjection: true, allowForcedReply: true },
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
    ...overrides,
  });
}

describe('getChatGameplayShortLabel', () => {
  it('hides the label for ordinary open chats', () => {
    expect(getChatGameplayShortLabel(baseChat({ mode: 'open_chat' }))).toBeNull();
  });

  it('repairs legacy empty sessionKind discussion rooms to the deliberation label', () => {
    expect(getChatGameplayShortLabel(baseChat({ mode: 'group_discussion', sessionKind: {} as never }))).toBe('审议');
  });

  it('uses scenario labels for non-ordinary rooms', () => {
    expect(getChatGameplayShortLabel(baseChat({
      mode: 'scripted_play',
      sessionKind: { topology: 'group', family: 'conversation', scenarioId: 'story-reader', surfaceProfile: 'hybrid' },
    }))).toBe('故事');
    expect(getChatGameplayShortLabel(baseChat({
      mode: 'werewolf',
      sessionKind: { topology: 'table', family: 'deduction', scenarioId: 'werewolf-classic', surfaceProfile: 'hybrid' },
    }))).toBe('狼人杀');
  });
});
