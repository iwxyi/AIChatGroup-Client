export const HOME_COMMAND_PLACEHOLDERS = [
  '让秦始皇、拿破仑和武则天开一场帝国治理圆桌',
  '根据一段武侠故事创建角色、门派关系和群聊',
  '做一个三国谋士会议室，让诸葛亮和司马懿互相拆招',
  '创建一个赛博茶馆故事房，加入老板、侦探和失忆黑客',
  '帮我设计一个密室推理房，AI 负责主持和记录线索',
  '开一个面试练习房，让严厉面试官追问我的项目经历',
  '创建一位会记得约定的陪伴角色，风格克制但很敏锐',
  '和秦始皇单独聊聊统一六国之后最难处理的问题',
  '让我的角色们围绕“中元节雨夜”自然续写一段群聊',
  '进入之前聊到中元节的那个会话',
  '把最近的聊天整理成一份可继续修改的 Markdown 纪要',
  '生成一个旅行计划表，按日期、预算和注意事项分栏',
  '写一个可运行的番茄钟网页小工具，带专注记录',
  '帮我做一份角色关系图的 Mermaid 流程图',
  '把这段世界观整理成角色卡、地点卡和冲突线索',
  '生成一张雨夜茶馆里的赛博风插画',
  '给我的角色生成三张不同风格的头像提示词',
  '查一下我现在还剩多少 AI 点数',
  '打开最近需要同步或失败的本地数据状态',
  '帮我找出最适合继续创作的那个故事会话',
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
