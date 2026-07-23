import { describe, expect, it } from 'vitest';
import { DEFAULT_CONVERSATION_DIRECTOR_CONTROLS, DEFAULT_CONVERSATION_DRAMA_RULES, DEFAULT_CONVERSATION_GOVERNANCE, DEFAULT_CONVERSATION_WORLD_STATE, type GroupChat } from '../types/chat';
import { migrateCharacterStoreState, migrateChatStoreState, migrateSettingsStoreState, migrateUiStoreState } from './storeMigrations';

function chatWithCohesion(cohesion: number): GroupChat {
  return {
    id: 'chat-1',
    type: 'group',
    mode: 'open_chat',
    modeConfig: { freeSpeaking: true, allowInterruptions: true, allowPrivateThreads: true, allowDirectorInterventions: true, showRoleActions: true },
    modeState: { phase: 'free' },
    name: '群聊',
    topic: '',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: [],
    speed: 1,
    isActive: true,
    allowIntervention: true,
    topicSeed: '',
    sourceChatId: null,
    sourceMemberIds: [],
    runtimeTimeline: [],
    runtimeEventsV2: [],
    relationshipLedger: [],
    governance: DEFAULT_CONVERSATION_GOVERNANCE,
    dramaRules: DEFAULT_CONVERSATION_DRAMA_RULES,
    worldState: {
      ...DEFAULT_CONVERSATION_WORLD_STATE,
      structuredRoomState: {
        heat: 20,
        cohesion,
        topicDrift: 0,
        dominantThread: null,
        alliances: [],
        conflictPairs: [],
        pileOnTarget: null,
        silencedActors: [],
      },
    },
    directorControls: DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
  };
}

describe('storeMigrations', () => {
  it('migrates old room cohesion from 50-centered scale to signed scale', () => {
    const migrated = migrateChatStoreState({ chats: [chatWithCohesion(50), chatWithCohesion(64), chatWithCohesion(42)] });

    expect(migrated?.chats?.[0]?.worldState.structuredRoomState?.cohesion).toBe(0);
    expect(migrated?.chats?.[1]?.worldState.structuredRoomState?.cohesion).toBe(14);
    expect(migrated?.chats?.[2]?.worldState.structuredRoomState?.cohesion).toBe(-8);
  });

  it('keeps valid chat reading positions while dropping invalid entries', () => {
    const migrated = migrateUiStoreState({
      rightPanelTab: 'chapters',
      chatReadingPositions: {
        'story-1': { messageId: 'message-2', offsetTop: 42, pinned: false, updatedAt: 123, sourceTimestamp: 456 },
        broken: { messageId: 123, offsetTop: 'bad' },
      },
    });

    expect(migrated?.rightPanelTab).toBe('chapters');
    expect(migrated?.chatReadingPositions).toEqual({
      'story-1': { messageId: 'message-2', offsetTop: 42, pinned: false, updatedAt: 123, sourceTimestamp: 456 },
    });
  });

  it('keeps story room sidebar tab values during migration', () => {
    expect(migrateUiStoreState({ rightPanelTab: 'clues' })?.rightPanelTab).toBe('clues');
    expect(migrateUiStoreState({ rightPanelTab: 'roles' })?.rightPanelTab).toBe('roles');
    expect(migrateUiStoreState({ rightPanelTab: 'developer' })?.rightPanelTab).toBe('developer');
  });

  it('enables human appraisal by default for older developer UI settings', () => {
    const migrated = migrateSettingsStoreState({
      developerUI: {
        showMemoryDebug: true,
      },
    });

    expect(migrated?.developerUI).toMatchObject({
      showMemoryDebug: true,
      enableHumanAppraisal: true,
    });
  });

  it('infers full character detail for legacy persisted records with detail fields', () => {
    const migrated = migrateCharacterStoreState({
      characters: [{
        id: 'character-1',
        name: '潇潇',
        avatar: '',
        personality: { openness: 50, extroversion: 50, agreeableness: 50, neuroticism: 50, humor: 50, creativity: 50, assertiveness: 50, empathy: 50 },
        expertise: [],
        speakingStyle: '轻声说话',
        background: '旧本地完整背景',
        behavior: { proactivity: 50, aggressiveness: 20, humorIntensity: 40, empathyLevel: 60, summarizing: 30, offTopic: 20 },
        relationships: [{ characterId: 'character-2', note: '旧关系', warmth: 10, trust: 20, competence: 0, threat: 0 }],
        memory: { longTerm: ['旧记忆'], shortTermSummary: '', secrets: [], obsessions: [], tabooTopics: [], userMemories: [] },
        layeredMemories: [],
        intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
        runtimeTimeline: [],
        isPreset: false,
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    expect((migrated?.characters?.[0] as { characterDetailLoaded?: boolean } | undefined)?.characterDetailLoaded).toBe(true);
    expect(migrated?.characters?.[0]?.relationships?.[0]?.note).toBe('旧关系');
    expect(migrated?.characters?.[0]?.memory?.longTerm).toEqual(['旧记忆']);
  });

  it('keeps legacy character summary records marked as not fully loaded', () => {
    const migrated = migrateCharacterStoreState({
      characters: [{
        id: 'character-1',
        name: '摘要角色',
        avatar: '',
        personality: { openness: 50, extroversion: 50, agreeableness: 50, neuroticism: 50, humor: 50, creativity: 50, assertiveness: 50, empathy: 50 },
        behavior: { proactivity: 50, aggressiveness: 20, humorIntensity: 40, empathyLevel: 60, summarizing: 30, offTopic: 20 },
        expertise: [],
        speakingStyle: '',
        background: '',
        relationships: [],
        memory: { longTerm: [], shortTermSummary: '', secrets: [], obsessions: [], tabooTopics: [], userMemories: [] },
        layeredMemories: [],
        intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
        runtimeTimeline: [],
        isPreset: false,
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    expect((migrated?.characters?.[0] as { characterDetailLoaded?: boolean } | undefined)?.characterDetailLoaded).toBe(false);
  });

  it('infers full chat runtime detail for legacy persisted records with runtime fields', () => {
    const migrated = migrateChatStoreState({
      chats: [{
        ...chatWithCohesion(58),
        runtimeEventsV2: [{ id: 'event-1', conversationId: 'chat-1', kind: 'room_shift', createdAt: 1, summary: '旧本地运行事件', payload: {} }],
      }],
    });

    expect(migrated?.chats?.[0]?.runtimeDetailLoaded).toBe(true);
    expect(migrated?.chats?.[0]?.runtimeEventsV2?.[0]?.summary).toBe('旧本地运行事件');
  });

  it('keeps legacy chat summary records marked as not fully loaded', () => {
    const migrated = migrateChatStoreState({
      chats: [{
        id: 'chat-1',
        type: 'group',
        mode: 'open_chat',
        modeConfig: {},
        modeState: {},
        name: '摘要群聊',
        topic: '',
        style: 'free',
        runtimeEvolutionIntensity: 'balanced',
        memberIds: ['character-1'],
        speed: 1,
        isActive: true,
        allowIntervention: true,
        createdAt: 1,
        updatedAt: 1,
        lastMessageAt: 1,
      } as GroupChat],
    });

    expect(migrated?.chats?.[0]?.runtimeDetailLoaded).toBe(false);
  });
});
