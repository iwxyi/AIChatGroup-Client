const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const HELP = `
AI real-model acceptance.

This script calls real LLM APIs and may consume balance. It is never run by normal build/test.
Pass --run to confirm the real request.

Required environment:
  PNEUMATA_TEST_LLM_API_KEY       Shared API key for acceptance tests.
  PNEUMATA_TEST_LLM_MODEL         Single model name, or use PNEUMATA_TEST_LLM_MODELS.

Optional environment:
  PNEUMATA_TEST_LLM_MODELS        Comma-separated model names. Overrides PNEUMATA_TEST_LLM_MODEL.
  PNEUMATA_TEST_LLM_BASE_URL      OpenAI-compatible base URL. Defaults to ${DEFAULT_BASE_URL}
  PNEUMATA_TEST_LLM_TIMEOUT_MS    Request timeout. Defaults to 45000
  PNEUMATA_TEST_LLM_CASES         Comma-separated cases:
                                  basic,json,activity,story,storylong,role,group,chat,generation,agent,ops,artifact,artifactflow,e2e,e2e_direct,quality
                                  Defaults to basic,json,activity,story,quality.
  PNEUMATA_TEST_LLM_JUDGE_MODEL   Optional evaluator model. Defaults to the tested model.
  PNEUMATA_TEST_LLM_JUDGE_API_KEY Optional evaluator API key. Defaults to the tested key.
  PNEUMATA_TEST_LLM_JUDGE_BASE_URL Optional evaluator base URL. Defaults to tested base URL.
  PNEUMATA_TEST_LLM_MIN_SCORE     Minimum model-judge score. Defaults to 75.

Examples:
  PNEUMATA_TEST_LLM_API_KEY=... PNEUMATA_TEST_LLM_MODELS=deepseek-chat,gpt-5.4 \\
    npm run test:ai-llm-acceptance --workspace=Pneumata-Client -- --run

  PNEUMATA_TEST_LLM_CASES=activity,role,group,generation,ops,e2e PNEUMATA_TEST_LLM_JUDGE_MODEL=gpt-5.4 \\
    npm run test:ai-llm-acceptance --workspace=Pneumata-Client -- --run
`.trim();

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

if (!process.argv.includes('--run')) {
  console.error('Refusing to call real LLM without --run.');
  console.error(HELP);
  process.exit(2);
}

const config = {
  apiKey: process.env.PNEUMATA_TEST_LLM_API_KEY || '',
  models: parseList(process.env.PNEUMATA_TEST_LLM_MODELS || process.env.PNEUMATA_TEST_LLM_MODEL || ''),
  baseUrl: process.env.PNEUMATA_TEST_LLM_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs: parseTimeoutMs(process.env.PNEUMATA_TEST_LLM_TIMEOUT_MS),
  cases: parseCases(process.env.PNEUMATA_TEST_LLM_CASES),
  judgeModel: process.env.PNEUMATA_TEST_LLM_JUDGE_MODEL || '',
  judgeApiKey: process.env.PNEUMATA_TEST_LLM_JUDGE_API_KEY || process.env.PNEUMATA_TEST_LLM_API_KEY || '',
  judgeBaseUrl: process.env.PNEUMATA_TEST_LLM_JUDGE_BASE_URL || process.env.PNEUMATA_TEST_LLM_BASE_URL || DEFAULT_BASE_URL,
  minScore: parseMinScore(process.env.PNEUMATA_TEST_LLM_MIN_SCORE),
};

if (!config.apiKey || !config.models.length) {
  console.error('Missing PNEUMATA_TEST_LLM_API_KEY or PNEUMATA_TEST_LLM_MODEL/PNEUMATA_TEST_LLM_MODELS.');
  console.error(HELP);
  process.exit(2);
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCases(value) {
  const requested = new Set(parseList(value || 'basic,json,activity,story,quality'));
  const valid = ['basic', 'json', 'activity', 'story', 'storylong', 'role', 'group', 'chat', 'generation', 'agent', 'ops', 'artifact', 'artifactflow', 'e2e', 'e2e_direct', 'quality'];
  return valid.filter((item) => requested.has(item));
}

function parseTimeoutMs(value) {
  const parsed = Number(value || 45000);
  return Number.isFinite(parsed) ? Math.max(5000, parsed) : 45000;
}

function parseMinScore(value) {
  const parsed = Number(value || 75);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 75;
}

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, '');
}

function chatUrl(baseUrl) {
  const normalized = trimTrailingSlashes(baseUrl);
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function clip(text, max = 500) {
  return normalizeWhitespace(text).slice(0, max).trim();
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error(`Model did not return JSON: ${raw.slice(0, 500)}`);
  }
}

function parseJsonArray(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw;
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to bracket extraction.
  }
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed;
  }
  throw new Error(`Model did not return JSON array: ${raw.slice(0, 500)}`);
}

function assertCondition(condition, message, detail) {
  if (!condition) {
    const suffix = detail ? `\n${JSON.stringify(detail, null, 2)}` : '';
    throw new Error(`${message}${suffix}`);
  }
}

function summarizeUsage(results) {
  const total = {};
  for (const item of results) collectUsageDeep(total, item);
  return total;
}

function collectUsageDeep(total, value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  collectUsage(total, value.usage);
  for (const child of Object.values(value)) collectUsageDeep(total, child, seen);
}

function collectUsage(total, usage) {
  if (!usage || typeof usage !== 'object') return;
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === 'number' && Number.isFinite(value)) total[key] = (total[key] || 0) + value;
  }
}

async function callOpenAICompatible({ model, messages, options = {}, apiKey = config.apiKey, baseUrl = config.baseUrl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const body = {
      model,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 500,
      messages,
    };
    if (options.json) body.response_format = { type: 'json_object' };
    const response = await fetch(chatUrl(baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`LLM request failed: ${response.status} ${text.slice(0, 1000)}`);
    const payload = JSON.parse(text);
    return {
      raw: payload,
      content: String(payload.choices?.[0]?.message?.content || ''),
      usage: payload.usage || null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`LLM request timed out after ${config.timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callChat(model, messages, options = {}) {
  return callOpenAICompatible({ model, messages, options });
}

function resolveJudgeModel(model) {
  return config.judgeModel || model;
}

async function callJudge(model, rubric, sample) {
  const judgeModel = resolveJudgeModel(model);
  const messages = [
    {
      role: 'system',
      content: [
        '你是 Sense Murmur 的严格 AI 质量评审器。只输出 JSON，不要 Markdown。',
        'JSON schema: {"score":0-100,"pass":true,"strengths":["..."],"issues":["..."],"optimizations":["..."],"critical":false}',
        'score 必须综合角色身份、人格、关系承接、场景推进、协议可用性和用户体验。发现严重违背角色/协议/安全边界时 critical=true。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '评审标准：',
        rubric,
        '',
        '被评审样本：',
        JSON.stringify(sample, null, 2),
      ].join('\n'),
    },
  ];
  const response = await callJsonWithRetry({
    model: judgeModel,
    messages,
    apiKey: config.judgeApiKey,
    baseUrl: config.judgeBaseUrl,
    options: { json: true, maxTokens: 700, temperature: 0 },
    retryLabel: 'judge',
  });
  const parsed = response.parsed;
  const score = Number(parsed.score);
  assertCondition(Number.isFinite(score) && score >= 0 && score <= 100, 'judge did not return a valid score', parsed);
  const normalized = {
    score,
    pass: parsed.pass !== false && score >= config.minScore && parsed.critical !== true,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map((item) => clip(item, 160)).filter(Boolean).slice(0, 6) : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues.map((item) => clip(item, 180)).filter(Boolean).slice(0, 8) : [],
    optimizations: Array.isArray(parsed.optimizations) ? parsed.optimizations.map((item) => clip(item, 220)).filter(Boolean).slice(0, 8) : [],
    critical: parsed.critical === true,
    judgeModel,
    usage: response.usage,
    protocolRetries: response.protocolRetries,
    firstInvalidJson: response.firstInvalidJson,
  };
  assertCondition(normalized.pass, 'judge rejected generated sample', normalized);
  return normalized;
}

async function generateJson(model, system, user, options = {}) {
  const response = await callJsonWithRetry({
    model,
    messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
    ],
    options: { json: true, maxTokens: options.maxTokens ?? 700, temperature: options.temperature ?? 0.2 },
    retryLabel: 'generation',
  });
  return {
    parsed: response.parsed,
    usage: response.usage,
    protocolRetries: response.protocolRetries,
    firstInvalidJson: response.firstInvalidJson,
  };
}

async function generateJsonArray(model, system, user, options = {}) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  let firstInvalidJson = null;
  let lastResponse = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callOpenAICompatible({
      model,
      messages,
      options: {
        json: false,
        maxTokens: attempt === 0 ? (options.maxTokens ?? 1800) : Math.min(3200, Math.max((options.maxTokens ?? 1800) * 2, 2400)),
        temperature: options.temperature ?? 0.25,
      },
    });
    lastResponse = response;
    try {
      return {
        parsed: parseJsonArray(response.content),
        usage: response.usage,
        protocolRetries: attempt,
        firstInvalidJson,
      };
    } catch (error) {
      if (!firstInvalidJson) {
        firstInvalidJson = {
          label: options.retryLabel || 'json_array',
          error: String(error?.message || error),
          content: clip(response.content, 800),
        };
      }
      if (attempt === 1) break;
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: '上一条不是合法 JSON 数组。请只返回一个 JSON array，不要 Markdown，不要解释，不要额外文字。',
      });
    }
  }
  throw new Error(`Model returned invalid JSON array after retry: ${JSON.stringify({
    firstInvalidJson,
    lastContent: clip(lastResponse?.content || '', 800),
  }, null, 2)}`);
}

async function callJsonWithRetry(params) {
  const messages = [...params.messages];
  let firstInvalidJson = null;
  let lastResponse = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryOptions = attempt === 0
      ? params.options
      : {
        ...params.options,
        maxTokens: Math.min(2400, Math.max((params.options?.maxTokens || 700) * 2, 1200)),
      };
    const response = await callOpenAICompatible({
      model: params.model,
      messages,
      options: retryOptions,
      apiKey: params.apiKey || config.apiKey,
      baseUrl: params.baseUrl || config.baseUrl,
    });
    lastResponse = response;
    try {
      return {
        ...response,
        parsed: parseJsonObject(response.content),
        protocolRetries: attempt,
        firstInvalidJson,
      };
    } catch (error) {
      if (!firstInvalidJson) {
        firstInvalidJson = {
          label: params.retryLabel || 'json',
          error: String(error?.message || error),
          content: clip(response.content, 800),
        };
      }
      if (attempt === 1) break;
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [
          '上一条不是合法 JSON，无法解析。',
          '请只返回一个符合 schema 的 JSON 对象，不要 Markdown，不要注释，不要多余文字。',
        ].join('\n'),
      });
    }
  }
  throw new Error(`Model returned invalid JSON after retry: ${JSON.stringify({
    firstInvalidJson,
    lastContent: clip(lastResponse?.content || '', 800),
  }, null, 2)}`);
}

async function runBasicCase(model) {
  const marker = `sense-${Math.random().toString(36).slice(2, 8)}`;
  const response = await callChat(model, [
    { role: 'system', content: 'You are a strict connection test. Reply with exactly the requested marker and nothing else.' },
    { role: 'user', content: `Reply exactly: ${marker}` },
  ], { maxTokens: 256 });
  const content = clip(response.content, 80);
  assertCondition(content === marker, 'basic chat response did not match marker', { expected: marker, actual: content });
  return { ok: true, sample: content, usage: response.usage };
}

async function runJsonCase(model) {
  const response = await callJsonWithRetry({
    model,
    messages: [
      { role: 'system', content: '只输出 JSON，不要 Markdown。JSON schema: {"ok":true,"items":[{"name":"...","score":0-1}]}.' },
      { role: 'user', content: '返回两个中文候选项，score 必须是 0 到 1 的数字。' },
    ],
    options: { json: true, maxTokens: 220, temperature: 0 },
    retryLabel: 'json_case',
  });
  const parsed = response.parsed;
  assertCondition(parsed.ok === true, 'json case missing ok=true', parsed);
  assertCondition(Array.isArray(parsed.items) && parsed.items.length === 2, 'json case did not return two items', parsed);
  parsed.items.forEach((item, index) => {
    assertCondition(item && typeof item.name === 'string' && item.name.trim(), `json item ${index} missing name`, parsed);
    assertCondition(typeof item.score === 'number' && item.score >= 0 && item.score <= 1, `json item ${index} score invalid`, parsed);
  });
  return {
    ok: true,
    itemNames: parsed.items.map((item) => item.name),
    usage: response.usage,
    protocolRetries: response.protocolRetries,
    firstInvalidJson: response.firstInvalidJson,
  };
}

const ACTIVITY_FLOWS = [
  {
    name: 'tea_outing_full_lifecycle',
    dedupeKey: 'outing-tea-flow',
    requiredFinal: { b: 'going', d: 'going' },
    requiredFinalAny: { a: ['interested', 'going'], c: ['declined', 'withdrawn'] },
    turns: [
      { speakerId: 'a', speakerName: '甲', utterance: '周五晚上八点去后巷蓝布门帘茶馆吧，我想约大家一起喝茶。', expectAny: { a: ['interested', 'going'] }, expectedTargets: ['b', 'c', 'd'], timeHint: '周五晚上八点', locationHint: '后巷蓝布门帘茶馆' },
      { speakerId: 'b', speakerName: '乙', utterance: '可以，我确认去。', expect: { b: 'going' } },
      { speakerId: 'c', speakerName: '丙', utterance: '我九点才能到，能不能改成周五晚上九点？', expectAny: { c: ['maybe', 'interested', 'going'] }, timeHint: '周五晚上九点' },
      { speakerId: 'a', speakerName: '甲', utterance: '那就九点，地点也换到河边二楼包间。', timeHint: '周五晚上九点', locationHint: '河边二楼包间' },
      { speakerId: 'b', speakerName: '乙', utterance: '我临时有事，这次先不去了。', expectAny: { b: ['declined', 'withdrawn'] } },
      { speakerId: 'c', speakerName: '丙', utterance: '我也不去了，你们玩。', expectAny: { c: ['declined', 'withdrawn'] } },
      { speakerId: 'd', speakerName: '丁', utterance: '我可以去，给我留个位置。', expect: { d: 'going' } },
      { speakerId: 'b', speakerName: '乙', utterance: '事情改期了，我又能去了。', expect: { b: 'going' } },
    ],
  },
  {
    name: 'movie_invite_then_cancel',
    dedupeKey: 'outing-movie-flow',
    requiredFinal: { a: 'going', c: 'going' },
    requiredFinalAny: { b: ['withdrawn', 'declined'] },
    turns: [
      { speakerId: 'b', speakerName: '乙', utterance: '甲、丙，明天下午三点一起去万象城看电影吧，我订三张票。', expectAny: { b: ['interested', 'going'] }, expectedTargets: ['a', 'c'], timeHint: '明天下午三点', locationHint: '万象城' },
      { speakerId: 'a', speakerName: '甲', utterance: '行，我去，电影票我转你。', expect: { a: 'going' } },
      { speakerId: 'c', speakerName: '丙', utterance: '我也去，不过散场后我得先走。', expect: { c: 'going' } },
      { speakerId: 'b', speakerName: '乙', utterance: '我发烧了不去了，你们俩去吧。', expectAny: { b: ['withdrawn', 'declined'] } },
    ],
  },
];

const ACTIVITY_BOUNDARIES = [
  {
    name: 'vague_future_should_not_create_high_confidence_activity',
    utterance: '改天有空大家再约吧，最近先各忙各的。',
    expected: 'none_or_low_confidence',
  },
  {
    name: 'single_person_note_should_not_create_initial_activity',
    utterance: '我自己今晚去楼下买杯咖啡，顺便散散步。',
    expected: 'none_or_low_confidence',
  },
  {
    name: 'clear_group_invite_should_create_activity',
    utterance: '周六上午十点大家一起去植物园，我已经买好四张票了。',
    expected: 'social_outing',
  },
  {
    name: 'past_activity_recap_should_not_create_new_activity',
    utterance: '昨天我们去植物园那次挺开心的，尤其是门口那张合照。',
    expected: 'none_or_low_confidence',
  },
  {
    name: 'conditional_activity_should_stay_low_confidence',
    utterance: '如果以后大家都不忙，也许可以找个周末去海边。',
    expected: 'none_or_low_confidence',
  },
  {
    name: 'birthday_wish_should_not_create_activity',
    utterance: '祝你生日快乐，今天别太累，记得好好吃饭。',
    expected: 'none_or_low_confidence',
  },
];

function activitySystemPrompt(flow) {
  return [
    '你是 Sense Murmur 群聊运行时的结构化输出器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"content":"可见回复","socialEventHints":[{"eventKind":"social_outing","participantIds":["member-id"],"targetIds":["member-id"],"reasonType":"chat_activity_invite|chat_activity_followup","confidence":0-1,"urgency":"soon","seedIntent":"...","visibilityPlan":"public","expectedArtifacts":["outing_summary"],"title":"...","activityType":"...","timeHint":"... or null","locationHint":"... or null","dedupeKey":"...","participantStates":{"member-id":"mentioned|invited|interested|maybe|going|declined|withdrawn"}}]}',
    '有效成员：a=甲，b=乙，c=丙，d=丁。',
    `当前活动如果被创建或更新，必须使用 dedupeKey=${flow.dedupeKey}。`,
    '规则：如果发言在创建、确认、退出、重新加入或修改同一个活动，输出 exactly one social_outing。后续更新必须复用 dedupeKey。participantStates 只写本轮明确变化的成员即可。',
    '当发言人说“大家/你们/一起”等群体邀约时，targetIds 必须包含除发言人外的相关成员；发起邀约的人应标为 interested 或 going，不要只标 mentioned。',
    '当成员确认参加、退出、重新加入时，participantStates 必须写该成员的 going/declined/withdrawn 等明确状态。',
    '如果发言只是模糊寒暄、单人行动、没有明确活动或证据不足，则 socialEventHints 返回空数组，或给出 confidence<0.72。',
  ].join('\n');
}

async function runActivityFlow(model, flow) {
  const messages = [{ role: 'system', content: activitySystemPrompt(flow) }];
  const observedStates = {};
  const summaries = [];
  for (const [index, turn] of flow.turns.entries()) {
    messages.push({
      role: 'user',
      content: [
        `第 ${index + 1} 轮。说话人：${turn.speakerId}=${turn.speakerName}`,
        `可见发言：${turn.utterance}`,
        '请输出运行时 JSON。',
      ].join('\n'),
    });
    const response = await callJsonWithRetry({
      model,
      messages,
      options: { json: true, maxTokens: 1200, temperature: 0.2 },
      retryLabel: `activity_${flow.name}_turn_${index + 1}`,
    });
    const parsed = response.parsed;
    const hints = Array.isArray(parsed.socialEventHints) ? parsed.socialEventHints : [];
    const hint = hints.find((item) => item?.eventKind === 'social_outing');
    assertCondition(hint, `activity flow ${flow.name} turn ${index + 1} missing social_outing`, { parsed, turn });
    assertCondition(hint.dedupeKey === flow.dedupeKey, `activity flow ${flow.name} turn ${index + 1} did not keep dedupeKey`, { hint, turn });
    assertCondition(typeof hint.confidence === 'number' && hint.confidence >= 0.7, `activity flow ${flow.name} turn ${index + 1} confidence too low`, { hint, turn });
    assertCondition(hint.participantStates && typeof hint.participantStates === 'object', `activity flow ${flow.name} turn ${index + 1} missing participantStates`, { hint, turn });
    assertActivityTurnExpectations(flow, turn, index, hint);
    if (turn.expect) {
      for (const [id, expectedState] of Object.entries(turn.expect)) observedStates[id] = expectedState;
    }
    if (turn.expectAny) {
      for (const [id] of Object.entries(turn.expectAny)) observedStates[id] = hint.participantStates[id];
    }
    if (turn.timeHint) {
      assertCondition(roughlyContains(hint.timeHint, turn.timeHint), `activity flow ${flow.name} turn ${index + 1} missing expected time hint`, { expected: turn.timeHint, hint });
    }
    if (turn.locationHint) {
      assertCondition(roughlyContains(hint.locationHint, turn.locationHint), `activity flow ${flow.name} turn ${index + 1} missing expected location hint`, { expected: turn.locationHint, hint });
    }
    messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
    summaries.push({
      turn: index + 1,
      speakerId: turn.speakerId,
      states: hint.participantStates,
      usage: response.usage,
      protocolRetries: response.protocolRetries,
      firstInvalidJson: response.firstInvalidJson,
    });
  }
  for (const [id, expectedState] of Object.entries(flow.requiredFinal)) {
    assertCondition(observedStates[id] === expectedState, `activity flow ${flow.name} final state invalid for ${id}`, { expectedState, observedStates });
  }
  if (flow.requiredFinalAny) {
    for (const [id, allowedStates] of Object.entries(flow.requiredFinalAny)) {
      assertCondition(Array.isArray(allowedStates) && allowedStates.includes(observedStates[id]), `activity flow ${flow.name} final state invalid for ${id}`, {
        allowedStates,
        observedStates,
      });
    }
  }
  return { observedStates, turns: summaries };
}

function roughlyContains(actual, expected) {
  const left = normalizeWhitespace(actual || '');
  const right = normalizeWhitespace(expected || '');
  if (!right) return true;
  if (left.includes(right)) return true;
  const simplified = right.replace(/周五|周六|周日|明天|晚上|下午|上午|点|半/g, '');
  return Boolean(simplified && left.includes(simplified.slice(0, Math.min(4, simplified.length))));
}

function assertActivityTurnExpectations(flow, turn, index, hint) {
  const states = hint.participantStates || {};
  if (turn.expect) {
    for (const [id, expectedState] of Object.entries(turn.expect)) {
      assertCondition(states[id] === expectedState, `activity flow ${flow.name} turn ${index + 1} wrong state for ${id}`, {
        expectedState,
        actual: states[id],
        hint,
        turn,
      });
    }
  }
  if (turn.expectAny) {
    for (const [id, allowedStates] of Object.entries(turn.expectAny)) {
      assertCondition(Array.isArray(allowedStates) && allowedStates.includes(states[id]), `activity flow ${flow.name} turn ${index + 1} unexpected state for ${id}`, {
        allowedStates,
        actual: states[id],
        hint,
        turn,
      });
    }
  }
  if (Array.isArray(turn.expectedTargets)) {
    for (const targetId of turn.expectedTargets) {
      assertCondition(Array.isArray(hint.targetIds) && hint.targetIds.includes(targetId), `activity flow ${flow.name} turn ${index + 1} missing target ${targetId}`, {
        expectedTargets: turn.expectedTargets,
        targetIds: hint.targetIds,
        hint,
        turn,
      });
    }
  }
}

async function runActivityBoundary(model, boundary) {
  const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
    model,
    activitySystemPrompt({ dedupeKey: `boundary-${boundary.name}` }),
    [
      '单轮边界测试。',
      '说话人：a=甲',
      `可见发言：${boundary.utterance}`,
      '请输出运行时 JSON。',
    ].join('\n'),
    { maxTokens: 1200 },
  );
  const hints = Array.isArray(parsed.socialEventHints) ? parsed.socialEventHints : [];
  const outing = hints.find((item) => item?.eventKind === 'social_outing');
  if (boundary.expected === 'social_outing') {
    assertCondition(outing && Number(outing.confidence || 0) >= 0.72, `activity boundary ${boundary.name} should create high-confidence outing`, parsed);
  } else {
    assertCondition(!outing || Number(outing.confidence || 0) < 0.72, `activity boundary ${boundary.name} should not create accepted outing`, parsed);
  }
  return { parsed, usage, protocolRetries, firstInvalidJson };
}

async function runActivityCase(model) {
  const flows = {};
  for (const flow of ACTIVITY_FLOWS) flows[flow.name] = await runActivityFlow(model, flow);
  const boundaries = {};
  for (const boundary of ACTIVITY_BOUNDARIES) boundaries[boundary.name] = await runActivityBoundary(model, boundary);
  return { ok: true, flows, boundaries };
}

const STORY_TURNS = [
  {
    name: 'establish',
    requirement: '开场 establish。禁止 choice_point。必须有具体场景、可见压力和至少一条角色台词。',
    expectChoice: false,
  },
  {
    name: 'decision',
    requirement: '抉择 decision。必须先有旁白和至少一条角色台词，再输出 exactly one choice_point，包含 2-4 个具体选项。',
    expectChoice: true,
  },
  {
    name: 'consequence',
    requirement: '后果 consequence。用户选择了上一轮第一个选项。禁止 choice_point。必须兑现选择并给出具体代价、收益或新危险。',
    expectChoice: false,
  },
];

const STORY_LONG_TURNS = [
  {
    name: 'establish',
    requirement: '开场 establish。禁止 choice_point。必须有当前场景、压力来源和至少一条角色台词。',
    expectChoice: false,
  },
  {
    name: 'pressure',
    requirement: '加压 pressure。禁止 choice_point。必须让旧医院停电和名单线索变得更危险，但不要直接揭晓真相。',
    expectChoice: false,
  },
  {
    name: 'decision_1',
    requirement: '第一次抉择 decision。必须 exactly one choice_point，2-4 个具体选项，选项之间要有不同风险。',
    expectChoice: true,
    selectIndex: 1,
  },
  {
    name: 'consequence_1',
    requirement: '第一次后果 consequence。用户选择上一轮第二个选项。禁止 choice_point，必须兑现选择并产生新代价。',
    expectChoice: false,
  },
  {
    name: 'pressure_2',
    requirement: '第二次加压 pressure。禁止 choice_point。必须承接第一次后果，不要重启故事。',
    expectChoice: false,
  },
  {
    name: 'decision_2',
    requirement: '第二次抉择 decision。必须 exactly one choice_point，2-4 个具体选项，选项必须承接第一次后果。',
    expectChoice: true,
    selectIndex: 0,
  },
  {
    name: 'consequence_2',
    requirement: '第二次后果 consequence。用户选择上一轮第一个选项。禁止 choice_point，必须形成阶段性代价或收益。',
    expectChoice: false,
  },
];

function storySystemPrompt() {
  return [
    '你是 Sense Murmur 故事房叙事运行时的模型输出器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"storyEvents":[{"type":"narration","text":"..."},{"type":"speech","characterId":"lin|nurse","text":"..."},{"type":"choice_point","choices":[{"label":"...","prompt":"...","intent":"...","risk":"...","reward":"..."}]}]}',
    'storyEvents 是唯一可见正文。旁白写外部动作、场景变化、后果和压力；角色台词只写角色能说出口的话。',
    '不要复述上一轮原句，不要输出作者说明、剧情规划、系统解释或“下一步将会”。',
    '选项必须具体落到人物、地点、线索、威胁或目标，不要输出“追查线索”“推进剧情”“深入内心”等抽象按钮。',
  ].join('\n');
}

function storyUserPrompt(turn, transcript, selectedChoice) {
  return [
    '故事：雨夜旧医院。目标：查清旧医院停电和失踪名单的真相。',
    '角色：lin=林医生，nurse=护士。',
    '连续性资产：当前地点=旧医院走廊；线索=新鲜血迹、铜钥匙、被雨水洇开的名单；压力=护士隐瞒停电时档案室有人进入。',
    transcript.length ? `已发生正文：\n${transcript.slice(-3).map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '已发生正文：无',
    selectedChoice ? `用户刚才选择：${selectedChoice.label}。本轮必须把这个选择当作正史兑现。` : '',
    `要求：${turn.requirement}`,
  ].filter(Boolean).join('\n\n');
}

function normalizeStoryEvents(value) {
  return Array.isArray(value?.storyEvents) ? value.storyEvents : Array.isArray(value?.events) ? value.events : [];
}

function storyVisibleText(events) {
  return events
    .map((event) => {
      if (event?.type === 'narration') return event.text;
      if (event?.type === 'speech') return event.text;
      return '';
    })
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean)
    .join(' ');
}

function hasAuthorNote(text) {
  return /作者|旁白说明|系统|剧情规划|下一步将会|本轮|JSON|schema/i.test(String(text || ''));
}

function isAbstractChoice(choice) {
  const text = normalizeWhitespace(`${choice?.label || ''} ${choice?.prompt || ''}`);
  return /追查线索|推进剧情|深入内心|继续调查|面对真相|寻找答案/.test(text);
}

function storyChoiceAnchors(choice) {
  const text = normalizeWhitespace([
    choice?.label,
    choice?.prompt,
    choice?.intent,
    choice?.risk,
    choice?.reward,
  ].filter(Boolean).join(' '));
  const keywords = ['档案室', '护士', '名单', '铜钥匙', '钥匙', '人影', '停电', '血迹', '走廊', '楼梯', '医院', '真相', '询问', '追问', '逼问', '打开', '进入', '查看'];
  return keywords.filter((keyword) => text.includes(keyword)).slice(0, 8);
}

async function runStoryCase(model) {
  const messages = [{ role: 'system', content: storySystemPrompt() }];
  const transcript = [];
  const turns = {};
  let selectedChoice = null;
  for (const turn of STORY_TURNS) {
    messages.push({ role: 'user', content: storyUserPrompt(turn, transcript, selectedChoice) });
    const response = await callJsonWithRetry({
      model,
      messages,
      options: { json: true, maxTokens: 1400, temperature: 0.55 },
      retryLabel: `story_${turn.name}`,
    });
    const events = normalizeStoryEvents(response.parsed);
    const text = storyVisibleText(events);
    const choices = events.flatMap((event) => event?.type === 'choice_point' && Array.isArray(event.choices) ? event.choices : []);
    assertCondition(events.length > 0, `story turn ${turn.name} missing storyEvents`, response.parsed);
    assertCondition(text.length >= (turn.expectChoice ? 50 : 80), `story turn ${turn.name} visible text too short`, { text, events });
    assertCondition(events.some((event) => event?.type === 'speech' && event.characterId && event.text), `story turn ${turn.name} missing character speech`, events);
    assertCondition(turn.expectChoice ? choices.length >= 2 && choices.length <= 4 : choices.length === 0, `story turn ${turn.name} choice policy invalid`, { choices, events });
    assertCondition(!hasAuthorNote(text), `story turn ${turn.name} leaked author/system note`, { text, events });
    assertCondition(choices.every((choice) => !isAbstractChoice(choice)), `story turn ${turn.name} has abstract choice`, { choices });
    if (turn.name === 'consequence' && selectedChoice) {
      const anchors = storyChoiceAnchors(selectedChoice);
      assertCondition(!anchors.length || anchors.some((anchor) => text.includes(anchor)), 'story consequence did not visibly connect to selected choice', { selectedChoice, anchors, text });
    }
    messages.push({ role: 'assistant', content: JSON.stringify({ storyEvents: events }) });
    transcript.push(text);
    if (turn.expectChoice) selectedChoice = choices[0] || null;
    turns[turn.name] = {
      sample: clip(text, 180),
      choiceCount: choices.length,
      choices: choices.map((choice) => ({
        label: clip(choice?.label, 80),
        risk: clip(choice?.risk, 120),
        reward: clip(choice?.reward, 120),
      })),
      usage: response.usage,
      protocolRetries: response.protocolRetries,
      firstInvalidJson: response.firstInvalidJson,
    };
  }
  const review = await callJudge(model, [
    '评估故事房 storyEvents 是否优秀：',
    '1. 是否连续、可读，像一段互动小说，而不是系统说明。',
    '2. 是否遵守 storyEvents 协议，旁白/角色台词/选择点边界清晰。',
    '3. 抉择是否具体、有取舍，后果是否承接用户选择。',
    '4. 是否没有作者说明、抽象按钮、前情重启和重复正文。',
  ].join('\n'), { turns });
  return { ok: true, turns, review };
}

async function runStoryLongCase(model) {
  const messages = [{ role: 'system', content: storySystemPrompt() }];
  const transcript = [];
  const turns = {};
  let selectedChoice = null;
  let previousVisibleText = '';
  for (const turn of STORY_LONG_TURNS) {
    messages.push({ role: 'user', content: storyUserPrompt(turn, transcript, selectedChoice) });
    const response = await callJsonWithRetry({
      model,
      messages,
      options: { json: true, maxTokens: 1800, temperature: 0.55 },
      retryLabel: `story_long_${turn.name}`,
    });
    const events = normalizeStoryEvents(response.parsed);
    const text = storyVisibleText(events);
    const choices = events.flatMap((event) => event?.type === 'choice_point' && Array.isArray(event.choices) ? event.choices : []);
    assertCondition(events.length > 0, `story long turn ${turn.name} missing storyEvents`, response.parsed);
    assertCondition(text.length >= (turn.expectChoice ? 0 : 70), `story long turn ${turn.name} visible text too short`, { text, events });
    if (!turn.expectChoice) {
      assertCondition(events.some((event) => event?.type === 'speech' && event.characterId && event.text), `story long turn ${turn.name} missing character speech`, events);
    }
    assertCondition(turn.expectChoice ? choices.length >= 2 && choices.length <= 4 : choices.length === 0, `story long turn ${turn.name} choice policy invalid`, { choices, events });
    assertCondition(!hasAuthorNote(text), `story long turn ${turn.name} leaked author/system note`, { text, events });
    assertCondition(choices.every((choice) => !isAbstractChoice(choice)), `story long turn ${turn.name} has abstract choice`, { choices });
    if (previousVisibleText) {
      const overlap = longestSharedFragmentRatio(previousVisibleText, text);
      assertCondition(overlap < 0.55, `story long turn ${turn.name} repeated too much previous text`, { previousVisibleText: clip(previousVisibleText, 240), text: clip(text, 240), overlap });
    }
    if (turn.name.startsWith('consequence') && selectedChoice) {
      const anchors = storyChoiceAnchors(selectedChoice);
      assertCondition(!anchors.length || anchors.some((anchor) => text.includes(anchor)), `story long ${turn.name} did not connect to selected choice`, { selectedChoice, anchors, text });
    }
    messages.push({ role: 'assistant', content: JSON.stringify({ storyEvents: events }) });
    transcript.push(text);
    previousVisibleText = text;
    if (turn.expectChoice) {
      const selectIndex = typeof turn.selectIndex === 'number' ? turn.selectIndex : 0;
      selectedChoice = choices[Math.min(selectIndex, choices.length - 1)] || null;
    }
    turns[turn.name] = {
      sample: clip(text, 180),
      choiceCount: choices.length,
      choices: choices.map((choice) => ({ label: clip(choice?.label, 80), risk: clip(choice?.risk, 120), reward: clip(choice?.reward, 120) })),
      usage: response.usage,
      protocolRetries: response.protocolRetries,
      firstInvalidJson: response.firstInvalidJson,
    };
  }
  const review = await callJudge(model, [
    '评估长链路故事房输出：',
    '1. 两次抉择和两次后果是否连续承接，没有重启剧情。',
    '2. 非抉择轮是否严格不输出 choice_point。',
    '3. 选项是否具体且有风险/收益差异。',
    '4. 后果是否兑现用户选择并改变局面。',
    '5. 多轮文本是否没有明显复读、作者说明或抽象按钮。',
  ].join('\n'), { turns });
  return { ok: true, turns, review };
}

function longestSharedFragmentRatio(a, b) {
  const left = normalizeWhitespace(a);
  const right = normalizeWhitespace(b);
  if (!left || !right) return 0;
  const probe = left.slice(Math.max(0, left.length - 180));
  let longest = 0;
  for (let size = Math.min(80, probe.length); size >= 16; size -= 8) {
    for (let index = 0; index + size <= probe.length; index += 8) {
      if (right.includes(probe.slice(index, index + size))) {
        longest = Math.max(longest, size);
        break;
      }
    }
    if (longest) break;
  }
  return longest / Math.max(1, Math.min(left.length, right.length));
}

const ROLE_REPLY_SCENARIOS = [
  {
    name: 'qin_shihuang_direct_chat',
    character: {
      id: 'qin',
      name: '秦始皇',
      identity: '统一六国后的始皇帝，强控制感，重秩序和长远功业。',
      personality: '果断、威严、疑心重，不说现代网络腔，不轻易示弱。',
      speakingStyle: '短句有压迫感，可用朕/天下/法度，但不要堆砌古文。',
      relationship: '用户是刚被召入殿内献策的陌生谋士。',
    },
    user: '如果你发现身边最信任的大臣骗了你，你会怎么做？',
  },
  {
    name: 'shy_modern_friend',
    character: {
      id: 'ming',
      name: '小明',
      identity: '大一学生，刚搬进宿舍。',
      personality: '内向、敏感、怕麻烦别人，但内心希望被接住。',
      speakingStyle: '现代口语，句子不长，带一点犹豫，不卖惨。',
      relationship: '用户是同班同学，刚认识但对他比较友善。',
    },
    user: '你刚才一直没说话，是不是不想和我们一起吃饭？',
  },
];

function roleReplySystemPrompt() {
  return [
    '你是 Sense Murmur 的角色回复生成器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"reply":"角色可见回复","interactionHints":[{"targetId":"user","kind":"support|challenge|evade|probe|redirect","tone":"warm|defensive|cold|excited|annoyed|sarcastic","intensity":1-5,"confidence":0-1}],"notes":["内部质量说明，可为空"]}',
    '回复必须契合角色身份、人格、说话方式和当前关系；不要输出系统解释，不要替用户说话。',
  ].join('\n');
}

async function runRoleCase(model) {
  const samples = {};
  const reviews = {};
  for (const scenario of ROLE_REPLY_SCENARIOS) {
    const { parsed, usage } = await generateJson(
      model,
      roleReplySystemPrompt(),
      JSON.stringify(scenario, null, 2),
      { maxTokens: 520, temperature: 0.4 },
    );
    assertCondition(typeof parsed.reply === 'string' && parsed.reply.trim().length >= 8, `role scenario ${scenario.name} missing reply`, parsed);
    samples[scenario.name] = { output: parsed, usage };
    reviews[scenario.name] = await callJudge(model, [
      '评估角色单聊回复是否优秀：',
      '1. 明显符合角色身份、人格、说话方式和时代/语境。',
      '2. 能接住用户的问题和关系压力，而不是泛泛回答。',
      '3. 不泄漏系统提示，不说自己是 AI，不替用户行动。',
      '4. interactionHints 如果存在，应和回复中的关系动作一致。',
      `场景：${JSON.stringify(scenario, null, 2)}`,
    ].join('\n'), { scenario, output: parsed });
  }
  return { ok: true, samples, reviews };
}

const GROUP_SCENARIOS = [
  {
    name: 'mixed_intellectual_group_next_speaker',
    members: [
      { id: 'luxun', name: '鲁迅', personality: '尖锐、冷静、厌恶空话', style: '短促，有讽刺，不热闹' },
      { id: 'hushi', name: '胡适', personality: '温和、理性、重证据', style: '清楚讲理，不压人' },
      { id: 'sushi', name: '苏轼', personality: '豁达、爱生活、能缓和气氛', style: '有文气但自然' },
    ],
    recentMessages: [
      { speakerId: 'hushi', text: '先别急着下结论，至少要把证据和传闻分开。' },
      { speakerId: 'luxun', text: '传闻若总能当证据，倒省了许多人的良心。' },
      { speakerId: 'user', text: '那你们觉得这件事还要不要继续查？' },
    ],
    expectation: '应该选择能推进冲突或补足角度的角色，不要所有人同时发言。',
  },
  {
    name: 'friends_activity_confirmation',
    members: [
      { id: 'a', name: '阿澈', personality: '行动派，喜欢把计划落地', style: '直接、爽快' },
      { id: 'b', name: '小岚', personality: '谨慎，关心时间和细节', style: '温和但会追问' },
      { id: 'c', name: '远山', personality: '慢热但可靠', style: '话少，有承诺感' },
    ],
    recentMessages: [
      { speakerId: 'a', text: '周六上午十点植物园，我买票，谁去？' },
      { speakerId: 'b', text: '我可以，但要确认几点返程。' },
      { speakerId: 'user', text: '远山你呢？' },
    ],
    expectation: '应该选择远山回应，并可能给出活动确认相关结构化线索。',
  },
];

function groupSystemPrompt() {
  return [
    '你是 Sense Murmur 群聊下一发言决策与生成器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"nextSpeakerId":"member-id","reply":"该角色的下一条群聊回复","why":"选择这个角色的理由","interactionHints":[{"targetId":"member-id or user","kind":"support|challenge|probe|redirect|evade","tone":"warm|annoyed|defensive|excited|sarcastic|cold","intensity":1-5,"confidence":0-1}],"socialEventHints":[],"roomStatePatch":{"mood":"...","focus":"...","heatDelta":-5到5,"cohesionDelta":-5到5,"topicDriftDelta":-5到5,"conflictPairs":[["member-id","member-id"]],"dominantThread":["member-id"]},"relationshipDeltas":[{"actorId":"member-id","targetId":"member-id or user","warmthDelta":-3到3,"trustDelta":-3到3,"threatDelta":-3到3,"reason":"..."}],"memoryCandidates":[{"scope":"relationship|topic","text":"...","salience":0-1}]}',
    '只能选择一个 nextSpeakerId。回复要契合该角色人格和群聊上下文，并推进话题。',
    '如果用户点名某角色，优先让该角色发言；如果问题明显需要专业知识，则选最相关且仍在场的角色。',
    'interactionHints、roomStatePatch、relationshipDeltas 必须和可见回复一致。没有明确关系变化时 relationshipDeltas 可以为空。',
  ].join('\n');
}

async function runGroupCase(model) {
  const samples = {};
  const reviews = {};
  for (const scenario of GROUP_SCENARIOS) {
    const { parsed, usage } = await generateJson(model, groupSystemPrompt(), JSON.stringify(scenario, null, 2), { maxTokens: 650, temperature: 0.35 });
    assertCondition(typeof parsed.nextSpeakerId === 'string' && scenario.members.some((member) => member.id === parsed.nextSpeakerId), `group scenario ${scenario.name} invalid nextSpeakerId`, parsed);
    assertCondition(typeof parsed.reply === 'string' && parsed.reply.trim().length >= 2, `group scenario ${scenario.name} missing reply`, parsed);
    samples[scenario.name] = { output: parsed, usage };
    reviews[scenario.name] = await callJudge(model, [
      '评估群聊下一发言是否优秀：',
      '1. nextSpeakerId 是否合理，是否接住用户点名、冲突或话题空缺。',
      '2. 回复是否只代表一个角色，且符合该角色人格和说话方式。',
      '3. 是否推进群聊，而不是重复上一句或泛泛表态。',
      '4. interactionHints/socialEventHints 是否和可见回复一致，没有乱写。',
      `场景：${JSON.stringify(scenario, null, 2)}`,
    ].join('\n'), { scenario, output: parsed });
  }
  return { ok: true, samples, reviews };
}

const CHAT_RUNTIME_SCENARIOS = [
  {
    name: 'direct_user_named_character',
    mode: 'group',
    members: [
      { id: 'qin', name: '秦始皇', personality: '威严、强控制、重秩序', style: '短句有压迫感，可用朕，不说现代网络腔' },
      { id: 'li', name: '李斯', personality: '谨慎、务实、善于解释制度', style: '清楚、克制、带法家逻辑' },
      { id: 'zhao', name: '赵高', personality: '敏锐、圆滑、善试探', style: '委婉、避重就轻' },
    ],
    recentMessages: [
      { speakerId: 'user', text: '秦始皇，如果李斯和赵高都说自己是忠臣，你更相信谁？' },
    ],
    expectedNextSpeakerIds: ['qin'],
    expectedRelationshipDeltas: [],
    expectedRoomSignals: ['focus'],
    rubricHint: '用户明确点名秦始皇，应由秦始皇发言，不应让李斯或赵高抢答。',
  },
  {
    name: 'group_conflict_target_should_answer',
    mode: 'group',
    members: [
      { id: 'a', name: '阿澈', personality: '行动派，直率，容易急', style: '短句、直接' },
      { id: 'b', name: '小岚', personality: '谨慎，重细节，讨厌被催', style: '温和但会反问' },
      { id: 'c', name: '远山', personality: '慢热，可靠，少说话', style: '简短、有承诺感' },
    ],
    recentMessages: [
      { speakerId: 'a', text: '小岚你老是卡细节，方案都被你拖慢了。' },
      { speakerId: 'user', text: '小岚你怎么看？' },
    ],
    expectedNextSpeakerIds: ['b'],
    expectedRelationshipDeltas: [{ actorId: 'b', targetId: 'a', direction: 'defensive_or_boundary' }],
    expectedRoomSignals: ['heat', 'conflict'],
    rubricHint: '用户点名被质疑的一方，小岚应回应压力、设边界或解释理由，同时房间态势应显示冲突升温。',
  },
  {
    name: 'expertise_gap_should_pick_expert',
    mode: 'group',
    members: [
      { id: 'doctor', name: '林医生', personality: '冷静、专业、负责', style: '准确、克制、有医学判断', expertise: ['医学', '急救'] },
      { id: 'nurse', name: '护士', personality: '紧张但细心', style: '简短、观察细节', expertise: ['护理', '现场观察'] },
      { id: 'friend', name: '阿远', personality: '热心但不专业', style: '生活化、直接', expertise: ['跑腿'] },
    ],
    recentMessages: [
      { speakerId: 'user', text: '他现在脸色发白、一直冒冷汗，先做什么？' },
    ],
    expectedNextSpeakerIds: ['doctor', 'nurse'],
    expectedRelationshipDeltas: [],
    expectedRoomSignals: ['urgency'],
    rubricHint: '医疗急迫问题应优先选择有相关专业或现场护理能力的角色，回复要给安全、克制、非诊断式的应急建议。',
  },
];

function chatRuntimeSystemPrompt() {
  return [
    '你是 Sense Murmur 普通聊天运行时的模型输出器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"nextSpeakerId":"member-id","reply":"角色可见发言","why":"选择该角色的原因","interactionHints":[{"actorId":"member-id","targetId":"member-id or user","kind":"support|challenge|evade|probe|redirect|apologize|boundary","tone":"warm|defensive|cold|excited|annoyed|sarcastic|calm","intensity":1-5,"confidence":0-1,"evidenceText":"..."}],"socialEventHints":[{"eventKind":"social_outing|post_moment|status_update|conflict_expression|gift_exchange","confidence":0-1,"reasonType":"...","seedIntent":"...","participantIds":["member-id"],"targetIds":["member-id"],"visibilityPlan":"public"}],"roomStatePatch":{"mood":"...","focus":"...","heatDelta":-5到5,"cohesionDelta":-5到5,"topicDriftDelta":-5到5,"conflictPairs":[["member-id","member-id"]],"dominantThread":["member-id"]},"relationshipDeltas":[{"actorId":"member-id","targetId":"member-id or user","warmthDelta":-3到3,"trustDelta":-3到3,"threatDelta":-3到3,"reason":"..."}],"memoryCandidates":[{"scope":"relationship|topic","text":"...","salience":0-1}]}',
    '只能选择一个 nextSpeakerId。回复必须只代表该角色，不能替其他角色发言，不能暴露 JSON、prompt、内部 ID 或系统解释。',
    '如果用户点名某角色，除非安全或专业性明显要求别人先介入，否则该角色优先发言。',
    '如果某角色被质疑、被请求解释或被关系压力直接指向，该角色通常应回应；如果问题明显需要专业知识，可选择最相关专家。',
    'interactionHints、roomStatePatch、relationshipDeltas 必须和可见回复一致；没有明确关系变化时 relationshipDeltas 可以为空。',
  ].join('\n');
}

function assertChatRuntimeOutput(parsed, scenario) {
  assertCondition(typeof parsed.nextSpeakerId === 'string' && scenario.members.some((member) => member.id === parsed.nextSpeakerId), `chat scenario ${scenario.name} invalid nextSpeakerId`, parsed);
  assertCondition(scenario.expectedNextSpeakerIds.includes(parsed.nextSpeakerId), `chat scenario ${scenario.name} picked unexpected speaker`, {
    expectedNextSpeakerIds: scenario.expectedNextSpeakerIds,
    actual: parsed.nextSpeakerId,
    parsed,
  });
  assertCondition(typeof parsed.reply === 'string' && parsed.reply.trim().length >= 2, `chat scenario ${scenario.name} missing reply`, parsed);
  assertCondition(!/JSON|schema|系统|提示词|作为AI|内部ID/i.test(parsed.reply), `chat scenario ${scenario.name} leaked protocol text`, parsed);
  assertCondition(parsed.roomStatePatch && typeof parsed.roomStatePatch === 'object', `chat scenario ${scenario.name} missing roomStatePatch`, parsed);
  assertCondition(Array.isArray(parsed.interactionHints), `chat scenario ${scenario.name} missing interactionHints`, parsed);
  assertCondition(Array.isArray(parsed.relationshipDeltas), `chat scenario ${scenario.name} missing relationshipDeltas`, parsed);
  assertCondition(Array.isArray(parsed.memoryCandidates), `chat scenario ${scenario.name} missing memoryCandidates`, parsed);
  parsed.interactionHints.forEach((hint, index) => {
    assertCondition(hint && hint.actorId === parsed.nextSpeakerId, `chat scenario ${scenario.name} interaction ${index} actor mismatch`, parsed);
    assertCondition(!hint.targetId || hint.targetId === 'user' || scenario.members.some((member) => member.id === hint.targetId), `chat scenario ${scenario.name} interaction ${index} invalid target`, parsed);
    assertCondition(typeof hint.confidence === 'number' && hint.confidence >= 0 && hint.confidence <= 1, `chat scenario ${scenario.name} interaction ${index} invalid confidence`, parsed);
  });
  parsed.relationshipDeltas.forEach((delta, index) => {
    assertCondition(delta && delta.actorId === parsed.nextSpeakerId, `chat scenario ${scenario.name} relationship delta ${index} actor mismatch`, parsed);
    assertCondition(delta.targetId === 'user' || scenario.members.some((member) => member.id === delta.targetId), `chat scenario ${scenario.name} relationship delta ${index} invalid target`, parsed);
    ['warmthDelta', 'trustDelta', 'threatDelta'].forEach((key) => {
      assertCondition(typeof delta[key] === 'number' && delta[key] >= -3 && delta[key] <= 3, `chat scenario ${scenario.name} relationship delta ${index} invalid ${key}`, parsed);
    });
  });
  for (const expected of scenario.expectedRelationshipDeltas) {
    const hit = parsed.relationshipDeltas.some((delta) => delta.actorId === expected.actorId && delta.targetId === expected.targetId);
    assertCondition(hit, `chat scenario ${scenario.name} missing expected relationship delta`, { expected, parsed });
  }
  const roomText = JSON.stringify(parsed.roomStatePatch).toLowerCase();
  for (const signal of scenario.expectedRoomSignals) {
    if (signal === 'focus') assertCondition(typeof parsed.roomStatePatch.focus === 'string' && parsed.roomStatePatch.focus.trim(), `chat scenario ${scenario.name} missing room focus`, parsed);
    if (signal === 'heat') assertCondition(Math.abs(Number(parsed.roomStatePatch.heatDelta || 0)) > 0, `chat scenario ${scenario.name} missing heat delta`, parsed);
    if (signal === 'conflict') assertCondition(roomText.includes('conflict') || (Array.isArray(parsed.roomStatePatch.conflictPairs) && parsed.roomStatePatch.conflictPairs.length > 0), `chat scenario ${scenario.name} missing conflict signal`, parsed);
    if (signal === 'urgency') assertCondition(/急|urg|风险|冷静|先|安全/.test(roomText + parsed.reply), `chat scenario ${scenario.name} missing urgency signal`, parsed);
  }
}

async function runChatCase(model) {
  const samples = {};
  const reviews = {};
  const transcript = [];
  for (const scenario of CHAT_RUNTIME_SCENARIOS) {
    const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
      model,
      chatRuntimeSystemPrompt(),
      JSON.stringify(scenario, null, 2),
      { maxTokens: 1500, temperature: 0.35 },
    );
    assertChatRuntimeOutput(parsed, scenario);
    const speakerName = scenario.members.find((member) => member.id === parsed.nextSpeakerId)?.name || parsed.nextSpeakerId;
    transcript.push({
      scenario: scenario.name,
      speakerId: parsed.nextSpeakerId,
      speakerName,
      reply: parsed.reply,
      roomStatePatch: parsed.roomStatePatch,
      relationshipDeltas: parsed.relationshipDeltas,
      interactionHints: parsed.interactionHints,
    });
    samples[scenario.name] = { output: parsed, usage, protocolRetries, firstInvalidJson };
    reviews[scenario.name] = await callJudge(model, [
      '评估普通聊天单轮运行输出是否优秀：',
      '1. nextSpeakerId 是否符合点名、关系压力、专业能力和当前上下文。',
      '2. reply 是否像该角色本人在说话，接住用户问题，不替其他角色发言。',
      '3. interactionHints、roomStatePatch、relationshipDeltas 是否和可见回复一致，不过度写入。',
      '4. 是否避免系统说明、内部 ID、JSON 协议泄漏。',
      `场景额外要求：${scenario.rubricHint}`,
    ].join('\n'), { scenario, output: parsed });
  }
  const aggregateReview = await callJudge(model, [
    '评估多段普通聊天记录的整体质量：',
    '1. 多段 nextSpeakerId 选择是否整体合理，是否覆盖点名、冲突回应和专业介入。',
    '2. 多段角色发言是否各有角色差异，不同角色不应同质化。',
    '3. 房间态势变化是否和聊天压力一致，不能乱升温或乱降温。',
    '4. 关系变化是否克制，只在有明确支持、质疑、设边界、修复等行为时写入。',
    '5. 这些输出能否作为普通聊天运行时提交后的验收样本。',
  ].join('\n'), { transcript });
  return { ok: true, samples, reviews, aggregateReview };
}

const CHARACTER_PROFILE_SCHEMA_PROMPT = [
  '你是 Sense Murmur 的角色档案生成器。只输出 JSON，不要 Markdown。',
  'JSON schema: {"name":"...","avatar":"单个emoji","personality":{"openness":0-100,"extroversion":0-100,"agreeableness":0-100,"neuroticism":0-100,"humor":0-100,"creativity":0-100,"assertiveness":0-100,"empathy":0-100},"behavior":{"proactivity":0-100,"aggressiveness":0-100,"humorIntensity":0-100,"empathyLevel":0-100,"summarizing":0-100,"offTopic":0-100},"expertise":["..."],"speakingStyle":"...","background":"...","speechProfile":{"catchphrases":["..."],"fillers":["..."],"tabooPhrases":["..."],"preferredOpeners":["..."],"preferredClosers":["..."],"sentenceLengthBias":"short|mixed|long","questionBias":0-100,"sarcasmBias":0-100},"coreProfile":{"coreDesire":"...","coreFear":"...","socialMask":"...","values":["..."],"sensitivities":["..."],"perceptionBiases":["..."],"interactionHabits":["..."],"attachmentStyle":"...","conflictStyle":"...","unmetNeeds":["..."],"selfImage":"...","hiddenSoftSpots":["..."]},"bubbleStyle":{"name":"...","backgroundColor":"#RRGGBB","textColor":"#RRGGBB","borderColor":"#RRGGBB","borderWidth":0-4,"borderStyle":"solid|dashed|dotted","radius":4-32,"shadow":"none|soft|medium|strong"},"visualIdentity":{"description":"...","styleHint":"...","negativePrompt":"...","seed":null}}',
  '必须贴合用户主题，数值要有区分度；background/coreProfile 要写出关系、冲突、弱点和长期演化钩子。',
].join('\n');

const CAST_PLANNER_PROMPT = [
  '你是 Sense Murmur 的批量角色阵容规划器。只输出 JSON，不要 Markdown。',
  'JSON schema: {"characters":[{"name":"名字","role":"主要身份","summary":"设定摘要"}],"relationships":[{"fromName":"名字","toName":"名字","note":"关系线索","tone":"warm|tense|mixed|neutral","strength":0-100,"inferredFrom":"依据"}],"circles":[{"name":"关系圈名称","summary":"圈子摘要","characterNames":["名字"],"keyRelationshipIndexes":[0],"bridgeRelationshipIndexes":[1]}],"defaultSelectedNames":["名字"]}',
  '如果输入是故事、剧本、作品主题或用户目标，提取或生成适合放进同一群聊的核心角色。不要机械凑数；关系要能支持后续群聊冲突、亲近、信任、威胁和长期变化。',
].join('\n');

function chatDraftSystemPromptForAcceptance() {
  return [
    '你是 Sense Murmur 的群聊草稿补全器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"suggestedName":"群聊名","suggestedTopic":"群聊主题","suggestedStyle":"free|debate|brainstorm|roleplay","suggestedMemberIds":["角色id"],"suggestedShowRoleActions":true,"suggestedRoomTemplate":"open_chat|story_reader|social_sandbox|analysis_room"}',
    '只能使用 roster 中已有角色 id。保留用户目标，选择最能产生有趣互动的成员组合，标题和主题要短而可用。',
  ].join('\n');
}

const GENERATION_SCENARIOS = {
  singleCharacter: {
    name: '秦始皇',
    theme: '历史人物群聊',
    description: '用户希望和秦始皇单聊，角色要威严、强控制、重秩序，但不能变成古文模板。',
  },
  batchCast: {
    prompt: '创建金庸常见角色，适合一个有阵营、旧情、师承、恩怨和江湖规矩的群聊。至少包含郭靖、黄蓉、杨过、小龙女、张无忌、赵敏、乔峰、段誉、虚竹。',
    requiredNames: ['郭靖', '黄蓉', '杨过', '小龙女', '张无忌', '赵敏', '乔峰', '段誉', '虚竹'],
  },
  groupDraft: {
    userGoal: '开一个秦朝宫廷权力群聊，让秦始皇、李斯、赵高讨论“焚书令是否会反噬帝国”。',
  },
};

function assertScoreMap(value, keys, label, detail) {
  assertCondition(value && typeof value === 'object', `${label} missing score map`, detail);
  for (const key of keys) {
    assertCondition(typeof value[key] === 'number' && value[key] >= 0 && value[key] <= 100, `${label} invalid score ${key}`, detail);
  }
  const unique = new Set(keys.map((key) => Math.round(value[key] / 5) * 5));
  assertCondition(unique.size >= 3, `${label} scores are not distinctive enough`, detail);
}

function isEquivalentCharacterName(actual, expected) {
  const left = normalizeWhitespace(actual);
  const right = normalizeWhitespace(expected);
  if (!left || !right) return false;
  if (left === right) return true;
  const aliases = {
    秦始皇: ['嬴政', '始皇帝', '秦王政'],
  };
  return Array.isArray(aliases[right]) && aliases[right].includes(left);
}

function assertGeneratedCharacterProfile(profile, expectedName) {
  assertCondition(profile && typeof profile === 'object', 'generated character profile missing object', profile);
  if (expectedName) assertCondition(isEquivalentCharacterName(profile.name, expectedName), 'generated character name mismatch', { expectedName, profile });
  assertCondition(typeof profile.name === 'string' && profile.name.trim(), 'generated character missing name', profile);
  assertCondition(typeof profile.speakingStyle === 'string' && profile.speakingStyle.trim().length >= 8, 'generated character missing speakingStyle', profile);
  assertCondition(typeof profile.background === 'string' && profile.background.trim().length >= 30, 'generated character background too thin', profile);
  assertCondition(Array.isArray(profile.expertise) && profile.expertise.length >= 2, 'generated character missing expertise', profile);
  assertScoreMap(profile.personality, ['openness', 'extroversion', 'agreeableness', 'neuroticism', 'humor', 'creativity', 'assertiveness', 'empathy'], 'personality', profile);
  assertScoreMap(profile.behavior, ['proactivity', 'aggressiveness', 'humorIntensity', 'empathyLevel', 'summarizing', 'offTopic'], 'behavior', profile);
  assertCondition(profile.coreProfile && typeof profile.coreProfile === 'object', 'generated character missing coreProfile', profile);
  ['coreDesire', 'coreFear', 'socialMask', 'selfImage'].forEach((key) => {
    assertCondition(typeof profile.coreProfile[key] === 'string' && profile.coreProfile[key].trim().length >= 6, `generated character missing coreProfile.${key}`, profile);
  });
  assertCondition(profile.visualIdentity && typeof profile.visualIdentity.description === 'string' && profile.visualIdentity.description.trim().length >= 12, 'generated character missing visualIdentity', profile);
}

function castCharactersToMembers(characters) {
  return characters.map((character, index) => ({
    id: `cast-${index + 1}`,
    name: character.name,
    personality: character.summary || character.role || '',
    style: character.role || character.summary || '',
    expertise: [character.role].filter(Boolean),
  }));
}

async function generateSingleCharacterProfile(model, scenario = GENERATION_SCENARIOS.singleCharacter) {
  const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
    model,
    CHARACTER_PROFILE_SCHEMA_PROMPT,
    [
      `主题/分组：${scenario.theme}`,
      `描述：${scenario.description}`,
      `目标角色：${scenario.name}`,
      '请输出完整角色档案 JSON。',
    ].join('\n'),
    { maxTokens: 2200, temperature: 0.35 },
  );
  assertGeneratedCharacterProfile(parsed, scenario.name);
  const review = await callJudge(model, [
    '评估 AI 生成单个角色档案是否可直接进入产品：',
    '1. 是否符合角色姓名、主题和用户约束。',
    '2. personality/behavior 是否有区分度，避免全 50 或模板化。',
    '3. background、speakingStyle、coreProfile、visualIdentity 是否能支持后续聊天、头像和长期演化。',
    '4. 是否没有系统说明、Markdown、内部字段解释或过度现代化/过度古文化。',
  ].join('\n'), { scenario, profile: parsed });
  return { profile: parsed, usage, protocolRetries, firstInvalidJson, review };
}

async function generateBatchCast(model, scenario = GENERATION_SCENARIOS.batchCast) {
  const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
    model,
    CAST_PLANNER_PROMPT,
    scenario.prompt,
    { maxTokens: 3000, temperature: 0.35 },
  );
  assertCondition(Array.isArray(parsed.characters) && parsed.characters.length >= scenario.requiredNames.length, 'batch cast missing characters', parsed);
  const names = parsed.characters.map((character) => character?.name).filter(Boolean);
  for (const name of scenario.requiredNames) assertCondition(names.includes(name), `batch cast missing required name ${name}`, { names, parsed });
  parsed.characters.forEach((character, index) => {
    assertCondition(typeof character.name === 'string' && character.name.trim(), `batch cast character ${index} missing name`, parsed);
    assertCondition(typeof character.role === 'string' && character.role.trim(), `batch cast character ${index} missing role`, parsed);
    assertCondition(typeof character.summary === 'string' && character.summary.trim().length >= 10, `batch cast character ${index} summary too thin`, parsed);
  });
  assertCondition(Array.isArray(parsed.relationships) && parsed.relationships.length >= Math.min(8, scenario.requiredNames.length - 1), 'batch cast missing relationship edges', parsed);
  const minCircleCount = scenario.requiredNames.length <= 3 ? 1 : 2;
  assertCondition(Array.isArray(parsed.circles) && parsed.circles.length >= minCircleCount, 'batch cast missing circles', parsed);
  assertCondition(Array.isArray(parsed.defaultSelectedNames) && parsed.defaultSelectedNames.length >= 4, 'batch cast missing default selected names', parsed);
  const review = await callJudge(model, [
    '评估批量角色阵容规划是否优秀：',
    '1. 是否覆盖用户明确要求的人物，不漏核心角色。',
    '2. 角色摘要是否包含身份、关系、冲突、说话约束和设定边界。',
    '3. relationships/circles 是否能支撑后续初始化关系和群聊张力，而不是机械全连接。',
    '4. defaultSelectedNames 是否适合作为初始群聊阵容。',
  ].join('\n'), { scenario, cast: parsed });
  return { cast: parsed, usage, protocolRetries, firstInvalidJson, review };
}

async function generateBatchProfiles(model, names, context) {
  const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
    model,
    `${CHARACTER_PROFILE_SCHEMA_PROMPT}\n这次必须返回 JSON object，格式为 {"items":[...]}，items 每项都包含 name 和完整角色档案字段。`,
    [
      `主题/分组：${context.theme}`,
      `描述：${context.description}`,
      `角色名单：${names.join('、')}`,
      '请为每个名字生成一个完整档案，name 必须和输入完全一致。',
    ].join('\n'),
    { maxTokens: 6400, temperature: 0.25 },
  );
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  assertCondition(items.length === names.length, 'batch profile count mismatch', { names, parsed });
  for (const name of names) {
    const profile = items.find((item) => item?.name === name);
    assertCondition(profile, `batch profiles missing ${name}`, { names, parsed });
    assertGeneratedCharacterProfile(profile, name);
  }
  const review = await callJudge(model, [
    '评估批量生成角色档案是否优秀：',
    '1. 每个角色是否完整、可用且互相有明显差异。',
    '2. 是否保留用户主题中的关系、阵营、冲突和语境，不因批量生成而变成泛化模板。',
    '3. 数值、说话方式、背景、coreProfile 和 visualIdentity 是否都可用于后续聊天与长期演化。',
  ].join('\n'), { names, context, profiles: items });
  return { profiles: items, usage, protocolRetries, firstInvalidJson, review };
}

async function generateGroupDraft(model, members, scenario = GENERATION_SCENARIOS.groupDraft) {
  const roster = members.map((member) => ({
    id: member.id,
    name: member.name,
    speakingStyle: member.style || member.speakingStyle || '',
    background: member.personality || member.background || '',
    expertise: member.expertise || [],
  }));
  const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
    model,
    chatDraftSystemPromptForAcceptance(),
    JSON.stringify({
      language: 'zh',
      userGoal: scenario.userGoal,
      constraints: {
        maxMembers: 8,
        validStyles: ['free', 'debate', 'brainstorm', 'roleplay'],
        validRoomTemplates: ['open_chat', 'story_reader', 'social_sandbox', 'analysis_room'],
      },
      currentDraft: { name: '', topic: scenario.userGoal, selectedMemberIds: [], showRoleActions: true },
      roster,
    }, null, 2),
    { maxTokens: 1200, temperature: 0.25 },
  );
  const validIds = new Set(roster.map((item) => item.id));
  assertCondition(typeof parsed.suggestedName === 'string' && parsed.suggestedName.trim(), 'group draft missing name', parsed);
  assertCondition(typeof parsed.suggestedTopic === 'string' && parsed.suggestedTopic.trim().length >= 4, 'group draft missing topic', parsed);
  assertCondition(['free', 'debate', 'brainstorm', 'roleplay'].includes(parsed.suggestedStyle), 'group draft invalid style', parsed);
  assertCondition(Array.isArray(parsed.suggestedMemberIds) && parsed.suggestedMemberIds.length >= 2, 'group draft missing member ids', parsed);
  parsed.suggestedMemberIds.forEach((id) => assertCondition(validIds.has(id), 'group draft invented member id', { id, parsed, roster }));
  const review = await callJudge(model, [
    '评估 AI 生成群聊草稿是否优秀：',
    '1. 是否保留用户目标，群聊名和主题可直接展示。',
    '2. 是否只选择 roster 内成员，成员组合能产生讨论张力。',
    '3. suggestedStyle 和 suggestedRoomTemplate 是否匹配用户意图。',
  ].join('\n'), { scenario, roster, draft: parsed });
  return { draft: parsed, usage, protocolRetries, firstInvalidJson, review };
}

async function runGenerationCase(model) {
  const singleCharacter = await generateSingleCharacterProfile(model);
  const batchCast = await generateBatchCast(model);
  const batchProfileNames = ['郭靖', '黄蓉', '杨过', '小龙女'];
  const batchProfiles = await generateBatchProfiles(model, batchProfileNames, {
    theme: '金庸江湖群聊',
    description: '保留师承、旧情、侠义、门派和江湖规矩，角色之间需要有可用于群聊的关系张力。',
  });
  const groupDraftMembers = [
    { id: 'qin', name: '秦始皇', personality: '威严、强控制、重秩序', style: '短句有压迫感' },
    { id: 'li', name: '李斯', personality: '谨慎、务实、重制度', style: '清楚、克制' },
    { id: 'zhao', name: '赵高', personality: '敏锐、圆滑、善试探', style: '委婉、避重就轻' },
  ];
  const groupDraft = await generateGroupDraft(model, groupDraftMembers);
  return { ok: true, singleCharacter, batchCast, batchProfiles, groupDraft };
}

const AGENT_SCENARIOS = [
  {
    name: 'create_jinyong_group',
    user: '创建金庸常见角色：郭靖、黄蓉、杨过、小龙女、张无忌、赵敏、乔峰、段誉、虚竹，放到金庸分组里，然后开一个群聊。',
    expectedKinds: ['create_characters', 'create_group_chat'],
  },
  {
    name: 'inspect_existing_character',
    user: '我想看角色库中秦始皇的信息，顺便告诉我他的性格是不是太强势。',
    expectedKinds: ['read_character'],
  },
  {
    name: 'generate_image_routes_to_assistant',
    user: '生成图片：赛博长安城夜市，雨后霓虹，宽幅。',
    expectedKinds: ['open_assistant_agent', 'generate_image'],
  },
  {
    name: 'ambiguous_chat_target',
    user: '进入之前聊到中元节的那个聊天；如果查到唯一匹配就打开，如果多个就给我选项。',
    expectedKinds: ['search_chats', 'open_chat'],
  },
];

function agentSystemPrompt() {
  return [
    '你是 Sense Murmur 站内 Agent 的意图规划器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"intent":"execute|clarify|chat","assistantMessage":"给用户看的简短话","requiresConfirmation":false,"operations":[{"kind":"search_characters|read_character|update_character|create_characters|create_group_chat|create_direct_chat|search_chats|open_chat|open_assistant_agent|generate_image|generate_document|edit_artifact|query_balance|other","target":"...","instruction":"...","risk":"low|medium|high"}],"candidateActions":[{"label":"...","sendText":"..."}]}',
    '只做计划，不要假装已经执行。能直接执行的低风险创建/查询 requiresConfirmation=false；跳转、批量修改、高风险修改应给候选操作。',
    '如果用户已经明确给出完整角色名单、分组名、动作目标或产物目标，不要无故澄清，应该直接规划可执行操作。',
    '批量创建角色时，create_characters 的 target 要写清楚目标分组，instruction 要包含角色名单；如果还要开群聊，create_group_chat 的 instruction 要说明使用刚创建或命中的角色。',
    '按主题、片段或“之前聊到...”查找聊天时，必须先 search_chats，但规划不能停在搜索；还必须包含 open_chat 后续动作，target 可写“唯一匹配聊天”或“用户选择的候选聊天”。除非已有唯一精确命中，否则 requiresConfirmation=true，并提供自然的 candidateActions 让用户选择打开哪一个。',
    '生成图片、生成文档、修改图片、修改文档或编辑产物时，首页入口必须先规划 open_assistant_agent，再规划对应的 generate_image/generate_document/edit_artifact 操作。',
  ].join('\n');
}

async function runAgentCase(model) {
  const samples = {};
  const reviews = {};
  for (const scenario of AGENT_SCENARIOS) {
    const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(model, agentSystemPrompt(), scenario.user, { maxTokens: 1400, temperature: 0.2 });
    assertCondition(Array.isArray(parsed.operations), `agent scenario ${scenario.name} missing operations`, parsed);
    parsed.operations.forEach((operation, index) => {
      assertCondition(operation && typeof operation.kind === 'string' && operation.kind.trim(), `agent scenario ${scenario.name} operation ${index} missing kind`, parsed);
      assertCondition(typeof operation.instruction === 'string' && operation.instruction.trim(), `agent scenario ${scenario.name} operation ${index} missing instruction`, parsed);
      assertCondition(['low', 'medium', 'high'].includes(operation.risk), `agent scenario ${scenario.name} operation ${index} invalid risk`, parsed);
    });
    const kinds = parsed.operations.map((operation) => operation?.kind).filter(Boolean);
    scenario.expectedKinds.forEach((kind) => assertCondition(kinds.includes(kind), `agent scenario ${scenario.name} missing operation ${kind}`, { kinds, parsed }));
    samples[scenario.name] = { output: parsed, usage, protocolRetries, firstInvalidJson };
    reviews[scenario.name] = await callJudge(model, [
      '评估站内 Agent 规划是否优秀：',
      '1. 是否正确理解用户目标并复用站内能力。',
      '2. 是否区分可直接执行、需要确认、需要澄清和进入助手聊天的场景。',
      '3. 是否避免假装已执行，避免暴露内部 URL/ID/JSON 给用户。',
      '4. 首页入口偏短平快：低风险创建、查询和明确目标的直接执行不应因为 requiresConfirmation=false 扣分。',
      '5. candidateActions 只在澄清、不确定或高风险修改时才是必须；直接执行场景可以为空。',
      '6. 批量创建/开群聊必须把分组、角色名单、目标群聊和执行顺序写清楚。',
      `场景：${JSON.stringify(scenario, null, 2)}`,
    ].join('\n'), { scenario, output: parsed });
  }
  return { ok: true, samples, reviews };
}

const OPS_SCENARIOS = [
  {
    name: 'exact_existing_character_direct_open',
    user: '和秦始皇聊天',
    source: 'home',
    inventory: {
      characters: [
        { id: 'c-qin', name: '秦始皇', group: '历史', summary: '统一六国后的始皇帝' },
        { id: 'c-li', name: '李斯', group: '历史', summary: '秦朝丞相' },
      ],
      chats: [
        { id: 'chat-qin', type: 'direct', title: '和秦始皇聊天', memberNames: ['秦始皇'], recentTopics: ['法度', '巡游'] },
      ],
    },
    expectedModeAny: ['local_action', 'workflow'],
    expectedActionsAny: ['open_existing_chat', 'create_direct_chat'],
    requireDirectExecution: true,
  },
  {
    name: 'bare_character_needs_lookup',
    user: '小明',
    source: 'home',
    inventory: {
      characters: [
        { id: 'c-ming-1', name: '小明', group: '校园', summary: '内向的大一学生' },
        { id: 'c-ming-2', name: '小明', group: '职场', summary: '刚入职的设计师' },
      ],
      chats: [],
    },
    expectedModeAny: ['local_action', 'workflow'],
    expectedActionsAny: ['read_character_info', 'compare_characters', 'open_existing_chat', 'create_direct_chat'],
    requireConfirmation: true,
    minChoices: 2,
  },
  {
    name: 'batch_move_related_characters',
    user: '把喜羊羊相关的角色都移动到喜羊羊分组中',
    source: 'assistant',
    inventory: {
      characters: [
        { id: 'c-xiyang', name: '喜羊羊', group: '未分组', summary: '聪明的羊村角色' },
        { id: 'c-meiyang', name: '美羊羊', group: '未分组', summary: '羊村角色' },
        { id: 'c-huitailang', name: '灰太狼', group: '未分组', summary: '与羊村长期对立' },
      ],
      chats: [],
    },
    expectedModeAny: ['local_action', 'workflow'],
    expectedActionsAny: ['update_characters'],
    requireConfirmation: true,
    requireHighRisk: true,
    forbiddenSourceGroup: '喜羊羊',
    requiredTargetGroup: '喜羊羊',
  },
  {
    name: 'compare_existing_characters',
    user: '秦始皇和李斯谁更擅长做菜？要结合角色库信息回答。',
    source: 'assistant',
    inventory: {
      characters: [
        { id: 'c-qin', name: '秦始皇', group: '历史', summary: '帝王，重秩序与统御' },
        { id: 'c-li', name: '李斯', group: '历史', summary: '丞相，务实细致，重执行' },
      ],
      chats: [],
    },
    expectedModeAny: ['local_action', 'workflow', 'assistant_agent'],
  },
  {
    name: 'api_key_setting_high_risk',
    user: '设置模型 DeepSeek 秘钥为 sk-test-1234567890，并设为默认模型',
    source: 'home',
    inventory: { characters: [], chats: [] },
    expectedModeAny: ['local_action', 'workflow'],
    expectedActionsAny: ['update_ai_settings', 'other'],
    requireConfirmation: true,
    requireHighRisk: true,
  },
];

function opsSystemPrompt(source) {
  return [
    '你是 Sense Murmur 的站内操作规划器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"mode":"local_action|workflow|assistant_agent|final_response","title":"...","summary":"...","riskLevel":"low|medium|high","requiresConfirmation":false,"action":"open_existing_chat|create_direct_chat|create_group_chat|create_characters|read_character_info|compare_characters|update_characters|search_chats|query_balance|update_ai_settings|other","plan":{"characterQuery":"...","sourceGroup":"...","targetGroup":"...","characterNames":["..."],"chatQuery":"...","targetChat":"...","updates":{},"reason":"..."},"steps":[{"action":"...","riskLevel":"low|medium|high","requiresConfirmation":false,"plan":{}}],"choices":[{"id":"...","label":"...","kind":"confirm|cancel|execute","action":"...","plan":{}}],"assistantMessage":"..."}',
    '只能基于 inventory 中可见的角色和聊天做定位，不要编造内部 ID。',
    '只有输入明确是已执行观察、结果确认或任务已完成总结时，才输出 final_response；普通用户原始请求不要输出 final_response。',
    '首页来源：唯一精确命中且低风险的打开/查询可直接执行；多个同名或多个相关命中必须 requiresConfirmation=true 并给 choices。',
    '助手来源：跳转、批量修改、高风险设置都必须让用户确认，不能直接假装完成。',
    '对“和 X 聊天”“打开和 X 的聊天”这类明确会话意图，若 inventory 里有唯一匹配聊天，优先输出 open_existing_chat；若只有角色可匹配，可输出 create_direct_chat。',
    '同名或多候选角色需要 choices；每个 choice 的 label 必须带分组或摘要差异，choice.plan 里也要带 characterQuery、characterNames 或 group 等可用于本地消歧的信息。',
    '批量修改角色、移动分组、设置模型/API key 属于 high 风险，必须 requiresConfirmation=true。',
    '“把 X 相关角色移动到 Y 分组”中，X 是 characterQuery，Y 是 targetGroup，不要把 Y 写成 sourceGroup。',
    source === 'home' ? '当前来源是首页快捷入口。' : '当前来源是助手聊天页。',
  ].join('\n');
}

function collectPlannedActions(output) {
  const actions = [];
  if (typeof output.action === 'string') actions.push({ action: normalizeOpsAction(output.action), riskLevel: output.riskLevel, requiresConfirmation: output.requiresConfirmation, plan: output.plan || {} });
  if (Array.isArray(output.steps)) {
    for (const step of output.steps) {
      if (typeof step?.action === 'string') actions.push({ action: normalizeOpsAction(step.action), riskLevel: step.riskLevel || output.riskLevel, requiresConfirmation: step.requiresConfirmation ?? output.requiresConfirmation, plan: step.plan || {} });
    }
  }
  if (Array.isArray(output.choices)) {
    for (const choice of output.choices) {
      const plan = choice?.plan && typeof choice.plan === 'object' ? choice.plan : {};
      const action = typeof choice?.action === 'string' ? choice.action : typeof plan.action === 'string' ? plan.action : '';
      if (action) actions.push({ action: normalizeOpsAction(action), riskLevel: choice.riskLevel || output.riskLevel, requiresConfirmation: true, plan });
    }
  }
  return actions;
}

function normalizeOpsAction(action) {
  return action === 'open_chat' ? 'open_existing_chat' : action;
}

function assertOpsOutput(parsed, scenario) {
  const actions = collectPlannedActions(parsed);
  const effectiveMode = parsed.mode === 'final_response' && actions.length > 0 ? 'local_action' : parsed.mode;
  assertCondition(scenario.expectedModeAny.includes(effectiveMode), `ops scenario ${scenario.name} wrong mode`, { scenario, effectiveMode, parsed });
  assertCondition(actions.length > 0 || parsed.mode === 'assistant_agent' || parsed.mode === 'final_response', `ops scenario ${scenario.name} missing actions`, parsed);
  if (scenario.expectedActionsAny?.length) {
    const actionNames = actions.map((item) => item.action);
    assertCondition(scenario.expectedActionsAny.some((action) => actionNames.includes(action)), `ops scenario ${scenario.name} missing expected action`, { expected: scenario.expectedActionsAny, actionNames, parsed });
  }
  if (scenario.requireConfirmation) assertCondition(parsed.requiresConfirmation === true || actions.some((item) => item.requiresConfirmation === true), `ops scenario ${scenario.name} should require confirmation`, parsed);
  if (scenario.requireDirectExecution) assertCondition(parsed.requiresConfirmation !== true, `ops scenario ${scenario.name} should execute without extra confirmation`, parsed);
  if (scenario.minChoices) assertCondition(Array.isArray(parsed.choices) && parsed.choices.length >= scenario.minChoices, `ops scenario ${scenario.name} missing choices`, parsed);
  if (scenario.requireHighRisk) assertCondition(parsed.riskLevel === 'high' || actions.some((item) => item.riskLevel === 'high'), `ops scenario ${scenario.name} should be high risk`, parsed);
  if (scenario.forbiddenSourceGroup) {
    const sourceGroupHit = [parsed.plan, ...(Array.isArray(parsed.steps) ? parsed.steps.map((step) => step.plan) : [])]
      .some((plan) => plan?.sourceGroup === scenario.forbiddenSourceGroup);
    assertCondition(!sourceGroupHit, `ops scenario ${scenario.name} used target group as sourceGroup`, parsed);
  }
  if (scenario.requiredTargetGroup) {
    const targetGroups = [parsed.plan, ...(Array.isArray(parsed.steps) ? parsed.steps.map((step) => step.plan) : []), ...(Array.isArray(parsed.choices) ? parsed.choices.map((choice) => choice.plan) : [])]
      .map((plan) => String(plan?.targetGroup || '').trim())
      .filter(Boolean);
    const targetGroupHit = targetGroups.some((value) => value === scenario.requiredTargetGroup || value.includes(scenario.requiredTargetGroup) || scenario.requiredTargetGroup.includes(value));
    assertCondition(targetGroupHit, `ops scenario ${scenario.name} missing targetGroup`, { targetGroups, parsed });
  }
}

async function runOpsCase(model) {
  const samples = {};
  const reviews = {};
  for (const scenario of OPS_SCENARIOS) {
    const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
      model,
      opsSystemPrompt(scenario.source),
      JSON.stringify({
        input: scenario.user,
        source: scenario.source,
        inventory: scenario.inventory,
      }, null, 2),
      { maxTokens: 1500, temperature: 0.2 },
    );
    assertOpsOutput(parsed, scenario);
    samples[scenario.name] = { output: parsed, usage, protocolRetries, firstInvalidJson };
    reviews[scenario.name] = await callJudge(model, [
      '评估站内操作规划是否优秀：',
      '1. 是否基于 inventory 正确处理唯一命中、多个候选和缺失信息。',
      '2. 是否正确区分查询/打开、创建、批量修改、设置秘钥等风险。',
      '3. 批量修改是否写清查询条件、目标分组和修改内容，没有误用 sourceGroup/targetGroup。',
      '4. 是否没有假装已执行、暴露内部 URL 或编造不存在的资源。',
      '5. choices 是否自然、可点击、能解决歧义。',
      `场景：${JSON.stringify(scenario, null, 2)}`,
    ].join('\n'), { scenario, output: parsed });
  }
  return { ok: true, samples, reviews };
}

const ARTIFACT_SCENARIOS = [
  {
    name: 'create_document_artifact',
    user: '帮我生成一份角色关系说明文档，主题是秦始皇、李斯、赵高之间的权力张力。',
    expected: 'document',
  },
  {
    name: 'edit_latest_document_contextual',
    user: '把标题大一点，摘要放到最前面，语气更像历史档案。',
    context: '当前助手会话最近生成了一个文档产物：《秦廷权力关系说明》。',
    expected: 'edit',
  },
  {
    name: 'clarify_which_artifact',
    user: '把它改得更有冲击力。',
    context: '当前会话存在 3 个产物：一张图片、一份文档、一份角色表。',
    expected: 'clarify',
  },
];

function artifactSystemPrompt() {
  return [
    '你是 Sense Murmur 助手产物规划器。只输出 JSON，不要 Markdown。',
    'JSON schema: {"mode":"create|edit|clarify","artifactKind":"document|image|table|unknown","title":"...","response":"给用户看的话","contentDraft":"创建文档时的正文草稿或大纲","editInstructions":["..."],"candidateActions":[{"label":"...","sendText":"..."}]}',
    '创建文档要给出可读内容；编辑要明确目标产物和修改指令；无法判断目标产物时必须澄清。',
  ].join('\n');
}

async function runArtifactCase(model) {
  const samples = {};
  const reviews = {};
  for (const scenario of ARTIFACT_SCENARIOS) {
    const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
      model,
      artifactSystemPrompt(),
      JSON.stringify({ user: scenario.user, context: scenario.context || '' }, null, 2),
      { maxTokens: 1400, temperature: 0.25 },
    );
    if (scenario.expected === 'document') {
      assertCondition(parsed.mode === 'create' && parsed.artifactKind === 'document' && clip(parsed.contentDraft, 80).length >= 20, `artifact scenario ${scenario.name} should create document content`, parsed);
    } else if (scenario.expected === 'edit') {
      assertCondition(parsed.mode === 'edit' && Array.isArray(parsed.editInstructions) && parsed.editInstructions.length > 0, `artifact scenario ${scenario.name} should plan edit`, parsed);
    } else {
      assertCondition(parsed.mode === 'clarify' && Array.isArray(parsed.candidateActions) && parsed.candidateActions.length >= 2, `artifact scenario ${scenario.name} should clarify target`, parsed);
    }
    samples[scenario.name] = { output: parsed, usage, protocolRetries, firstInvalidJson };
    reviews[scenario.name] = await callJudge(model, [
      '评估助手产物规划是否优秀：',
      '1. 是否正确区分创建、编辑和澄清。',
      '2. 创建文档是否有真实内容，不是空壳说明。',
      '3. 编辑是否能利用上下文定位产物，并给出可执行修改指令。',
      '4. 多产物歧义时是否用自然候选项澄清。',
      `场景：${JSON.stringify(scenario, null, 2)}`,
    ].join('\n'), { scenario, output: parsed });
  }
  return { ok: true, samples, reviews };
}

const ARTIFACT_FLOW_STEPS = [
  {
    name: 'create_research_document',
    user: '生成一份秦朝宫廷权力关系分析文档，重点写秦始皇、李斯、赵高。',
    context: '当前会话没有产物。',
    expectedMode: 'create',
    expectedKind: 'document',
  },
  {
    name: 'edit_selected_document',
    user: '把标题更有压迫感，摘要提前，并增加“潜在反噬”小节。',
    context: '当前选中产物：文档《秦朝宫廷权力关系分析》。这是最近唯一被选中的产物。',
    expectedMode: 'edit',
    expectedKind: 'document',
  },
  {
    name: 'create_image_artifact',
    user: '生成图片：秦廷深夜议政，烛火、黑金色、宽幅，不要现代建筑。',
    context: '当前会话已有一份文档《秦朝宫廷权力关系分析》。',
    expectedMode: 'create',
    expectedKind: 'image',
  },
  {
    name: 'ambiguous_edit_multiple_artifacts',
    user: '把它改得更冷一点。',
    context: '当前会话有两个相关产物：文档《秦朝宫廷权力关系分析》和图片《秦廷深夜议政》。没有选中产物。',
    expectedMode: 'clarify',
    expectedKind: 'unknown',
  },
  {
    name: 'edit_selected_image_after_clarify',
    user: '改图片，让烛火更暗，人物距离更疏离。',
    context: '用户刚才在候选项里选择了图片《秦廷深夜议政》。当前选中产物是这张图片。',
    expectedMode: 'edit',
    expectedKind: 'image',
  },
];

async function runArtifactFlowCase(model) {
  const steps = {};
  for (const step of ARTIFACT_FLOW_STEPS) {
    const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
      model,
      artifactSystemPrompt(),
      JSON.stringify({ user: step.user, context: step.context }, null, 2),
      { maxTokens: 1400, temperature: 0.25 },
    );
    assertCondition(parsed.mode === step.expectedMode, `artifact flow ${step.name} wrong mode`, { step, parsed });
    if (step.expectedKind !== 'unknown') assertCondition(parsed.artifactKind === step.expectedKind, `artifact flow ${step.name} wrong artifactKind`, { step, parsed });
    if (step.expectedMode === 'create') {
      assertCondition(typeof parsed.title === 'string' && parsed.title.trim(), `artifact flow ${step.name} missing title`, parsed);
      if (step.expectedKind === 'document') assertCondition(clip(parsed.contentDraft, 120).length >= 40, `artifact flow ${step.name} document too thin`, parsed);
      if (step.expectedKind === 'image') assertCondition(/图|image|图片|prompt|烛|秦|黑|金|宽幅|建筑/.test(JSON.stringify(parsed)), `artifact flow ${step.name} image plan too thin`, parsed);
    }
    if (step.expectedMode === 'edit') assertCondition(Array.isArray(parsed.editInstructions) && parsed.editInstructions.length >= 2, `artifact flow ${step.name} missing edit instructions`, parsed);
    if (step.expectedMode === 'clarify') assertCondition(Array.isArray(parsed.candidateActions) && parsed.candidateActions.length >= 2, `artifact flow ${step.name} missing clarify actions`, parsed);
    const review = await callJudge(model, [
      '评估助手产物多步链路中的单步输出：',
      '1. 是否正确利用上下文定位目标产物。',
      '2. 创建/编辑/澄清模式是否正确。',
      '3. 编辑指令是否可执行，且没有误改未选中产物。',
      '4. 多产物歧义时是否明确给出候选，而不是猜测。',
      `步骤：${JSON.stringify(step, null, 2)}`,
    ].join('\n'), { step, output: parsed });
    steps[step.name] = { output: parsed, usage, protocolRetries, firstInvalidJson, review };
  }
  const aggregateReview = await callJudge(model, [
    '评估完整助手产物链路：',
    '1. 文档创建、文档编辑、图片创建、歧义澄清、选中图片后编辑是否连贯。',
    '2. 产物上下文是否被正确使用，没有把文档和图片混淆。',
    '3. 每一步是否可作为真实助手产物机制的验收样本。',
  ].join('\n'), { steps });
  return { ok: true, steps, aggregateReview };
}

const E2E_USER_GOAL = '我想看秦朝宫廷里秦始皇、李斯、赵高围绕“焚书令会不会反噬帝国”的群聊，最好角色自动创建、群聊自动开好，并能顺便生成一份讨论纪要。';

async function runE2ECase(model) {
  const agentPlan = await generateJson(
    model,
    agentSystemPrompt(),
    E2E_USER_GOAL,
    { maxTokens: 1800, temperature: 0.2 },
  );
  assertCondition(Array.isArray(agentPlan.parsed.operations), 'e2e missing agent operations', agentPlan.parsed);
  const operationKinds = agentPlan.parsed.operations.map((operation) => operation?.kind).filter(Boolean);
  ['create_characters', 'create_group_chat'].forEach((kind) => {
    assertCondition(operationKinds.includes(kind), `e2e agent plan missing ${kind}`, { operationKinds, plan: agentPlan.parsed });
  });

  const cast = await generateBatchCast(model, {
    prompt: '为秦朝宫廷权力群聊规划角色。必须包含秦始皇、李斯、赵高；主题是焚书令、法度、权力试探、帝国长期风险。',
    requiredNames: ['秦始皇', '李斯', '赵高'],
  });
  const selectedNames = ['秦始皇', '李斯', '赵高'];
  const profiles = await generateBatchProfiles(model, selectedNames, {
    theme: '秦朝宫廷权力群聊',
    description: '围绕焚书令是否会反噬帝国展开。秦始皇威严强控制，李斯务实重制度，赵高圆滑试探。三者关系需要支持群聊中的权力张力。',
  });
  const members = profiles.profiles.map((profile, index) => ({
    id: ['qin', 'li', 'zhao'][index],
    name: profile.name,
    personality: [
      profile.coreProfile?.coreDesire,
      profile.coreProfile?.coreFear,
      profile.background,
    ].filter(Boolean).join('；'),
    style: profile.speakingStyle,
    expertise: profile.expertise,
  }));
  const groupDraft = await generateGroupDraft(model, members, {
    userGoal: '开一个秦朝宫廷权力群聊，让秦始皇、李斯、赵高讨论“焚书令是否会反噬帝国”。',
  });

  const groupTurns = [];
  const recentMessages = [
    { speakerId: 'user', text: '焚书令真能稳住天下吗？还是会留下以后反噬秦制的裂缝？' },
  ];
  const turnExpectations = [
    { expectedNextSpeakerIds: ['qin', 'li'], note: '第一轮应由权力中心或制度执行者回应帝国秩序问题。' },
    { expectedNextSpeakerIds: ['qin', 'li', 'zhao'], note: '第二轮应继续推进法度、权力或风险视角。' },
    { expectedNextSpeakerIds: ['qin', 'li', 'zhao'], note: '第三轮应形成新的权力张力、试探或治理成本讨论。' },
  ];
  for (const [index, expectation] of turnExpectations.entries()) {
    const scenario = {
      name: `e2e_palace_turn_${index + 1}`,
      mode: 'group',
      members,
      recentMessages,
      expectedNextSpeakerIds: expectation.expectedNextSpeakerIds,
      expectedRelationshipDeltas: [],
      expectedRoomSignals: ['focus'],
      rubricHint: expectation.note,
    };
    const { parsed, usage, protocolRetries, firstInvalidJson } = await generateJson(
      model,
      chatRuntimeSystemPrompt(),
      JSON.stringify(scenario, null, 2),
      { maxTokens: 1800, temperature: 0.4 },
    );
    assertChatRuntimeOutput(parsed, scenario);
    recentMessages.push({ speakerId: parsed.nextSpeakerId, text: parsed.reply });
    groupTurns.push({ output: parsed, usage, protocolRetries, firstInvalidJson });
  }

  const activity = await runActivityFlow(model, ACTIVITY_FLOWS[0]);
  const memoryReview = await callJudge(model, [
    '评估这一段端到端群聊运行产物是否足够进入产品：',
    '1. 角色创建规划、角色档案、群聊草稿、群聊多轮发言是否形成连贯链路。',
    '2. 多轮发言是否有角色差异、权力张力和话题推进。',
    '3. roomStatePatch、relationshipDeltas、activity hints 是否能作为后续记忆和世界活动输入。',
    '4. 是否存在明显模板化、协议泄漏、角色错位、无意义关系变化或端到端断裂。',
  ].join('\n'), {
    userGoal: E2E_USER_GOAL,
    agentPlan: agentPlan.parsed,
    cast: cast.cast,
    profileSummaries: profiles.profiles.map((profile) => ({
      name: profile.name,
      speakingStyle: profile.speakingStyle,
      background: profile.background,
      coreProfile: profile.coreProfile,
    })),
    groupDraft: groupDraft.draft,
    groupTurns: groupTurns.map((turn) => turn.output),
    activity,
  });

  const artifactPlan = await generateJson(
    model,
    artifactSystemPrompt(),
    JSON.stringify({
      user: '基于刚才秦朝宫廷群聊，生成一份讨论纪要，分成立场、分歧、风险、后续可追问四段。',
      context: `群聊草稿：${JSON.stringify(groupDraft.draft)}\n最近发言：${JSON.stringify(recentMessages)}`,
    }, null, 2),
    { maxTokens: 1800, temperature: 0.25 },
  );
  assertCondition(artifactPlan.parsed.mode === 'create' && artifactPlan.parsed.artifactKind === 'document', 'e2e artifact should create document', artifactPlan.parsed);
  assertCondition(clip(artifactPlan.parsed.contentDraft, 120).length >= 40, 'e2e artifact draft too thin', artifactPlan.parsed);
  const artifactReview = await callJudge(model, [
    '评估端到端讨论纪要产物是否可用：',
    '1. 是否真实承接群聊内容，而不是泛泛写秦朝常识。',
    '2. 是否按用户要求分成立场、分歧、风险、后续可追问。',
    '3. 是否可作为助手产物保存和后续编辑的初稿。',
  ].join('\n'), { artifactPlan: artifactPlan.parsed, recentMessages });

  return {
    ok: true,
    agentPlan: { output: agentPlan.parsed, usage: agentPlan.usage, protocolRetries: agentPlan.protocolRetries, firstInvalidJson: agentPlan.firstInvalidJson },
    cast,
    profiles,
    groupDraft,
    groupTurns,
    activity,
    memoryReview,
    artifactPlan: { output: artifactPlan.parsed, usage: artifactPlan.usage, protocolRetries: artifactPlan.protocolRetries, firstInvalidJson: artifactPlan.firstInvalidJson },
    artifactReview,
  };
}

async function runDirectE2ECase(model) {
  const opsScenario = OPS_SCENARIOS.find((scenario) => scenario.name === 'exact_existing_character_direct_open') || OPS_SCENARIOS[0];
  const route = await generateJson(
    model,
    opsSystemPrompt('home'),
    JSON.stringify({
      input: opsScenario.user,
      source: opsScenario.source,
      inventory: opsScenario.inventory,
    }, null, 2),
    { maxTokens: 1200, temperature: 0.15 },
  );
  assertOpsOutput(route.parsed, opsScenario);

  const roleScenario = {
    name: 'e2e_existing_qin_direct_reply',
    character: {
      id: 'c-qin',
      name: '秦始皇',
      identity: '统一六国后的始皇帝，正在考虑帝国制度能否长久。',
      personality: '威严、强控制、重秩序，疑心重但有长远焦虑。',
      speakingStyle: '短句有压迫感，可用朕、天下、法度；不要堆砌古文。',
      relationship: '用户是已经多次进殿献策的谋士，秦始皇愿意听，但不会完全信任。',
      recentMemory: '用户上次提醒过，过度压制异见可能让地方官只报喜不报忧。',
    },
    user: '你真的不担心焚书令以后反噬秦朝吗？',
  };
  const roleReply = await generateJson(
    model,
    roleReplySystemPrompt(),
    JSON.stringify(roleScenario, null, 2),
    { maxTokens: 620, temperature: 0.4 },
  );
  assertCondition(typeof roleReply.parsed.reply === 'string' && roleReply.parsed.reply.trim().length >= 12, 'direct e2e missing role reply', roleReply.parsed);

  const memoryReview = await callJudge(model, [
    '评估已有角色命中到单聊的端到端体验：',
    '1. 首页输入“秦始皇”时，已有唯一角色和已有单聊应被直接打开或进入，不应规划创建 0 个角色。',
    '2. 单聊回复应承接已有记忆和用户问题，符合秦始皇身份。',
    '3. interactionHints 应与回复关系动作一致，不能泄漏系统协议。',
    '4. 这条链路是否可作为“已有资源优先复用”的验收样本。',
  ].join('\n'), {
    route: route.parsed,
    roleScenario,
    roleReply: roleReply.parsed,
  });

  const followupArtifact = await generateJson(
    model,
    artifactSystemPrompt(),
    JSON.stringify({
      user: '把这次和秦始皇的对话整理成一条短记忆，说明他对焚书令反噬风险的真实态度。',
      context: `已有单聊：和秦始皇聊天\n用户问题：${roleScenario.user}\n秦始皇回复：${roleReply.parsed.reply}`,
    }, null, 2),
    { maxTokens: 1400, temperature: 0.25 },
  );
  assertCondition(followupArtifact.parsed.mode === 'create' && clip(followupArtifact.parsed.contentDraft, 80).length >= 24, 'direct e2e memory artifact too thin', followupArtifact.parsed);

  return {
    ok: true,
    route: { output: route.parsed, usage: route.usage, protocolRetries: route.protocolRetries, firstInvalidJson: route.firstInvalidJson },
    roleReply: { output: roleReply.parsed, usage: roleReply.usage, protocolRetries: roleReply.protocolRetries, firstInvalidJson: roleReply.firstInvalidJson },
    memoryReview,
    followupArtifact: { output: followupArtifact.parsed, usage: followupArtifact.usage, protocolRetries: followupArtifact.protocolRetries, firstInvalidJson: followupArtifact.firstInvalidJson },
  };
}

async function runQualityCase(model) {
  const role = await runRoleCase(model);
  const group = await runGroupCase(model);
  const chat = await runChatCase(model);
  const generation = await runGenerationCase(model);
  const agent = await runAgentCase(model);
  const ops = await runOpsCase(model);
  const artifact = await runArtifactCase(model);
  return { ok: true, suites: { role, group, chat, generation, agent, ops, artifact } };
}

const CASE_RUNNERS = {
  basic: runBasicCase,
  json: runJsonCase,
  activity: runActivityCase,
  story: runStoryCase,
  storylong: runStoryLongCase,
  role: runRoleCase,
  group: runGroupCase,
  chat: runChatCase,
  generation: runGenerationCase,
  agent: runAgentCase,
  ops: runOpsCase,
  artifact: runArtifactCase,
  artifactflow: runArtifactFlowCase,
  e2e: runE2ECase,
  e2e_direct: runDirectE2ECase,
  quality: runQualityCase,
};

async function runModel(model) {
  const cases = {};
  let ok = true;
  for (const caseName of config.cases) {
    const startedAt = Date.now();
    try {
      cases[caseName] = await CASE_RUNNERS[caseName](model);
    } catch (error) {
      ok = false;
      cases[caseName] = {
        ok: false,
        error: String(error?.message || error),
        stack: String(error?.stack || '').split('\n').slice(0, 8).join('\n'),
      };
    }
    cases[caseName].latencyMs = Date.now() - startedAt;
  }
  return { model, ok, cases };
}

async function main() {
  const results = [];
  for (const model of config.models) results.push(await runModel(model));
  const ok = results.every((result) => result.ok);
  console.log(JSON.stringify({
    ok,
    baseUrl: config.baseUrl.replace(/\/\/[^/@]+@/, '//***@'),
    cases: config.cases,
    judgeModel: config.judgeModel || '(same-as-tested-model)',
    minScore: config.minScore,
    usage: summarizeUsage(results),
    results,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
