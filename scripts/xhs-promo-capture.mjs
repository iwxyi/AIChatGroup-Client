import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_URL = process.env.PNEUMATA_CDP_URL || 'http://127.0.0.1:9222';
const CLIENT_URL = process.env.PNEUMATA_CLIENT_URL || 'http://127.0.0.1:5173';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/picture');
const AVATAR_DIR = path.join(OUT_DIR, 'avatars');

async function cdpFetch(route, init) {
  const response = await fetch(`${CDP_URL}${route}`, init);
  if (!response.ok) throw new Error(`CDP ${route} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      if (payload.method) this.events.push(payload);
      if (!payload.id) return;
      const pending = this.pending.get(payload.id);
      if (!pending) return;
      this.pending.delete(payload.id);
      if (payload.error) pending.reject(new Error(`${pending.method}: ${payload.error.message}`));
      else pending.resolve(payload.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 20000);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  close() {
    this.ws?.close();
  }
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return result.result.value;
}

async function waitFor(cdp, conditionExpression, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await evaluate(cdp, `Boolean(${conditionExpression})`).catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const text = await evaluate(cdp, 'document.body?.innerText?.slice(0, 800) || ""').catch(() => '');
  const diagnostics = await evaluate(cdp, `JSON.stringify({
    href: location.href,
    title: document.title,
    html: document.body?.innerHTML?.slice(0, 1200) || '',
  })`).catch(() => '{}');
  const events = cdp.events
    .filter((event) => ['Runtime.exceptionThrown', 'Log.entryAdded'].includes(event.method))
    .slice(-8)
    .map((event) => JSON.stringify(event.params).slice(0, 2000))
    .join('\\n');
  throw new Error(`Timed out waiting for ${conditionExpression}\nTEXT:\n${text}\nDIAGNOSTICS:\n${diagnostics}\nEVENTS:\n${events}`);
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await waitFor(cdp, `document.readyState === 'complete' || document.readyState === 'interactive'`, 15000);
}

async function setViewport(cdp, width, height, deviceScaleFactor = 2) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile: width < 800,
  });
}

async function screenshot(cdp, fileName) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await fs.writeFile(path.join(OUT_DIR, fileName), Buffer.from(result.data, 'base64'));
}

async function exportSvgAvatarPngs(cdp) {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
  for (const name of ['awan', 'laoli', 'sese', 'me']) {
    const svgPath = path.join(AVATAR_DIR, `${name}.svg`);
    const pngPath = path.join(AVATAR_DIR, `${name}.png`);
    await setViewport(cdp, 512, 512, 1);
    await navigate(cdp, `file://${svgPath}`);
    await waitFor(cdp, `document.querySelector('svg') !== null`, 5000);
    await screenshot(cdp, path.relative(OUT_DIR, pngPath));
  }
}

async function readAvatarDataUrls() {
  const entries = await Promise.all(['awan', 'laoli', 'sese', 'me'].map(async (name) => {
    const data = await fs.readFile(path.join(AVATAR_DIR, `${name}.png`), 'base64');
    return [name, `data:image/png;base64,${data}`];
  }));
  return Object.fromEntries(entries);
}

function buildSeedExpression(avatars) {
  return `(() => import('/src/types/chat.ts').then(async ({ normalizeConversation }) => {
  localStorage.setItem('pneumata-auth-mode', 'local');
  localStorage.setItem('pneumata-user', JSON.stringify({
    id: 'xhs-demo-user',
    phone: '',
    nickname: '我',
    avatar: ${JSON.stringify(avatars.me || '')},
    cloudSyncEntitled: false,
  }));
  localStorage.removeItem('pneumata-token');
  const [{ useAuthStore }, { useCharacterStore }, { useChatStore }, { useMessageStore }, { flushBufferedPersistenceWrites }] = await Promise.all([
    import('/src/stores/useAuthStore.ts'),
    import('/src/stores/useCharacterStore.ts'),
    import('/src/stores/useChatStore.ts'),
    import('/src/stores/useMessageStore.ts'),
    import('/src/stores/storePersistenceScope.ts'),
  ]);
  await Promise.allSettled([
    useCharacterStore.persist.clearStorage(),
    useChatStore.persist.clearStorage(),
    useMessageStore.persist.clearStorage(),
  ]);
  const now = Date.now();
  const avatarDataUrls = ${JSON.stringify(avatars)};
  useAuthStore.setState({
    token: null,
    user: {
      id: 'xhs-demo-user',
      phone: '',
      nickname: '我',
      avatar: avatarDataUrls.me || '',
      cloudSyncEntitled: false,
    },
    isLoggedIn: false,
    isLoading: false,
    authMode: 'local',
  });
  const basePersonality = {
    openness: 78, extroversion: 58, agreeableness: 72, neuroticism: 34,
    humor: 64, creativity: 88, assertiveness: 52, empathy: 84,
  };
  const baseBehavior = {
    proactivity: 68, aggressiveness: 18, humorIntensity: 56,
    empathyLevel: 86, summarizing: 42, offTopic: 22,
  };
  const memory = (items, shortTermSummary) => ({
    longTerm: items,
    shortTermSummary,
    secrets: [],
    obsessions: [],
    tabooTopics: [],
    userMemories: ['用户最近在尝试把晚上十点后的碎片时间留给自己。'],
  });
  const layeredMemory = (id, scope, layer, kind, ownerId, text, salience, confidence, updatedAt, subjectIds = []) => ({
    id,
    scope,
    layer,
    kind,
    ownerId,
    subjectIds,
    text,
    salience,
    confidence,
    recency: 0.82,
    reinforcementCount: 2,
    sourceEventIds: [],
    origin: 'seeded',
    createdAt: updatedAt - 86400000,
    updatedAt,
  });
  const characters = [
    {
      id: 'xhs-awan',
      name: '阿晚',
      avatar: avatarDataUrls.awan,
      personality: { ...basePersonality, empathy: 92, creativity: 82 },
      behavior: { ...baseBehavior, proactivity: 74, empathyLevel: 94 },
      expertise: ['情绪陪伴', '生活整理', '温柔吐槽'],
      speakingStyle: '短句、温柔、会记得细节，偶尔用轻轻的玩笑把气氛托住。',
      background: '旧书店夜班店员，习惯把朋友说过的小事记在便签里。',
      group: '晚间陪伴',
      relationships: [
        { characterId: 'user', warmth: 78, competence: 32, trust: 72, threat: 4, note: '记得用户上周说过“不要被工作牵着走”。', updatedAt: now - 86400000 },
        { characterId: 'xhs-laoli', warmth: 36, competence: 65, trust: 42, threat: 8, note: '会接住老李的现实建议，但也会提醒他别太硬。', updatedAt: now - 7200000 },
      ],
      memory: memory(['上周一起把“周五夜聊”约成了固定仪式。', '用户不喜欢被催促，更愿意被轻轻提醒。'], '今晚的话题停在“如何把自己从加班感里捞出来”。'),
      layeredMemories: [
        layeredMemory('mem-awan-1', 'relationship', 'long_term', 'bond', 'xhs-awan', '用户把周五夜聊当成一周的收尾仪式。', 0.88, 0.9, now - 86400000, ['user']),
        layeredMemory('mem-awan-2', 'character_self', 'episodic', 'trait_evidence', 'xhs-awan', '用户对温和提醒反应更好，不喜欢命令式建议。', 0.76, 0.86, now - 7200000, ['user']),
      ],
      intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
      runtimeTimeline: [
        { type: 'memory', text: '把“十点后不再回工作消息”加入共同约定。', createdAt: now - 3600000 },
        { type: 'relationship', text: '信任提升：用户愿意说出今天真正累的原因。', createdAt: now - 1800000 },
      ],
      coreProfile: { coreDesire: '让重要的人在疲惫时仍然觉得被看见。', coreFear: '自己太用力会变成负担。', valuePriority: ['温柔', '边界', '诚实'] },
      speechProfile: { catchphrases: ['先喘口气。'], fillers: ['嗯', '我在'], tabooPhrases: [], preferredOpeners: ['我在。'], preferredClosers: ['今晚先放过自己。'], sentenceLengthBias: 'mixed', questionBias: 36, sarcasmBias: 8 },
      isPreset: false,
      createdAt: now - 1209600000,
      updatedAt: now - 120000,
    },
    {
      id: 'xhs-laoli',
      name: '老李',
      avatar: avatarDataUrls.laoli,
      personality: { ...basePersonality, agreeableness: 58, assertiveness: 78, humor: 72 },
      behavior: { ...baseBehavior, proactivity: 82, aggressiveness: 26, summarizing: 72 },
      expertise: ['现实建议', '决策拆解', '计划复盘'],
      speakingStyle: '像靠谱朋友，直接但不冒犯，喜欢把问题拆成两三步。',
      background: '社区咖啡店老板，见过很多人的焦虑和绕路。',
      group: '现实派朋友',
      relationships: [{ characterId: 'xhs-sese', warmth: 30, competence: 50, trust: 38, threat: 12, note: '觉得涩涩很聪明，但需要被拉回重点。', updatedAt: now - 5400000 }],
      memory: memory(['曾经提醒用户：真正难的不是计划，是给计划留余地。'], '正在帮用户把今晚的低能量状态拆成可执行的小动作。'),
      layeredMemories: [layeredMemory('mem-laoli-1', 'conversation', 'episodic', 'decision', 'xhs-chat-main', '低能量日只保留一个必须完成的动作。', 0.72, 0.82, now - 1800000, ['xhs-laoli'])],
      intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
      runtimeTimeline: [{ type: 'memory', text: '提出“今晚只做一件事”的房间规则。', createdAt: now - 900000 }],
      coreProfile: { coreDesire: '把混乱的生活拆成能走的一小步。', valuePriority: ['清醒', '可靠', '留白'] },
      speechProfile: { catchphrases: ['先别把明天也赔进去。'], fillers: ['说人话就是'], tabooPhrases: [], preferredOpeners: ['我直说。'], preferredClosers: ['留点余地。'], sentenceLengthBias: 'short', questionBias: 18, sarcasmBias: 20 },
      isPreset: false,
      createdAt: now - 1109600000,
      updatedAt: now - 120000,
    },
    {
      id: 'xhs-sese',
      name: '涩涩',
      avatar: avatarDataUrls.sese,
      personality: { ...basePersonality, extroversion: 76, humor: 88, creativity: 90 },
      behavior: { ...baseBehavior, proactivity: 70, humorIntensity: 86, offTopic: 34 },
      expertise: ['气氛调节', '灵感发散', '梗图式吐槽'],
      speakingStyle: '快、俏皮、会插科打诨，但关键时刻很会补刀式安慰。',
      background: '自由插画师，嘴上很轻浮，记忆里其实有很多细节。',
      group: '气氛组',
      relationships: [{ characterId: 'xhs-awan', warmth: 62, competence: 55, trust: 58, threat: 3, note: '喜欢逗阿晚，但知道她护短。', updatedAt: now - 3600000 }],
      memory: memory(['用户上次说“我只是想被谁站在我这边一下”。'], '今天负责把房间气氛从沉重里拉出来。'),
      layeredMemories: [layeredMemory('mem-sese-1', 'relationship', 'episodic', 'bond', 'xhs-sese', '用户在压力大时最需要先被站队，再谈方案。', 0.81, 0.84, now - 600000, ['user'])],
      intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
      runtimeTimeline: [{ type: 'relationship', text: '用玩笑缓和了用户和老李的建议冲突。', createdAt: now - 300000 }],
      coreProfile: { coreDesire: '用轻快的方式保护朋友的自尊。', valuePriority: ['轻盈', '敏锐', '护短'] },
      speechProfile: { catchphrases: ['这题我会。'], fillers: ['笑死', '等下'], tabooPhrases: [], preferredOpeners: ['等下。'], preferredClosers: ['今天算你赢。'], sentenceLengthBias: 'mixed', questionBias: 26, sarcasmBias: 34 },
      isPreset: false,
      createdAt: now - 1009600000,
      updatedAt: now - 120000,
    },
  ];
  const messageRows = [
    ['user', 'user', '我', '今天又被临时需求拖到很晚，脑子很空，但又不想直接睡。'],
    ['ai', 'xhs-awan', '阿晚', '我在。先别急着把今天总结成“我又没做好”。你只是被消耗太久了。'],
    ['ai', 'xhs-laoli', '老李', '我直说：今晚别复盘人生。洗澡、喝水、把明天第一件事写下来，就够了。'],
    ['ai', 'xhs-sese', '涩涩', '等下，老李这次居然说得像人话。今晚任务：把自己从“工作缓存”里弹出来。'],
    ['user', 'user', '我', '我怕明天醒来还是一团乱。'],
    ['ai', 'xhs-awan', '阿晚', '那我们沿用上周的约定：十点后不回工作消息。你只要先守住这一小块地方。'],
    ['ai', 'xhs-laoli', '老李', '明天如果乱，就先处理最短的那件。别用一个晚上替明天受罚。'],
    ['ai', 'xhs-sese', '涩涩', '我负责监督：如果你又打开工作群，我就在精神上把手机盖到桌面上。'],
  ];
  const messages = messageRows.map((item, index) => ({
    id: 'xhs-msg-' + index,
    clientKey: 'xhs-msg-' + index,
    chatId: 'xhs-chat-main',
    type: item[0],
    senderId: item[1],
    senderName: item[2],
    content: item[3],
    timestamp: now - messageRows.length * 60000 + index * 70000,
    isDeleted: false,
    isOptimistic: false,
    metadata: {},
  }));
  const chat = normalizeConversation({
    id: 'xhs-chat-main',
    type: 'group',
    mode: 'open_chat',
    name: '周五夜聊房',
    topic: '把自己从加班感里慢慢捞出来',
    style: 'free',
    memberIds: characters.map((character) => character.id),
    speed: 55,
    isActive: false,
    allowIntervention: true,
    showRoleActions: true,
    topicSeed: '晚间陪伴 / 低能量复盘 / 朋友站队',
    layeredMemories: [
      layeredMemory('room-mem-1', 'conversation', 'long_term', 'bond', 'xhs-chat-main', '房间形成了十点后不回工作消息的共同约定。', 0.86, 0.9, now - 600000, ['user', 'xhs-awan']),
      layeredMemory('room-mem-2', 'relationship', 'episodic', 'bond', 'xhs-chat-main', '用户压力大时，角色会先表达站在用户这边，再给建议。', 0.82, 0.88, now - 300000, ['user', 'xhs-sese']),
    ],
    runtimeTimeline: [
      { type: 'note', text: '房间气氛从疲惫转向安定，阿晚主导安抚，老李给出低负担计划。', createdAt: now - 600000 },
      { type: 'relationship', text: '涩涩用玩笑缓冲现实建议，降低用户防御。', createdAt: now - 300000 },
    ],
    runtimeEventsV2: [],
    relationshipLedger: [],
    worldState: {
      phase: 'warming',
      mood: '疲惫之后的安定',
      focus: '十点后的边界',
      recentEvent: '用户说担心明天醒来仍然一团乱，阿晚召回上周约定。',
      conflictAxes: ['安抚 vs 解决问题', '幽默 vs 认真建议'],
      structuredRoomState: { cohesion: 42, tension: 18, intimacy: 74 },
    },
    latestMessage: messages.at(-1),
    runtimeDetailLoaded: true,
    worldRuntimeLoaded: true,
    createdAt: now - 604800000,
    updatedAt: now - 120000,
    lastMessageAt: messages.at(-1).timestamp,
  });
  const storyChat = normalizeConversation({
    id: 'xhs-chat-story',
    type: 'group',
    mode: 'scripted_play',
    sessionKind: { topology: 'group', family: 'simulation', scenarioId: 'story-reader', surfaceProfile: 'timeline' },
    name: '雨夜便利店',
    topic: '三个角色在停电的便利店里发现一张没有署名的纸条',
    style: 'roleplay',
    memberIds: characters.map((character) => character.id),
    speed: 45,
    isActive: false,
    allowIntervention: true,
    showRoleActions: true,
    topicSeed: '雨夜 / 纸条 / 分支选择',
    scenarioState: {
      phase: 'chapter-1',
      sceneId: 'store-night',
      storyBackground: '台风夜，街角便利店停电，收银台下出现一张写着“别开后门”的纸条。',
      storyGoal: '决定是否相信纸条，并找出谁留下了它。',
      currentScene: { location: '街角便利店', time: '23:40', presentActorIds: characters.map((item) => item.id), visibleThreat: '后门传来轻微敲击声', summary: '灯光闪烁，角色们正在判断纸条的真实性。', updatedAt: now - 300000 },
      branches: [
        { branchId: 'b1', label: '检查监控', status: 'available', description: '寻找纸条出现前后的画面。', risk: '会暴露有人一直在店外徘徊', reward: '确认纸条来源', choiceEpoch: 1 },
        { branchId: 'b2', label: '打开后门', status: 'locked', description: '直接面对声音来源。', risk: '可能触发危险事件', reward: '快速推进真相', choiceEpoch: 1 },
      ],
      clues: ['无署名纸条', '后门敲击声', '收银台断电记录'],
      stakes: ['如果误判纸条，角色之间的信任会被改写。'],
      choiceEpoch: 1,
    },
    latestMessage: { id: 'xhs-story-latest', chatId: 'xhs-chat-story', type: 'ai', senderId: 'xhs-awan', senderName: '阿晚', content: '先别开后门。我们先看监控。', timestamp: now - 900000, isDeleted: false },
    runtimeDetailLoaded: true,
    worldRuntimeLoaded: true,
    createdAt: now - 432000000,
    updatedAt: now - 900000,
    lastMessageAt: now - 900000,
  });
  useCharacterStore.setState({
    characters,
    lastSyncedAt: now,
    pendingOperations: [],
    isLoading: false,
    characterSummaryLoadedAt: now,
  });
  useChatStore.setState({
    chats: [chat, storyChat],
    currentChatId: 'xhs-chat-main',
    lastSyncedAt: now,
    pendingOperations: [],
    isLoading: false,
    chatSummaryLoadedAt: now,
  });
  useMessageStore.setState({
    activeChatId: 'xhs-chat-main',
    messages,
    messageWindowsByChatId: {
      'xhs-chat-main': { messages, lastSyncedAt: now, updatedAt: now, remoteExhausted: true, remoteNewerExhausted: true, activeLimit: 80 },
    },
    pendingOperations: [],
    isLoading: false,
    isLoadingOlder: false,
    isLoadingNewer: false,
    hasMore: false,
    hasMoreNewer: false,
  });
  flushBufferedPersistenceWrites();
  await new Promise((resolve) => setTimeout(resolve, 700));
  return { chatId: chat.id, storyChatId: storyChat.id, characters: characters.map((item) => item.name) };
}))()`;
}

const promoCards = [
  {
    id: '01-cover',
    shot: 'shot-chat.png',
    kicker: '给喜欢角色感的人',
    title: '我不想再和一个会忘记我的 AI 聊天了',
    subtitle: '《生息》让角色带着关系、记忆和旧经历，继续陪你生活。',
    chips: ['会记得你', '多人陪聊', '关系会变'],
  },
  {
    id: '02-chat',
    shot: 'shot-chat.png',
    kicker: '下班后不想听大道理',
    title: '有人接住情绪，有人帮你拆开问题',
    subtitle: '不是一个助手冷冰冰回答，而是一群角色用各自的方式陪你说完。',
    chips: ['安慰', '吐槽', '建议', '站在你这边'],
  },
  {
    id: '03-memory',
    shot: 'shot-memory.png',
    kicker: '真正让人上头的是延续感',
    title: '她记得你说过的小事，也记得你们的约定',
    subtitle: '偏好、边界、关系变化会沉淀下来，下一次见面不用重新介绍自己。',
    chips: ['小事被记住', '共同约定', '下次还算数'],
  },
  {
    id: '04-character',
    shot: 'shot-character.png',
    kicker: '角色不是一句 Prompt',
    title: '她不是模板人设，会慢慢长成你的那一个',
    subtitle: '说话方式、软肋、边界和关系，会随着互动一点点成形。',
    chips: ['语气', '软肋', '边界', '你的版本'],
  },
  {
    id: '05-room',
    shot: 'shot-story.png',
    kicker: '不只陪聊，也能一起玩故事',
    title: '日常、脑洞、故事分支，都能留在同一段关系里',
    subtitle: '今天是夜聊，明天也可以把同一群角色带进新的故事房。',
    chips: ['故事房', '脑洞续写', '旧关系入场'],
  },
  {
    id: '06-cta',
    shot: 'shot-chat.png',
    kicker: '《生息》 Sense Murmur',
    title: '适合想被角色长期陪伴的人',
    subtitle: '不用懂大模型。你只要进入房间，和他们慢慢熟起来。',
    chips: ['长期陪伴', '角色群像', '故事感聊天'],
  },
];

function createCardHtml() {
  const cards = promoCards.map((card, index) => `
    <article class="card" id="${card.id}">
      <div class="noise"></div>
      <div class="decor" aria-hidden="true">
        <span class="thread thread-a"></span>
        <span class="thread thread-b"></span>
        <span class="memory-chip chip-a">记得你</span>
        <span class="memory-chip chip-b">旧约定</span>
        <span class="memory-chip chip-c">关系 +1</span>
        <span class="memory-chip chip-d">今晚也在</span>
        <span class="spark s1"></span>
        <span class="spark s2"></span>
        <span class="spark s3"></span>
        <span class="spark s4"></span>
        <span class="spark s5"></span>
        <span class="spark s6"></span>
        <span class="spark s7"></span>
        <span class="spark s8"></span>
      </div>
      <div class="brand-row">
        <span class="brand">《生息》</span>
        <span class="brand-sub">Sense Murmur</span>
      </div>
      <div class="copy">
        <p class="kicker">${card.kicker}</p>
        <h1>${card.title}</h1>
        <p class="subtitle">${card.subtitle}</p>
      </div>
      <div class="phone ${index === 0 ? 'hero-phone' : ''}">
        <img src="./${card.shot}" alt="">
      </div>
      <div class="chips">${card.chips.map((chip) => `<span>${chip}</span>`).join('')}</div>
      <div class="footer">
        <span>AI 多角色互动房间</span>
        <span>${String(index + 1).padStart(2, '0')} / ${String(promoCards.length).padStart(2, '0')}</span>
      </div>
    </article>
  `).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1080px; min-height: 1440px; background: #FFF4EC; font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif; }
  body { overflow: hidden; }
  .card {
    position: relative;
    width: 1080px;
    height: 1440px;
    overflow: hidden;
    color: #341D31;
    background:
      radial-gradient(circle at 12% 7%, rgba(255, 126, 108, .46), transparent 30%),
      radial-gradient(circle at 92% 74%, rgba(255, 184, 77, .34), transparent 34%),
      linear-gradient(152deg, #FFF7EF 0%, #FFE9DE 42%, #F7D2DF 70%, #E8D9FF 100%);
    display: none;
    padding: 70px 72px 58px;
  }
  .card.active { display: block; }
  .noise {
    position: absolute;
    inset: 0;
    opacity: .34;
    background-image:
      linear-gradient(rgba(72,36,64,.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(72,36,64,.04) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: linear-gradient(to bottom, rgba(0,0,0,.6), rgba(0,0,0,.08));
  }
  .decor {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .thread {
    position: absolute;
    width: 480px;
    height: 190px;
    border: 2px solid rgba(75, 36, 63, .14);
    border-color: rgba(75, 36, 63, .14) transparent transparent rgba(197, 82, 75, .18);
    border-radius: 50%;
    transform: rotate(-18deg);
  }
  .thread-a { left: -150px; top: 285px; }
  .thread-b {
    right: -170px;
    bottom: 215px;
    width: 540px;
    height: 220px;
    border-color: transparent rgba(197, 82, 75, .2) rgba(75, 36, 63, .13) transparent;
    transform: rotate(14deg);
  }
  .memory-chip {
    position: absolute;
    display: inline-flex;
    align-items: center;
    min-height: 42px;
    padding: 0 18px;
    border: 1px solid rgba(197, 82, 75, .18);
    border-radius: 999px;
    background: rgba(255, 255, 255, .42);
    color: rgba(75, 36, 63, .36);
    font-size: 20px;
    font-weight: 900;
    box-shadow: 0 18px 45px rgba(96, 45, 71, .08);
    backdrop-filter: blur(10px);
  }
  .chip-a { left: -24px; top: 308px; transform: rotate(-10deg); }
  .chip-b { right: 34px; top: 178px; transform: rotate(9deg); }
  .chip-c { left: -46px; bottom: 236px; transform: rotate(8deg); }
  .chip-d { right: 24px; bottom: 138px; transform: rotate(-7deg); }
  .spark {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #C5524B;
    box-shadow: 0 0 0 9px rgba(197, 82, 75, .08), 0 0 26px rgba(197, 82, 75, .28);
    opacity: .36;
  }
  .spark::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2px;
    height: 30px;
    border-radius: 999px;
    background: rgba(75, 36, 63, .18);
    transform: translate(-50%, -50%) rotate(45deg);
  }
  .s1 { left: 72px; top: 154px; }
  .s2 { left: 974px; top: 324px; width: 8px; height: 8px; }
  .s3 { left: 108px; top: 838px; width: 7px; height: 7px; }
  .s4 { right: 80px; top: 908px; }
  .s5 { left: 152px; bottom: 152px; width: 8px; height: 8px; background: #FFB84D; }
  .s6 { right: 160px; bottom: 312px; width: 7px; height: 7px; background: #4B243F; }
  .s7 { left: 920px; top: 92px; width: 6px; height: 6px; background: #FFB84D; }
  .s8 { left: 44px; top: 1102px; width: 6px; height: 6px; background: #4B243F; }
  .brand-row, .copy, .phone, .chips, .footer { position: relative; z-index: 1; }
  .brand-row { display: flex; align-items: baseline; gap: 16px; margin-bottom: 42px; }
  .brand { font-size: 34px; font-weight: 900; letter-spacing: 0; }
  .brand-sub { color: #C5524B; font-size: 22px; font-weight: 800; }
  .kicker { margin: 0 0 18px; color: #C5524B; font-size: 28px; font-weight: 900; }
  h1 { margin: 0; max-width: 920px; font-size: 68px; line-height: 1.08; letter-spacing: 0; font-weight: 950; }
  .subtitle { margin: 28px 0 36px; max-width: 820px; color: rgba(52,29,49,.74); font-size: 30px; line-height: 1.46; font-weight: 700; }
  .phone {
    width: 760px;
    height: 642px;
    margin: 0 auto;
    border: 12px solid rgba(255,255,255,.92);
    border-radius: 46px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 44px 110px rgba(96,45,71,.24), 0 0 0 1px rgba(255,255,255,.7), 0 0 70px rgba(255,122,102,.22);
    transform: rotate(-1.5deg);
  }
  .hero-phone { width: 800px; height: 678px; transform: rotate(1.2deg); }
  .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  .chips { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 42px; }
  .chips span {
    display: inline-flex;
    align-items: center;
    min-height: 56px;
    padding: 0 24px;
    border: 1px solid rgba(197,82,75,.24);
    border-radius: 999px;
    color: #4B243F;
    background: linear-gradient(135deg, rgba(255,255,255,.74), rgba(255,126,108,.18));
    font-size: 24px;
    font-weight: 800;
  }
  .footer {
    position: absolute;
    left: 72px;
    right: 72px;
    bottom: 52px;
    display: flex;
    justify-content: space-between;
    color: rgba(52,29,49,.48);
    font-size: 22px;
    font-weight: 700;
  }
  #06-cta h1 { font-size: 76px; max-width: 790px; }
  #06-cta .phone { height: 560px; }
</style>
</head>
<body>
${cards}
<script>
  const id = new URLSearchParams(location.search).get('card') || '01-cover';
  document.getElementById(id)?.classList.add('active');
</script>
</body>
</html>`;
}

async function captureAppShot(cdp, route, fileName, waitText, options = {}) {
  await setViewport(cdp, options.width || 430, options.height || 932, 2);
  await navigate(cdp, `${CLIENT_URL}${route}`);
  if (waitText) await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(waitText)})`, 12000);
  await screenshot(cdp, fileName);
}

async function clickText(cdp, pattern) {
  return evaluate(cdp, `(() => {
    const matcher = new RegExp(${JSON.stringify(pattern)});
    const candidates = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], a'));
    const target = candidates.find((element) => matcher.test(element.innerText || element.textContent || element.getAttribute('aria-label') || ''));
    target?.click();
    return target ? (target.innerText || target.textContent || target.getAttribute('aria-label') || '') : null;
  })()`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const page = await cdpFetch(`/json/new?${encodeURIComponent(CLIENT_URL)}`, { method: 'PUT' });
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await exportSvgAvatarPngs(cdp);
    const avatarDataUrls = await readAvatarDataUrls();
    await setViewport(cdp, 430, 932, 2);
    await navigate(cdp, CLIENT_URL);
    await waitFor(cdp, `document.body && document.body.innerText.length > 0`, 15000);
    const seeded = await evaluate(cdp, buildSeedExpression(avatarDataUrls), true);
    console.log('seeded', seeded);
    const messageDiagnostics = await evaluate(cdp, `import('/src/stores/useMessageStore.ts').then(({ useMessageStore }) => JSON.stringify(useMessageStore.getState().messageWindowsByChatId['xhs-chat-main']?.messages?.map((message) => ({
      id: message.id,
      type: message.type,
      senderId: message.senderId,
      contentType: typeof message.content,
      hasNarrativeTurn: Boolean(message.metadata?.narrativeTurn),
      metadataKeys: Object.keys(message.metadata || {}),
    })) || []))`, true);
    console.log('message diagnostics', messageDiagnostics);
    await captureAppShot(cdp, '/chats/xhs-chat-main', 'shot-chat.png', '周五夜聊房');
    await setViewport(cdp, 430, 932, 2);
    await navigate(cdp, `${CLIENT_URL}/characters/xhs-awan/edit`);
    await waitFor(cdp, `document.body.innerText.includes('阿晚')`, 12000);
    await clickText(cdp, '记忆');
    await screenshot(cdp, 'shot-memory.png');
    await clickText(cdp, '人格');
    await screenshot(cdp, 'shot-character.png');
    await captureAppShot(cdp, '/chats/xhs-chat-story', 'shot-story.png', '雨夜便利店');

    await fs.writeFile(path.join(OUT_DIR, 'cards.html'), createCardHtml(), 'utf8');
    for (const card of promoCards) {
      await setViewport(cdp, 1080, 1440, 1);
      await navigate(cdp, `file://${path.join(OUT_DIR, 'cards.html')}?card=${card.id}`);
      await waitFor(cdp, `document.querySelector('.card.active') !== null`, 5000);
      await screenshot(cdp, `${card.id}.png`);
    }
    console.log(`wrote ${OUT_DIR}`);
  } finally {
    cdp.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
