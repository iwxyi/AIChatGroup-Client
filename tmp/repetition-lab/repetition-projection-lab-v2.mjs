import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const DEFAULT_REPORT = '../ai-reports/ai-llm-acceptance-2026-07-29T06-26-42-130Z.json';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const REPORT_PATH = resolve(import.meta.dirname, process.env.REPETITION_LAB_REPORT || DEFAULT_REPORT);
const OUT_DIR = resolve(import.meta.dirname, 'reports');
const API_KEY = process.env.PNEUMATA_TEST_LLM_API_KEY || '';
const MODEL = process.env.PNEUMATA_TEST_LLM_MODEL || '';
const BASE_URL = (process.env.PNEUMATA_TEST_LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const TRIALS = Math.max(1, Math.min(30, Number(process.env.REPETITION_LAB_TRIALS || 8)));
const CASE_LIMIT = Math.max(1, Math.min(60, Number(process.env.REPETITION_LAB_CASES || 18)));
const RUN_BATCH_JUDGE = /^(1|true|yes|on)$/i.test(String(process.env.REPETITION_LAB_BATCH_JUDGE || '').trim());
const INCLUDE_SYNTHETIC_CASES = !/^(0|false|no|off)$/i.test(String(process.env.REPETITION_LAB_SYNTHETIC || '1').trim());
const SELECTED_VARIANTS = new Set(String(process.env.REPETITION_LAB_VARIANTS || '').split(',').map((item) => item.trim()).filter(Boolean));
const SELECTED_CASE_IDS = new Set(String(process.env.REPETITION_LAB_CASE_IDS || '').split(',').map((item) => item.trim()).filter(Boolean));

if (!API_KEY || !MODEL) {
  console.error('Missing PNEUMATA_TEST_LLM_API_KEY or PNEUMATA_TEST_LLM_MODEL.');
  process.exit(2);
}

function normalizeForComparison(content) {
  return String(content || '')
    .replace(/（[^（）]{1,80}）/g, '')
    .replace(/\([^()]{1,80}\)/g, '')
    .replace(/\*[^*\n]{1,80}\*/g, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCompact(content) {
  return normalizeForComparison(content).replace(/\s+/g, '');
}

function collectCharBigrams(content) {
  const normalized = normalizeCompact(content);
  const grams = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) grams.add(normalized.slice(index, index + 2));
  return grams;
}

function bigramSimilarity(a, b) {
  const aGrams = collectCharBigrams(a);
  const bGrams = collectCharBigrams(b);
  if (!aGrams.size || !bGrams.size) return 0;
  let intersection = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) intersection += 1;
  const union = new Set([...aGrams, ...bGrams]).size;
  return union ? intersection / union : 0;
}

function lcsRatio(a, b) {
  const left = Array.from(normalizeCompact(a)).slice(0, 500);
  const right = Array.from(normalizeCompact(b)).slice(0, 500);
  if (!left.length || !right.length) return 0;
  const dp = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = dp[j];
      dp[j] = left[i - 1] === right[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[right.length] / Math.max(left.length, right.length);
}

function opening(content) {
  const cleaned = String(content || '').replace(/\s+/g, ' ').trim();
  return (cleaned.split(/[。！？!?]/)[0] || cleaned).split(/[，,、：:；;]/)[0].trim().slice(0, 18);
}

function visibleCharLength(content) {
  return Array.from(String(content || '').replace(/\s+/g, '')).length;
}

function actionProfile(content) {
  const text = String(content || '');
  const parentheticalActions = [...text.matchAll(/[（(][^（）()\n]{2,80}[）)]/g)].map((match) => match[0]);
  const actionDialoguePattern = /^[（(][^（）()\n]{2,80}[）)]\s*[^（）()\n]{2,160}[。！？!?，,；;]\s*[（(][^（）()\n]{2,80}[）)]/s.test(text.trim());
  const multiBlock = parentheticalActions.length >= 2 || actionDialoguePattern;
  return {
    parentheticalActionCount: parentheticalActions.length,
    actionDialoguePattern,
    multiActionRisk: multiBlock,
  };
}

function collectMetrics(reply, input) {
  const ownPrevious = [...input.previousMessages].reverse().find((message) => message.senderId === input.speakerId)?.content || '';
  const lastPrevious = input.previousMessages.at(-1)?.content || '';
  const sims = input.previousMessages.map((message) => ({
    senderId: message.senderId,
    senderName: message.senderName,
    own: message.senderId === input.speakerId,
    bigram: bigramSimilarity(reply, message.content),
    lcs: lcsRatio(reply, message.content),
    sameOpening: opening(reply).length >= 4 && opening(reply) === opening(message.content),
    content: message.content,
  }));
  const max = sims.reduce((best, item) => {
    const score = Math.max(item.bigram, item.lcs);
    const bestScore = best ? Math.max(best.bigram, best.lcs) : -1;
    return score > bestScore ? item : best;
  }, null);
  const ownBigram = ownPrevious ? bigramSimilarity(reply, ownPrevious) : 0;
  const ownLcs = ownPrevious ? lcsRatio(reply, ownPrevious) : 0;
  const lastBigram = lastPrevious ? bigramSimilarity(reply, lastPrevious) : 0;
  const lastLcs = lastPrevious ? lcsRatio(reply, lastPrevious) : 0;
  const originalBigram = bigramSimilarity(reply, input.originalContent);
  const originalLcs = lcsRatio(reply, input.originalContent);
  const exact = normalizeCompact(reply) && input.previousMessages.some((message) => normalizeCompact(reply) === normalizeCompact(message.content));
  const intentionalAllowed = Boolean(input.allowsIntentionalRepeat);
  const hardDuplicate = !intentionalAllowed && (exact || Math.max(ownBigram, ownLcs) >= 0.58 || Math.max(max?.bigram || 0, max?.lcs || 0) >= 0.72 || Boolean(max?.sameOpening));
  const semanticLoopRisk = !intentionalAllowed && Math.max(ownBigram, ownLcs, originalBigram, originalLcs) >= 0.34;
  return {
    exact,
    hardDuplicate,
    semanticLoopRisk,
    visibleLength: visibleCharLength(reply),
    action: actionProfile(reply),
    ownBigram: Number(ownBigram.toFixed(3)),
    ownLcs: Number(ownLcs.toFixed(3)),
    lastBigram: Number(lastBigram.toFixed(3)),
    lastLcs: Number(lastLcs.toFixed(3)),
    originalBigram: Number(originalBigram.toFixed(3)),
    originalLcs: Number(originalLcs.toFixed(3)),
    maxRecent: max ? {
      senderName: max.senderName,
      own: max.own,
      bigram: Number(max.bigram.toFixed(3)),
      lcs: Number(max.lcs.toFixed(3)),
      sameOpening: max.sameOpening,
      content: max.content,
    } : null,
  };
}

function chatUrl() {
  return BASE_URL.endsWith('/chat/completions') ? BASE_URL : `${BASE_URL}/chat/completions`;
}

async function callModel(messages, options = {}) {
  const maxAttempts = Math.max(1, Math.min(4, Number(process.env.REPETITION_LAB_LLM_ATTEMPTS || 2)));
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.PNEUMATA_TEST_LLM_TIMEOUT_MS || 45000));
    try {
      const response = await fetch(chatUrl(), {
        method: 'POST',
        headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: options.temperature ?? 0.62,
          max_tokens: options.maxTokens || 900,
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`LLM request failed ${response.status}: ${text.slice(0, 500)}`);
        error.status = response.status;
        throw error;
      }
      const data = JSON.parse(text);
      return {
        content: data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '',
        usage: data.usage || null,
      };
    } catch (error) {
      lastError = error;
      const status = error?.status;
      const retryable = attempt < maxAttempts && (!status || status === 429 || status >= 500);
      console.error(`[projection-lab-v2] LLM call failed attempt ${attempt}/${maxAttempts}: ${error?.message || error}`);
      if (!retryable) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('LLM call failed');
}

function parseContent(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw;
  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed.content === 'string') return parsed.content;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (typeof parsed.content === 'string') return parsed.content;
      } catch {
        // Fall through.
      }
    }
  }
  return raw.replace(/^["“]?content["”]?\s*[:：]\s*/i, '').trim();
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const fencedMatches = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]?.trim()).filter(Boolean);
  for (const candidate of [...fencedMatches, raw]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Try balanced JSON blocks below.
    }
  }

  const candidates = [];
  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(raw.slice(start, index + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates.reverse()) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Keep scanning older blocks.
    }
  }
  return null;
}

function buildSystemPrompt(input) {
  return [
    `You are ${input.speakerName} in a Sense Murmur multi-character group chat.`,
    'Reply as this character only. Write one visible live-chat turn.',
    'Recent transcript is room state and social pressure, not wording to imitate.',
    'If this speaker already spoke recently, continue from the changed situation; do not restate the same ask, conclusion, or closing.',
    'Return JSON only: {"content":"visible reply"}',
  ].join('\n');
}

function label(message) {
  if (message.type === 'user' || message.type === 'god') return '用户';
  return message.senderName || message.senderId;
}

function oldAssistantProjection(input) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(input) },
    { role: 'user', content: 'Conversation transcript for context only:\nRecent transcript is room state and thread evidence, not a style sample to imitate.' },
  ];
  for (const message of input.previousMessages) {
    if (message.type === 'ai' && message.senderId === input.speakerId) messages.push({ role: 'assistant', content: message.content });
    else messages.push({ role: 'user', content: `${label(message)}: ${message.content}` });
  }
  messages.push({ role: 'user', content: `Now write ${input.speakerName}'s next visible reply. Do not explain.` });
  return messages;
}

function allNamedTranscriptProjection(input) {
  const transcript = input.previousMessages
    .map((message) => `${message.senderId === input.speakerId ? `${input.speakerName}（自己刚才说过）` : label(message)}: ${message.content}`)
    .join('\n');
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: [
        'Conversation transcript for context only.',
        'Every line below is room transcript evidence. None of it is an assistant message to continue verbatim.',
        transcript,
        '',
        `Now write ${input.speakerName}'s next visible reply. Do not explain.`,
      ].join('\n'),
    },
  ];
}

function reportCases(data) {
  const scenarios = data.results?.[0]?.cases?.chatflow?.scenarios || {};
  const cases = [];
  for (const [scenarioName, run] of Object.entries(scenarios)) {
    const transcript = run.transcript || [];
    const chronologicalMessages = (run.seedUserMessages || []).map((item, index) => ({
      type: 'user',
      senderId: `seed-user-${index + 1}`,
      senderName: item.senderName || '用户',
      content: item.content,
    }));
    const injections = (run.userInjectionLog || []).map((item, index) => ({
      type: 'user',
      senderId: `injection-user-${index + 1}`,
      senderName: '用户',
      afterTurn: item.afterTurn,
      content: item.content,
    }));
    const appendInjectionsAfterTurn = (turn) => {
      for (const injection of injections.filter((item) => item.afterTurn === turn)) {
        chronologicalMessages.push({
          type: 'user',
          senderId: injection.senderId,
          senderName: injection.senderName,
          content: injection.content,
        });
      }
    };
    appendInjectionsAfterTurn(0);
    for (let index = 0; index < transcript.length; index += 1) {
      const current = transcript[index];
      const previousMessages = chronologicalMessages.slice(-8);
      if (!previousMessages.length) continue;
      const previous = previousMessages.at(-1);
      const review = (run.turnReviews || []).find((item) => item.turn === current.turn);
      const issueText = JSON.stringify(review?.review?.issues || []);
      const previousSpeakerSame = previous?.senderId === current.senderId;
      const originalMetrics = collectMetrics(current.content, {
        previousMessages,
        speakerId: current.senderId,
        originalContent: current.content,
      });
      const categories = classifyCase({
        scenarioName,
        current,
        previous,
        previousMessages,
        issueText,
        originalMetrics,
        previousSpeakerSame,
      });
      const priority = (originalMetrics.hardDuplicate ? 100 : 0)
        + (previousSpeakerSame ? 30 : 0)
        + (/重复|雷同|相同|连续/.test(issueText) ? 20 : 0)
        + (review?.score ? Math.max(0, 80 - review.score) / 10 : 0);
      if (priority > 0 || categories.includes('coverage')) {
        cases.push({
          id: `${scenarioName}:${current.turn}:${current.senderId}`,
          scenarioName,
          turn: current.turn,
          speakerId: current.senderId,
          speakerName: current.senderName,
          originalContent: current.content,
          originalIssues: review?.review?.issues || [],
          originalScore: review?.score ?? null,
          previousMessages,
          previousSpeakerSame,
          categories,
          originalMetrics,
          priority,
        });
      }
      chronologicalMessages.push({
        type: 'ai',
        senderId: current.senderId,
        senderName: current.senderName,
        content: current.content,
      });
      appendInjectionsAfterTurn(current.turn);
    }
  }
  return selectBalancedCases(INCLUDE_SYNTHETIC_CASES ? [...cases, ...syntheticCases()] : cases);
}

function classifyCase({ scenarioName, current, previous, previousMessages, issueText, originalMetrics, previousSpeakerSame }) {
  const text = [scenarioName, current.content, issueText].join('\n');
  const lastOther = [...previousMessages].reverse().find((message) => message.senderId !== current.senderId);
  const ownPrevious = [...previousMessages].reverse().find((message) => message.senderId === current.senderId);
  const categories = [];
  if (originalMetrics.hardDuplicate || /重复|雷同|相同/.test(issueText)) categories.push('duplicate_risk');
  if (previousSpeakerSame) categories.push('same_speaker');
  if (previousSpeakerSame && !originalMetrics.hardDuplicate && !/重复|雷同|相同/.test(issueText)) categories.push('valid_same_speaker');
  if (/点名|抢答|提到|目标|hijack|mention/i.test(text)) categories.push('mention_target');
  if (/选择|决定|建议|怎么选|怎么办|更适合|确认|不确定|contradiction|矛盾|记忆/.test(text)) categories.push('decision_or_memory');
  if (lastOther?.content && /[？?]\s*$/.test(lastOther.content.trim())) categories.push('answer_pending_question');
  if (ownPrevious && Math.max(bigramSimilarity(current.content, ownPrevious.content), lcsRatio(current.content, ownPrevious.content)) >= 0.28) categories.push('own_move_overlap');
  if (!categories.length && previous) categories.push('coverage');
  return categories;
}

function selectBalancedCases(cases) {
  if (SELECTED_CASE_IDS.size) {
    const byId = new Map(cases.map((item) => [item.id, item]));
    const selected = [...SELECTED_CASE_IDS].map((id) => byId.get(id)).filter(Boolean);
    const missing = [...SELECTED_CASE_IDS].filter((id) => !byId.has(id));
    if (missing.length) console.error(`[projection-lab-v2] missing selected case ids: ${missing.join(', ')}`);
    return selected;
  }
  const sorted = [...cases].sort((a, b) => b.priority - a.priority);
  const selected = [];
  const seen = new Set();
  const buckets = [
    'duplicate_risk',
    'same_speaker',
    'valid_same_speaker',
    'decision_or_memory',
    'answer_pending_question',
    'mention_target',
    'intentional_repeat',
    'quality_guardrail',
    'own_move_overlap',
    'coverage',
  ];
  for (const bucket of buckets) {
    for (const item of sorted.filter((candidate) => candidate.categories.includes(bucket)).slice(0, 4)) {
      if (selected.length >= CASE_LIMIT) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      selected.push(item);
    }
  }
  for (const item of sorted) {
    if (selected.length >= CASE_LIMIT) break;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    selected.push(item);
  }
  return selected;
}

function syntheticCases() {
  const ai = (senderId, senderName, content) => ({ type: 'ai', senderId, senderName, content });
  const user = (content) => ({ type: 'user', senderId: 'user', senderName: '用户', content });
  return [
    {
      id: 'synthetic:decision_after_repeated_question:yu',
      scenarioName: 'synthetic_decision_pressure',
      turn: 99,
      speakerId: 'yu',
      speakerName: '余声',
      originalContent: '所以你是更想要安静点，还是想要热闹点？',
      originalIssues: ['用户已经要求帮忙选择，继续追问会无视用户意图。'],
      originalScore: null,
      previousMessages: [
        user('帮我选一个周五晚上聚会的地方，别再问我了。'),
        ai('yu', '余声', '木桌倒是有，但他们周五音乐偏爵士，人多的话热闹感可能会打折扣。'),
        ai('xiao', '小满', '我只要能坐下来聊天就行，太吵我会头疼。'),
      ],
      previousSpeakerSame: false,
      categories: ['decision_or_memory', 'quality_guardrail'],
      expectedBehavior: '应该直接给出选择和理由，可带一个可执行备选；不要继续把选择题丢回给用户。',
      originalMetrics: null,
      priority: 92,
    },
    {
      id: 'synthetic:valid_same_speaker_continuation:chef',
      scenarioName: 'synthetic_valid_same_speaker',
      turn: 99,
      speakerId: 'chef',
      speakerName: '梁师傅',
      originalContent: '油温别太低，不然蛋会吸油。番茄先炒出汁，再把蛋回锅。',
      originalIssues: [],
      originalScore: null,
      previousMessages: [
        user('番茄炒蛋怎么炒才不会水汪汪？'),
        ai('chef', '梁师傅', '先把番茄籽心去一部分，蛋液里少放水，火要够。'),
        user('那蛋和番茄哪个先下锅？'),
      ],
      previousSpeakerSame: false,
      categories: ['valid_same_speaker', 'answer_pending_question', 'quality_guardrail'],
      expectedBehavior: '连续由同一专业角色回答是合理的；应该回答新问题，不能因为反重复而交棒或回避。',
      originalMetrics: null,
      priority: 86,
    },
    {
      id: 'synthetic:mentioned_other_should_handoff:zhou',
      scenarioName: 'synthetic_mention_target',
      turn: 99,
      speakerId: 'zhou',
      speakerName: '周策',
      originalContent: '我觉得这事先按我的方案走，安安那边之后再补。',
      originalIssues: ['用户明确点名安安，周策继续抢话会破坏体验。'],
      originalScore: null,
      previousMessages: [
        ai('zhou', '周策', '这个方案不用讨论太久，今天先定第一版。'),
        user('安安，你怎么看？我想听你的意见。'),
      ],
      previousSpeakerSame: false,
      categories: ['mention_target', 'quality_guardrail'],
      expectedBehavior: '如果系统仍选到周策，应该极短交棒给安安或承认该听安安，不应继续替安安回答。',
      originalMetrics: null,
      priority: 90,
    },
    {
      id: 'synthetic:intentional_repeat_chant:awan',
      scenarioName: 'synthetic_intentional_repeat',
      turn: 99,
      speakerId: 'awan',
      speakerName: '阿晚',
      originalContent: '出发！',
      originalIssues: [],
      originalScore: null,
      previousMessages: [
        user('我数三二一，大家一起说“出发！”'),
        ai('sese', '瑟瑟', '出发！'),
      ],
      previousSpeakerSame: false,
      categories: ['intentional_repeat', 'quality_guardrail'],
      expectedBehavior: '这是社交跟风/口令场景，允许短促重复“出发！”或类似固定呼应；不应该为了避重写成长篇解释。',
      allowsIntentionalRepeat: true,
      originalMetrics: null,
      priority: 88,
    },
    {
      id: 'synthetic:pressure_soften_without_losing_core:laoli',
      scenarioName: 'synthetic_pressure_repair',
      turn: 99,
      speakerId: 'laoli',
      speakerName: '老李',
      originalContent: '你到底去不去？别磨叽。',
      originalIssues: ['连续施压容易重复且让关系变硬，但完全绕开确认也会跑题。'],
      originalScore: null,
      previousMessages: [
        ai('laoli', '老李', '瑟瑟，加班能不能定？能去就说能去，不能去我们好改时间。'),
        ai('sese', '瑟瑟', '我不是不想去，就是领导还没批，我也有点烦。'),
      ],
      previousSpeakerSame: false,
      categories: ['decision_or_memory', 'quality_guardrail', 'own_move_overlap'],
      expectedBehavior: '应该降低压迫感但保留确认需求，例如给截止时间或备选方案；不要原样催问，也不要完全转移话题。',
      originalMetrics: null,
      priority: 91,
    },
    {
      id: 'synthetic:long_speech_and_action_drift:temujin',
      scenarioName: 'synthetic_long_speech_drift',
      turn: 99,
      speakerId: 'temujin',
      speakerName: '成吉思汗',
      originalContent: '（握紧马鞭，目光扫过众人）拿破仑，你那些纸上推演的后劲，能比得上我一支箭在千里外射出的连锁反应吗？草原的规矩很简单——我法典只需一句话：服从我，共享一切；背叛我，马蹄踏平你的骨头。你改那法典要几年？我的法令写在马蹄印里，走到哪，传到哪。（他抬手指向远方，仿佛千军万马正在风雪里奔腾）',
      originalIssues: ['群聊逐渐变成长篇演说，当前回复继续抬高长度。', '出现动作+话+动作的剧本化结构。', '对前文做宏大反驳但没有像普通群聊一样接一个具体现场点。'],
      originalScore: null,
      previousMessages: [
        user('你们平时有什么真正能让自己放松的消遣？不要只聊治国。'),
        ai('kangxi', '康熙帝', '朕若得闲，倒喜欢让南怀仁拿些西洋仪器来，浑天仪、望远镜，摆弄摆弄。静下来算算历法，看看星辰运行，比什么都让人心静。'),
        ai('zhaokuangyin', '宋太祖', '浑天仪、望远镜听着就比咱汴京城里的司天台精巧。朕也想过摆弄，就是这些名儿太绕口，怕两天就扔库里落灰了。'),
        ai('caesar', '凯撒', '历法这事，我在埃及跟祭司学过。后来我让人把结果刻成书，城里贴一份，军营里也放一份。怕落灰是最好的起点。'),
        ai('peter', '彼得大帝', '落灰的东西就是废物。我在荷兰造船厂学的时候，第一批木工活烂得像马槽子，但你不能怕烂。康熙，你那浑天仪看得再准，不如亲手拆一颗螺丝。'),
        ai('temujin', '成吉思汗', '彼得，说得好！草原上的汉子，哪个不是在马背上学会射箭、在风雪里学会生存？浑天仪再精巧，也比不上实战里磨出来的眼力。'),
        ai('liuche', '汉武帝', '一个造船，一个造弓，朕倒想起打通西域那会儿，亲自给张骞定路线图。动手虽好，可若无万里疆域给你放手去试，再巧的手也凿不出帝国。'),
        ai('napoleon', '拿破仑', '彼得，浑天仪拆了再装回去，那还是浑天仪。但你拆了一座旧帝国又自己打一副新骨架，那才叫本事。说起消遣，我在枫丹白露倒常翻法典草案，改掉那些拖沓措辞。'),
      ],
      previousSpeakerSame: false,
      categories: ['long_form_drift', 'action_drift', 'quality_guardrail'],
      expectedBehavior: '应该把话拉回自然群聊，短一点接住“消遣/动手/法典”中的一个现场点；避免继续升级成宏大演说，避免动作+话+动作。',
      originalMetrics: null,
      priority: 93,
    },
  ].map((item) => ({
    ...item,
    originalMetrics: collectMetrics(item.originalContent, item),
  }));
}

function transcriptWithOwnLinesQuarantined(input) {
  const roomTranscript = input.previousMessages
    .filter((message) => message.senderId !== input.speakerId)
    .map((message) => `${label(message)}: ${message.content}`)
    .join('\n');
  const ownLines = input.previousMessages
    .filter((message) => message.senderId === input.speakerId)
    .slice(-3)
    .map((message) => `- ${message.content.replace(/\s+/g, ' ').slice(0, 260)}`)
    .join('\n') || '- No recent own visible lines.';
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: [
        'Conversation transcript for context only.',
        'The room transcript below excludes your own previous lines so you do not continue or copy them as assistant history.',
        roomTranscript || '(No other visible room lines in this window.)',
        '',
        'Your recent own visible lines are listed only as a no-repeat quarantine. They are not assistant history and not a style sample:',
        ownLines,
        '',
        `Now write ${input.speakerName}'s next visible reply. Do not repeat your quarantined lines or ask for the same thing again.`,
      ].join('\n'),
    },
  ];
}

function transcriptWithContinuationContract(input) {
  const transcript = input.previousMessages
    .map((message) => `${message.senderId === input.speakerId ? `${input.speakerName}（自己刚才说过，不能复述）` : label(message)}: ${message.content}`)
    .join('\n');
  const samePrev = input.previousSpeakerSame;
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: [
        'Conversation transcript for context only.',
        'Every line below is room transcript evidence. None of it is an assistant message to continue verbatim.',
        transcript,
        '',
        samePrev
          ? [
              'Continuation contract because the previous visible speaker was also you:',
              '- Do not repeat the same request, same pressure, same summary, or same closing.',
              '- Do not merely make the previous line stricter.',
              '- Pick a different conversational job: add a concrete logistical detail, answer a detail raised by someone else, soften/repair the pressure, set a new deadline, or hand the floor to a specific person.',
              '- The reply must contain at least one new fact, concrete action, or changed stance not present in your own previous line.',
            ].join('\n')
          : 'Continue the latest room situation without copying sentence structure.',
        '',
        `Now write ${input.speakerName}'s next visible reply. Do not explain.`,
      ].join('\n'),
    },
  ];
}

function transcriptWithAdaptiveContinuationContract(input) {
  const transcript = input.previousMessages
    .map((message) => `${message.senderId === input.speakerId ? `${input.speakerName}（自己刚才说过，不能复述）` : label(message)}: ${message.content}`)
    .join('\n');
  const samePrev = input.previousSpeakerSame;
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: [
        'Conversation transcript for context only.',
        'Every line below is room transcript evidence. None of it is an assistant message to continue verbatim.',
        transcript,
        '',
        samePrev
          ? [
              'Adaptive continuation rule because the previous visible speaker was also you:',
              '- First decide whether this character should really add another line. If another person should answer, write a brief handoff or one concrete setup for that person instead of repeating your own pressure.',
              '- Choose exactly one natural conversational job from the situation. Do not announce the job.',
              '- Candidate jobs: add a new concrete fact only if the character plausibly knows it; make a specific next-step action; answer or integrate a detail someone else just raised; soften or repair your previous pressure; set a clear but non-identical boundary/deadline; hand the floor to a named person; close the loop briefly if the point is already settled.',
              '- Do not force every job. Do not add logistics, deadlines, or facts just to be different.',
              '- Bad continuation: same demand with stronger words, same summary with new adjectives, or a generic "so that is settled" closer.',
              '- Good continuation: the room can tell what changed after your previous line.',
            ].join('\n')
          : [
              'Continue the latest room situation.',
              '- Pick the natural conversational job from the current pressure; do not copy sentence structure.',
              '- If the room already has enough pressure, prefer a small new action, handoff, or concrete detail over another summary.',
            ].join('\n'),
        '',
        `Now write ${input.speakerName}'s next visible reply. Do not explain.`,
      ].join('\n'),
    },
  ];
}

function deriveSituationalJobContract(input) {
  const ownPrevious = [...input.previousMessages].reverse().find((message) => message.senderId === input.speakerId);
  const last = input.previousMessages.at(-1);
  const lastOther = [...input.previousMessages].reverse().find((message) => message.senderId !== input.speakerId);
  const ownOverlapRisk = ownPrevious
    ? Math.max(bigramSimilarity(input.originalContent, ownPrevious.content), lcsRatio(input.originalContent, ownPrevious.content))
    : 0;
  const lastOtherAsked = lastOther?.content ? /[？?]\s*$/.test(lastOther.content.trim()) : false;
  const currentWasNamed = Boolean(last?.content && new RegExp(input.speakerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(last.content));
  const lastNamedOther = input.previousMessages.some((message) => (
    message.senderId !== input.speakerId
    && message.senderName
    && last?.content
    && new RegExp(message.senderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(last.content)
  ));
  const decisionPressure = /选择|决定|建议|怎么选|怎么办|更适合|确认|定|改|去不去|能不能|要不要/.test(
    input.previousMessages.slice(-4).map((message) => message.content).join('\n'),
  );
  const memoryPressure = /记得|记忆|以前|之前|性格|关系|矛盾|不是说过|明明/.test(
    input.previousMessages.slice(-6).map((message) => message.content).join('\n'),
  );
  const highRepeatRisk = input.previousSpeakerSame || ownOverlapRisk >= 0.28 || input.originalMetrics.hardDuplicate;
  const guidance = [];

  if (lastOtherAsked && (currentWasNamed || !lastNamedOther)) {
    guidance.push('有人刚提出问题且当前角色适合回应：先回答问题，再补一句必要的态度或下一步。');
  }
  if (lastOtherAsked && lastNamedOther && !currentWasNamed) {
    guidance.push('上一句更像是在问别人：不要抢答；如必须发言，只做短促交棒或补充现场信息。');
  }
  if (decisionPressure) {
    guidance.push('房间有选择或确认压力：优先给明确偏好、条件、取舍或下一步，不要继续原地催问。');
  }
  if (memoryPressure) {
    guidance.push('上下文涉及记忆或自我矛盾：承认具体矛盾点并给修正/解释，不要继续追问用户已经给出的选择题。');
  }
  if (input.previousSpeakerSame) {
    guidance.push('上一句也是自己说的：只有在信息发生推进时才继续；否则用一句短交棒把话递给具体对象。');
  }
  if (ownOverlapRisk >= 0.28 || input.originalMetrics.hardDuplicate) {
    guidance.push('本窗口已有同角色相近表达：禁止复述同一请求、同一总结、同一收尾或只是加强语气。');
  }
  if (!guidance.length) {
    guidance.push('按当前房间压力自然接话；不要为了“不同”强行编造事实、deadline 或动作。');
  }

  return {
    highRepeatRisk,
    ownOverlapRisk: Number(ownOverlapRisk.toFixed(3)),
    guidance,
  };
}

function latestUserPressure(input) {
  const latestUser = [...input.previousMessages].reverse().find((message) => message.type === 'user');
  const text = latestUser?.content || '';
  return {
    text,
    asksDecision: /帮我选|替我选|你们帮我选|直接选|别再问|不用问|给个结论|推荐一个|定一个|怎么选|怎么办/.test(text),
    namesCurrent: text.includes(input.speakerName),
    namedSomeone: /[^\s，。！？、]{1,8}[，,、 ]*(你怎么看|你来说|你说|想听你|直接说)/.test(text) || /我想听/.test(text),
  };
}

function transcriptWithSituationalJobContract(input) {
  const contract = deriveSituationalJobContract(input);
  const transcript = input.previousMessages
    .map((message) => `${message.senderId === input.speakerId ? `${input.speakerName}（自己曾经说过，不能当作模板）` : label(message)}: ${message.content}`)
    .join('\n');
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: [
        'Conversation transcript for context only.',
        'Every line below is room evidence, not text to imitate.',
        transcript,
        '',
        'Situational conversational job contract:',
        ...contract.guidance.map((item) => `- ${item}`),
        '- 只选择当前语境真正需要的一种或两种动作。不是每次都要补事实、给动作、软化压力或设 deadline。',
        '- 好回复的标准：房间能看出当前这句相对前文发生了什么变化，同时仍像这个角色会说的话。',
        '',
        `Now write ${input.speakerName}'s next visible reply. Return JSON only. Do not explain.`,
      ].join('\n'),
    },
  ];
}

function transcriptWithFocusedSituationalJobContract(input) {
  const contract = deriveSituationalJobContract(input);
  const recentOwn = input.previousMessages
    .filter((message) => message.senderId === input.speakerId)
    .slice(-3)
    .map((message) => `- ${message.content.replace(/\s+/g, ' ').slice(0, 220)}`);
  const transcript = input.previousMessages
    .map((message) => `${message.senderId === input.speakerId ? `${input.speakerName}（自己曾经说过）` : label(message)}: ${message.content}`)
    .join('\n');
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: [
        'Conversation transcript for context only.',
        'Every line below is room evidence, not text to imitate.',
        transcript,
        '',
        recentOwn.length ? 'Your recent own lines are forbidden as wording and as unchanged social moves:' : '',
        ...recentOwn,
        '',
        'Context-first job selection:',
        '- Do not choose a new job just to be different. Keep the current core pressure unless another speaker was explicitly addressed.',
        '- If the user or another character asked for a decision, give a decision or a conditional recommendation. Do not ask another broad preference question.',
        '- If the last line asks you a direct question, answer it first.',
        '- If the last line clearly asks another named person, do not hijack; hand off briefly.',
        '- If your previous line was too harsh, you may soften it, but keep the practical need visible.',
        '- If the scene is a deliberate chant, quote, fixed answer, or playful echo, a concise intentional repeat is allowed.',
        ...contract.guidance.map((item) => `- Situation signal: ${item}`),
        '- The reply should change exactly what needs changing: fact, stance, boundary, answer, handoff, or emotional temperature. Leave the rest alone.',
        '',
        `Now write ${input.speakerName}'s next visible reply. Return JSON only. Do not explain.`,
      ].filter((line) => line !== '').join('\n'),
    },
  ];
}

function transcriptWithFocusedSituationalJobContractV2(input) {
  const contract = deriveSituationalJobContract(input);
  const userPressure = latestUserPressure(input);
  const recentOwn = input.previousMessages
    .filter((message) => message.senderId === input.speakerId)
    .slice(-3)
    .map((message) => `- ${message.content.replace(/\s+/g, ' ').slice(0, 220)}`);
  const transcript = input.previousMessages
    .map((message) => `${message.senderId === input.speakerId ? `${input.speakerName}（自己曾经说过）` : label(message)}: ${message.content}`)
    .join('\n');
  const explicitRules = [];
  if (userPressure.asksDecision) {
    explicitRules.push('Latest user pressure is decision/recommendation. Pick one recommendation or give one conditional decision. Do not return a broad option list or another preference question.');
  }
  if (userPressure.namedSomeone && !userPressure.namesCurrent) {
    explicitRules.push('Latest user pressure names someone else. If this speaker is not that person, hand off in one short sentence and do not add your own plan, framework, or opinion.');
  }
  if (input.allowsIntentionalRepeat) {
    explicitRules.push('This is an intentional repeat/chant/quote scenario. A short exact repeat is valid and often best; do not inflate it to avoid similarity.');
  }
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: [
        'Conversation transcript for context only.',
        'Every line below is room evidence, not text to imitate.',
        transcript,
        '',
        recentOwn.length ? 'Your recent own lines are forbidden as wording and as unchanged social moves:' : '',
        ...recentOwn,
        '',
        'Highest-priority context rules:',
        ...explicitRules.map((item) => `- ${item}`),
        explicitRules.length ? '- These rules override generic anti-repeat variety.' : '- No explicit user override detected; choose the natural next conversational job.',
        '',
        'Context-first job selection:',
        '- Preserve the current unresolved need. Do not switch to a fresh logistical action merely to be different.',
        '- If answering is needed, answer first; optional detail comes after the answer.',
        '- If pressure has become harsh, soften the temperature while keeping the practical ask visible.',
        '- If a handoff is needed, keep it short and clean; do not attach your own stance.',
        '- If repetition is deliberate social behavior, keep it short and socially legible.',
        ...contract.guidance.map((item) => `- Situation signal: ${item}`),
        '- Good reply test: the room can tell what changed, and the reply still solves the latest user/room pressure.',
        '',
        `Now write ${input.speakerName}'s next visible reply. Return JSON only. Do not explain.`,
      ].filter((line) => line !== '').join('\n'),
    },
  ];
}

function recentRoomLengthProfile(input) {
  const aiLengths = input.previousMessages
    .filter((message) => message.type === 'ai')
    .slice(-6)
    .map((message) => visibleCharLength(message.content))
    .filter((length) => length > 0);
  const average = aiLengths.length ? aiLengths.reduce((sum, item) => sum + item, 0) / aiLengths.length : 0;
  const longCount = aiLengths.filter((length) => length >= 120).length;
  return {
    aiLengths,
    average: Number(average.toFixed(1)),
    longRunRisk: aiLengths.length >= 3 && longCount >= Math.ceil(aiLengths.length * 0.5),
  };
}

function transcriptWithCleanPromptV2(input) {
  const userPressure = latestUserPressure(input);
  const contract = deriveSituationalJobContract(input);
  const lengthProfile = recentRoomLengthProfile(input);
  const transcript = input.previousMessages
    .map((message) => `${label(message)}: ${message.content}`)
    .join('\n');
  const directSignals = [
    input.previousSpeakerSame ? '- Same speaker just spoke. Continue only if the room has actually moved; otherwise keep it brief or hand off.' : '',
    userPressure.asksDecision ? '- User asked for a choice/recommendation. Give one recommendation or one conditional decision; do not bounce back a broad preference question.' : '',
    userPressure.namedSomeone && !userPressure.namesCurrent ? '- User named someone else. If you are not that person, hand off in one short sentence and do not add your own view.' : '',
    input.allowsIntentionalRepeat ? '- This is a chant/quote/fixed-answer moment. A short deliberate repeat is valid.' : '',
    lengthProfile.longRunRisk ? `- Recent room replies are getting long (${lengthProfile.aiLengths.join(' / ')} chars). Natural chat can cool back down with a short concrete line; do not write a speech just because the room got heated.` : '',
  ].filter(Boolean);
  return [
    {
      role: 'system',
      content: [
        `You are ${input.speakerName} in a Sense Murmur multi-character group chat.`,
        'Write one visible live-chat turn as this character only.',
        '',
        'Priority order:',
        '1. Latest user or room pressure.',
        '2. Character voice and relationships.',
        '3. Natural chat surface.',
        '4. JSON protocol.',
        '',
        'Natural chat surface:',
        '- This is chat, not an essay, speech, report, or script page.',
        '- Reply to one live point. Do not recap the whole debate or make a personal manifesto.',
        '- Heat can make replies sharper or slightly longer, but it should not force every next speaker to write longer.',
        '- Physical actions are usually omitted in ordinary group chat. If one is truly needed, use at most one brief beat; never action + speech + action + speech.',
        '- Do not solve repetition by adding backstory, extra examples, or decorative actions.',
        '- Return JSON only: {"content":"visible reply"}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Recent transcript for context:',
        transcript,
        '',
        directSignals.length ? 'Current turn signals:' : '',
        ...directSignals,
        ...contract.guidance.map((item) => `- Situation signal: ${item}`),
        '',
        'Now write the next visible reply. Keep the room moving naturally.',
      ].filter((line) => line !== '').join('\n'),
    },
  ];
}

function naturalChatSurfaceContractForLab(input) {
  const lengthProfile = recentRoomLengthProfile(input);
  const lengthLine = lengthProfile.longRunRisk
    ? `\n- Recent room replies are getting long (${lengthProfile.aiLengths.join(' / ')} chars). It is natural for the next turn to cool back down with one concrete line.`
    : '';
  return [
    'Natural chat surface contract:',
    '- This contract controls surface shape only. It must not override a focused job, handoff, direct answer, or decision/recommendation required above.',
    '- This is live chat, not an essay, speech, report, script page, or narrator prose.',
    '- Reply to one live point instead of recapping the whole debate or making a personal manifesto.',
    `- Heat may make a reply sharper or slightly longer, but it should not force every next speaker to write longer.${lengthLine}`,
    '- Physical actions are usually omitted in ordinary group chat. If one truly changes meaning or social temperature, use at most one brief beat.',
    '- Never use an action + speech + action + speech wrapper. Do not solve repetition by adding backstory, extra examples, or decorative actions.',
  ].join('\n');
}

function transcriptWithFocusedPlusNaturalSurface(input) {
  const projected = transcriptWithFocusedSituationalJobContract(input);
  const userMessage = projected.at(-1);
  if (!userMessage || userMessage.role !== 'user') return projected;
  return [
    projected[0],
    {
      role: 'user',
      content: [
        userMessage.content,
        '',
        naturalChatSurfaceContractForLab(input),
      ].join('\n'),
    },
  ];
}

async function judgeBatch(caseResult) {
  const variantScores = {};
  const shared = {
    id: caseResult.id,
    categories: caseResult.categories,
    scenarioName: caseResult.scenarioName,
    speakerName: caseResult.speakerName,
    samePreviousSpeaker: caseResult.previousSpeakerSame,
    originalContent: caseResult.originalContent,
    originalIssues: caseResult.originalIssues,
    expectedBehavior: caseResult.expectedBehavior || '',
    allowsIntentionalRepeat: Boolean(caseResult.allowsIntentionalRepeat),
    recentTranscript: caseResult.previousMessages.slice(-6).map((message) => `${message.senderName}: ${message.content}`),
  };
  for (const [variantName, trials] of Object.entries(caseResult.variants)) {
      const compactTrials = trials.slice(0, 5).map((trial, index) => ({
      index,
      reply: trial.reply,
      metrics: {
        own: Math.max(trial.metrics.ownBigram, trial.metrics.ownLcs),
        original: Math.max(trial.metrics.originalBigram, trial.metrics.originalLcs),
        maxRecent: Math.max(trial.metrics.maxRecent?.bigram || 0, trial.metrics.maxRecent?.lcs || 0),
        hardDuplicate: trial.metrics.hardDuplicate,
        semanticLoopRisk: trial.metrics.semanticLoopRisk,
        visibleLength: trial.metrics.visibleLength,
        action: trial.metrics.action,
      },
    }));
    const raw = await callModel([
      {
        role: 'system',
        content: [
          '你是 Sense Murmur 群聊提示词实验评审。',
          '只输出一个 JSON 对象。不要 Markdown。不要写推理过程。',
          'JSON schema: {"score":0-100,"duplicateControl":0-100,"naturalness":0-100,"contextFit":0-100,"jobChoice":0-100,"risks":["..."],"bestReplyIndex":0,"notes":"..."}',
          '评估重点：避免复读和同义原地打转；conversational job 是否按上下文自然选择，而不是固定补事实/给动作/软化压力；是否仍像角色本人；是否接住当前房间压力；是否没有为了不同而跑题或凭空编事实。',
          '如果 expectedBehavior 存在，它是测试验收标准；但仍要综合判断自然度和角色一致性。',
          '如果 allowsIntentionalRepeat=true，允许有社交目的的短重复；此时不要因为短促跟风、口令、引用本身扣分。',
          '如果回复机械、过度补事实、过度设 deadline、把该交给别人回答的问题继续抢答、或用户要决策时继续追问，要明确扣分。',
        ].join('\n'),
      },
      { role: 'user', content: JSON.stringify({ ...shared, variantName, trials: compactTrials }, null, 2) },
    ], { temperature: 0.1, maxTokens: 3600 });
    const parsed = extractJsonObject(raw.content);
    variantScores[variantName] = parsed || { parseError: raw.content.slice(0, 1000) };
  }
  const scored = Object.entries(variantScores)
    .filter(([, review]) => Number.isFinite(review.score))
    .sort((a, b) => b[1].score - a[1].score);
  return {
    variantScores,
    winner: scored[0]?.[0] || '',
    notes: scored.length ? `Winner selected by highest per-variant judge score: ${scored[0][1].score}` : 'No parseable variant judge score.',
  };
}

const variants = [
  ['old_assistant_projection', oldAssistantProjection],
  ['all_named_transcript_projection', allNamedTranscriptProjection],
  ['own_lines_quarantined_projection', transcriptWithOwnLinesQuarantined],
  ['continuation_contract_projection', transcriptWithContinuationContract],
  ['adaptive_continuation_contract_projection', transcriptWithAdaptiveContinuationContract],
  ['situational_job_contract_projection', transcriptWithSituationalJobContract],
  ['focused_situational_job_contract_projection', transcriptWithFocusedSituationalJobContract],
  ['focused_situational_job_contract_v2_projection', transcriptWithFocusedSituationalJobContractV2],
  ['focused_plus_natural_surface_projection', transcriptWithFocusedPlusNaturalSurface],
  ['clean_prompt_v2_projection', transcriptWithCleanPromptV2],
].filter(([variantName]) => !SELECTED_VARIANTS.size || SELECTED_VARIANTS.has(variantName));

if (!variants.length) {
  console.error(`No variants selected. REPETITION_LAB_VARIANTS=${[...SELECTED_VARIANTS].join(',')}`);
  process.exit(2);
}

const data = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
const result = { generatedAt: new Date().toISOString(), model: MODEL, reportPath: REPORT_PATH, trials: TRIALS, cases: [] };

for (const input of reportCases(data)) {
  const caseResult = { ...input, variants: {} };
  for (const [variantName, buildMessages] of variants) {
    const trials = [];
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const response = await callModel(buildMessages(input));
      const reply = parseContent(response.content);
      const metrics = collectMetrics(reply, input);
      trials.push({ trial, reply, metrics, usage: response.usage });
      console.error(`[projection-lab-v2] ${input.id} ${variantName} trial ${trial}: hard=${metrics.hardDuplicate} loop=${metrics.semanticLoopRisk} own=${Math.max(metrics.ownBigram, metrics.ownLcs).toFixed(3)}`);
    }
    caseResult.variants[variantName] = trials;
  }
  if (RUN_BATCH_JUDGE) {
    console.error(`[projection-lab-v2] batch judge ${input.id}`);
    caseResult.batchReview = await judgeBatch(caseResult);
  }
  result.cases.push(caseResult);
}

function avg(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  return nums.length ? Number((nums.reduce((sum, item) => sum + item, 0) / nums.length).toFixed(3)) : null;
}

function summarizeTrials(trials) {
  return {
    hardDuplicates: trials.filter((trial) => trial.metrics.hardDuplicate).length,
    semanticLoopRisk: trials.filter((trial) => trial.metrics.semanticLoopRisk).length,
    exact: trials.filter((trial) => trial.metrics.exact).length,
    longReplies: trials.filter((trial) => trial.metrics.visibleLength >= 120).length,
    actionRisk: trials.filter((trial) => trial.metrics.action.multiActionRisk).length,
    avgLength: avg(trials.map((trial) => trial.metrics.visibleLength)),
    avgOwn: avg(trials.map((trial) => Math.max(trial.metrics.ownBigram, trial.metrics.ownLcs))),
    avgOriginal: avg(trials.map((trial) => Math.max(trial.metrics.originalBigram, trial.metrics.originalLcs))),
    avgMaxRecent: avg(trials.map((trial) => Math.max(trial.metrics.maxRecent?.bigram || 0, trial.metrics.maxRecent?.lcs || 0))),
  };
}

function markdown() {
  const lines = [
    '# Repetition Projection Lab V2',
    '',
    `- Model: ${MODEL}`,
    `- Report: ${basename(REPORT_PATH)}`,
    `- Cases: ${result.cases.length}`,
    `- Trials per variant: ${TRIALS}`,
    `- Synthetic cases: ${INCLUDE_SYNTHETIC_CASES ? 'included' : 'excluded'}`,
    `- Variants: ${variants.map(([name]) => name).join(', ')}`,
    '',
    '## Category Summary',
    '',
    '| Category | Cases | Best Avg Own Sim Variant | Lowest Hard Dup Variant |',
    '|---|---:|---|---|',
    ...categorySummaryLines(),
    '',
    '| Case | Scenario | Same Prev | Intentional Repeat | Original Hard | Variant | Hard Dup | Loop Risk | Long | Action Risk | Avg Len | Avg Own Sim | Avg Original Sim | Avg Max Recent | Judge |',
    '|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const item of result.cases) {
    for (const [variantName, trials] of Object.entries(item.variants)) {
      const summary = summarizeTrials(trials);
      const judgeScore = item.batchReview?.variantScores?.[variantName]?.score;
      lines.push(`| ${item.id} | ${item.scenarioName} | ${item.previousSpeakerSame ? 'yes' : 'no'} | ${item.allowsIntentionalRepeat ? 'yes' : 'no'} | ${item.originalMetrics.hardDuplicate ? 'yes' : 'no'} | ${variantName} | ${summary.hardDuplicates}/${trials.length} | ${summary.semanticLoopRisk}/${trials.length} | ${summary.longReplies}/${trials.length} | ${summary.actionRisk}/${trials.length} | ${summary.avgLength ?? '-'} | ${summary.avgOwn ?? '-'} | ${summary.avgOriginal ?? '-'} | ${summary.avgMaxRecent ?? '-'} | ${typeof judgeScore === 'number' ? judgeScore : '-'} |`);
    }
  }
  lines.push('', '## Samples', '');
  for (const item of result.cases) {
    lines.push(`### ${item.id}`, '');
    lines.push(`Original score: ${item.originalScore ?? '-'}; same previous speaker: ${item.previousSpeakerSame}; original hard duplicate: ${item.originalMetrics.hardDuplicate}`);
    lines.push(`Categories: ${item.categories.join(', ')}`);
    if (item.expectedBehavior) lines.push(`Expected behavior: ${item.expectedBehavior}`);
    lines.push(`Original: ${item.originalContent.replace(/\n/g, ' / ').slice(0, 260)}`);
    if (item.originalIssues.length) lines.push(`Original issues: ${item.originalIssues.join('；').slice(0, 260)}`);
    if (item.batchReview) {
      lines.push(`Batch judge winner: ${item.batchReview.winner || '-'}`);
      if (item.batchReview.notes) lines.push(`Batch judge notes: ${String(item.batchReview.notes).slice(0, 500)}`);
    }
    lines.push('');
    for (const [variantName, trials] of Object.entries(item.variants)) {
      lines.push(`#### ${variantName}`);
      const sorted = [...trials].sort((a, b) => Math.max(b.metrics.ownBigram, b.metrics.ownLcs, b.metrics.originalBigram, b.metrics.originalLcs) - Math.max(a.metrics.ownBigram, a.metrics.ownLcs, a.metrics.originalBigram, a.metrics.originalLcs));
      for (const trial of sorted.slice(0, 3)) {
        lines.push(`- ${trial.trial}: hard=${trial.metrics.hardDuplicate} loop=${trial.metrics.semanticLoopRisk} len=${trial.metrics.visibleLength} actionRisk=${trial.metrics.action.multiActionRisk} own=${Math.max(trial.metrics.ownBigram, trial.metrics.ownLcs)} original=${Math.max(trial.metrics.originalBigram, trial.metrics.originalLcs)} maxRecent=${Math.max(trial.metrics.maxRecent?.bigram || 0, trial.metrics.maxRecent?.lcs || 0)}`);
        lines.push(`  - ${trial.reply.replace(/\n/g, ' / ').slice(0, 260)}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function categorySummaryLines() {
  const categories = [...new Set(result.cases.flatMap((item) => item.categories))].sort();
  return categories.map((category) => {
    const cases = result.cases.filter((item) => item.categories.includes(category));
    const variantSummaries = variants.map(([variantName]) => {
      const trials = cases.flatMap((item) => item.variants[variantName] || []);
      const own = avg(trials.map((trial) => Math.max(trial.metrics.ownBigram, trial.metrics.ownLcs))) ?? 999;
      const hard = trials.filter((trial) => trial.metrics.hardDuplicate).length;
      return { variantName, own, hard, total: trials.length };
    }).filter((item) => item.total);
    const bestOwn = [...variantSummaries].sort((a, b) => a.own - b.own)[0]?.variantName || '-';
    const bestHard = [...variantSummaries].sort((a, b) => a.hard - b.hard || a.own - b.own)[0]?.variantName || '-';
    return `| ${category} | ${cases.length} | ${bestOwn} | ${bestHard} |`;
  });
}

await mkdir(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonPath = resolve(OUT_DIR, `repetition-projection-lab-v2-${stamp}.json`);
const mdPath = resolve(OUT_DIR, `repetition-projection-lab-v2-${stamp}.md`);
await writeFile(jsonPath, JSON.stringify(result, null, 2));
await writeFile(mdPath, markdown());
console.log(jsonPath);
console.log(mdPath);
