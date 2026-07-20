import { generateResponse } from '../../services/aiClient';
import { getUsablePreferredAIProfile } from '../../types/settings';
import type { AppCommandChoice, AppCommandContext, AppCommandRoute, LocalActionPlan, PlannedCharacter } from './commandTypes';
import { redactCommandSecrets } from './secretRedaction';

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function parsePlannerJson(text: string): unknown {
  return JSON.parse(extractJsonObject(text));
}

function shortText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizeCharacters(value: unknown): PlannedCharacter[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PlannedCharacter | null => {
      if (typeof item === 'string') return { name: item.trim() };
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = shortText(record.name, 40);
      if (!name) return null;
      return {
        name,
        group: shortText(record.group, 40) || null,
        roleHint: shortText(record.roleHint ?? record.role_hint, 160),
      };
    })
    .filter((item): item is PlannedCharacter => item !== null && Boolean(item.name))
    .slice(0, 16);
}

function normalizePlan(raw: Record<string, unknown>): LocalActionPlan {
  const rawPlan = (raw.plan && typeof raw.plan === 'object' ? raw.plan : raw) as Record<string, unknown>;
  const action = shortText(raw.action ?? rawPlan.action, 60) as LocalActionPlan['action'];
  return {
    action,
    title: shortText(rawPlan.title, 80),
    summary: shortText(rawPlan.summary, 260),
    characterName: shortText(rawPlan.characterName ?? rawPlan.character_name, 40),
    characters: normalizeCharacters(rawPlan.characters),
    groupName: shortText(rawPlan.groupName ?? rawPlan.group_name, 80),
    groupTopic: shortText(rawPlan.groupTopic ?? rawPlan.group_topic, 260),
    groupStyle: rawPlan.groupStyle === 'debate' || rawPlan.groupStyle === 'brainstorm' || rawPlan.groupStyle === 'roleplay' ? rawPlan.groupStyle : 'free',
    chatQuery: shortText(rawPlan.chatQuery ?? rawPlan.chat_query, 120),
    chatTypePreference: rawPlan.chatTypePreference === 'group' || rawPlan.chatTypePreference === 'direct' || rawPlan.chatTypePreference === 'assistant' ? rawPlan.chatTypePreference : 'any',
    theme: rawPlan.theme === 'light' || rawPlan.theme === 'dark' || rawPlan.theme === 'system' ? rawPlan.theme : undefined,
    providerHint: shortText(rawPlan.providerHint ?? rawPlan.provider_hint, 80),
    modelHint: shortText(rawPlan.modelHint ?? rawPlan.model_hint, 80),
    apiKeyRef: shortText(rawPlan.apiKeyRef ?? rawPlan.api_key_ref, 40),
    routePath: shortText(rawPlan.routePath ?? rawPlan.route_path, 160),
  };
}

function normalizeChoices(value: unknown): AppCommandChoice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): AppCommandChoice[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const label = shortText(record.label, 64);
    if (!label) return [];
    const kind = record.kind === 'cancel' || record.kind === 'confirm' || record.kind === 'clarify' ? record.kind : 'execute';
    const rawPlan = record.plan && typeof record.plan === 'object' ? record.plan as Record<string, unknown> : record;
    const action = shortText(record.action ?? rawPlan.action, 60) as LocalActionPlan['action'];
    const plan = action ? normalizePlan({ action, plan: rawPlan }) : undefined;
    return [{
      id: shortText(record.id, 40) || `choice-${index + 1}`,
      label,
      description: shortText(record.description, 180),
      kind,
      input: shortText(record.input, 300),
      url: shortText(record.url, 240),
      plan: plan ? {
        action: plan.action,
        plan,
        confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
      } : undefined,
    }];
  }).slice(0, 10);
}

function normalizeRoute(raw: unknown, fallbackInput: string): AppCommandRoute {
  if (!raw || typeof raw !== 'object') {
    return { mode: 'assistant_agent', initialMessage: fallbackInput, reason: 'planner_empty' };
  }
  const record = raw as Record<string, unknown>;
  if (record.mode === 'assistant_agent') {
    const mode = record.preferredAgentMode;
    return {
      mode: 'assistant_agent',
      initialMessage: shortText(record.initialMessage ?? record.initial_message, 2000) || fallbackInput,
      preferredAgentMode: mode === 'image' || mode === 'research' || mode === 'tool' ? mode : 'chat',
      reason: shortText(record.reason, 160),
    };
  }
  const plan = normalizePlan(record);
  const allowed = new Set<LocalActionPlan['action']>([
    'create_character',
    'create_characters',
    'create_group_chat',
    'create_direct_chat',
    'open_existing_chat',
    'query_ai_balance',
    'update_theme',
    'set_ai_model_key',
    'navigate',
  ]);
  if (!allowed.has(plan.action)) {
    return { mode: 'assistant_agent', initialMessage: fallbackInput, reason: 'unsupported_action' };
  }
  const rawRisk = record.riskLevel ?? record.risk_level;
  const riskLevel = rawRisk === 'high' || rawRisk === 'medium' ? rawRisk : 'low';
  return {
    mode: 'local_action',
    action: plan.action,
    plan,
    riskLevel,
    requiresConfirmation: Boolean(record.requiresConfirmation ?? record.requires_confirmation ?? riskLevel !== 'low'),
    confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
    choices: normalizeChoices(record.choices),
    choicePresentation: record.choicePresentation === 'list' || record.choicePresentation === 'select' ? record.choicePresentation : undefined,
  };
}

function buildPlannerPrompt(source: AppCommandContext['source']) {
  return [
    '你是 Sense Murmur 的应用指令规划器。你只输出严格 JSON，不要 Markdown，不要解释。',
    '你负责理解用户自然语言，把请求路由成受控应用动作或助手 Agent。不要生成正文内容，不要编造资源 ID。',
    '如果请求可由站内工具直接完成，输出 local_action。若是普通问答、生成图片、长任务、文件分析、开放写作、需要多轮讨论或你不确定，输出 assistant_agent。',
    '如果用户意图有多个合理执行方式，仍输出 local_action，但必须提供 choices。每个 choice 是一个用户可点击操作，可以带自己的 action/plan。',
    '可用 local_action:',
    '- create_character: 创建单个角色。',
    '- create_characters: 批量创建角色。',
    '- create_group_chat: 创建群聊，并列出需要的角色。',
    '- create_direct_chat: 创建或打开单聊，characterName 必填。',
    '- open_existing_chat: 根据 chatQuery 查找会话。',
    '- query_ai_balance: 查询 AI 点数。',
    '- update_theme: 切换 light/dark/system。',
    '- set_ai_model_key: 设置模型 API key，必须只使用脱敏占位 apiKeyRef。',
    '- navigate: 跳转站内页面。',
    '风险规则：查询、打开、跳转、切主题是 low；创建角色或聊天是 medium；设置秘钥或模型配置是 high。',
    source === 'home'
      ? '首页来源：medium/high 需要确认；assistant_agent 会跳转到助手会话。'
      : '助手来源：可以把创建类动作规划出来，让助手和用户确认后执行；若用户已明确要求立即创建，也可以 local_action。',
    'choices 规则：',
    '- 简单确认可返回 choices=[{"id":"confirm","label":"创建角色和群聊","kind":"confirm"},{"id":"cancel","label":"取消","kind":"cancel"}]。',
    '- 不确定用户要做什么时，返回多个 execute choices，例如“只创建角色”“只创建群聊”“创建角色+群聊”，每个 choice 带 action 和 plan。',
    '- choice 的 label 是用户可见按钮文字，短而明确；description 可说明影响。',
    '输出格式：',
    '{"mode":"local_action","action":"create_group_chat","riskLevel":"medium","requiresConfirmation":true,"confirmationText":"...","plan":{"action":"create_group_chat","title":"...","summary":"...","groupName":"...","groupTopic":"...","groupStyle":"free","characters":[{"name":"秦始皇","group":"皇帝","roleHint":"..."}]},"choices":[{"id":"create-both","label":"创建角色+群聊","kind":"confirm"},{"id":"characters-only","label":"只创建角色","kind":"execute","action":"create_characters","plan":{"action":"create_characters","characters":[{"name":"秦始皇"}]}},{"id":"cancel","label":"取消","kind":"cancel"}]}',
    '或：',
    '{"mode":"assistant_agent","initialMessage":"用户原始请求","preferredAgentMode":"chat|image|research|tool","reason":"..."}',
  ].join('\n');
}

export async function routeAppCommand(context: AppCommandContext) {
  const profile = getUsablePreferredAIProfile(context.aiProfiles, 'text') || context.apiConfig;
  const redacted = redactCommandSecrets(context.input);
  const response = await generateResponse(
    {
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
    },
    buildPlannerPrompt(context.source),
    [{ role: 'user', content: redacted.text }],
    undefined,
    {
      responseFormat: 'json',
      maxTokens: 1800,
      aiUsage: { type: 'other', label: '应用指令规划', scope: 'app-command' },
    },
  );
  return {
    route: normalizeRoute(parsePlannerJson(response), context.input),
    secrets: redacted.secrets,
  };
}
