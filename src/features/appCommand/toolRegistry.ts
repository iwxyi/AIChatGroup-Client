import type { AppCommandAction, AppCommandRiskLevel, CommandSource, LocalActionPlan } from './commandTypes';

export interface AppCommandToolDefinition {
  action: Exclude<AppCommandAction, 'assistant_chat'>;
  title: string;
  riskLevel: AppCommandRiskLevel;
  description: string;
  parameters: string[];
  examples: string[];
  sourcePolicy?: Partial<Record<CommandSource, string>>;
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
    examples: ['进入之前聊到中元节的群聊', '打开和秦始皇的聊天'],
  },
  {
    action: 'read_character_info',
    title: '读取角色信息',
    riskLevel: 'low',
    description: '读取用户角色库中的角色资料，并基于资料回答问题。不要编造角色 ID。',
    parameters: ['characterName', 'characterQuery', 'characters[]', 'summary'],
    examples: ['我想看角色库中秦始皇的信息', '秦始皇的性格怎么样'],
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
    description: '打开明确的站内页面，例如角色库、账号、会员、AI模型、聊天列表。',
    parameters: ['routePath', 'title', 'summary'],
    examples: ['打开角色库', '进入账号页面'],
  },
];

const SUPPORTED_ACTIONS = new Set<LocalActionPlan['action']>(APP_COMMAND_TOOLS.map((tool) => tool.action));

export function isSupportedAppCommandAction(action: LocalActionPlan['action']) {
  return SUPPORTED_ACTIONS.has(action);
}

export function getAppCommandToolPrompt(source: CommandSource) {
  return APP_COMMAND_TOOLS.map((tool) => [
    `- ${tool.action}: ${tool.title}。${tool.description}`,
    `  风险: ${tool.riskLevel}`,
    tool.parameters.length ? `  参数: ${tool.parameters.join(', ')}` : '  参数: 无',
    tool.examples.length ? `  示例: ${tool.examples.join('；')}` : '',
    tool.sourcePolicy?.[source] ? `  ${source}策略: ${tool.sourcePolicy[source]}` : '',
  ].filter(Boolean).join('\n')).join('\n');
}
