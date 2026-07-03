import { describe, expect, it } from 'vitest';
import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import { applyAnalysisRunPolicy, buildAnalysisRunPolicyEvent, type SessionLoopDecision } from './analysisRunPolicy';

const blockedDecision: SessionLoopDecision = { canRun: false, runChat: false, runAction: false, actionFirst: false };
const allowedDecision: SessionLoopDecision = { canRun: true, runChat: true, runAction: false, actionFirst: false };

function buildAnalysisChat(overrides: Partial<GroupChat> = {}): GroupChat {
  return {
    id: 'chat-1',
    type: 'group',
    mode: 'group_discussion',
    sessionKind: { topology: 'group', family: 'analysis', scenarioId: 'opinion-review', surfaceProfile: 'text' },
    modeConfig: {},
    modeState: { phase: 'free', currentSpeakerId: null, currentTopicFocus: '', lastRelationshipEventAt: null },
    name: '观点审议',
    topic: '合租是否可行',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: ['a', 'b'],
    speed: 1,
    isActive: true,
    allowIntervention: true,
    topicSeed: '',
    governance: { ownerCharacterId: null, adminCharacterIds: [], autoModeration: false, allowMute: true, allowPrivateThreads: true },
    dramaRules: { allowCliques: false, allowMockery: false, allowAlliances: false, allowContempt: false },
    worldState: { phase: 'debating', mood: '', focus: '', recentEvent: '', conflictAxes: [] },
    directorControls: { allowSpeakAs: true, allowDirectorMode: true, allowEventInjection: true, allowForcedReply: true },
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
    ...overrides,
  } as GroupChat;
}

function aiMessage(metadata?: Message['metadata']): Message {
  return {
    id: 'm1',
    chatId: 'chat-1',
    type: 'ai',
    senderId: 'a',
    senderName: '甲',
    content: '上一条',
    emotion: 0,
    timestamp: 1,
    isDeleted: false,
    metadata,
  };
}

describe('applyAnalysisRunPolicy', () => {
  it('allows the first manual analysis activation even when the latest AI has no artifacts', () => {
    const result = applyAnalysisRunPolicy({
      chat: buildAnalysisChat(),
      messages: [aiMessage()],
      iterationCount: 1,
      rawDecision: blockedDecision,
    });

    expect(result.decision).toEqual(allowedDecision);
    expect(result.trace).toMatchObject({
      applies: true,
      manualActivation: true,
      structuralContinuation: false,
      reason: 'manual_activation',
    });
  });

  it('continues after an AI artifact turn while no verdict or summary has landed', () => {
    const result = applyAnalysisRunPolicy({
      chat: buildAnalysisChat(),
      messages: [aiMessage({
        deliberationArtifacts: {
          issues: [{ text: '付费意愿缺证据', reason: '仍需追问', confidence: 0.8 }],
        },
      })],
      iterationCount: 2,
      rawDecision: blockedDecision,
    });

    expect(result.decision).toEqual(allowedDecision);
    expect(result.trace).toMatchObject({
      structuralContinuation: true,
      latestHasArtifacts: true,
      latestHasLanding: false,
      reason: 'structural_continuation',
    });
  });

  it('continues after a verdict lands because only the user should stop analysis runs', () => {
    const result = applyAnalysisRunPolicy({
      chat: buildAnalysisChat(),
      messages: [aiMessage({
        deliberationArtifacts: {
          verdicts: [{ text: '低耦合公共空间更可行', tendency: 'mixed', reason: '阶段判断', confidence: 0.78 }],
        },
      })],
      iterationCount: 2,
      rawDecision: blockedDecision,
    });

    expect(result.decision).toEqual(allowedDecision);
    expect(result.trace).toMatchObject({
      structuralContinuation: true,
      latestHasArtifacts: true,
      latestHasLanding: true,
      reason: 'structural_continuation',
    });
    expect(buildAnalysisRunPolicyEvent(result.trace)).toBeNull();
  });

  it('continues after a non-landing AI turn without structural artifacts', () => {
    const result = applyAnalysisRunPolicy({
      chat: buildAnalysisChat(),
      messages: [aiMessage()],
      iterationCount: 2,
      rawDecision: blockedDecision,
    });

    expect(result.decision).toEqual(allowedDecision);
    expect(result.trace).toMatchObject({
      structuralContinuation: true,
      latestHasArtifacts: false,
      latestHasLanding: false,
      reason: 'structural_continuation',
    });
    expect(buildAnalysisRunPolicyEvent(result.trace)).toBeNull();
  });

  it('does not override non-analysis rooms or already runnable decisions', () => {
    const conversationResult = applyAnalysisRunPolicy({
      chat: buildAnalysisChat({ sessionKind: { topology: 'group', family: 'conversation', scenarioId: 'open-chat', surfaceProfile: 'text' } }),
      messages: [aiMessage()],
      iterationCount: 1,
      rawDecision: blockedDecision,
    });
    const alreadyRunnableResult = applyAnalysisRunPolicy({
      chat: buildAnalysisChat(),
      messages: [aiMessage()],
      iterationCount: 1,
      rawDecision: allowedDecision,
    });

    expect(conversationResult.decision).toEqual(blockedDecision);
    expect(conversationResult.trace.reason).toBe('not_analysis');
    expect(alreadyRunnableResult.decision).toEqual(allowedDecision);
    expect(alreadyRunnableResult.trace.reason).toBe('raw_allows_run');
  });
});
