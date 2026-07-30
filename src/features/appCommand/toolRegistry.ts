import type { AppCommandAction, AppCommandObservation, AppCommandObservationNextAction, AppCommandRiskLevel, CommandSource, LocalActionPlan } from './commandTypes';

export interface AppCommandToolDefinition {
  action: Exclude<AppCommandAction, 'assistant_chat'>;
  title: string;
  riskLevel: AppCommandRiskLevel;
  defaultConfirmation?: Partial<Record<CommandSource, boolean>>;
  description: string;
  parameters: string[];
  validation?: {
    requiredAny?: Array<{
      fields: string[];
      title: string;
      message: string;
      reasonType: string;
      possibleNextActions?: AppCommandObservationNextAction[];
    }>;
  };
  examples: string[];
  sourcePolicy?: Partial<Record<CommandSource, string>>;
}

export interface AppCommandPlanValidationIssue {
  title: string;
  message: string;
  reasonType: string;
  recoverable: boolean;
  observation: AppCommandObservation;
}

export const APP_COMMAND_TOOLS: AppCommandToolDefinition[] = [
  {
    action: 'create_character',
    title: '创建单个角色',
    riskLevel: 'medium',
    description: '创建一个新角色。适合用户明确要新增人物、角色设定或模板。',
    parameters: ['characterName', 'characters[0].name', 'characters[0].group', 'characters[0].roleHint', 'summary'],
    examples: ['创建秦始皇角色', '生成一个嘴硬但心软的侦探角色'],
  },
  {
    action: 'create_characters',
    title: '批量创建角色',
    riskLevel: 'medium',
    description: '批量创建多个角色，可按主题、故事、作品或用户描述生成。',
    parameters: ['characters[].name', 'characters[].group', 'characters[].roleHint', 'summary'],
    examples: ['创建金庸常见角色', '根据这个故事批量创建主要人物'],
  },
  {
    action: 'create_group_chat',
    title: '创建群聊或玩法房',
    riskLevel: 'medium',
    description: '创建群聊并确保所需角色存在。可通过 roomTemplateKey/scenarioId/roomKind 选择自由群聊、故事房、审议、剧本杀、棋盘房、学习/任务等已开放玩法，并填入对应玩法参数。',
    parameters: ['groupName', 'groupTopic', 'groupStyle', 'roomTemplateKey', 'scenarioId', 'roomKind', 'characters[]', 'storyBackground', 'storyDirection', 'storyOutline', 'studyGoalLabel', 'agentGoalLabel', 'mysteryScript', 'boardColumns', 'boardRows', 'summary'],
    examples: ['想看10个皇帝在同一个群里', '创建一个三国谋士讨论AI的群聊', '生成一个宫斗故事房', '创建一个围绕产品方向的观点审议房'],
  },
  {
    action: 'create_direct_chat',
    title: '创建或打开单聊',
    riskLevel: 'medium',
    description: '和某个角色聊天；如果角色或单聊已存在，执行器会复用已有数据。',
    parameters: ['characterName', 'characters[0].name', 'summary'],
    examples: ['和秦始皇聊天', '我想找小明聊聊'],
  },
  {
    action: 'open_existing_chat',
    title: '打开已有会话',
    riskLevel: 'low',
    description: '按名称、主题或近期聊天内容查找已有单聊、群聊或助手会话。',
    parameters: ['chatQuery', 'chatTypePreference'],
    validation: {
      requiredAny: [{
        fields: ['chatQuery', 'groupTopic', 'characterName', 'title'],
        title: '缺少检索条件',
        message: '没有得到要打开的会话条件，请重新说明想找的会话。',
        reasonType: 'missing_chat_query',
        possibleNextActions: ['search_chats', 'assistant_agent'],
      }],
    },
    examples: ['进入之前聊到中元节的群聊', '打开和秦始皇的聊天'],
  },
  {
    action: 'search_chats',
    title: '搜索聊天记录',
    riskLevel: 'low',
    description: '在会话名称、主题、最近事件和已加载聊天消息中检索，返回匹配会话列表；不自动打开会话。',
    parameters: ['chatQuery', 'chatTypePreference', 'summary'],
    validation: {
      requiredAny: [{
        fields: ['chatQuery', 'groupTopic', 'characterName', 'title'],
        title: '缺少检索条件',
        message: '没有得到聊天检索条件，请重新说明想找的聊天内容。',
        reasonType: 'missing_chat_query',
        possibleNextActions: ['assistant_agent'],
      }],
    },
    examples: ['哪个聊天里提到皇帝', '搜索聊天记录里的世界杯', '哪些会话聊过秦始皇'],
  },
  {
    action: 'read_character_info',
    title: '读取角色信息',
    riskLevel: 'low',
    description: '读取用户角色库中的角色资料，并基于资料回答问题；也可按身份、职业、专长、背景或设定筛选并列出多个角色。不要编造角色 ID。',
    parameters: ['characterName', 'characterQuery', 'characterQueryMode', 'characters[]', 'summary'],
    validation: {
      requiredAny: [{
        fields: ['characterName', 'characterQuery', 'characters[].name'],
        title: '缺少检索条件',
        message: '没有得到要查询的角色条件，请重新说明角色名称或筛选条件。',
        reasonType: 'missing_character_query',
        possibleNextActions: ['assistant_agent'],
      }],
    },
    examples: ['我想看角色库中秦始皇的信息', '秦始皇的性格怎么样', '哪些角色是皇帝'],
  },
  {
    action: 'compare_characters',
    title: '比较角色',
    riskLevel: 'low',
    description: '基于用户角色库资料比较多个角色的能力、性格或背景。',
    parameters: ['characters[].name', 'characterQuery', 'compareQuestion', 'summary'],
    examples: ['A和B谁更擅长做菜', '小明和小红谁更外向'],
  },
  {
    action: 'update_characters',
    title: '修改角色资料',
    riskLevel: 'high',
    description: '按自然语言修改一个或一批角色的资料。characterQuery/characters/sourceGroup 用于定位角色；updateInstruction 描述修改内容；targetGroup 只表示写入目标分组。',
    parameters: ['characterQuery', 'characters[].name', 'sourceGroup', 'targetGroup', 'updateInstruction', 'summary'],
    examples: ['把喜羊羊相关的角色都移动到喜羊羊分组中', '把武侠分组下所有角色的说话风格改得更古风', '小明性格太懦弱了，需要调外向一点'],
  },
  {
    action: 'delete_characters',
    title: '删除角色',
    riskLevel: 'medium',
    description: '把一个或一批明确匹配的角色移入回收站。只在用户明确要求删除、移除、清理角色时使用；执行器会按本地角色库匹配，匹配不明确时要求用户选择。',
    parameters: ['characterQuery', 'characters[].name', 'sourceGroup', 'summary'],
    examples: ['删除秦始皇角色', '把刚才创建的三个角色删掉', '清理赛博茶馆分组里的角色'],
  },
  {
    action: 'restore_characters',
    title: '恢复角色',
    riskLevel: 'medium',
    description: '从回收站恢复一个或一批明确匹配的角色。只在用户明确要求恢复、找回、撤销删除角色时使用。',
    parameters: ['characterQuery', 'characters[].name', 'sourceGroup', 'summary'],
    examples: ['恢复刚才删除的角色', '把秦始皇从回收站找回来'],
  },
  {
    action: 'open_character',
    title: '打开角色资料',
    riskLevel: 'low',
    description: '打开明确匹配的角色资料或编辑页。用于“打开某个角色设置/资料/编辑页”。',
    parameters: ['characterName', 'characterQuery', 'characters[]'],
    examples: ['打开秦始皇角色设置', '进入小明的角色资料'],
  },
  {
    action: 'rename_character',
    title: '重命名角色',
    riskLevel: 'medium',
    description: '修改明确匹配角色的名称。执行器会检查重名；目标不明确时要求选择。',
    parameters: ['characterName', 'characterQuery', 'characters[]', 'newName', 'summary'],
    examples: ['把小明改名为林明', '秦始皇角色改名为始皇帝'],
  },
  {
    action: 'delete_chats',
    title: '删除会话',
    riskLevel: 'medium',
    description: '把明确匹配的会话移入回收站。用于删除助手、单聊或群聊；匹配不明确时展示候选。',
    parameters: ['chatQuery', 'chatTypePreference', 'summary'],
    examples: ['删除刚才创建的群聊', '把世界杯动态查询这个助手会话删掉'],
  },
  {
    action: 'restore_chats',
    title: '恢复会话',
    riskLevel: 'medium',
    description: '从回收站恢复明确匹配的会话。',
    parameters: ['chatQuery', 'chatTypePreference', 'summary'],
    examples: ['恢复刚才删除的群聊', '把世界杯动态查询会话找回来'],
  },
  {
    action: 'rename_chat',
    title: '重命名会话',
    riskLevel: 'medium',
    description: '修改明确匹配的助手、单聊或群聊名称。目标不明确时展示候选。',
    parameters: ['chatQuery', 'chatName', 'chatTypePreference', 'newName', 'summary'],
    examples: ['把这个群聊改名为赛博茶馆', '把最新世界杯动态查询改名为世界杯消息'],
  },
  {
    action: 'create_assistant_chat',
    title: '创建助手会话',
    riskLevel: 'medium',
    description: '创建一个普通助手会话，可指定标题；是否默认开启 Agent 由用户偏好决定。',
    parameters: ['chatName', 'title', 'summary'],
    examples: ['创建一个新的助手会话', '新建助手叫资料查询'],
  },
  {
    action: 'manage_group_members',
    title: '管理群聊成员',
    riskLevel: 'medium',
    description: '给明确匹配的群聊添加、移除或设置角色成员。memberOperation 为 add/remove/set；角色由 characters 定位或创建。',
    parameters: ['chatQuery', 'groupName', 'memberOperation', 'characters[]', 'summary'],
    examples: ['把秦始皇加入这个群聊', '从赛博茶馆里移除机械跑堂小铁'],
  },
  {
    action: 'query_ai_balance',
    title: '查询 AI 点数',
    riskLevel: 'low',
    description: '查询当前账号可用 AI 点数。',
    parameters: [],
    examples: ['我还剩下多少点数', '查一下AI余额'],
  },
  {
    action: 'update_theme',
    title: '切换主题',
    riskLevel: 'low',
    description: '切换 light、dark 或 system 主题。',
    parameters: ['theme'],
    examples: ['切换到夜间模式', '跟随系统主题'],
  },
  {
    action: 'set_ai_model_key',
    title: '设置模型秘钥',
    riskLevel: 'high',
    description: '写入模型 API key。必须只使用脱敏占位 apiKeyRef，由执行器解析真实秘钥。',
    parameters: ['providerHint', 'modelHint', 'apiKeyRef'],
    examples: ['设置DeepSeek秘钥为 sk-xxx', '把默认模型key换成 xxx'],
  },
  {
    action: 'navigate',
    title: '打开站内页面',
    riskLevel: 'low',
    description: '打开明确的站内页面，例如角色库、账号、会员、模型设置、聊天列表。用户要求配置模型、设置 DeepSeek/OpenAI/图片模型但没有给出秘钥或具体可执行参数时，应跳转到 settings 模型页。',
    parameters: ['routePath', 'title', 'summary'],
    examples: ['打开角色库', '进入账号页面', '设置模型为 deepseek', '配置图片模型'],
  },
];

const SUPPORTED_ACTIONS = new Set<LocalActionPlan['action']>(APP_COMMAND_TOOLS.map((tool) => tool.action));
const TOOL_BY_ACTION = new Map<LocalActionPlan['action'], AppCommandToolDefinition>(APP_COMMAND_TOOLS.map((tool) => [tool.action, tool]));
const RISK_RANK: Record<AppCommandRiskLevel, number> = { low: 1, medium: 2, high: 3 };

export function isSupportedAppCommandAction(action: LocalActionPlan['action']) {
  return SUPPORTED_ACTIONS.has(action);
}

export function getAppCommandToolDefinition(action: LocalActionPlan['action']) {
  return TOOL_BY_ACTION.get(action) || null;
}

export function maxAppCommandRiskLevel(left: AppCommandRiskLevel, right: AppCommandRiskLevel): AppCommandRiskLevel {
  return RISK_RANK[left] >= RISK_RANK[right] ? left : right;
}

export function normalizeAppCommandActionRisk(action: LocalActionPlan['action'], plannerRiskLevel: AppCommandRiskLevel): AppCommandRiskLevel {
  const tool = getAppCommandToolDefinition(action);
  return tool ? maxAppCommandRiskLevel(plannerRiskLevel, tool.riskLevel) : plannerRiskLevel;
}

export function shouldConfirmAppCommandTool(params: {
  action: LocalActionPlan['action'];
  source: CommandSource;
  riskLevel: AppCommandRiskLevel;
  hasChoices?: boolean;
  requestedConfirmation?: boolean;
}) {
  if (params.hasChoices) return true;
  if (params.riskLevel === 'high') return true;
  const tool = getAppCommandToolDefinition(params.action);
  const toolDefault = tool?.defaultConfirmation?.[params.source];
  if (typeof params.requestedConfirmation === 'boolean') return params.requestedConfirmation || toolDefault === true;
  if (typeof toolDefault === 'boolean') return toolDefault;
  return params.source === 'assistant' && params.riskLevel !== 'low';
}

function hasPlanValue(plan: LocalActionPlan, field: string) {
  if (field === 'characters[].name') return Boolean(plan.characters?.some((character) => character.name?.trim()));
  const value = plan[field as keyof LocalActionPlan];
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

export function validateAppCommandPlan(plan: LocalActionPlan): AppCommandPlanValidationIssue | null {
  const tool = getAppCommandToolDefinition(plan.action);
  const requiredAny = tool?.validation?.requiredAny || [];
  for (const requirement of requiredAny) {
    if (requirement.fields.some((field) => hasPlanValue(plan, field))) continue;
    return {
      title: requirement.title,
      message: requirement.message,
      reasonType: requirement.reasonType,
      recoverable: true,
      observation: {
        attemptedAction: plan.action,
        missingFields: requirement.fields,
        possibleNextActions: requirement.possibleNextActions || ['assistant_agent'],
      },
    };
  }
  return null;
}

export function getAppCommandToolPrompt(source: CommandSource) {
  return APP_COMMAND_TOOLS.map((tool) => [
    `- ${tool.action}: ${tool.title}。${tool.description}`,
    `  风险: ${tool.riskLevel}`,
    tool.parameters.length ? `  参数: ${tool.parameters.join(', ')}` : '  参数: 无',
    tool.validation?.requiredAny?.length ? `  必填: ${tool.validation.requiredAny.map((item) => `至少一个(${item.fields.join(' | ')})`).join('；')}` : '',
    tool.examples.length ? `  示例: ${tool.examples.join('；')}` : '',
    tool.sourcePolicy?.[source] ? `  ${source}策略: ${tool.sourcePolicy[source]}` : '',
  ].filter(Boolean).join('\n')).join('\n');
}
