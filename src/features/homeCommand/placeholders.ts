export const HOME_COMMAND_PLACEHOLDERS = [
  '我想和秦始皇聊天，帮我创建角色并开始单聊',
  '创建三个赛博茶馆角色，并把他们放进一个群聊',
  '我想开一个十个皇帝聊天的群，让他们争论天下怎么治理',
  '帮我做一个校园悬疑故事房，先创建主要角色和关系',
  '帮我选一个适合继续写下去的群聊，并给出下一轮开场',
  '把我这段故事设定拆成角色、关系和一个可开聊的群',
  '从已有角色里挑两位最有冲突感的角色，让他们开始对话',
  '创建一个古风权谋群聊，角色之间要有同盟、背叛和秘密',
  '帮我整理当前角色的关系图，用 Mermaid 表示',
  '给最近创建的角色设计头像方向和一段更鲜明的人设描述',
  '我想做一个侦探和嫌疑人对峙的群聊，帮我先搭好角色',
  '随机选一个群聊，帮我换一个更有张力的新聊天话题',
  '随机切换一次程序外观主题，可以是浅色、夜间或跟随系统',
  '帮我把一个末日避难所设定拆成队长、医生、工程师和内鬼',
  '我想和一位温柔但有边界感的陪伴角色聊天',
  '从角色库里找出皇帝角色，并推荐一个适合开聊的组合',
  '把最近的群聊整理成一份 Markdown 剧情纪要',
  '帮我检查最近的故事群聊，找出最值得继续推进的冲突线',
  '打开我最近聊过的那个古风群聊，并帮我续上话题',
];

export function getRandomHomeCommandPlaceholderIndex(currentIndex: number, random = Math.random) {
  if (HOME_COMMAND_PLACEHOLDERS.length <= 1) return 0;
  if (currentIndex < 0 || currentIndex >= HOME_COMMAND_PLACEHOLDERS.length) {
    return Math.floor(random() * HOME_COMMAND_PLACEHOLDERS.length);
  }
  const normalizedCurrent = currentIndex;
  const offset = Math.floor(random() * (HOME_COMMAND_PLACEHOLDERS.length - 1)) + 1;
  return (normalizedCurrent + offset) % HOME_COMMAND_PLACEHOLDERS.length;
}

export function resolveHomeCommandSubmissionValue(input: string, placeholder: string) {
  return input.trim() || placeholder.trim();
}
