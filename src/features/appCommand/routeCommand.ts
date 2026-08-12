import { generateResponse } from '../../services/aiClient';
import { getUsablePreferredAIProfile } from '../../types/settings';
import type { AppCommandChoice, AppCommandContext, AppCommandRiskLevel, AppCommandRoute, LocalActionPlan, PlannedCharacter } from './commandTypes';
import { redactCommandSecrets } from './secretRedaction';
import {
  getAppCommandToolPrompt,
  isSupportedAppCommandAction,
  maxAppCommandRiskLevel,
  normalizeAppCommandActionRisk,
  shouldConfirmAppCommandTool,
} from './toolRegistry';

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function parsePlannerJson(text: string): unknown {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  return JSON.parse(jsonText);
}

function shortText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function positiveInteger(value: unknown, max: number) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;
  return Math.min(max, Math.floor(numberValue));
}

function nonNegativeInteger(value: unknown, max: number) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return undefined;
  return Math.min(max, Math.floor(numberValue));
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
  const rawUpdates = rawPlan.updates && typeof rawPlan.updates === 'object' ? rawPlan.updates as Record<string, unknown> : {};
  const action = shortText(raw.action ?? rawPlan.action, 60) as LocalActionPlan['action'];
  return {
    action,
    title: shortText(rawPlan.title, 80),
    summary: shortText(rawPlan.summary, 260),
    characterName: shortText(rawPlan.characterName ?? rawPlan.character_name, 40),
    characters: normalizeCharacters(rawPlan.characters),
    characterQuery: shortText(rawPlan.characterQuery ?? rawPlan.character_query, 120),
    characterQueryMode: rawPlan.characterQueryMode === 'collection' || rawPlan.character_query_mode === 'collection' ? 'collection' : rawPlan.characterQueryMode === 'single' || rawPlan.character_query_mode === 'single' ? 'single' : undefined,
    groupName: shortText(rawPlan.groupName ?? rawPlan.group_name, 80),
    groupTopic: shortText(rawPlan.groupTopic ?? rawPlan.group_topic, 260),
    groupStyle: rawPlan.groupStyle === 'debate' || rawPlan.groupStyle === 'brainstorm' || rawPlan.groupStyle === 'roleplay' ? rawPlan.groupStyle : 'free',
    roomTemplateKey: shortText(rawPlan.roomTemplateKey ?? rawPlan.room_template_key, 80),
    scenarioId: shortText(rawPlan.scenarioId ?? rawPlan.scenario_id, 80),
    roomKind: shortText(rawPlan.roomKind ?? rawPlan.room_kind, 80),
    storyBackground: shortText(rawPlan.storyBackground ?? rawPlan.story_background, 1200),
    storyDirection: shortText(rawPlan.storyDirection ?? rawPlan.story_direction, 1200),
    storyOutline: shortText(rawPlan.storyOutline ?? rawPlan.story_outline, 1200),
    studyGoalLabel: shortText(rawPlan.studyGoalLabel ?? rawPlan.study_goal_label, 240),
    agentGoalLabel: shortText(rawPlan.agentGoalLabel ?? rawPlan.agent_goal_label, 360),
    werewolfRoleConfig: shortText(rawPlan.werewolfRoleConfig ?? rawPlan.werewolf_role_config, 800),
    werewolfPostGameMode: shortText(rawPlan.werewolfPostGameMode ?? rawPlan.werewolf_post_game_mode, 80),
    mysteryScript: shortText(rawPlan.mysteryScript ?? rawPlan.mystery_script, 1200),
    mysteryRoleMappingMode: shortText(rawPlan.mysteryRoleMappingMode ?? rawPlan.mystery_role_mapping_mode, 80),
    boardColumns: positiveInteger(rawPlan.boardColumns ?? rawPlan.board_columns, 32),
    boardRows: positiveInteger(rawPlan.boardRows ?? rawPlan.board_rows, 32),
    deductionFactionCount: positiveInteger(rawPlan.deductionFactionCount ?? rawPlan.deduction_faction_count, 12),
    mysteryClueCount: positiveInteger(rawPlan.mysteryClueCount ?? rawPlan.mystery_clue_count, 50),
    chatQuery: shortText(rawPlan.chatQuery ?? rawPlan.chat_query, 120),
    chatId: shortText(rawPlan.chatId ?? rawPlan.chat_id, 160),
    chatTypePreference: rawPlan.chatTypePreference === 'group' || rawPlan.chatTypePreference === 'direct' || rawPlan.chatTypePreference === 'assistant' ? rawPlan.chatTypePreference : 'any',
    chatSearchScope: rawPlan.chatSearchScope === 'local' || rawPlan.chatSearchScope === 'cloud' || rawPlan.chatSearchScope === 'auto'
      ? rawPlan.chatSearchScope
      : rawPlan.chat_search_scope === 'local' || rawPlan.chat_search_scope === 'cloud' || rawPlan.chat_search_scope === 'auto'
        ? rawPlan.chat_search_scope
        : undefined,
    chatSearchSortBy: rawPlan.chatSearchSortBy === 'relevance' || rawPlan.chatSearchSortBy === 'time_desc' || rawPlan.chatSearchSortBy === 'time_asc'
      ? rawPlan.chatSearchSortBy
      : rawPlan.chat_search_sort_by === 'relevance' || rawPlan.chat_search_sort_by === 'time_desc' || rawPlan.chat_search_sort_by === 'time_asc'
        ? rawPlan.chat_search_sort_by
        : undefined,
    chatSearchLimit: positiveInteger(rawPlan.chatSearchLimit ?? rawPlan.chat_search_limit, 100),
    chatSearchOffset: nonNegativeInteger(rawPlan.chatSearchOffset ?? rawPlan.chat_search_offset, 100000),
    sourceGroup: shortText(rawPlan.sourceGroup ?? rawPlan.source_group, 80),
    targetGroup: shortText(rawPlan.targetGroup ?? rawPlan.target_group ?? rawUpdates.group, 80),
    updateInstruction: shortText(rawPlan.updateInstruction ?? rawPlan.update_instruction, 260),
    compareQuestion: shortText(rawPlan.compareQuestion ?? rawPlan.compare_question, 260),
    chatName: shortText(rawPlan.chatName ?? rawPlan.chat_name, 80),
    newName: shortText(rawPlan.newName ?? rawPlan.new_name, 80),
    newTopic: shortText(rawPlan.newTopic ?? rawPlan.new_topic, 260),
    openingMessage: shortText(rawPlan.openingMessage ?? rawPlan.opening_message, 500),
    selectionMode: rawPlan.selectionMode === 'random' || rawPlan.selection_mode === 'random'
      ? 'random'
      : rawPlan.selectionMode === 'recent' || rawPlan.selection_mode === 'recent'
        ? 'recent'
        : undefined,
    memberOperation: rawPlan.memberOperation === 'add' || rawPlan.memberOperation === 'remove' || rawPlan.memberOperation === 'set'
      ? rawPlan.memberOperation
      : rawPlan.member_operation === 'add' || rawPlan.member_operation === 'remove' || rawPlan.member_operation === 'set'
        ? rawPlan.member_operation
        : undefined,
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

function normalizeLocalActionStep(raw: unknown, source: AppCommandContext['source']): AppCommandRoute['mode'] extends never ? never : Extract<AppCommandRoute, { mode: 'workflow' }>['steps'][number] | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const plan = normalizePlan(record);
  if (!isSupportedAppCommandAction(plan.action)) return null;
  const rawRisk = record.riskLevel ?? record.risk_level;
  const plannerRiskLevel = rawRisk === 'high' || rawRisk === 'medium' ? rawRisk : 'low';
  const riskLevel = normalizeAppCommandActionRisk(plan.action, plannerRiskLevel);
  const requestedConfirmation = record.requiresConfirmation ?? record.requires_confirmation;
  return {
    action: plan.action,
    plan,
    riskLevel,
    requiresConfirmation: shouldConfirmAppCommandTool({
      action: plan.action,
      source,
      riskLevel,
      requestedConfirmation: typeof requestedConfirmation === 'boolean' ? requestedConfirmation : undefined,
    }),
    confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
  };
}

function buildRecentConversationContext(context: AppCommandContext) {
  const recent = (context.recentMessages || [])
    .map((message) => ({
      role: message.role,
      content: shortText(redactCommandSecrets(message.content).text, 700),
    }))
    .filter((message) => message.content);
  if (!recent.length) return '';
  return [
    '近期对话上下文如下。它只用于解析“这三个角色”“刚才那个群聊”等指代，不代表用户最新输入已经改变：',
    JSON.stringify(recent.slice(-8)),
    '',
    `用户最新输入：${context.input}`,
  ].join('\n');
}

function requiresConfirmationForRoute(record: Record<string, unknown>, action: LocalActionPlan['action'], source: AppCommandContext['source'], riskLevel: AppCommandRiskLevel, choices: AppCommandChoice[]) {
  const requestedConfirmation = record.requiresConfirmation ?? record.requires_confirmation;
  return shouldConfirmAppCommandTool({
    action,
    source,
    riskLevel,
    hasChoices: choices.length > 0,
    requestedConfirmation: typeof requestedConfirmation === 'boolean' ? requestedConfirmation : undefined,
  });
}

function normalizeRoute(raw: unknown, fallbackInput: string, source: AppCommandContext['source']): AppCommandRoute {
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
      const rawRiskLevel = rawRisk === 'high' || rawRisk === 'medium' ? rawRisk : 'low';
      const riskLevel = normalizeAppCommandActionRisk(plan.action, rawRiskLevel);
      return {
        mode: 'local_action',
        action: plan.action,
        plan,
        riskLevel,
        requiresConfirmation: requiresConfirmationForRoute(record, plan.action, source, riskLevel, choices),
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
      ? record.steps.map((step) => normalizeLocalActionStep(step, source)).filter((step): step is NonNullable<typeof step> => Boolean(step)).slice(0, 6)
      : [];
    const rawRisk = record.riskLevel ?? record.risk_level;
    const maxStepRisk = steps.some((step) => step.riskLevel === 'high') ? 'high' : steps.some((step) => step.riskLevel === 'medium') ? 'medium' : 'low';
    const rawRiskLevel = rawRisk === 'high' || rawRisk === 'medium' || rawRisk === 'low' ? rawRisk : maxStepRisk;
    const riskLevel = maxAppCommandRiskLevel(rawRiskLevel, maxStepRisk);
    const choices = normalizeChoices(record.choices);
    if (!steps.length) {
      const directPlan = normalizePlan(record);
      const choicePlan = choices.find((choice) => choice.plan?.action && choice.plan.plan)?.plan;
      const choiceAction = choicePlan?.action as LocalActionPlan['action'] | undefined;
      const action = isSupportedAppCommandAction(directPlan.action)
        ? directPlan.action
        : choiceAction && isSupportedAppCommandAction(choiceAction)
          ? choiceAction
          : undefined;
      const plan = isSupportedAppCommandAction(directPlan.action)
        ? directPlan
        : choicePlan?.plan
          ? normalizePlan({ action, plan: choicePlan.plan })
          : null;
      if (action && plan) {
        return {
          mode: 'local_action',
          action,
          plan,
          riskLevel,
          requiresConfirmation: requiresConfirmationForRoute(record, action, source, riskLevel, choices),
          confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
          choices,
          choicePresentation: record.choicePresentation === 'list' || record.choicePresentation === 'select' ? record.choicePresentation : undefined,
        };
      }
      return { mode: 'assistant_agent', initialMessage: fallbackInput, reason: 'workflow_empty' };
    }
    return {
      mode: 'workflow',
      title: shortText(record.title, 80),
      summary: shortText(record.summary, 260),
      steps,
      riskLevel,
      requiresConfirmation: shouldConfirmAppCommandTool({
        action: steps[0]?.action || 'navigate',
        source,
        riskLevel,
        hasChoices: choices.length > 0,
        requestedConfirmation: typeof (record.requiresConfirmation ?? record.requires_confirmation) === 'boolean'
          ? Boolean(record.requiresConfirmation ?? record.requires_confirmation)
          : undefined,
      }),
      confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
      choices,
      choicePresentation: record.choicePresentation === 'list' || record.choicePresentation === 'select' ? record.choicePresentation : undefined,
    };
  }
  const plan = normalizePlan(record);
  if (!isSupportedAppCommandAction(plan.action)) {
    return { mode: 'assistant_agent', initialMessage: fallbackInput, reason: 'unsupported_action' };
  }
  const rawRisk = record.riskLevel ?? record.risk_level;
  const rawRiskLevel = rawRisk === 'high' || rawRisk === 'medium' ? rawRisk : 'low';
  const riskLevel = normalizeAppCommandActionRisk(plan.action, rawRiskLevel);
  const choices = normalizeChoices(record.choices);
  return {
    mode: 'local_action',
    action: plan.action,
    plan,
    riskLevel,
    requiresConfirmation: requiresConfirmationForRoute(record, plan.action, source, riskLevel, choices),
    confirmationText: shortText(record.confirmationText ?? record.confirmation_text, 260),
    choices,
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
    '你是目标驱动的多步 Agent，不是一次性命令分类器。每次决策都先判断：用户最终目标是什么、当前已知状态是什么、目标是否完成、还缺什么、当前工具能力中哪一步最能推进目标。',
    '工具未命中只是 observation，不代表用户目标失败；只要仍有可用工具能推进原始目标，就继续规划下一步。不要把某个工具的失败当成最终答案。',
    '收到“这是站内 Agent 的执行观察结果”时，必须读取 originalGoal、上一轮路由、失败/阻塞类型、结构化观察和 possibleNextActions，重新选择下一步。recoverable=true 时不要输出 final_response，除非 observation 已说明没有任何可行下一步，或继续执行会越权/高风险/需要用户澄清。',
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
    '- 数据源必须由你判断：问角色库资料、身份、职业、专长、背景或设定时用 read_character_info；问聊天/对话/历史消息/刚才聊过什么/在哪个会话出现过时用 search_chats 或 open_existing_chat；不要把聊天内容问题误送到角色库。',
    '- 角色检索不要编造 ID，也不要把本地角色 id 写进 characterName、characters[].name 或 characterQuery；只输出用户可见名称、分组、自然语言查询，执行器会在本地角色库匹配。',
    '- 会话类目标不要只按字面动词选择工具。若用户目标是“获得一个可继续对话的对象或场景”，可以组合查找、复用、创建和打开等工具；若目标是“找回特定历史内容”，则应优先检索已有数据，未命中时澄清或说明。',
    '- 创建类、打开类、读取类、修改类、配置类请求都按目标状态判断是否完成：例如目标是“能开始使用”，最终状态通常应是已打开或已准备好，而不只是某个中间查询完成。',
    '- 创建群聊或玩法房时，必须把用户想要的玩法形态写入 roomTemplateKey、scenarioId 或 roomKind；不要把故事房、审议、剧本杀、棋盘、学习、任务协作等已开放玩法降级为普通自由群聊。',
    '- 创建群聊或玩法房时，不要默认输出 includeUserAsMember 或 showRoleActions；执行器会沿用用户上一次的新建群聊默认值。只有用户明确要求“我也加入/不要我加入/显示动作/关闭动作”等时才写对应布尔字段。',
    '- 玩法消歧：用户明确说“故事房”“互动故事”“读者选择”“关键选择影响剧情”时，优先 story/story_reader，即使题材是悬疑；只有明确说“剧本杀”“案件推理”“搜证”“线索”“角色身份/凶手”时，才用 mystery/剧本杀。',
    '- 如果用户描述了故事背景、剧情方向、案件、规则、学习目标或任务目标，应把这些内容写入对应玩法参数，而不是只塞进 groupTopic。',
    '- 创建群聊或玩法房时，如果本地角色库中已有角色和用户主题、时代、地点、人物关系明显相关，必须优先写入 plan.characters 或 characterName；不要创建空房间再让用户手动补。',
    '- 如果用户要求 N 人玩法房且本地角色不足，必须 workflow 先 create_characters 补齐，或在 create_group_chat 的 plan.characters 里直接列出 N 个可创建角色。',
    '- 创建或打开单聊/群聊时，如果用户输入里包含进入后要发送给角色的明确开场、问题或第一句话，必须写入 openingMessage，只保留要发进聊天的那句话，不要把“帮我创建/让我进入/和某某聊天”等应用指令一起放进去。例如“让我和秦始皇单聊：统一六国之后，他最怕哪件事失控？”应 create_direct_chat characterName=秦始皇 openingMessage=统一六国之后，你最怕哪件事失控？',
    '- 玩法参数字段写普通短文本，不要在字符串里嵌套 JSON、数组或大量转义内容。',
    '- 同名或多候选角色需要 choices；每个 choice 的 label 必须带分组或摘要差异，choice.plan 里也要带 characterQuery、characterName、characters[].group 等可用于本地消歧的信息。',
    '- 对“秦始皇的性格怎么样”“A 和 B 谁更擅长做菜”“结合角色库信息回答”这类请求，必须使用 read_character_info 或 compare_characters；不要直接 final_response，不要退回 assistant_agent，也不要只凭摘要自由回答。',
    '- 对“哪些角色是皇帝/有哪些医生/列出擅长摄影的人”等按身份、职业、专长、背景或设定筛选角色库的集合查询，必须使用 read_character_info，并由你把 characterQueryMode 设为 collection、characterQuery 写成核心筛选条件（如“皇帝”“医生”“摄影”）；不要直接声称没有角色。',
    '- 对“哪个聊天里提到皇帝/搜索聊天记录里的世界杯/刚才哪些会话聊过秦始皇”等聊天记录/玩法房时间线检索，必须使用 search_chats，并把 chatQuery 写成核心检索条件。先判断用户是在“找记录”还是“直接打开那个会话”：前者用 search_chats，后者只有在目标唯一时才用 open_existing_chat。',
    '- search_chats 不是裸搜索。planner 要尽量从自然语言里提炼关键词、时间范围、会话类型、排序和分页：用户明确说云端/服务器/数据库/全部/完整历史时设置 chatSearchScope=cloud；否则默认 auto。用户要求最近/最新/按时间时设置 chatSearchSortBy=time_desc，要求最早/从早到晚时设置 time_asc，未指定时 relevance。用户要求数量时设置 chatSearchLimit，最大 100。chatSearchOffset 是分页字段，除非用户明确要求继续上一页之后的结果，否则不要设置。',
    '- 如果上一轮上下文已经显示 search_chats 未命中或结果太泛，下一轮不要重复原样检索；应改成更具体的关键词、缩小时间范围、切换会话类型或改用 cloud/local。若用户说“换个词再找/继续找/再搜一次”，优先保留原目标并优化检索条件，而不是直接 final_response。',
    '- search_chats 命中后，执行器会返回可点击结果列表和跳转位置；planner 不要把它再包装成“打开会话”完成态，除非用户明确只想进入唯一会话。若命中多个结果，返回的核心目标应是“列出并让用户选”，而不是自动跳转。',
    '- 如果用户要求“列出”“找出哪些会话”“返回前几个结果”“查看更多”，优先把这视为 search_chats 的分页/列表任务；如果只说“找一下”但没有足够关键词，可先保留最核心实体词，再补时间或范围到 search_chats。',
    '- 对“把某分组下角色都改成...”“把喜羊羊相关的角色都移动到喜羊羊分组中”“把小明调外向一点”这类请求，输出 update_characters，并设置 riskLevel=high、requiresConfirmation=true。',
    '- 对“删除/移除/清理某些角色”“删掉刚才创建的角色”“删除这三个角色”这类请求，输出 delete_characters；若近期上下文能明确指向角色名，必须写入 characters[].name，不要改成 create_characters、update_characters 或 final_response。',
    '- delete_characters 是移入回收站，不是永久清空；当角色名称或范围明确时可以 requiresConfirmation=false，范围不明确或多候选时由执行器继续让用户选择。',
    '- 对“恢复/找回/撤销删除某角色”输出 restore_characters；对“打开某角色资料/设置/编辑页”输出 open_character；对“把某角色改名为 X”输出 rename_character。',
    '- 对“删除/恢复/重命名某会话/群聊/助手”分别输出 delete_chats、restore_chats、rename_chat；目标不明确时让执行器返回候选。',
    '- 对“修改聊天主题/换群聊话题/给某个群聊换新主题”输出 update_chat_topic，newTopic 写新话题；没有明确群聊但用户说随机时 selectionMode=random、chatTypePreference=group；用户说最近时 selectionMode=recent。注意这和程序外观主题不同。',
    '- 对“新建助手会话”输出 create_assistant_chat；对“给群聊添加/移除/替换成员”输出 manage_group_members，并写 memberOperation=add/remove/set。',
    '- 对“切换程序外观主题/应用主题/夜间模式/浅色模式/跟随系统/随机换个外观主题”输出 update_theme，theme 为 light、dark 或 system；如果用户说随机，任选一个和当前无关的合法主题即可。不要和聊天主题混淆。',
    '- 对“设置模型为 deepseek / 配置 OpenAI / 配置图片模型 / 模型怎么设置”这类没有提供真实 key 或完整配置的请求，输出 navigate，routePath 使用 ssmm://settings?action=open&tab=models&card=models，不要假装已经设置完成。',
    '- 需要跳转页面时，routePath 优先使用跨平台 AppLink，例如 ssmm://settings?action=open&tab=models&card=models、ssmm://characters?action=open、ssmm://chats?action=open；不要输出 hash 路由或平台私有路径。',
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
  const userPrompt = buildRecentConversationContext({ ...context, input: redacted.text }) || redacted.text;
  const response = await generateResponse(
    {
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
    },
    buildPlannerPrompt(context.source),
    [{ role: 'user', content: userPrompt }],
    undefined,
    {
      responseFormat: 'json',
      maxTokens: 1800,
      aiUsage: { type: 'other', label: '应用指令规划', scope: 'app-command' },
    },
  );
  return {
    route: normalizeRoute(parsePlannerJson(response), context.input, context.source),
    secrets: redacted.secrets,
  };
}
