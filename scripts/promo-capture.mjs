import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_URL = process.env.PNEUMATA_CDP_URL || 'http://127.0.0.1:9222';
const CLIENT_URL = process.env.PNEUMATA_CLIENT_URL || 'http://127.0.0.1:5173';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/picture');
const POSTER_DIR = path.join(OUT_DIR, 'posters');
const SCREENSHOT_DIR = path.join(OUT_DIR, 'screenshots');
const PREVIEW_DIR = path.join(OUT_DIR, 'preview');
const AVATAR_DIR = path.join(OUT_DIR, 'avatars');
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1747;

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
    id: 'promo-demo-user',
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
      id: 'promo-demo-user',
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
      id: 'promo-awan',
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
        { characterId: 'promo-laoli', warmth: 36, competence: 65, trust: 42, threat: 8, note: '会接住老李的现实建议，但也会提醒他别太硬。', updatedAt: now - 7200000 },
      ],
      memory: memory(['上周一起把“周五夜聊”约成了固定仪式。', '用户不喜欢被催促，更愿意被轻轻提醒。'], '今晚的话题停在“如何把自己从加班感里捞出来”。'),
      layeredMemories: [
        layeredMemory('mem-awan-1', 'relationship', 'long_term', 'bond', 'promo-awan', '用户把周五夜聊当成一周的收尾仪式。', 0.88, 0.9, now - 86400000, ['user']),
        layeredMemory('mem-awan-2', 'character_self', 'episodic', 'trait_evidence', 'promo-awan', '用户对温和提醒反应更好，不喜欢命令式建议。', 0.76, 0.86, now - 7200000, ['user']),
        layeredMemory('mem-awan-3', 'character_self', 'long_term', 'preference', 'promo-awan', '阿晚会先确认用户是不是被消耗太久，再决定要不要给方案。', 0.79, 0.84, now - 5400000, ['user']),
        layeredMemory('mem-awan-4', 'relationship', 'episodic', 'promise', 'promo-awan', '十点后不回工作消息已经变成阿晚和用户之间的低负担约定。', 0.83, 0.87, now - 3600000, ['user']),
        layeredMemory('mem-awan-5', 'character_self', 'episodic', 'boundary', 'promo-awan', '当用户说“脑子很空”时，阿晚会避免追问原因，先给安静的陪伴。', 0.74, 0.82, now - 2400000, ['user']),
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
      id: 'promo-laoli',
      name: '老李',
      avatar: avatarDataUrls.laoli,
      personality: { ...basePersonality, agreeableness: 58, assertiveness: 78, humor: 72 },
      behavior: { ...baseBehavior, proactivity: 82, aggressiveness: 26, summarizing: 72 },
      expertise: ['现实建议', '决策拆解', '计划复盘'],
      speakingStyle: '像靠谱朋友，直接但不冒犯，喜欢把问题拆成两三步。',
      background: '社区咖啡店老板，见过很多人的焦虑和绕路。',
      group: '现实派朋友',
      relationships: [{ characterId: 'promo-sese', warmth: 30, competence: 50, trust: 38, threat: 12, note: '觉得涩涩很聪明，但需要被拉回重点。', updatedAt: now - 5400000 }],
      memory: memory(['曾经提醒用户：真正难的不是计划，是给计划留余地。'], '正在帮用户把今晚的低能量状态拆成可执行的小动作。'),
      layeredMemories: [layeredMemory('mem-laoli-1', 'conversation', 'episodic', 'decision', 'promo-chat-main', '低能量日只保留一个必须完成的动作。', 0.72, 0.82, now - 1800000, ['promo-laoli'])],
      intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
      runtimeTimeline: [{ type: 'memory', text: '提出“今晚只做一件事”的房间规则。', createdAt: now - 900000 }],
      coreProfile: { coreDesire: '把混乱的生活拆成能走的一小步。', valuePriority: ['清醒', '可靠', '留白'] },
      speechProfile: { catchphrases: ['先别把明天也赔进去。'], fillers: ['说人话就是'], tabooPhrases: [], preferredOpeners: ['我直说。'], preferredClosers: ['留点余地。'], sentenceLengthBias: 'short', questionBias: 18, sarcasmBias: 20 },
      isPreset: false,
      createdAt: now - 1109600000,
      updatedAt: now - 120000,
    },
    {
      id: 'promo-sese',
      name: '涩涩',
      avatar: avatarDataUrls.sese,
      personality: { ...basePersonality, extroversion: 76, humor: 88, creativity: 90 },
      behavior: { ...baseBehavior, proactivity: 70, humorIntensity: 86, offTopic: 34 },
      expertise: ['气氛调节', '灵感发散', '梗图式吐槽'],
      speakingStyle: '快、俏皮、会插科打诨，但关键时刻很会补刀式安慰。',
      background: '自由插画师，嘴上很轻浮，记忆里其实有很多细节。',
      group: '气氛组',
      relationships: [{ characterId: 'promo-awan', warmth: 62, competence: 55, trust: 58, threat: 3, note: '喜欢逗阿晚，但知道她护短。', updatedAt: now - 3600000 }],
      memory: memory(['用户上次说“我只是想被谁站在我这边一下”。'], '今天负责把房间气氛从沉重里拉出来。'),
      layeredMemories: [layeredMemory('mem-sese-1', 'relationship', 'episodic', 'bond', 'promo-sese', '用户在压力大时最需要先被站队，再谈方案。', 0.81, 0.84, now - 600000, ['user'])],
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
    ['ai', 'promo-awan', '阿晚', '我在。先别急着把今天总结成“我又没做好”。你只是被消耗太久了。'],
    ['ai', 'promo-laoli', '老李', '我直说：今晚别复盘人生。洗澡、喝水、把明天第一件事写下来，就够了。'],
    ['ai', 'promo-sese', '涩涩', '等下，老李这次居然说得像人话。今晚任务：把自己从“工作缓存”里弹出来。'],
    ['user', 'user', '我', '我怕明天醒来还是一团乱。'],
    ['ai', 'promo-awan', '阿晚', '那我们沿用上周的约定：十点后不回工作消息。你只要先守住这一小块地方。'],
    ['ai', 'promo-laoli', '老李', '明天如果乱，就先处理最短的那件。别用一个晚上替明天受罚。'],
    ['ai', 'promo-sese', '涩涩', '我负责监督：如果你又打开工作群，我就在精神上把手机盖到桌面上。'],
  ];
  const messages = messageRows.map((item, index) => ({
    id: 'promo-msg-' + index,
    clientKey: 'promo-msg-' + index,
    chatId: 'promo-chat-main',
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
    id: 'promo-chat-main',
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
      layeredMemory('room-mem-1', 'conversation', 'long_term', 'bond', 'promo-chat-main', '房间形成了十点后不回工作消息的共同约定。', 0.86, 0.9, now - 600000, ['user', 'promo-awan']),
      layeredMemory('room-mem-2', 'relationship', 'episodic', 'bond', 'promo-chat-main', '用户压力大时，角色会先表达站在用户这边，再给建议。', 0.82, 0.88, now - 300000, ['user', 'promo-sese']),
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
  const directChat = normalizeConversation({
    id: 'promo-chat-direct',
    type: 'direct',
    mode: 'open_chat',
    name: '阿晚',
    topic: '睡前十分钟，把今天放轻一点',
    style: 'free',
    memberIds: ['promo-awan'],
    speed: 50,
    isActive: false,
    allowIntervention: true,
    showRoleActions: true,
    topicSeed: '睡前陪伴 / 低负担提醒',
    layeredMemories: [
      layeredMemory('direct-mem-1', 'conversation', 'long_term', 'ritual', 'promo-chat-direct', '睡前十分钟只聊今天留下来的情绪，不急着解决所有问题。', 0.78, 0.84, now - 1200000, ['user', 'promo-awan']),
    ],
    runtimeTimeline: [
      { type: 'memory', text: '阿晚记得用户希望提醒温柔一点，不要像打卡。', createdAt: now - 1200000 },
    ],
    runtimeDetailLoaded: true,
    worldRuntimeLoaded: true,
    createdAt: now - 345600000,
    updatedAt: now - 600000,
    lastMessageAt: now - 600000,
    latestMessage: { id: 'promo-direct-latest', chatId: 'promo-chat-direct', type: 'ai', senderId: 'promo-awan', senderName: '阿晚', content: '今天先不追答案，先把自己放回身体里。', timestamp: now - 600000, isDeleted: false },
  });
  const storyChat = normalizeConversation({
    id: 'promo-chat-story',
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
    latestMessage: { id: 'promo-story-latest', chatId: 'promo-chat-story', type: 'ai', senderId: 'promo-awan', senderName: '阿晚', content: '先别开后门。我们先看监控。', timestamp: now - 900000, isDeleted: false },
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
    chats: [chat, directChat, storyChat],
    currentChatId: 'promo-chat-main',
    lastSyncedAt: now,
    pendingOperations: [],
    isLoading: false,
    chatSummaryLoadedAt: now,
  });
  useMessageStore.setState({
    activeChatId: 'promo-chat-main',
    messages,
    messageWindowsByChatId: {
      'promo-chat-main': { messages, lastSyncedAt: now, updatedAt: now, remoteExhausted: true, remoteNewerExhausted: true, activeLimit: 80 },
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
  return { chatId: chat.id, directChatId: directChat.id, storyChatId: storyChat.id, characters: characters.map((item) => item.name) };
}))()`;
}

const promoCards = [
  {
    id: '01-cover',
    shot: '../screenshots/shot-chat.png',
    kicker: '给喜欢角色感的人',
    title: '我不想再和会忘记我的 AI 聊天了',
    subtitle: '《生息》让角色带着关系、记忆和旧经历，继续陪你生活。',
    chips: ['被记住', '被接住', '有后续'],
    decorChips: ['记得你', '旧约定', '关系 +1', '今晚也在'],
    layout: 'cover',
    proof: [
      ['多人聊天', '群聊里每个角色都能发言，也会互相接话。'],
      ['关系记忆', '约定、偏好和相处痕迹会带到下一次对话。'],
      ['连续陪伴', '今天聊到的事，之后还可以继续。'],
    ],
  },
  {
    id: '02-chat',
    shot: '../screenshots/shot-chat-list.png',
    kicker: '下班后不想听大道理',
    title: '有人接住情绪，帮你拆开问题',
    subtitle: '群聊、单聊、故事房都能留下关系痕迹，不再只是一次性对话。',
    chips: ['安慰', '吐槽', '建议', '站在你这边'],
    decorChips: ['有人接话', '低能量日', '朋友在场', '不讲大道理'],
    layout: 'rooms',
    spotlight: '不是一个 AI 在答，是一群角色在接话。',
    proof: [
      ['多种房间', '群聊、单聊、故事房，按当下的需要进入。'],
      ['角色接话', '不同角色会安慰、拆解或调节气氛。'],
      ['关系延续', '每个房间都能留下可继续的上下文。'],
    ],
  },
  {
    id: '03-memory',
    shot: '../screenshots/shot-memory.png',
    kicker: '真正让人上头的是延续感',
    title: '她记得你说过的小事，也记得你们的约定',
    subtitle: '偏好、边界、关系变化会沉淀下来，下一次见面不用重新介绍自己。',
    chips: ['小事被记住', '共同约定', '下次还算数'],
    decorChips: ['小事存档', '边界被记住', '偏好沉淀', '下次还算'],
    layout: 'memory',
    proof: [
      ['记忆沉淀', '小事、边界和约定会整理成可回看的记忆。'],
      ['影响回应', '记忆会改变角色下一次的语气和选择。'],
      ['手动整理', '重要内容可以查看、补充和调整。'],
    ],
  },
  {
    id: '04-character',
    shot: '../screenshots/shot-character.png',
    kicker: '角色不是一句 Prompt',
    title: '她不是模板人设，会慢慢长成你的那一个',
    subtitle: '说话方式、软肋、边界和关系，会随着互动一点点成形。',
    chips: ['语气', '软肋', '边界', '你的版本'],
    decorChips: ['性格漂移', '语气成形', '软肋浮现', '不是模板'],
    layout: 'character',
    proof: [
      ['人格参数', '开放性、共情力等性格维度可以看见。'],
      ['说话风格', '口头禅、句式和边界会形成稳定风格。'],
      ['关系变化', '相处历史会让角色逐渐变成你的版本。'],
    ],
  },
  {
    id: '05-room',
    shot: '../screenshots/shot-story.png',
    kicker: '不只陪聊，也能一起玩故事',
    title: '日常和故事，都留在同一段关系里',
    subtitle: '今天是夜聊，明天也可以把同一群角色带进新的故事房。',
    chips: ['故事房', '脑洞续写', '旧关系入场'],
    decorChips: ['分支选择', '线索回收', '旧关系入场', '一起推进'],
    layout: 'story',
    proof: [
      ['分支选择', '每个选择都会影响线索、风险和信任。'],
      ['故事状态', '地点、目标和线索会留在当前故事里。'],
      ['旧关系入场', '已经熟悉的角色可以进入新的剧情。'],
    ],
  },
  {
    id: '06-cta',
    shot: '../screenshots/shot-chat-list.png',
    kicker: '不用懂大模型',
    title: '适合想被角色长期陪伴的人',
    subtitle: '不用懂大模型。你只要进入房间，和他们慢慢熟起来。',
    chips: ['长期陪伴', '角色群像', '故事感聊天'],
    decorChips: ['慢慢熟悉', '长期陪伴', '角色群像', '打开房间'],
    layout: 'audience',
    spotlight: '不用先懂 AI，先找一个愿意陪你的人。',
    proof: [
      ['角色库', '先挑一个角色，再从一句话开始熟悉。'],
      ['聊天房间', '不需要理解模型，直接选择群聊或单聊。'],
      ['长期陪伴', '对话、记忆和故事都能继续往下走。'],
    ],
  },
];

function renderMetric(label, value, note) {
  return `<div class="metric"><b>${value}</b><span>${label}</span>${note ? `<em>${note}</em>` : ''}</div>`;
}

function renderBars(items) {
  return `<div class="bar-list">${items.map((item) => `
    <div class="bar-row">
      <div class="bar-head"><span>${item.label}</span><b>${item.value}</b></div>
      <div class="bar-track"><i style="width:${item.value}%"></i></div>
    </div>
  `).join('')}</div>`;
}

function renderInfoModules(card) {
  if (card.shot) return '';
  if (card.layout === 'cover') return '';
  if (card.layout === 'rooms') {
    return `
      <section class="role-stack">
        <div>
          <img src="../avatars/awan.png" alt="">
          <span>安慰</span>
          <b>阿晚先接住情绪</b>
          <p>不催你解决问题，先把今晚放轻一点。</p>
        </div>
        <div>
          <img src="../avatars/laoli.png" alt="">
          <span>拆解</span>
          <b>老李把事拆小</b>
          <p>只留一个能做的动作，不让明天压过来。</p>
        </div>
        <div>
          <img src="../avatars/sese.png" alt="">
          <span>气氛</span>
          <b>涩涩负责续上</b>
          <p>用吐槽缓一口气，让房间不只剩沉重。</p>
        </div>
      </section>
    `;
  }
  if (card.layout === 'memory') {
    return `
      <section class="memory-list">
        <div><b>边界</b><p>十点后不回工作消息。</p></div>
        <div><b>偏好</b><p>温和提醒比命令式建议更有效。</p></div>
        <div><b>关系</b><p>先站在你这边，再一起处理问题。</p></div>
      </section>
      <section class="stats-row">
        ${renderMetric('沉淀记忆', '5', '可回看')}
        ${renderMetric('关系线索', '2', '会影响语气')}
        ${renderMetric('共同约定', '1', '下次还算')}
      </section>
    `;
  }
  if (card.layout === 'character') {
    return `
      <section class="trait-panel">
        ${renderBars([
          { label: '共情力', value: 92 },
          { label: '创造力', value: 82 },
          { label: '开放性', value: 78 },
          { label: '主动性', value: 74 },
        ])}
      </section>
      <section class="profile-grid">
        <div><span>说话方式</span><b>短句、温柔、记得细节</b></div>
        <div><span>核心边界</span><b>不催促，不命令</b></div>
      </section>
      <section class="voice-card">
        <span>同一个角色，会因为你们的相处方式变得更像“你的版本”。</span>
      </section>
    `;
  }
  if (card.layout === 'story') {
    return `
      <section class="branch-board">
        <div class="branch active"><span>可选</span><b>检查监控</b><p>确认纸条来源，风险较低。</p></div>
        <div class="branch locked"><span>锁定</span><b>打开后门</b><p>推进更快，但会改写信任。</p></div>
      </section>
      <section class="clue-row">
        <span>无署名纸条</span><span>后门敲击声</span><span>断电记录</span>
      </section>
    `;
  }
  return `
    <section class="audience-list">
      <div><b>想要陪伴的人</b><p>下班后有人接住，而不是只给答案。</p></div>
      <div><b>喜欢角色的人</b><p>关系、语气和软肋会慢慢长出来。</p></div>
      <div><b>喜欢故事的人</b><p>旧关系可以进入新的剧情和房间。</p></div>
    </section>
    <section class="audience-matrix">
      <div><span>陪伴</span><b>夜聊 / 树洞 / 低能量日</b></div>
      <div><span>角色</span><b>OC / 群像 / 关系变化</b></div>
      <div><span>故事</span><b>分支 / 线索 / 旧经历</b></div>
      <div><span>创作</span><b>脑洞 / 对话 / 世界延续</b></div>
    </section>
    <section class="closing-line">进入房间，不用先懂 AI，只要慢慢熟起来。</section>
  `;
}

function renderProofPanel(card) {
  if (!card.proof?.length) return '';
  return `
    <section class="proof-panel" aria-label="功能介绍">
      ${card.proof.map(([label, text]) => `
        <div class="proof-row">
          <b>${label}</b>
          <p>${text}</p>
        </div>
      `).join('')}
    </section>
  `;
}

function renderSpotlight(card) {
  return card.spotlight && !card.shot ? `<section class="spotlight-panel">${card.spotlight}</section>` : '';
}

function createCardHtml() {
  const cards = promoCards.map((card, index) => `
    <article class="card" id="${card.id}">
      <div class="noise"></div>
      <div class="decor" aria-hidden="true">
        <span class="thread thread-a"></span>
        <span class="thread thread-b"></span>
        <span class="memory-chip chip-a">${card.decorChips[0]}</span>
        <span class="memory-chip chip-b">${card.decorChips[1]}</span>
        <span class="memory-chip chip-c">${card.decorChips[2]}</span>
        <span class="memory-chip chip-d">${card.decorChips[3]}</span>
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
      <div class="content ${card.layout}">
        <div class="info-modules">
          ${renderInfoModules(card)}
        </div>
        ${card.shot ? `
          <div class="phone ${index === 0 ? 'hero-phone' : ''}">
            <img src="${card.shot}" alt="">
          </div>
        ` : ''}
      </div>
      ${renderSpotlight(card)}
      <div class="chips">${card.chips.slice(0, 2).map((chip) => `<span>${chip}</span>`).join('')}</div>
      ${renderProofPanel(card)}
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
  html, body { margin: 0; width: ${CARD_WIDTH}px; min-height: ${CARD_HEIGHT}px; background: #FFF4EC; font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif; }
  body { overflow: hidden; }
  .card {
    position: relative;
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    overflow: hidden;
    color: #341D31;
    background:
      radial-gradient(circle at 12% 7%, rgba(255, 126, 108, .46), transparent 30%),
      radial-gradient(circle at 92% 74%, rgba(255, 184, 77, .34), transparent 34%),
      linear-gradient(152deg, #FFF7EF 0%, #FFE9DE 42%, #F7D2DF 70%, #E8D9FF 100%);
    display: none;
    padding: 48px 62px 46px;
  }
  .card.active { display: flex; flex-direction: column; }
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
    display: none;
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
    opacity: .18;
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
  .s3, .s4, .s5, .s6, .s7, .s8 { display: none; }
  .brand-row, .copy, .content, .spotlight-panel, .chips, .proof-panel, .footer { position: relative; z-index: 1; }
  .brand-row { display: flex; align-items: baseline; gap: 16px; margin-bottom: 18px; }
  .brand { font-size: 32px; font-weight: 900; letter-spacing: 0; }
  .brand-sub { color: #C5524B; font-size: 21px; font-weight: 800; }
  .kicker { margin: 0 0 14px; color: #C5524B; font-size: 32px; font-weight: 900; }
  h1 { margin: 0; max-width: 956px; font-size: 76px; line-height: 1.02; letter-spacing: 0; font-weight: 950; }
  .subtitle { margin: 18px 0 26px; max-width: 940px; color: rgba(52,29,49,.76); font-size: 35px; line-height: 1.28; font-weight: 800; }
  .content { display: grid; gap: 16px; }
  .content.cover { grid-template-columns: 1fr; align-items: stretch; }
  .content.rooms, .content.audience { grid-template-columns: 1fr; }
  .content.memory, .content.character, .content.story { grid-template-columns: 1fr; align-items: stretch; gap: 18px; }
  .info-modules { display: grid; gap: 14px; min-width: 0; }
  .compare, .flow, .cover-dashboard, .room-grid, .role-stack, .scene-strip, .memory-list, .stats-row, .trait-panel, .profile-grid, .voice-card, .branch-board, .clue-row, .audience-list, .audience-matrix, .closing-line, .spotlight-panel, .proof-panel {
    border: 1px solid rgba(197,82,75,.18);
    border-radius: 22px;
    background: rgba(255,255,255,.55);
    box-shadow: 0 22px 58px rgba(96,45,71,.10);
    backdrop-filter: blur(14px);
  }
  .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 14px; }
  .compare div { min-height: 126px; border-radius: 16px; padding: 16px 18px; background: rgba(255,247,239,.66); }
  .compare div:last-child { background: linear-gradient(135deg, rgba(255,126,108,.16), rgba(255,255,255,.7)); }
  .compare span, .profile-grid span, .branch span, .role-stack span { color: #C5524B; font-size: 25px; font-weight: 900; }
  .compare b { display: block; margin: 6px 0 6px; font-size: 34px; line-height: 1.06; }
  .compare p, .room-grid p, .memory-list p, .audience-list p, .branch p { margin: 0; color: rgba(52,29,49,.68); font-size: 26px; line-height: 1.25; font-weight: 800; }
  .flow { display: grid; grid-template-columns: auto 1fr auto 1fr auto 1fr auto; align-items: center; gap: 12px; padding: 17px 22px; }
  .flow span { font-size: 29px; font-weight: 900; color: #4B243F; white-space: nowrap; }
  .flow i { height: 3px; border-radius: 999px; background: linear-gradient(90deg, #FF7A66, rgba(75,36,63,.14)); }
  .cover-dashboard { display: grid; grid-template-columns: 1fr 288px; gap: 16px; padding: 16px; }
  .dialogue-preview { display: grid; gap: 12px; }
  .dialogue-line {
    display: grid;
    grid-template-columns: 86px 1fr;
    gap: 12px;
    align-items: start;
    border-radius: 18px;
    padding: 16px 18px;
    background: rgba(255,255,255,.7);
    border: 1px solid rgba(75,36,63,.08);
  }
  .dialogue-line strong { color: #C5524B; font-size: 28px; line-height: 1.22; }
  .dialogue-line p { margin: 0; color: #341D31; font-size: 29px; line-height: 1.24; font-weight: 850; }
  .user-line { background: linear-gradient(135deg, rgba(255,122,102,.18), rgba(255,255,255,.74)); }
  .signal-stack { display: grid; grid-template-columns: 1fr; overflow: hidden; border-radius: 18px; border: 1px solid rgba(197,82,75,.14); background: rgba(255,247,239,.62); }
  .signal-stack .metric { border-right: 0; border-bottom: 1px solid rgba(197,82,75,.12); }
  .signal-stack .metric:last-child { border-bottom: 0; }
  .room-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 16px; }
  .room-grid div, .audience-list div { border-radius: 16px; background: rgba(255,255,255,.62); padding: 18px; }
  .room-grid b, .memory-list b, .audience-list b, .branch b { display: block; margin-bottom: 8px; font-size: 36px; line-height: 1.06; }
  .role-stack { display: grid; gap: 1px; overflow: hidden; background: rgba(197,82,75,.14); }
  .role-stack div {
    min-height: 176px;
    display: grid;
    grid-template-columns: 66px 96px 1fr;
    grid-template-rows: auto auto;
    column-gap: 14px;
    align-items: center;
    padding: 18px 20px;
    background: linear-gradient(135deg, rgba(255,255,255,.72), rgba(255,122,102,.09));
  }
  .role-stack img {
    grid-row: 1 / 3;
    width: 72px;
    height: 72px;
    border-radius: 20px;
    object-fit: cover;
    box-shadow: 0 12px 26px rgba(96,45,71,.13);
  }
  .role-stack span { font-size: 28px; }
  .role-stack b { display: block; color: #341D31; font-size: 34px; line-height: 1.08; }
  .role-stack p {
    grid-column: 2 / 4;
    margin: 6px 0 0;
    color: rgba(52,29,49,.68);
    font-size: 25px;
    line-height: 1.16;
    font-weight: 800;
  }
  .scene-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; overflow: hidden; background: rgba(197,82,75,.14); }
  .scene-strip div { min-height: 96px; padding: 16px 14px; background: rgba(255,255,255,.62); }
  .scene-strip b { display: block; margin-bottom: 6px; color: #C5524B; font-size: 26px; }
  .scene-strip span { color: #4B243F; font-size: 25px; line-height: 1.1; font-weight: 900; }
  .memory-list, .audience-list { display: grid; gap: 12px; padding: 16px; }
  .memory-list div { padding: 16px 18px; border-radius: 16px; background: rgba(255,255,255,.62); }
  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); overflow: hidden; }
  .metric { padding: 16px 14px; border-right: 1px solid rgba(197,82,75,.14); text-align: center; }
  .metric:last-child { border-right: 0; }
  .metric b { display: block; font-size: 52px; line-height: 1; color: #C5524B; }
  .metric span { display: block; margin-top: 8px; font-size: 24px; font-weight: 900; }
  .metric em { display: block; margin-top: 4px; color: rgba(52,29,49,.56); font-size: 20px; font-style: normal; font-weight: 800; }
  .trait-panel { padding: 18px; }
  .bar-list { display: grid; gap: 18px; }
  .bar-head { display: flex; justify-content: space-between; color: #341D31; font-size: 26px; font-weight: 900; }
  .bar-track { height: 16px; margin-top: 10px; border-radius: 999px; background: rgba(75,36,63,.12); overflow: hidden; }
  .bar-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #FF7A66, #696BFF); }
  .profile-grid { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 16px; }
  .profile-grid div { padding: 15px 16px; border-radius: 16px; background: rgba(255,255,255,.62); }
  .profile-grid b { display: block; margin-top: 7px; font-size: 29px; line-height: 1.18; }
  .voice-card { padding: 20px 22px; color: #4B243F; font-size: 29px; line-height: 1.24; font-weight: 900; }
  .branch-board { display: grid; gap: 14px; padding: 16px; }
  .branch { padding: 18px; border-radius: 16px; background: rgba(255,255,255,.64); border: 1px solid rgba(197,82,75,.12); }
  .branch.locked { opacity: .72; }
  .clue-row { display: flex; flex-wrap: wrap; gap: 10px; padding: 16px; }
  .clue-row span { min-height: 54px; display: inline-flex; align-items: center; padding: 0 18px; border-radius: 999px; background: rgba(255,126,108,.12); color: #4B243F; font-size: 24px; font-weight: 900; }
  .audience-matrix { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; overflow: hidden; background: rgba(197,82,75,.14); }
  .audience-matrix div { min-height: 118px; padding: 22px; background: rgba(255,255,255,.62); }
  .audience-matrix span { display: block; margin-bottom: 8px; color: #C5524B; font-size: 27px; font-weight: 900; }
  .audience-matrix b { display: block; color: #341D31; font-size: 32px; line-height: 1.18; }
  .closing-line { padding: 26px 28px; color: #4B243F; font-size: 36px; line-height: 1.2; font-weight: 950; }
  .spotlight-panel {
    min-height: 128px;
    display: flex;
    align-items: center;
    margin-top: 16px;
    padding: 24px 32px;
    color: #341D31;
    font-size: 40px;
    line-height: 1.16;
    font-weight: 950;
    background: linear-gradient(135deg, rgba(255,255,255,.72), rgba(255,122,102,.18));
  }
  .phone {
    width: 760px;
    height: 760px;
    margin: 0 auto;
    border: 12px solid rgba(255,255,255,.92);
    border-radius: 46px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 44px 110px rgba(96,45,71,.24), 0 0 0 1px rgba(255,255,255,.7), 0 0 70px rgba(255,122,102,.22);
    transform: rotate(-1.5deg);
  }
  .hero-phone { transform: rotate(1.1deg); }
  .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  #02-chat .phone img, #06-cta .phone img { object-position: center top; }
  #03-memory .phone img { object-position: center 18%; }
  #04-character .phone img { object-position: center 12%; }
  #05-room .phone img { object-position: center 10%; }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 14px;
  }
  .chips span {
    display: inline-flex;
    align-items: center;
    min-height: 66px;
    padding: 0 28px;
    border: 1px solid rgba(197,82,75,.24);
    border-radius: 999px;
    color: #4B243F;
    background: linear-gradient(135deg, rgba(255,255,255,.74), rgba(255,126,108,.18));
    font-size: 31px;
    font-weight: 900;
  }
  .proof-panel {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1px;
    margin-top: 18px;
    overflow: hidden;
    background: rgba(197,82,75,.14);
  }
  .proof-row {
    min-height: 106px;
    display: grid;
    grid-template-columns: 180px 1fr;
    align-items: center;
    gap: 22px;
    padding: 16px 24px;
    background: rgba(255,255,255,.58);
  }
  .proof-row b {
    display: inline-flex;
    align-items: center;
    min-height: 42px;
    padding-left: 14px;
    border-left: 6px solid #C5524B;
    color: #C5524B;
    font-size: 30px;
    line-height: 1.12;
  }
  .proof-row p {
    margin: 0;
    color: #341D31;
    font-size: 27px;
    line-height: 1.24;
    font-weight: 800;
  }
  .footer {
    position: absolute;
    left: 62px;
    right: 62px;
    bottom: 46px;
    display: flex;
    justify-content: space-between;
    color: rgba(52,29,49,.48);
    font-size: 22px;
    font-weight: 700;
  }
  #01-cover h1 { max-width: 950px; font-size: 76px; }
  #01-cover .subtitle { margin-bottom: 16px; }
  #01-cover .content { gap: 0; }
  #01-cover .phone { order: -1; }
  #01-cover .info-modules { grid-template-columns: 1fr; gap: 12px; }
  #06-cta h1 { font-size: 76px; max-width: 910px; }
  #02-chat .subtitle { margin-bottom: 14px; }
  #02-chat .info-modules, #06-cta .info-modules { align-content: start; }
  #06-cta .audience-list { grid-template-columns: 1fr; }
  #06-cta .audience-list div { min-height: 96px; }
  #06-cta .closing-line { min-height: 88px; display: flex; align-items: center; }
  #01-cover .content, #02-chat .content, #06-cta .content { gap: 12px; }
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
  if (options.beforeShot) await evaluate(cdp, options.beforeShot, true);
  await screenshot(cdp, fileName);
}

async function keepExistingOnCaptureFailure(label, capture) {
  try {
    await capture();
  } catch (error) {
    console.warn(`skip ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
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

function buildAvatarInjectionExpression(avatars) {
  const avatarMap = {
    '阿': avatars.awan,
    '阿晚': avatars.awan,
    '老': avatars.laoli,
    '老李': avatars.laoli,
    '涩': avatars.sese,
    '涩涩': avatars.sese,
    '我': avatars.me,
  };
  return `new Promise((resolve) => {
    const avatarMap = ${JSON.stringify(avatarMap)};
    const applyAvatar = (element, src) => {
      if (!element || !src) return;
      element.textContent = '';
      element.style.backgroundImage = 'url("' + src + '")';
      element.style.backgroundSize = 'cover';
      element.style.backgroundPosition = 'center';
      element.style.backgroundColor = 'transparent';
      element.style.opacity = '1';
    };
    requestAnimationFrame(() => {
      Array.from(document.querySelectorAll('.MuiAvatar-root')).forEach((element) => {
        const text = (element.textContent || '').trim();
        applyAvatar(element, avatarMap[text]);
      });
      resolve(true);
    });
  })`;
}

async function main() {
  await Promise.all([
    fs.mkdir(OUT_DIR, { recursive: true }),
    fs.mkdir(POSTER_DIR, { recursive: true }),
    fs.mkdir(SCREENSHOT_DIR, { recursive: true }),
    fs.mkdir(PREVIEW_DIR, { recursive: true }),
  ]);
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
    const messageDiagnostics = await evaluate(cdp, `import('/src/stores/useMessageStore.ts').then(({ useMessageStore }) => JSON.stringify(useMessageStore.getState().messageWindowsByChatId['promo-chat-main']?.messages?.map((message) => ({
      id: message.id,
      type: message.type,
      senderId: message.senderId,
      contentType: typeof message.content,
      hasNarrativeTurn: Boolean(message.metadata?.narrativeTurn),
      metadataKeys: Object.keys(message.metadata || {}),
    })) || []))`, true);
    console.log('message diagnostics', messageDiagnostics);
    const injectAvatars = buildAvatarInjectionExpression(avatarDataUrls);
    await keepExistingOnCaptureFailure('chat detail screenshot', () => captureAppShot(cdp, '/chats/promo-chat-main', 'screenshots/shot-chat.png', '周五夜聊房', { height: 1040, beforeShot: injectAvatars }));
    await keepExistingOnCaptureFailure('chat list screenshot', () => captureAppShot(cdp, '/chats?tab=0', 'screenshots/shot-chat-list.png', '周五夜聊房', { height: 1040, beforeShot: injectAvatars }));
    await keepExistingOnCaptureFailure('character list screenshot', () => captureAppShot(cdp, '/characters', 'screenshots/shot-character-list.png', '阿晚', { height: 1040 }));
    await keepExistingOnCaptureFailure('character memory screenshot', async () => {
      await setViewport(cdp, 430, 1040, 2);
      await navigate(cdp, `${CLIENT_URL}/characters/promo-awan/edit`);
      await waitFor(cdp, `document.body.innerText.includes('阿晚')`, 12000);
      await clickText(cdp, '记忆');
      await evaluate(cdp, `new Promise((resolve) => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 90, behavior: 'instant' });
          resolve(true);
        });
      })`, true);
      await screenshot(cdp, 'screenshots/shot-memory.png');
      await clickText(cdp, '人格');
      await evaluate(cdp, `new Promise((resolve) => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 260, behavior: 'instant' });
          resolve(true);
        });
      })`, true);
      await screenshot(cdp, 'screenshots/shot-character.png');
    });
    await keepExistingOnCaptureFailure('story screenshot', () => captureAppShot(cdp, '/chats/promo-chat-story', 'screenshots/shot-story.png', '雨夜便利店', {
      height: 1040,
      beforeShot: `new Promise((resolve) => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 92, behavior: 'instant' });
          const storyCard = Array.from(document.querySelectorAll('.MuiCard-root, [class*="Card"], article, section'))
            .find((element) => (element.innerText || '').includes('故事即将开始'));
          if (storyCard) {
            storyCard.style.transform = 'translateY(-72px)';
            storyCard.style.marginBottom = '-72px';
          }
          resolve(true);
        });
      })`,
    }));

    const previewPath = path.join(PREVIEW_DIR, 'cards.html');
    await fs.writeFile(previewPath, createCardHtml(), 'utf8');
    for (const card of promoCards) {
      await setViewport(cdp, CARD_WIDTH, CARD_HEIGHT, 1);
      await navigate(cdp, `file://${previewPath}?card=${card.id}`);
      await waitFor(cdp, `document.querySelector('.card.active') !== null`, 5000);
      await screenshot(cdp, `posters/${card.id}.png`);
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
