import { generateResponse } from '../../services/aiClient';
import { getUsablePreferredAIProfile } from '../../types/settings';
import type { AppCommandChoice, AppCommandContext, AppCommandRoute, LocalActionPlan, PlannedCharacter } from './commandTypes';
import { redactCommandSecrets } from './secretRedaction';
import { getAppCommandToolPrompt, isSupportedAppCommandAction } from './toolRegistry';

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
    characterQuery: shortText(rawPlan.characterQuery ?? rawPlan.character_query, 120),
    groupName: shortText(rawPlan.groupName ?? rawPlan.group_name, 80),
    groupTopic: shortText(rawPlan.groupTopic ?? rawPlan.group_topic, 260),
    groupStyle: rawPlan.groupStyle === 'debate' || rawPlan.groupStyle === 'brainstorm' || rawPlan.groupStyle === 'roleplay' ? rawPlan.groupStyle : 'free',
    chatQuery: shortText(rawPlan.chatQuery ?? rawPlan.chat_query, 120),
    chatTypePreference: rawPlan.chatTypePreference === 'group' || rawPlan.chatTypePreference === 'direct' || rawPlan.chatTypePreference === 'assistant' ? rawPlan.chatTypePreference : 'any',
    sourceGroup: shortText(rawPlan.sourceGroup ?? rawPlan.source_group, 80),
    targetGroup: shortText(rawPlan.targetGroup ?? rawPlan.target_group, 80),
    updateInstruction: shortText(rawPlan.updateInstruction ?? rawPlan.update_instruction, 260),
    compareQuestion: shortText(rawPlan.compareQuestion ?? rawPlan.compare_question, 260),
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

function normalizeLocalActionStep(raw: unknown): AppCommandRoute['mode'] extends never ? never : Extract<AppCommandRoute, { mode: 'workflow' }>['steps'][number] | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const plan = normalizePlan(record);
  if (!isSupportedAppCommandAction(plan.action)) return null;
  const rawRisk = record.riskLevel ?? record.risk_level;
  const riskLevel = rawRisk === 'high' || rawRisk === 'medium' ? rawRisk : 'low';
  return {
    action: plan.action,
    plan,
    riskLevel,
    requiresConfirmation: Boolean(record.requiresConfirmation ?? record.requires_confirmation ?? riskLevel !== 'low'),
    confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
  };
}

function normalizeRoute(raw: unknown, fallbackInput: string): AppCommandRoute {
  if (!raw || typeof raw !== 'object') {
    return { mode: 'assistant_agent', initialMessage: fallbackInput, reason: 'planner_empty' };
  }
  const record = raw as Record<string, unknown>;
  if (record.mode === 'assistant_agent') {
    const mode = record.preferredAgentMode;
    const plan = normalizePlan(record);
    const choices = normalizeChoices(record.choices);
    if (isSupportedAppCommandAction(plan.action)) {
      const rawRisk = record.riskLevel ?? record.risk_level;
      const riskLevel = rawRisk === 'high' || rawRisk === 'medium' ? rawRisk : 'low';
      return {
        mode: 'local_action',
        action: plan.action,
        plan,
        riskLevel,
        requiresConfirmation: Boolean(record.requiresConfirmation ?? record.requires_confirmation ?? riskLevel !== 'low'),
        confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
        choices,
        choicePresentation: record.choicePresentation === 'list' || record.choicePresentation === 'select' ? record.choicePresentation : undefined,
      };
    }
    return {
      mode: 'assistant_agent',
      initialMessage: shortText(record.initialMessage ?? record.initial_message, 2000) || fallbackInput,
      preferredAgentMode: mode === 'image' || mode === 'research' || mode === 'tool' ? mode : 'chat',
      reason: shortText(record.reason, 160),
    };
  }
  if (record.mode === 'final_response' && !record.action && !record.plan && !record.steps) {
    return {
      mode: 'final_response',
      title: shortText(record.title, 80) || '已完成',
      message: shortText(record.message ?? record.summary, 1000) || '已完成。',
    };
  }
  if (record.mode === 'workflow' || (record.mode === 'final_response' && Array.isArray(record.steps))) {
    const steps = Array.isArray(record.steps)
      ? record.steps.map(normalizeLocalActionStep).filter((step): step is NonNullable<typeof step> => Boolean(step)).slice(0, 6)
      : [];
    if (!steps.length) return { mode: 'assistant_agent', initialMessage: fallbackInput, reason: 'workflow_empty' };
    const rawRisk = record.riskLevel ?? record.risk_level;
    const maxStepRisk = steps.some((step) => step.riskLevel === 'high') ? 'high' : steps.some((step) => step.riskLevel === 'medium') ? 'medium' : 'low';
    const riskLevel = rawRisk === 'high' || rawRisk === 'medium' || rawRisk === 'low' ? rawRisk : maxStepRisk;
    return {
      mode: 'workflow',
      title: shortText(record.title, 80),
      summary: shortText(record.summary, 260),
      steps,
      riskLevel,
      requiresConfirmation: Boolean(record.requiresConfirmation ?? record.requires_confirmation ?? riskLevel !== 'low'),
      confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
      choices: normalizeChoices(record.choices),
      choicePresentation: record.choicePresentation === 'list' || record.choicePresentation === 'select' ? record.choicePresentation : undefined,
    };
  }
  const plan = normalizePlan(record);
  if (!isSupportedAppCommandAction(plan.action)) {
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
    '如果请求可由站内工具直接完成，输出 local_action；如果需要连续执行多个站内工具，输出 workflow。若是普通问答、生成/修改图片、生成/修改文档、代码、网页、表格、图表、文件分析、开放写作、需要多轮讨论或你不确定，输出 assistant_agent。只有当输入明确是上一轮执行观察、结果确认或任务已完成的总结请求时，才输出 final_response；普通用户原始请求不要输出 final_response。',
    '生成或编辑产物必须输出 assistant_agent，让助手页的 artifact 机制处理；不要用 local_action 或 workflow 模拟产物创建。',
    'workflow 是动态多步执行计划，不是固定模板。可把查询、创建、修改、打开等工具按用户目标组合，最多 6 步。',
    '如果用户意图有多个合理执行方式，仍输出 local_action，但必须提供 choices。每个 choice 是一个用户可点击操作，可以带自己的 action/plan。',
    '可用 local_action 由站内工具能力动态提供：',
    getAppCommandToolPrompt(source),
    '风险规则：查询、读取、比较、打开、跳转、切主题是 low；创建角色或聊天是 medium；修改角色资料、批量修改、设置秘钥或模型配置是 high。',
    source === 'home'
      ? '首页来源：这是一次性快捷入口。能明确执行的 local_action 默认直接执行，不要因为 medium 风险添加确认；只有设置秘钥或模型配置等 high 风险、关键信息缺失、存在多个同等合理结果时才设置 requiresConfirmation=true 或提供 choices。assistant_agent 会跳转到助手会话。'
      : '助手来源：可以把创建类动作规划出来，让助手和用户确认后执行；若用户已明确要求立即创建，也可以 local_action。',
    'choices 规则：',
    '- 简单确认可返回 choices=[{"id":"confirm","label":"创建角色和群聊","kind":"confirm"},{"id":"cancel","label":"取消","kind":"cancel"}]。',
    '- 不确定用户要做什么时，返回多个 execute choices，例如“只创建角色”“只创建群聊”“创建角色+群聊”，每个 choice 带 action 和 plan。',
    '- 角色检索不要编造 ID，只输出名称、分组、自然语言查询；执行器会在本地角色库匹配。',
    '- 对“和 X 聊天”“打开和 X 的聊天”“进入之前聊到某主题的聊天”这类明确会话意图，优先使用 open_existing_chat；如果是新单聊意图可用 create_direct_chat。不要用 read_character_info 代替聊天跳转。',
    '- 同名或多候选角色需要 choices；每个 choice 的 label 必须带分组或摘要差异，choice.plan 里也要带 characterQuery、characterName、characters[].group 等可用于本地消歧的信息。',
    '- 对“秦始皇的性格怎么样”“A 和 B 谁更擅长做菜”这类请求，优先使用 read_character_info 或 compare_characters，不要退回 assistant_agent。',
    '- 对“把某分组下角色都改成...”“把喜羊羊相关的角色都移动到喜羊羊分组中”“把小明调外向一点”这类请求，输出 update_characters，并设置 riskLevel=high、requiresConfirmation=true。',
    '- sourceGroup 表示源分组筛选；targetGroup 表示写入目标分组。不要把“移动到 X 分组”里的 X 放到 sourceGroup。',
    '- “相关的角色”“包含某关键词的角色”应放到 characterQuery，而不是 sourceGroup。',
    '- choice 的 label 是用户可见按钮文字，短而明确；description 可说明影响。',
    '输出格式：',
    '{"mode":"local_action","action":"create_group_chat","riskLevel":"medium","requiresConfirmation":true,"confirmationText":"...","plan":{"action":"create_group_chat","title":"...","summary":"...","groupName":"...","groupTopic":"...","groupStyle":"free","characters":[{"name":"秦始皇","group":"皇帝","roleHint":"..."}]},"choices":[{"id":"create-both","label":"创建角色+群聊","kind":"confirm"},{"id":"characters-only","label":"只创建角色","kind":"execute","action":"create_characters","plan":{"action":"create_characters","characters":[{"name":"秦始皇"}]}},{"id":"cancel","label":"取消","kind":"cancel"}]}',
    '或 workflow：',
    '{"mode":"workflow","title":"...","summary":"...","riskLevel":"medium","requiresConfirmation":false,"steps":[{"action":"create_characters","riskLevel":"medium","requiresConfirmation":false,"plan":{"action":"create_characters","characters":[{"name":"..."}]}},{"action":"create_group_chat","riskLevel":"medium","requiresConfirmation":false,"plan":{"action":"create_group_chat","groupName":"...","characters":[{"name":"..."}]}}]}',
    '或：',
    '{"mode":"assistant_agent","initialMessage":"用户原始请求","preferredAgentMode":"chat|image|research|tool","reason":"..."}',
    '或任务完成：',
    '{"mode":"final_response","title":"已完成","message":"..."}',
    '产物任务 preferredAgentMode：图片/海报/插画/照片用 image；文档/代码/表格/网页/图表/文件处理用 tool；普通助手聊天用 chat；检索研究用 research。',
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
