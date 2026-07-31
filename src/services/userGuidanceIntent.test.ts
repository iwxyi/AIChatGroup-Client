import { describe, expect, it } from 'vitest';
import type { AICharacter } from '../types/character';
import { getGuidanceMemoryTargetActorIds, parseUserGuidanceIntent } from './userGuidanceIntent';

function character(id: string, name: string): AICharacter {
  return {
    id,
    name,
    avatar: '',
    personality: { openness: 50, extroversion: 50, agreeableness: 50, neuroticism: 50, humor: 50, creativity: 50, assertiveness: 50, empathy: 50 },
    behavior: { proactivity: 50, aggressiveness: 50, humorIntensity: 50, empathyLevel: 50, summarizing: 50, offTopic: 50 },
    expertise: [],
    speakingStyle: '',
    background: '',
    relationships: [],
    memory: { longTerm: [], shortTermSummary: '', secrets: [], obsessions: [], tabooTopics: [], userMemories: [] },
    intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
    isPreset: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('userGuidanceIntent', () => {
  const members = [
    character('mei', '美羊羊'),
    character('hui', '灰太狼'),
    character('xi', '喜羊羊'),
  ];

  it('separates the requested image sender from the image subject', () => {
    const intent = parseUserGuidanceIntent('美羊羊发个灰太狼证件照的图片', members);

    expect(intent).toMatchObject({
      kind: 'media_request',
      actorIds: ['mei'],
      mentionedActorIds: ['mei', 'hui'],
      beatType: 'answer',
    });
    expect(intent?.mediaRequest).toMatchObject({
      kind: 'image',
      subjectActorIds: ['hui'],
    });
    expect(intent?.maxTurns).toBe(1);
  });

  it('treats the actor before 帮/给/替 as the image sender and later names as subjects', () => {
    const intent = parseUserGuidanceIntent('美羊羊帮灰太狼画个美美的证件照呗', members);

    expect(intent?.kind).toBe('media_request');
    expect(intent?.actorIds).toEqual(['mei']);
    expect(intent?.mediaRequest?.subjectActorIds).toEqual(['hui']);
    expect(intent?.mediaRequest?.subjectText).toBe('灰太狼');
  });

  it('does not treat the beneficiary after 让...帮 as another requested sender', () => {
    const intent = parseUserGuidanceIntent('让美羊羊帮灰太狼画一张证件照', members);

    expect(intent?.kind).toBe('media_request');
    expect(intent?.actorIds).toEqual(['mei']);
    expect(intent?.mediaRequest?.subjectActorIds).toEqual(['hui']);
  });

  it('keeps broad topic guidance as a multi-turn room focus', () => {
    const intent = parseUserGuidanceIntent('新话题：狼抓羊有过错吗？狼应该抓羊吗？', members);

    expect(intent).toMatchObject({
      kind: 'topic_shift',
      actorIds: [],
      beatType: 'invite',
      maxTurns: 3,
    });
  });

  it('supports multiple explicitly requested actors', () => {
    const intent = parseUserGuidanceIntent('让美羊羊和喜羊羊都发一张灰太狼证件照', members);

    expect(intent?.kind).toBe('media_request');
    expect(intent?.actorIds).toEqual(['mei', 'xi']);
    expect(intent?.mediaRequest?.subjectActorIds).toEqual(['hui']);
    expect(intent?.maxTurns).toBe(2);
  });

  it('treats collective writing instructions as direct tasks for every member', () => {
    const intent = parseUserGuidanceIntent('你怎么看待AI在未来对人类的影响？每个人写一篇800字作文', members);

    expect(intent).toMatchObject({
      kind: 'direct_reply',
      actorIds: ['mei', 'hui', 'xi'],
      beatType: 'answer',
      maxTurns: 3,
    });
    expect(intent?.reason).toContain('所有角色');
  });

  it('resolves image subjects as memory recall targets instead of the requested sender', () => {
    const intent = parseUserGuidanceIntent('美羊羊发个灰太狼证件照的图片', members);

    expect(getGuidanceMemoryTargetActorIds(intent, members, 'mei')).toEqual(['hui']);
  });

  it('resolves the discussed person as memory recall target for direct replies', () => {
    const intent = parseUserGuidanceIntent('美羊羊说说你怎么看灰太狼', members);

    expect(intent?.actorIds).toEqual(['mei']);
    expect(getGuidanceMemoryTargetActorIds(intent, members, 'mei')).toEqual(['hui']);
  });

  it('matches natural short display names inside longer character names for direct tasks', () => {
    const intent = parseUserGuidanceIntent('苏苏你写一篇这个话题的800字作文', [
      character('susu', '穿搭博主苏苏'),
      character('luxun', '鲁智深'),
      character('xiao', '潇潇'),
    ]);

    expect(intent).toMatchObject({
      kind: 'direct_reply',
      actorIds: ['susu'],
      beatType: 'answer',
      maxTurns: 1,
    });
  });

  it('treats natural "what do you think" mentions as direct replies', () => {
    const intent = parseUserGuidanceIntent('安安，你怎么看？我想听你的意见', [
      character('anan', '安安'),
      character('zhou', '周策'),
      character('mei', '梅青'),
    ]);

    expect(intent).toMatchObject({
      kind: 'direct_reply',
      actorIds: ['anan'],
      mentionedActorIds: ['anan'],
      beatType: 'answer',
      maxTurns: 1,
    });
  });

  it('keeps the leading addressed actor when later text mentions someone else', () => {
    const intent = parseUserGuidanceIntent('安安，你直接说吧，用户到底为什么不再用了？不用先照顾周策的汇报口径。', [
      character('anan', '安安'),
      character('zhou', '周策'),
      character('mei', '梅青'),
    ]);

    expect(intent).toMatchObject({
      kind: 'direct_reply',
      actorIds: ['anan'],
      mentionedActorIds: ['anan', 'zhou'],
      suppressedActorIds: ['zhou'],
      beatType: 'answer',
      minTargetTurns: 2,
      maxTurns: 5,
    });
  });

  it('does not treat negated directive text as a request for the negated actor', () => {
    const intent = parseUserGuidanceIntent('我刚才是想听安安说，不是让周策替她做决定。', [
      character('anan', '安安'),
      character('zhou', '周策'),
      character('mei', '梅青'),
    ]);

    expect(intent).toMatchObject({
      kind: 'direct_reply',
      actorIds: ['anan'],
      mentionedActorIds: ['anan', 'zhou'],
      suppressedActorIds: ['zhou'],
      beatType: 'answer',
      maxTurns: 5,
    });
    expect(intent?.minTargetTurns).toBeUndefined();
  });

  it('does not use a suppressed hijacking actor as the memory target', () => {
    const intent = parseUserGuidanceIntent('我刚才是想听安安说，不是让周策替她做决定。', [
      character('anan', '安安'),
      character('zhou', '周策'),
      character('mei', '梅青'),
    ]);

    expect(getGuidanceMemoryTargetActorIds(intent, [
      character('anan', '安安'),
      character('zhou', '周策'),
      character('mei', '梅青'),
    ], 'anan')).toEqual([]);
  });

  it('keeps hard constraints as persistent topic guidance for named actors', () => {
    const intent = parseUserGuidanceIntent('小唐预算不超过80，别忽略她', [
      character('xiaotang', '小唐'),
      character('anan', '安安'),
    ]);

    expect(intent).toMatchObject({
      kind: 'topic_shift',
      actorIds: [],
      mentionedActorIds: ['xiaotang'],
      hardConstraintActorIds: ['xiaotang'],
      hasHardConstraints: true,
      maxTurns: 5,
    });
  });
});
