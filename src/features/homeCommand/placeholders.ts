export const HOME_COMMAND_PLACEHOLDERS = [
  '让秦始皇、拿破仑和武则天坐到同一张长桌前，争一争帝国该怎么治理',
  '把一段江湖旧案拆成门派、恩怨和人物，让他们直接开聊',
  '开一间三国谋士密会室，让诸葛亮和司马懿当面互相拆招',
  '搭一个雨夜赛博茶馆：老板藏着秘密，侦探追线索，黑客忘了自己是谁',
  '做一个密室推理房，让 AI 主持搜证、记录嫌疑和推进真相',
  '开一场高压面试模拟，让面试官抓着我的项目细节连续追问',
  '创建一个会记得约定的陪伴角色，说话克制，但能听出我没说出口的事',
  '让我和秦始皇单聊：统一六国之后，他最怕哪件事失控？',
  '让我的角色们接上“中元节雨夜”的旧话题，像真的断点续聊一样继续',
  '带我回到之前聊中元节雨夜的那个会话',
  '把最近这段对话整理成一份能继续修改的 Markdown 纪要',
  '做一张三天旅行计划表，把路线、预算、吃饭和避坑都列清楚',
  '写一个能直接运行的番茄钟网页小工具，带专注记录和休息提醒',
  '把这些角色的爱恨、同盟和秘密整理成 Mermaid 关系图',
  '把这段世界观拆成角色卡、地点卡、冲突线和下一幕钩子',
  '生成一张霓虹雨夜茶馆插画：灯牌反光、玻璃水痕、有人在角落等消息',
  '给这个角色设计三套头像方向：日常照、证件照、暗黑海报风',
  '看一下我现在还剩多少 AI 点数，顺便告诉我最近消耗大不大',
  '打开同步状态，帮我看看有没有卡住、失败或还没上传的数据',
  '帮我从已有会话里找一个最适合今晚继续写下去的故事',
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
