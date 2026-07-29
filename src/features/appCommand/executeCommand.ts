import type { NavigateFunction } from 'react-router-dom';
import { api } from '../../services/api';
import { generateResponse } from '../../services/aiClient';
import { buildDirectChatDraft, buildGroupChatDraft } from '../../services/chatDraftBuilder';
import { generateCharacterProfilesSafe } from '../../services/characterGenerator';
import { getRoomTemplate, ROOM_TEMPLATES, type RoomTemplateDefinition, type RoomTemplateKey } from '../../services/roomTemplates';
import { useCharacterStore } from '../../stores/useCharacterStore';
import { useChatStore } from '../../stores/useChatStore';
import { useMessageStore } from '../../stores/useMessageStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { AICharacter } from '../../types/character';
import { DEFAULT_CHARACTER_BEHAVIOR, DEFAULT_CHARACTER_INTERVENTION, DEFAULT_CHARACTER_MEMORY, DEFAULT_PERSONALITY, normalizeCharacterGroup } from '../../types/character';
import { getUsablePreferredAIProfile } from '../../types/settings';
import { formatAiBalanceAmount } from '../../utils/aiPoints';
import type { AppCommandCandidate, AppCommandChoice, AppCommandContext, AppCommandExecutionResult, AppCommandRoute, LocalActionPlan, PlannedCharacter } from './commandTypes';
import { savePendingAppCommand } from './pendingCommandStore';
import { resolveSecretRef } from './secretRedaction';
import { parseAppLink, resolveAppLinkToWebPath, serializeAppLink } from '../../services/appLink';

function clean(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeName(value?: string | null) {
  return clean(value).replace(/\s+/g, '').toLowerCase();
}

function buildCharacterDraft(input: PlannedCharacter, profile?: Awaited<ReturnType<typeof generateCharacterProfilesSafe>>['success'][number]['profile']) {
  return {
    name: clean(input.name),
    avatar: profile?.avatar || '🤖',
    personality: profile?.personality || DEFAULT_PERSONALITY,
    behavior: profile?.behavior || DEFAULT_CHARACTER_BEHAVIOR,
    expertise: profile?.expertise || [],
    speakingStyle: profile?.speakingStyle || input.roleHint || '自然、清晰地表达观点。',
    background: profile?.background || input.roleHint || `${input.name} 是根据用户指令创建的角色。`,
    group: clean(input.group) || null,
    relationships: [],
    memory: DEFAULT_CHARACTER_MEMORY,
    intervention: DEFAULT_CHARACTER_INTERVENTION,
    speechProfile: profile?.speechProfile,
    coreProfile: profile?.coreProfile,
    visualIdentity: profile?.visualIdentity,
    bubbleStyle: profile?.bubbleStyle || null,
  };
}

function findCharacterByName(characters: AICharacter[], name: string) {
  const target = normalizeName(name);
  return characters.find((character) => normalizeName(character.name) === target)
    || characters.find((character) => normalizeName(character.name).includes(target) || target.includes(normalizeName(character.name)));
}

async function ensureCharacters(planCharacters: PlannedCharacter[], context: AppCommandContext) {
  const existing = useCharacterStore.getState().characters;
  const found: AICharacter[] = [];
  const missing: PlannedCharacter[] = [];
  planCharacters.forEach((item) => {
    const current = findCharacterByName(existing, item.name);
    if (current) found.push(current);
    else missing.push(item);
  });
  if (!missing.length) return found;
  const profile = getUsablePreferredAIProfile(context.aiProfiles, 'text') || context.apiConfig;
  const generated = await generateCharacterProfilesSafe(
    {
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
    },
    missing.map((item) => item.name),
    'zh',
    { theme: context.input, description: context.input },
  );
  const profileByName = new Map(generated.success.map((item) => [normalizeName(item.name), item.profile]));
  const created = await useCharacterStore.getState().addCharacters(
    missing.map((item) => buildCharacterDraft(item, profileByName.get(normalizeName(item.name)))),
  );
  return [...found, ...created];
}

function chatWebPath(chatId: string, tab: number) {
  return `/chats/${encodeURIComponent(chatId)}?fromTab=${tab}`;
}

function chatAppLink(chatId: string, tab: number) {
  return serializeAppLink({ target: 'chat', id: chatId, action: 'open', params: { fromTab: String(tab) } });
}

function markdownChatLink(label: string, chatId: string, tab: number) {
  return `[${label}](${chatAppLink(chatId, tab)})`;
}

function resolveCommandUrlForWeb(url: string) {
  const link = parseAppLink(url);
  return link ? resolveAppLinkToWebPath(link) || url : url;
}

function candidateChoices(candidates: AppCommandCandidate[]): AppCommandChoice[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    description: candidate.description,
    url: candidate.url,
    kind: 'execute' as const,
  })).slice(0, 5);
}

function buildPlannedCharacters(plan: LocalActionPlan, fallbackInput?: string): PlannedCharacter[] {
  const planned = plan.characters?.filter((item) => clean(item.name)) || [];
  if (planned.length) return planned;
  const fallbackName = clean(plan.characterName || plan.title || fallbackInput);
  return fallbackName ? [{ name: fallbackName, group: null, roleHint: plan.summary }] : [];
}

function shouldOpenSingleCharacterFromHome(plan: LocalActionPlan, context: AppCommandContext) {
  if (context.source !== 'home') return false;
  if (plan.action !== 'create_character' && plan.action !== 'create_characters') return false;
  const explicitCreate = /创建|新建|生成|批量|角色|人物|设定/.test(context.input);
  if (explicitCreate) return false;
  return buildPlannedCharacters(plan, context.input).length === 1;
}

function scoreText(text: string, query: string) {
  const source = text.toLowerCase();
  const target = query.toLowerCase();
  if (!target) return 0;
  if (source.includes(target)) return 20 + target.length;
  return target.split(/\s+/).filter((part) => part && source.includes(part)).length;
}

function normalizeLooseKey(value?: string | null) {
  return clean(value).replace(/[\s_-]+/g, '').toLowerCase();
}

function scoreRoomTemplate(template: RoomTemplateDefinition, query: string) {
  const normalized = normalizeLooseKey(query);
  if (!normalized) return 0;
  const fields = [
    template.key,
    template.label,
    template.description,
    template.structure,
    template.category,
    template.categoryLabel,
    template.sessionKind.scenarioId,
    template.sessionKind.family,
    template.presetLabel,
    template.presetDescription,
    ...(template.sellingPoints || []),
  ].filter(Boolean).join('\n');
  const compact = normalizeLooseKey(fields);
  if (compact === normalized) return 100;
  if (compact.includes(normalized) || normalized.includes(compact)) return 50;
  return scoreText(fields, query);
}

function resolveRoomTemplate(plan: LocalActionPlan) {
  const explicitKey = clean(plan.roomTemplateKey);
  if (explicitKey && ROOM_TEMPLATES.some((item) => item.key === explicitKey)) {
    return getRoomTemplate(explicitKey as RoomTemplateKey);
  }
  const scenarioId = clean(plan.scenarioId);
  if (scenarioId) {
    const byScenario = ROOM_TEMPLATES.find((item) => item.sessionKind.scenarioId === scenarioId || item.key === scenarioId);
    if (byScenario) return byScenario;
  }
  const query = clean(plan.roomKind || plan.roomTemplateKey || plan.scenarioId);
  if (!query) return getRoomTemplate('open_chat');
  const ranked = ROOM_TEMPLATES
    .map((template) => ({ template, score: scoreRoomTemplate(template, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.template || getRoomTemplate('open_chat');
}

function characterAppLink(characterId: string) {
  return serializeAppLink({ target: 'character', id: characterId, action: 'edit' });
}

function markdownCharacterLink(label: string, characterId: string) {
  return `[${label}](${characterAppLink(characterId)})`;
}

function characterSearchText(character: AICharacter) {
  return [
    character.name,
    character.group,
    character.background,
    character.speakingStyle,
    character.expertise?.join(' '),
    character.coreProfile?.coreDesire,
    character.coreProfile?.coreFear,
    character.coreProfile?.values?.join(' '),
  ].filter(Boolean).join('\n');
}

function formatCharacterForAgent(character: AICharacter) {
  return [
    `名称：${character.name}`,
    `分组：${character.group || '未分组'}`,
    `专长：${character.expertise?.length ? character.expertise.join('、') : '未设置'}`,
    `性格参数：开放性 ${character.personality.openness}，外向性 ${character.personality.extroversion}，宜人性 ${character.personality.agreeableness}，神经质 ${character.personality.neuroticism}，幽默 ${character.personality.humor}，创造力 ${character.personality.creativity}，主见 ${character.personality.assertiveness}，共情 ${character.personality.empathy}`,
    `行为参数：主动性 ${character.behavior.proactivity}，攻击性 ${character.behavior.aggressiveness}，幽默强度 ${character.behavior.humorIntensity}，共情强度 ${character.behavior.empathyLevel}，总结倾向 ${character.behavior.summarizing}，跑题倾向 ${character.behavior.offTopic}`,
    `说话风格：${character.speakingStyle || '未设置'}`,
    `背景：${character.background || '未设置'}`,
    character.coreProfile ? `核心画像：${JSON.stringify(character.coreProfile)}` : '',
  ].filter(Boolean).join('\n');
}

function resolveCharacterMatches(plan: LocalActionPlan, input: string) {
  const characters = useCharacterStore.getState().characters.filter((character) => !character.deletedAt);
  const queries = [
    ...(plan.characters?.map((item) => item.name) || []),
    plan.characterName,
    plan.characterQuery,
  ].map((item) => clean(item)).filter(Boolean);
  const sourceGroup = normalizeCharacterGroup(plan.sourceGroup);
  if (sourceGroup && !queries.length) {
    return characters.filter((character) => normalizeCharacterGroup(character.group) === sourceGroup);
  }
  const effectiveQueries = queries.length ? queries : [input];
  const matches = new Map<string, { character: AICharacter; score: number; fullMatch: boolean }>();
  for (const query of effectiveQueries) {
    const normalizedQuery = normalizeName(query);
    characters.forEach((character) => {
      if (sourceGroup && normalizeCharacterGroup(character.group) !== sourceGroup) return;
      const searchable = characterSearchText(character);
      const score = scoreText(searchable, query) + (normalizeName(character.name) === normalizedQuery ? 40 : 0);
      if (score <= 0) return;
      const existing = matches.get(character.id);
      const fullMatch = Boolean(normalizedQuery && normalizeName(character.name) === normalizedQuery);
      if (!existing || score > existing.score) matches.set(character.id, { character, score, fullMatch });
    });
  }
  return Array.from(matches.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.character);
}

function characterCandidates(characters: AICharacter[]): AppCommandCandidate[] {
  return characters.slice(0, 8).map((character) => ({
    id: character.id,
    label: character.name,
    description: [character.group || '未分组', character.expertise?.slice(0, 3).join('、')].filter(Boolean).join(' · '),
    url: characterAppLink(character.id),
    kind: 'character',
  }));
}

function characterActionChoices(characters: AICharacter[], plan: LocalActionPlan): AppCommandChoice[] {
  return characters.slice(0, 8).map((character) => ({
    id: character.id,
    label: character.name,
    description: [character.group || '未分组', character.expertise?.slice(0, 3).join('、')].filter(Boolean).join(' · '),
    kind: 'execute' as const,
    plan: {
      action: plan.action,
      plan: {
        ...plan,
        characterName: character.name,
        characterQuery: character.name,
        characters: [{ name: character.name, group: character.group || null }],
        sourceGroup: undefined,
      },
    },
  }));
}

function shouldAskCharacterMatch(plan: LocalActionPlan, context: AppCommandContext, matches: AICharacter[]) {
  if (matches.length <= 1) return false;
  const query = normalizeName(plan.characterQuery || plan.characterName || plan.characters?.[0]?.name || context.input);
  const exactMatches = matches.filter((character) => normalizeName(character.name) === query);
  if (exactMatches.length === 1 && !plan.sourceGroup) return false;
  return true;
}

async function generateAgentText(context: AppCommandContext, system: string, user: string, label: string) {
  const profile = getUsablePreferredAIProfile(context.aiProfiles, 'text') || context.apiConfig;
  return generateResponse(
    {
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
    },
    system,
    [{ role: 'user', content: user }],
    undefined,
    {
      responseFormat: 'text',
      maxTokens: 900,
      aiUsage: { type: 'other', label, scope: 'app-command' },
    },
  );
}

function getPendingScopeKey(context: AppCommandContext) {
  return context.source === 'assistant' ? `assistant:${context.chatId || 'default'}` : 'home';
}

function savePendingRoute(context: AppCommandContext, route: AppCommandRoute, secrets: Record<string, string>, candidates?: AppCommandCandidate[], choices?: AppCommandChoice[]) {
  savePendingAppCommand({
    scopeKey: getPendingScopeKey(context),
    source: context.source,
    input: context.input,
    route,
    secrets,
    candidates,
    choices,
  });
}

async function openExistingChat(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const query = clean(plan.chatQuery || plan.groupTopic || plan.characterName || plan.title);
  const normalizedQuery = normalizeName(query);
  const chats = useChatStore.getState().chats;
  const messages = useMessageStore.getState().messages;
  const ranked = chats
    .map((chat) => {
      const messageText = messages
        .filter((message) => message.chatId === chat.id)
        .slice(-30)
        .map((message) => message.content)
        .join('\n');
      const score = scoreText(`${chat.name}\n${chat.topic}\n${chat.worldState?.recentEvent || ''}\n${messageText}`, query)
        + (plan.chatTypePreference && plan.chatTypePreference !== 'any' && chat.type === plan.chatTypePreference ? 10 : 0);
      const searchable = normalizeName(`${chat.name}\n${chat.topic}\n${chat.worldState?.recentEvent || ''}\n${messageText}`);
      return { chat, score, fullMatch: Boolean(normalizedQuery && searchable.includes(normalizedQuery)) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 5);
  const best = top[0]?.chat;
  if (!best) {
    return {
      status: 'info',
      title: '没有找到会话',
      message: query ? `没有找到和“${query}”相关的会话。` : '没有找到可打开的会话。',
      recoverable: true,
      reasonType: 'chat_not_found',
      observation: {
        attemptedAction: 'open_existing_chat',
        query,
        chatTypePreference: plan.chatTypePreference || 'any',
        foundCount: 0,
        possibleNextActions: ['create_direct_chat', 'read_character_info', 'create_character', 'create_group_chat', 'navigate'],
      },
    };
  }
  const candidates: AppCommandCandidate[] = top.map(({ chat, score }) => {
    const tab = chat.type === 'assistant' ? 3 : chat.type === 'direct' ? 1 : 0;
    return {
      id: chat.id,
      label: chat.name,
      description: [chat.type === 'group' ? '群聊' : chat.type === 'direct' ? '单聊' : '助手', chat.topic].filter(Boolean).join(' · '),
      url: chatAppLink(chat.id, tab),
      score,
      kind: chat.type,
    };
  });
  const secondScore = top[1]?.score || 0;
  const typeMismatch = plan.chatTypePreference && plan.chatTypePreference !== 'any' && best.type !== plan.chatTypePreference;
  const fullMatchCount = top.filter((item) => item.fullMatch).length;
  const shouldAsk = context.source === 'assistant'
    || typeMismatch
    || fullMatchCount > 1
    || (secondScore > 0 && ranked[0].score - secondScore <= 8);
  if (shouldAsk) {
    return {
      status: 'needs_confirmation',
      title: typeMismatch ? '找到的会话类型不完全匹配' : fullMatchCount > 1 ? '找到多个匹配会话' : '找到可打开会话',
      message: typeMismatch
        ? `最相关的是“${best.name}”，但它不是你指定的${plan.chatTypePreference === 'group' ? '群聊' : plan.chatTypePreference === 'direct' ? '单聊' : '助手会话'}。`
        : fullMatchCount > 1 || secondScore > 0
          ? `找到多个和“${query}”相关的会话，请选择要打开哪一个。`
          : `找到“${best.name}”，请确认是否打开。`,
      candidates,
      choices: candidateChoices(candidates),
      choicePresentation: candidates.length > 4 ? 'select' : 'chips',
    };
  }
  const tab = best.type === 'assistant' ? 3 : best.type === 'direct' ? 1 : 0;
  const url = chatWebPath(best.id, tab);
  context.navigate?.(url);
  return {
    status: 'success',
    title: '已打开会话',
    message: `已打开 ${best.name}。`,
    markdown: `已找到会话：${markdownChatLink(best.name, best.id, tab)}`,
    navigateTo: url,
    candidates,
  };
}

async function executeChoice(plan: LocalActionPlan, choice: AppCommandChoice, context: AppCommandContext, secrets: Record<string, string>): Promise<AppCommandExecutionResult> {
  if (choice.kind === 'cancel') {
    return { status: 'info', title: '已取消', message: '已取消本次操作。' };
  }
  if (choice.kind === 'confirm' && !choice.plan) {
    return executeAppCommandRoute(contextToRoute(plan), context, secrets);
  }
  if (choice.url && !choice.plan) {
    const webPath = resolveCommandUrlForWeb(choice.url);
    context.navigate?.(webPath);
    return { status: 'success', title: '已打开', message: '已打开对应页面。', navigateTo: webPath };
  }
  const nextPlan = choice.plan?.plan
    ? { ...plan, ...choice.plan.plan, action: choice.plan.action || plan.action }
    : plan;
  const nextRoute: AppCommandRoute = {
    mode: 'local_action',
    action: nextPlan.action,
    plan: nextPlan,
    riskLevel: 'medium',
    requiresConfirmation: choice.kind === 'confirm' ? false : true,
    confirmationText: choice.plan?.confirmationText,
  };
  return executeAppCommandRoute(nextRoute, context, secrets);
}

function contextToRoute(plan: LocalActionPlan): AppCommandRoute {
  return {
    mode: 'local_action',
    action: plan.action,
    plan,
    riskLevel: 'medium',
    requiresConfirmation: false,
  };
}

function localActionRouteFromStep(step: Extract<AppCommandRoute, { mode: 'workflow' }>['steps'][number], confirmed = false): AppCommandRoute {
  return {
    mode: 'local_action',
    action: step.action,
    plan: step.plan,
    riskLevel: step.riskLevel,
    requiresConfirmation: confirmed ? false : step.requiresConfirmation,
    confirmationText: step.confirmationText,
  };
}

async function createDirectChat(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const name = clean(plan.characterName || plan.characters?.[0]?.name || plan.title);
  if (!name) return {
    status: 'info',
    title: '缺少角色名',
    message: '请告诉我想和哪个角色聊天。',
    recoverable: false,
    reasonType: 'missing_character_name',
    observation: { attemptedAction: 'create_direct_chat', possibleNextActions: ['open_existing_chat', 'assistant_agent'] },
  };
  const [character] = await ensureCharacters([{ name, group: plan.characters?.[0]?.group || null, roleHint: plan.summary }], context);
  const existing = useChatStore.getState().chats.find((chat) => chat.type === 'direct' && chat.memberIds.includes(character.id));
  const chat = existing || await useChatStore.getState().addChat(buildDirectChatDraft(character.id, character.name));
  const url = chatWebPath(chat.id, 1);
  context.navigate?.(url);
  return {
    status: 'success',
    title: existing ? '已打开单聊' : '已创建单聊',
    message: existing ? `已打开和 ${character.name} 的单聊。` : `已创建和 ${character.name} 的单聊。`,
    markdown: `${existing ? '已打开单聊' : '已创建单聊'}：${markdownChatLink(character.name, chat.id, 1)}`,
    navigateTo: url,
  };
}

async function createGroupChat(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const plannedCharacters = (plan.characters || []).filter((item) => clean(item.name));
  if (!plannedCharacters.length) return {
    status: 'info',
    title: '缺少角色',
    message: '创建群聊前需要至少一个角色。',
    recoverable: true,
    reasonType: 'missing_group_members',
    observation: { attemptedAction: 'create_group_chat', possibleNextActions: ['create_characters', 'assistant_agent'] },
  };
  const template = resolveRoomTemplate(plan);
  const defaults = template.defaults || {};
  const members = await ensureCharacters(plannedCharacters, context);
  const memberIds = ['user', ...members.map((item) => item.id)];
  const title = clean(plan.groupName || plan.title) || `${plannedCharacters.slice(0, 3).map((item) => item.name).join('、')}的群聊`;
  const topic = clean(plan.groupTopic || plan.summary || context.input);
  const chat = await useChatStore.getState().addChat(buildGroupChatDraft({
    type: 'group',
    name: title,
    topic,
    style: template.style || plan.groupStyle || 'free',
    runtimeEvolutionIntensity: template.runtimeEvolutionIntensity || 'balanced',
    sessionKind: template.sessionKind,
    storyBranchMode: defaults.storyBranchMode,
    storyBackground: clean(plan.storyBackground) || defaults.storyBackground || topic,
    storyDirection: clean(plan.storyDirection) || defaults.storyDirection || clean(plan.summary) || topic,
    storyOutline: clean(plan.storyOutline) || defaults.storyOutline || '',
    studyGoalLabel: clean(plan.studyGoalLabel) || defaults.studyGoalLabel || topic,
    agentGoalLabel: clean(plan.agentGoalLabel) || defaults.agentGoalLabel || topic,
    boardColumns: plan.boardColumns || defaults.boardColumns,
    boardRows: plan.boardRows || defaults.boardRows,
    deductionFactionCount: plan.deductionFactionCount || defaults.deductionFactionCount,
    werewolfRoleConfig: clean(plan.werewolfRoleConfig) || defaults.werewolfRoleConfig || topic,
    werewolfPostGameMode: clean(plan.werewolfPostGameMode) || defaults.werewolfPostGameMode,
    mysteryClueCount: plan.mysteryClueCount || defaults.mysteryClueCount,
    mysteryScript: clean(plan.mysteryScript) || defaults.mysteryScript || topic,
    mysteryRoleMappingMode: clean(plan.mysteryRoleMappingMode) || defaults.mysteryRoleMappingMode,
    memberIds,
    operatorIds: [],
    showRoleActions: template.sessionKind.scenarioId !== 'story-reader',
    seedMemoryText: '',
    seedArtifactText: '',
    ownerCharacterId: null,
    adminCharacterIds: [],
    autoModeration: true,
    allowMute: false,
    allowPrivateThreads: defaults.allowPrivateThreads ?? false,
    allowCliques: defaults.allowCliques ?? true,
    allowMockery: defaults.allowMockery ?? false,
    mood: '',
    focus: topic,
    recentEvent: '',
    allowSpeakAs: true,
    allowDirectorMode: true,
    allowEventInjection: true,
    allowForcedReply: true,
  }));
  const url = chatWebPath(chat.id, 0);
  context.navigate?.(url);
  return {
    status: 'success',
    title: `已创建${template.label}`,
    message: `已创建“${chat.name}”，玩法为${template.label}，包含 ${members.length} 个角色。`,
    markdown: `已创建${template.label}：${markdownChatLink(chat.name, chat.id, 0)}`,
    navigateTo: url,
    observation: {
      completedGoal: true,
      createdChatId: chat.id,
      roomTemplateKey: template.key,
      scenarioId: template.sessionKind.scenarioId,
      family: template.sessionKind.family,
    },
  };
}

async function createCharacters(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const plannedCharacters = buildPlannedCharacters(plan, context.input);
  if (!plannedCharacters.length) return {
    status: 'info',
    title: '缺少角色名',
    message: '请告诉我想创建哪个角色。',
    recoverable: true,
    reasonType: 'missing_character_name',
    observation: { attemptedAction: plan.action, possibleNextActions: ['create_direct_chat', 'create_group_chat', 'assistant_agent'] },
  };
  const characters = await ensureCharacters(plannedCharacters, context);
  return {
    status: 'success',
    title: '已创建角色',
    message: `已准备 ${characters.length} 个角色。`,
    markdown: `已准备角色：${characters.map((item) => item.name).join('、')}。可以在[角色库](${serializeAppLink({ target: 'characters', action: 'open' })})查看。`,
    navigateTo: '/characters',
  };
}

async function readCharacterInfo(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const matches = resolveCharacterMatches(plan, context.input);
  if (!matches.length) return {
    status: 'info',
    title: '没有找到角色',
    message: '角色库里没有找到匹配的角色。',
    recoverable: true,
    reasonType: 'character_not_found',
    observation: {
      attemptedAction: 'read_character_info',
      query: plan.characterName || plan.characterQuery || plan.characters?.map((item) => item.name).join('、') || context.input,
      foundCount: 0,
      possibleNextActions: ['create_character', 'create_direct_chat', 'assistant_agent'],
    },
  };
  if (shouldAskCharacterMatch(plan, context, matches)) {
    const candidates = characterCandidates(matches);
    return {
      status: 'needs_confirmation',
      title: '找到多个角色',
      message: '找到多个可能匹配的角色，请选择要查看哪一个。',
      candidates,
      choices: characterActionChoices(matches, plan),
      choicePresentation: candidates.length > 4 ? 'select' : 'chips',
    };
  }
  const character = matches[0];
  const summary = await generateAgentText(
    context,
    [
      '你是 Sense Murmur 的站内角色资料助手。',
      '只根据用户给出的角色资料回答，不要编造未提供的信息。',
      '回答要简洁、有判断力，可以引用关键字段，但不要暴露内部 JSON 或 ID。',
    ].join('\n'),
    [`用户问题：${context.input}`, '', '角色资料：', formatCharacterForAgent(character)].join('\n'),
    '角色资料解读',
  );
  return {
    status: 'success',
    title: character.name,
    message: summary,
    markdown: `${summary}\n\n${markdownCharacterLink('打开角色资料', character.id)}`,
    candidates: characterCandidates([character]),
  };
}

async function compareCharacters(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const matches = resolveCharacterMatches(plan, context.input);
  const expectedCount = plan.characters?.length || 2;
  const selected = matches.slice(0, Math.max(expectedCount, 2));
  if (selected.length < 2) return {
    status: 'info',
    title: '角色不足',
    message: '至少需要找到两个角色才能比较。',
    recoverable: true,
    reasonType: 'insufficient_characters',
    observation: { attemptedAction: 'compare_characters', foundCount: selected.length, expectedCount, possibleNextActions: ['read_character_info', 'create_characters', 'assistant_agent'] },
  };
  if (matches.length > selected.length && context.source === 'assistant') {
    const candidates = characterCandidates(matches);
    return {
      status: 'needs_confirmation',
      title: '找到多个可比较角色',
      message: '找到多个相关角色，请先选择要查看的角色资料，或重新说明要比较哪几个角色。',
      candidates,
      choices: characterActionChoices(matches, { ...plan, action: 'read_character_info' }),
      choicePresentation: candidates.length > 4 ? 'select' : 'chips',
    };
  }
  const answer = await generateAgentText(
    context,
    [
      '你是 Sense Murmur 的站内角色分析助手。',
      '只根据提供的角色资料做比较，不要编造未提供的信息。',
      '如果资料不足，明确指出依据不足，并给出当前资料下的倾向判断。',
    ].join('\n'),
    [
      `用户问题：${plan.compareQuestion || context.input}`,
      '',
      ...selected.map((character, index) => [`角色 ${index + 1}:`, formatCharacterForAgent(character)].join('\n')),
    ].join('\n\n'),
    '角色能力比较',
  );
  return {
    status: 'success',
    title: '角色比较',
    message: answer,
    markdown: answer,
    candidates: characterCandidates(selected),
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function clamp01(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return undefined;
  return Math.max(0, Math.min(1, numberValue));
}

function stringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => clean(String(item))).filter(Boolean).slice(0, limit);
  return items.length ? items : undefined;
}

function sanitizeCharacterPatch(raw: unknown, character: AICharacter): Partial<AICharacter> {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  const patch: Partial<AICharacter> = {};
  if ('group' in record) patch.group = normalizeCharacterGroup(String(record.group || ''));
  if (typeof record.background === 'string') patch.background = record.background.trim().slice(0, 4000);
  if (typeof record.speakingStyle === 'string') patch.speakingStyle = record.speakingStyle.trim().slice(0, 1200);
  const expertise = stringArray(record.expertise);
  if (expertise) patch.expertise = expertise;
  if (record.personality && typeof record.personality === 'object') {
    const source = record.personality as Record<string, unknown>;
    const next = { ...character.personality };
    (Object.keys(DEFAULT_PERSONALITY) as Array<keyof typeof DEFAULT_PERSONALITY>).forEach((key) => {
      const value = clamp01(source[key]);
      if (value !== undefined) next[key] = value;
    });
    patch.personality = next;
  }
  if (record.behavior && typeof record.behavior === 'object') {
    const source = record.behavior as Record<string, unknown>;
    const next = { ...character.behavior };
    (Object.keys(DEFAULT_CHARACTER_BEHAVIOR) as Array<keyof typeof DEFAULT_CHARACTER_BEHAVIOR>).forEach((key) => {
      const value = clamp01(source[key]);
      if (value !== undefined) next[key] = value;
    });
    patch.behavior = next;
  }
  if (record.coreProfile && typeof record.coreProfile === 'object') {
    const source = record.coreProfile as Record<string, unknown>;
    const nextCoreProfile = { ...(character.coreProfile || {}) };
    if (typeof source.coreDesire === 'string') nextCoreProfile.coreDesire = source.coreDesire.trim().slice(0, 240);
    if (typeof source.coreFear === 'string') nextCoreProfile.coreFear = source.coreFear.trim().slice(0, 240);
    const values = stringArray(source.values, 10);
    if (values) nextCoreProfile.values = values;
    const biases = stringArray(source.biases, 10);
    if (biases) nextCoreProfile.biases = biases;
    const sensitivities = stringArray(source.sensitivities, 10);
    if (sensitivities) nextCoreProfile.sensitivities = sensitivities;
    const interactionHabits = stringArray(source.interactionHabits, 10);
    if (interactionHabits) nextCoreProfile.interactionHabits = interactionHabits;
    patch.coreProfile = nextCoreProfile;
  }
  return patch;
}

async function buildCharacterUpdatePatch(character: AICharacter, instruction: string, context: AppCommandContext) {
  const profile = getUsablePreferredAIProfile(context.aiProfiles, 'text') || context.apiConfig;
  const response = await generateResponse(
    {
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
    },
    [
      '你是 Sense Murmur 的角色资料补丁生成器。只输出严格 JSON。',
      '根据用户的修改要求和当前角色资料，返回允许更新的字段。',
      '允许字段：group, background, speakingStyle, expertise, personality, behavior, coreProfile。',
      'personality 和 behavior 的数值范围必须是 0 到 1。不要输出 id、name、avatar、memory、relationships 或其他字段。',
    ].join('\n'),
    [{ role: 'user', content: [`修改要求：${instruction}`, '', '当前角色：', formatCharacterForAgent(character)].join('\n') }],
    undefined,
    {
      responseFormat: 'json',
      maxTokens: 1000,
      aiUsage: { type: 'other', label: '角色资料修改计划', scope: 'app-command' },
    },
  );
  return sanitizeCharacterPatch(JSON.parse(extractJsonObject(response)), character);
}

function mergeExplicitCharacterPatch(plan: LocalActionPlan, patch: Partial<AICharacter>) {
  const targetGroup = normalizeCharacterGroup(plan.targetGroup);
  if (!targetGroup) return patch;
  return { ...patch, group: targetGroup };
}

async function updateCharactersByInstruction(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const instruction = clean(plan.updateInstruction || plan.summary || context.input);
  if (!instruction) return { status: 'info', title: '缺少修改要求', message: '请说明希望怎样修改角色。' };
  const matches = resolveCharacterMatches(plan, context.input);
  if (!matches.length) return { status: 'info', title: '没有找到角色', message: '没有找到要修改的角色。' };
  const allowsBatchUpdate = Boolean(plan.sourceGroup || plan.targetGroup || plan.characterQuery || (plan.characters?.length || 0) > 1);
  if (!allowsBatchUpdate && matches.length > 1) {
    const candidates = characterCandidates(matches);
    return {
      status: 'needs_confirmation',
      title: '找到多个角色',
      message: '找到多个可能要修改的角色，请选择一个，或明确要修改的分组。',
      candidates,
      choices: characterActionChoices(matches, plan),
      choicePresentation: candidates.length > 4 ? 'select' : 'chips',
    };
  }
  const patches = await Promise.all(matches.slice(0, 20).map(async (character) => ({
    id: character.id,
    character,
    updates: mergeExplicitCharacterPatch(plan, await buildCharacterUpdatePatch(character, instruction, context)),
  })));
  const validPatches = patches.filter((patch) => Object.keys(patch.updates).length > 0);
  if (!validPatches.length) return { status: 'info', title: '没有可应用修改', message: '没有生成可安全写入的角色字段修改。' };
  await useCharacterStore.getState().updateCharacters(validPatches.map((patch) => ({ id: patch.id, updates: patch.updates })));
  const names = validPatches.map((patch) => patch.character.name).join('、');
  return {
    status: 'success',
    title: '已更新角色',
    message: `已更新 ${validPatches.length} 个角色：${names}。`,
    markdown: `已更新 ${validPatches.length} 个角色：${names}。`,
    candidates: characterCandidates(validPatches.map((patch) => patch.character)),
  };
}

async function queryAiBalance(): Promise<AppCommandExecutionResult> {
  const balance = await api.getAiBalance(undefined, { force: true });
  return {
    status: 'success',
    title: 'AI 点数',
    message: `当前可用 AI 点数：${formatAiBalanceAmount(balance, undefined, { empty: '-' })}`,
  };
}

function updateTheme(plan: LocalActionPlan): AppCommandExecutionResult {
  const theme = plan.theme || 'dark';
  useSettingsStore.getState().setTheme(theme);
  return { status: 'success', title: '已切换主题', message: theme === 'dark' ? '已切换到夜间模式。' : theme === 'light' ? '已切换到浅色模式。' : '已切换为跟随系统。' };
}

function setAiModelKey(plan: LocalActionPlan, secrets: Record<string, string>): AppCommandExecutionResult {
  const key = resolveSecretRef(secrets, plan.apiKeyRef);
  if (!key) return { status: 'info', title: '没有找到秘钥', message: '没有识别到可写入的 API key。' };
  const hint = `${plan.providerHint || ''} ${plan.modelHint || ''}`.toLowerCase();
  const settings = useSettingsStore.getState();
  const target = settings.aiProfiles.find((profile) => {
    const text = `${profile.name} ${profile.provider} ${profile.model}`.toLowerCase();
    return hint ? hint.split(/\s+/).filter(Boolean).some((part) => text.includes(part)) : profile.type === 'text';
  }) || settings.aiProfiles.find((profile) => profile.type === 'text');
  if (!target) return { status: 'info', title: '没有可配置模型', message: '没有找到可写入的文本模型配置。' };
  settings.updateAIProfile(target.id, { apiKey: key });
  return { status: 'success', title: '已更新秘钥', message: `已更新“${target.name || target.model}”的 API key。` };
}

type LocalActionHandler = (plan: LocalActionPlan, context: AppCommandContext, secrets: Record<string, string>) => Promise<AppCommandExecutionResult> | AppCommandExecutionResult;

const LOCAL_ACTION_HANDLERS: Record<LocalActionPlan['action'], LocalActionHandler> = {
  create_character: createCharacters,
  create_characters: createCharacters,
  create_group_chat: createGroupChat,
  create_direct_chat: createDirectChat,
  open_existing_chat: openExistingChat,
  read_character_info: readCharacterInfo,
  compare_characters: compareCharacters,
  update_characters: updateCharactersByInstruction,
  query_ai_balance: () => queryAiBalance(),
  update_theme: (plan) => updateTheme(plan),
  set_ai_model_key: (plan, _context, secrets) => setAiModelKey(plan, secrets),
  navigate: (plan, context) => {
    if (!plan.routePath) return { status: 'info', title: '缺少页面', message: '没有找到要打开的页面。' };
    const webPath = resolveCommandUrlForWeb(plan.routePath);
    if (context.source === 'assistant') {
      return {
        status: 'needs_confirmation',
        title: plan.title || '找到可打开页面',
        message: plan.summary || '请确认要打开这个页面。',
        choices: [{ id: 'open-page', label: plan.title || '打开页面', url: plan.routePath, kind: 'execute' }],
        choicePresentation: 'chips',
      };
    }
    context.navigate?.(webPath);
    return { status: 'success', title: '已打开页面', message: '已为你打开对应页面。', navigateTo: webPath };
  },
};

async function executeLocalActionPlan(route: Extract<AppCommandRoute, { mode: 'local_action' }>, context: AppCommandContext, secrets: Record<string, string>): Promise<AppCommandExecutionResult> {
  const plan = route.plan;
  if (shouldOpenSingleCharacterFromHome(plan, context)) {
    return createDirectChat({ ...plan, characterName: buildPlannedCharacters(plan, context.input)[0]?.name }, context);
  }
  const handler = LOCAL_ACTION_HANDLERS[plan.action];
  return handler ? handler(plan, context, secrets) : { status: 'info', title: '暂不支持', message: '这个动作暂时无法直接执行，已建议交给助手处理。' };
}

async function executeWorkflowRoute(route: Extract<AppCommandRoute, { mode: 'workflow' }>, context: AppCommandContext, secrets: Record<string, string>): Promise<AppCommandExecutionResult> {
  const completed: AppCommandExecutionResult[] = [];
  for (const step of route.steps) {
    const stepResult = await executeAppCommandRoute(localActionRouteFromStep(step, true), context, secrets);
    if (stepResult.status === 'needs_confirmation') return stepResult;
    completed.push(stepResult);
  }
  const last = completed.at(-1);
  const summary = completed
    .filter((item) => item.status === 'success')
    .map((item) => item.title)
    .filter(Boolean)
    .join('、');
  return {
    status: last?.status || 'info',
    title: route.title || last?.title || '已完成',
    message: route.summary || (summary ? `已完成：${summary}。` : last?.message || '已完成。'),
    markdown: last?.markdown,
    navigateTo: last?.navigateTo,
    candidates: last?.candidates,
    choices: last?.choices,
    choicePresentation: last?.choicePresentation,
  };
}

export async function executeAppCommandRoute(route: AppCommandRoute, context: AppCommandContext, secrets: Record<string, string> = {}): Promise<AppCommandExecutionResult> {
  if (route.mode === 'final_response') {
    return {
      status: 'success',
      title: route.title,
      message: route.message,
      markdown: route.message,
    };
  }
  if (route.mode === 'assistant_agent') {
    return {
      status: 'info',
      title: '需要助手继续处理',
      message: route.initialMessage,
    };
  }
  if (route.mode === 'workflow') {
    if (route.choices?.length) {
      savePendingRoute(context, route, secrets, undefined, route.choices);
      return {
        status: 'needs_confirmation',
        title: route.title || '请选择操作',
        message: route.confirmationText || route.summary || '请选择一种执行方式。',
        choices: route.choices,
      };
    }
    if (route.requiresConfirmation) {
      savePendingRoute(context, route, secrets, undefined, route.choices);
      return {
        status: 'needs_confirmation',
        title: route.title || '确认执行',
        message: route.confirmationText || route.summary || '这个操作会执行多个步骤，确认后继续。',
        choices: route.choices,
      };
    }
    return executeWorkflowRoute(route, context, secrets);
  }
  const plan = route.plan;
  if (route.choices?.length) {
    savePendingRoute(context, route, secrets, undefined, route.choices);
    return {
      status: 'needs_confirmation',
      title: plan.title || '请选择操作',
      message: route.confirmationText || plan.summary || '请选择一种执行方式。',
      choices: route.choices,
    };
  }
  if (route.requiresConfirmation) {
    savePendingRoute(context, route, secrets, undefined, route.choices);
    return {
      status: 'needs_confirmation',
      title: plan.title || '确认执行',
      message: route.confirmationText || plan.summary || '这个操作会创建或修改内容，确认后继续执行。',
      choices: route.choices,
    };
  }
  const result = await executeLocalActionPlan(route, context, secrets);
  if (result.status === 'needs_confirmation') savePendingRoute(context, route, secrets, result.candidates, result.choices);
  return result;
}
