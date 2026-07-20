import type { NavigateFunction } from 'react-router-dom';
import { api } from '../../services/api';
import { buildDirectChatDraft, buildGroupChatDraft } from '../../services/chatDraftBuilder';
import { generateCharacterProfilesSafe } from '../../services/characterGenerator';
import { useCharacterStore } from '../../stores/useCharacterStore';
import { useChatStore } from '../../stores/useChatStore';
import { useMessageStore } from '../../stores/useMessageStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { AICharacter } from '../../types/character';
import { DEFAULT_CHARACTER_BEHAVIOR, DEFAULT_CHARACTER_INTERVENTION, DEFAULT_CHARACTER_MEMORY, DEFAULT_PERSONALITY } from '../../types/character';
import { getUsablePreferredAIProfile } from '../../types/settings';
import { formatAiBalanceAmount } from '../../utils/aiPoints';
import type { AppCommandCandidate, AppCommandChoice, AppCommandContext, AppCommandExecutionResult, AppCommandRoute, LocalActionPlan, PlannedCharacter } from './commandTypes';
import { savePendingAppCommand } from './pendingCommandStore';
import { resolveSecretRef } from './secretRedaction';

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

function chatUrl(chatId: string, tab: number) {
  return `/chats/${encodeURIComponent(chatId)}?fromTab=${tab}`;
}

function markdownChatLink(label: string, chatId: string, tab: number) {
  return `[${label}](${chatUrl(chatId, tab)})`;
}

function scoreText(text: string, query: string) {
  const source = text.toLowerCase();
  const target = query.toLowerCase();
  if (!target) return 0;
  if (source.includes(target)) return 20 + target.length;
  return target.split(/\s+/).filter((part) => part && source.includes(part)).length;
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

async function openExistingChat(plan: LocalActionPlan, navigate?: NavigateFunction): Promise<AppCommandExecutionResult> {
  const query = clean(plan.chatQuery || plan.groupTopic || plan.characterName || plan.title);
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
      return { chat, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 5);
  const best = top[0]?.chat;
  if (!best) {
    return { status: 'info', title: '没有找到会话', message: query ? `没有找到和“${query}”相关的会话。` : '没有找到可打开的会话。' };
  }
  const candidates: AppCommandCandidate[] = top.map(({ chat, score }) => {
    const tab = chat.type === 'assistant' ? 3 : chat.type === 'direct' ? 1 : 0;
    return {
      id: chat.id,
      label: chat.name,
      description: [chat.type === 'group' ? '群聊' : chat.type === 'direct' ? '单聊' : '助手', chat.topic].filter(Boolean).join(' · '),
      url: chatUrl(chat.id, tab),
      score,
      kind: chat.type,
    };
  });
  const secondScore = top[1]?.score || 0;
  const typeMismatch = plan.chatTypePreference && plan.chatTypePreference !== 'any' && best.type !== plan.chatTypePreference;
  if ((secondScore > 0 && ranked[0].score - secondScore <= 2) || typeMismatch) {
    return {
      status: 'needs_confirmation',
      title: typeMismatch ? '找到的会话类型不完全匹配' : '找到多个相近会话',
      message: typeMismatch
        ? `最相关的是“${best.name}”，但它不是你指定的${plan.chatTypePreference === 'group' ? '群聊' : plan.chatTypePreference === 'direct' ? '单聊' : '助手会话'}。`
        : `找到多个和“${query}”相近的会话，请确认要打开哪一个。`,
      candidates,
      choices: candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        description: candidate.description,
        url: candidate.url,
        kind: 'execute' as const,
      })).slice(0, 5),
      choicePresentation: candidates.length > 4 ? 'select' : 'chips',
    };
  }
  const tab = best.type === 'assistant' ? 3 : best.type === 'direct' ? 1 : 0;
  const url = chatUrl(best.id, tab);
  navigate?.(url);
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
    context.navigate?.(choice.url);
    return { status: 'success', title: '已打开', message: '已打开对应页面。', navigateTo: choice.url };
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

async function createDirectChat(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const name = clean(plan.characterName || plan.characters?.[0]?.name || plan.title);
  if (!name) return { status: 'info', title: '缺少角色名', message: '请告诉我想和哪个角色聊天。' };
  const [character] = await ensureCharacters([{ name, group: plan.characters?.[0]?.group || null, roleHint: plan.summary }], context);
  const existing = useChatStore.getState().chats.find((chat) => chat.type === 'direct' && chat.memberIds.includes(character.id));
  const chat = existing || await useChatStore.getState().addChat(buildDirectChatDraft(character.id, character.name));
  const url = chatUrl(chat.id, 1);
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
  if (!plannedCharacters.length) return { status: 'info', title: '缺少角色', message: '创建群聊前需要至少一个角色。' };
  const members = await ensureCharacters(plannedCharacters, context);
  const memberIds = ['user', ...members.map((item) => item.id)];
  const title = clean(plan.groupName || plan.title) || `${plannedCharacters.slice(0, 3).map((item) => item.name).join('、')}的群聊`;
  const topic = clean(plan.groupTopic || plan.summary || context.input);
  const chat = await useChatStore.getState().addChat(buildGroupChatDraft({
    type: 'group',
    name: title,
    topic,
    style: plan.groupStyle || 'free',
    sessionKind: undefined,
    memberIds,
    operatorIds: [],
    showRoleActions: true,
    runtimeEvolutionIntensity: 'balanced',
    seedMemoryText: '',
    seedArtifactText: '',
    ownerCharacterId: null,
    adminCharacterIds: [],
    autoModeration: true,
    allowMute: false,
    allowPrivateThreads: false,
    allowCliques: true,
    allowMockery: false,
    mood: '',
    focus: topic,
    recentEvent: '',
    allowSpeakAs: true,
    allowDirectorMode: true,
    allowEventInjection: true,
    allowForcedReply: true,
  }));
  const url = chatUrl(chat.id, 0);
  context.navigate?.(url);
  return {
    status: 'success',
    title: '已创建群聊',
    message: `已创建“${chat.name}”，包含 ${members.length} 个角色。`,
    markdown: `已创建群聊：${markdownChatLink(chat.name, chat.id, 0)}`,
    navigateTo: url,
  };
}

async function createCharacters(plan: LocalActionPlan, context: AppCommandContext): Promise<AppCommandExecutionResult> {
  const plannedCharacters = plan.characters?.length ? plan.characters : (plan.characterName ? [{ name: plan.characterName, group: null, roleHint: plan.summary }] : []);
  const characters = await ensureCharacters(plannedCharacters, context);
  return {
    status: 'success',
    title: '已创建角色',
    message: `已准备 ${characters.length} 个角色。`,
    markdown: `已准备角色：${characters.map((item) => item.name).join('、')}。可以在[角色库](/characters)查看。`,
    navigateTo: '/characters',
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

export async function executeAppCommandRoute(route: AppCommandRoute, context: AppCommandContext, secrets: Record<string, string> = {}): Promise<AppCommandExecutionResult> {
  if (route.mode === 'assistant_agent') {
    return {
      status: 'info',
      title: '需要助手继续处理',
      message: route.initialMessage,
    };
  }
  const plan = route.plan;
  if (route.choices?.length && route.requiresConfirmation) {
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
  const selectedChoice = route.choices?.find((choice) => choice.kind !== 'cancel' && choice.kind !== 'confirm' && choice.plan);
  if (selectedChoice && (route.choices?.length || 0) > 1 && route.requiresConfirmation === false) {
    return executeChoice(plan, selectedChoice, context, secrets);
  }
  let result: AppCommandExecutionResult;
  if (plan.action === 'create_direct_chat') result = await createDirectChat(plan, context);
  else if (plan.action === 'create_group_chat') result = await createGroupChat(plan, context);
  else if (plan.action === 'create_character' || plan.action === 'create_characters') result = await createCharacters(plan, context);
  else if (plan.action === 'open_existing_chat') result = await openExistingChat(plan, context.navigate);
  else if (plan.action === 'query_ai_balance') result = await queryAiBalance();
  else if (plan.action === 'update_theme') result = updateTheme(plan);
  else if (plan.action === 'set_ai_model_key') result = setAiModelKey(plan, secrets);
  else if (plan.action === 'navigate' && plan.routePath) {
    context.navigate?.(plan.routePath);
    result = { status: 'success', title: '已打开页面', message: '已为你打开对应页面。', navigateTo: plan.routePath };
  }
  else result = { status: 'info', title: '暂不支持', message: '这个动作暂时无法直接执行，已建议交给助手处理。' };
  if (result.status === 'needs_confirmation') savePendingRoute(context, route, secrets, result.candidates, result.choices);
  return result;
}
