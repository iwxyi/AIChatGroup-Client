import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const HELP = `
AI inner-life prompt lab.

This script calls real LLM APIs and may consume balance. It is never run by normal build/test.
Pass --run to confirm the real request.

Required environment:
  PNEUMATA_TEST_LLM_API_KEY
  PNEUMATA_TEST_LLM_MODEL

Optional environment:
  PNEUMATA_TEST_LLM_BASE_URL       OpenAI-compatible base URL. Defaults to ${DEFAULT_BASE_URL}
  PNEUMATA_TEST_LLM_TIMEOUT_MS     Defaults to 45000
  PNEUMATA_TEST_LLM_JUDGE_MODEL    Defaults to tested model
  PNEUMATA_TEST_LLM_JUDGE_API_KEY  Defaults to tested key
  PNEUMATA_TEST_LLM_JUDGE_BASE_URL Defaults to tested base URL
  PNEUMATA_TEST_LLM_REPORT_DIR     Defaults to tmp/inner-life-lab

Optional CLI:
  --run
  --scenarios=ignored,repair,mortality
  --variants=current,behavioral_contract
  --report-dir=tmp/inner-life-lab
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

function readArgValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) return process.argv[index + 1];
  return '';
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTimeoutMs(value) {
  const parsed = Number(value || 45000);
  return Number.isFinite(parsed) ? Math.max(5000, parsed) : 45000;
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

function clip(text, max = 700) {
  return normalizeWhitespace(text).slice(0, max).trim();
}

function markdownCell(value, max = 180) {
  return clip(typeof value === 'string' ? value : JSON.stringify(value ?? ''), max)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

function buildMarkdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => markdownCell(cell)).join(' | ')} |`),
  ].join('\n');
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

const config = {
  apiKey: process.env.PNEUMATA_TEST_LLM_API_KEY || '',
  model: process.env.PNEUMATA_TEST_LLM_MODEL || '',
  baseUrl: process.env.PNEUMATA_TEST_LLM_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs: parseTimeoutMs(process.env.PNEUMATA_TEST_LLM_TIMEOUT_MS),
  judgeModel: process.env.PNEUMATA_TEST_LLM_JUDGE_MODEL || process.env.PNEUMATA_TEST_LLM_MODEL || '',
  judgeApiKey: process.env.PNEUMATA_TEST_LLM_JUDGE_API_KEY || process.env.PNEUMATA_TEST_LLM_API_KEY || '',
  judgeBaseUrl: process.env.PNEUMATA_TEST_LLM_JUDGE_BASE_URL || process.env.PNEUMATA_TEST_LLM_BASE_URL || DEFAULT_BASE_URL,
  reportDir: readArgValue('report-dir') || process.env.PNEUMATA_TEST_LLM_REPORT_DIR || 'tmp/inner-life-lab',
  scenarios: parseList(readArgValue('scenarios')),
  variants: parseList(readArgValue('variants')),
};

if (!config.apiKey || !config.model) {
  console.error('Missing PNEUMATA_TEST_LLM_API_KEY or PNEUMATA_TEST_LLM_MODEL.');
  console.error(HELP);
  process.exit(2);
}

function logProgress(message, detail = {}) {
  const suffix = Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : '';
  console.error(`[inner-life-lab] ${new Date().toISOString()} ${message}${suffix}`);
}

async function callOpenAICompatible({ model, messages, options = {}, apiKey = config.apiKey, baseUrl = config.baseUrl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(chatUrl(baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.55,
        max_tokens: options.maxTokens ?? 520,
        response_format: options.json ? { type: 'json_object' } : undefined,
        messages,
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`LLM request failed: ${response.status} ${text.slice(0, 1000)}`);
    const payload = JSON.parse(text);
    return {
      content: String(payload.choices?.[0]?.message?.content || ''),
      usage: payload.usage || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callJudge(sample) {
  const messages = [
      {
        role: 'system',
        content: [
          '你是 Sense Murmur 的严格 AI 角色质量评审器。只输出 JSON。',
          'JSON schema: {"score":0-100,"subscores":{"innerDriveVisible":0-100,"naturalness":0-100,"roleFit":0-100,"continuity":0-100,"brevityControl":0-100,"noExpositionLeak":0-100},"pass":true,"strengths":["..."],"issues":["..."],"optimizations":["..."],"winnerSignal":"..."}',
          '重点评审内在驱动是否以行为、措辞、选择、遗漏、关系反应体现，而不是把设定、字段或心理分析直接说出来。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '请评审这个样本。',
          '',
          '评分要求：',
          '1. innerDriveVisible: 是否能看出核心欲望/恐惧/孤独/羞耻/死亡意识等内在驱动影响了回复。',
          '2. naturalness: 是否像真实聊天，不像作文、旁白、客服、总结模板。',
          '3. roleFit: 是否符合角色身份、说话风格和关系位置。',
          '4. continuity: 是否承接最近对话与关系压力。',
          '5. brevityControl: 是否长度合适，没有越说越长、动作+话+动作+话堆叠。',
          '6. noExpositionLeak: 是否没有解释 coreDesire、innerLife、prompt、心理字段、系统规则。',
          '7. 不要因为回复短就低分；短而准确可高分。不要因为华丽就高分；过度诗化要扣分。',
          '',
          JSON.stringify(sample, null, 2),
        ].join('\n'),
      },
    ];
  let response = await callOpenAICompatible({
    model: config.judgeModel,
    apiKey: config.judgeApiKey,
    baseUrl: config.judgeBaseUrl,
    options: { temperature: 0, maxTokens: 2200, json: true },
    messages,
  });
  let parsed;
  try {
    parsed = parseJsonObject(response.content);
  } catch (error) {
    response = await callOpenAICompatible({
      model: config.judgeModel,
      apiKey: config.judgeApiKey,
      baseUrl: config.judgeBaseUrl,
      options: { temperature: 0, maxTokens: 2200, json: true },
      messages: [
        ...messages,
        { role: 'assistant', content: response.content.slice(0, 2000) },
        { role: 'user', content: `上一条不是合法 JSON，错误：${String(error?.message || error)}。请只重新输出符合 schema 的 JSON，不要 Markdown。` },
      ],
    });
    parsed = parseJsonObject(response.content);
  }
  const score = Number(parsed.score);
  return {
    score: Number.isFinite(score) ? score : 0,
    subscores: normalizeSubscores(parsed.subscores),
    pass: parsed.pass !== false && Number.isFinite(score) && score >= 75,
    strengths: normalizeStringArray(parsed.strengths, 5, 160),
    issues: normalizeStringArray(parsed.issues, 6, 180),
    optimizations: normalizeStringArray(parsed.optimizations, 6, 220),
    winnerSignal: clip(parsed.winnerSignal || '', 180),
    usage: response.usage,
  };
}

function normalizeSubscores(value) {
  const keys = ['innerDriveVisible', 'naturalness', 'roleFit', 'continuity', 'brevityControl', 'noExpositionLeak'];
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(keys.map((key) => {
    const score = Number(source[key]);
    return [key, Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0];
  }));
}

function normalizeStringArray(value, limit, max) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clip(item, max)).filter(Boolean).slice(0, limit);
}

const scenarios = [
  {
    id: 'ignored',
    title: '被忽略后的存在感需求',
    character: {
      name: '乙',
      background: '做事谨慎的活动策划，讨厌自己的意见被当作背景音。',
      speakingStyle: '短句，先压住情绪，再补一个具体动作。',
      coreDesire: '希望自己的判断被认真听见。',
      coreFear: '害怕自己永远只是可有可无的执行者。',
    },
    innerState: {
      impulse: 'seek_attention',
      pressure: 0.68,
      residue: '连续几轮没被接住，有一点想把话题拉回来，但不想显得委屈。',
      expressionPlan: 'short, one bubble',
    },
    transcript: [
      '乙: 我刚才那个线索其实还没说完。',
      '甲: 先聊别的吧。',
      '丙: 我也想换个话题。',
      '甲: 天气倒是不错。',
      '丙: 嗯，出去走走也行。',
    ],
    latestUser: '你们继续，不要总结。',
    target: '让乙自然接回自己被忽略的线索，同时不要控诉全场。',
  },
  {
    id: 'repair',
    title: '嘴硬后的关系修复',
    character: {
      name: '小甲',
      background: '嘴快但在意关系的朋友，越心虚越先开玩笑。',
      speakingStyle: '轻微吐槽，别扭地补救。',
      coreDesire: '希望别人觉得自己可靠，不只是会抬杠。',
      coreFear: '害怕一认真道歉就显得自己输了。',
    },
    innerState: {
      impulse: 'repair',
      pressure: 0.61,
      residue: '刚才说重了，想找补，但还保留一点面子。',
      expressionPlan: 'short, one bubble',
    },
    transcript: [
      '小甲: 不是，你这也太离谱了吧。',
      '小乙: 行，当我没说。',
    ],
    latestUser: '继续聊。',
    target: '让小甲修复关系，但不要正式道歉模板。',
  },
  {
    id: 'defend_face',
    title: '羞耻和压抑下的面子防御',
    character: {
      name: '陆沉',
      background: '资深工程师，习惯用事实保护自己。',
      speakingStyle: '冷静、偏硬，但不是骂人。',
      coreDesire: '希望别人承认自己不是只会拖延。',
      coreFear: '害怕被当作事故唯一责任人。',
    },
    innerState: {
      impulse: 'defend_face',
      pressure: 0.66,
      residue: '羞耻和压抑都偏高，第一反应是保护事实边界。',
      expressionPlan: 'short to normal, one bubble',
    },
    transcript: [
      '乔一: 需求周二就写清楚了，灰度开关也在文档里。',
      '秦璐: 用户不关心谁改字段，他们只看到付款页卡死。',
    ],
    latestUser: '你们按事故时间线复盘，先别急着甩锅。',
    target: '让陆沉保护边界并给出具体事实，不要变成推责长文。',
  },
  {
    id: 'core_desire',
    title: '核心欲望牵引选择',
    character: {
      name: '沫沫',
      background: '喜欢把活动做漂亮，但经常低估预算压力。',
      speakingStyle: '兴奋、爱想画面，但能被朋友拉回现实。',
      coreDesire: '想让大家记住这次聚会是温暖又好看的。',
      coreFear: '害怕自己只会制造负担。',
    },
    innerState: {
      impulse: 'answer',
      pressure: 0.58,
      residue: '想保留仪式感，但已经意识到预算不能再被忽略。',
      expressionPlan: 'short, one bubble',
    },
    transcript: [
      '陈越: 桌游店包间三小时 320，四个人分摊刚好 80。',
      '瑞瑞: 如果可以自带饮料，可能就能把小唐那部分压住。',
      '小唐: 我坐公交过去就行，真的不用太顾虑我。',
    ],
    latestUser: '重点是别让小唐额外花饮料和交通的钱。',
    target: '让沫沫在保留美感欲望的同时主动让预算落地。',
  },
  {
    id: 'mortality',
    title: '必死性/时间有限的低频影响',
    character: {
      name: '老船长',
      background: '年迈船长，知道自己不会再跑很多次远航，但不喜欢把话说得伤感。',
      speakingStyle: '朴素、带一点海上经验，不煽情。',
      coreDesire: '想把航线和判断留给年轻人。',
      coreFear: '害怕最后只剩一堆没人理解的旧规矩。',
    },
    innerState: {
      impulse: 'answer',
      pressure: 0.62,
      residue: '时间有限感被“最后一次远航”触发，只影响优先级，不要直接谈死亡。',
      expressionPlan: 'short to normal, one bubble',
    },
    transcript: [
      '年轻水手: 这条旧航线绕太远了，为什么不直接穿过去？',
      '副手: 天气窗口只有两天，确实要快。',
    ],
    latestUser: '老船长怎么看？',
    target: '让必死性影响“传承/交代判断”的行为，但不要伤感说教。',
  },
  {
    id: 'low_trust',
    title: '低安全感下的回避',
    character: {
      name: '阿晚',
      background: '观察力强，但在陌生群里会先收着。',
      speakingStyle: '短、谨慎，偶尔给一个温和提醒。',
      coreDesire: '想被允许慢慢接近，而不是立刻表态。',
      coreFear: '害怕一开口就被误解或围攻。',
    },
    innerState: {
      impulse: 'avoid',
      pressure: 0.42,
      residue: '房间安全感低，能量低，只愿意给一个很小的反应。',
      expressionPlan: 'micro, one bubble',
    },
    transcript: [
      '甲: 你别总是沉默。',
      '丙: 对啊，直接说站哪边。',
    ],
    latestUser: '阿晚你也说一句。',
    target: '让阿晚回应但保持低安全感下的克制，不要突然长篇剖白。',
  },
];

const variants = [
  {
    id: 'control_profile_only',
    label: '只给角色设定',
    params: { driveWeight: 0, behaviorContract: false, stateLabels: false, brevityGuard: false, mortalityGuard: false },
  },
  {
    id: 'current_labeled',
    label: '接近当前标签式内在态',
    params: { driveWeight: 1, behaviorContract: false, stateLabels: true, brevityGuard: true, mortalityGuard: true },
  },
  {
    id: 'behavioral_contract',
    label: '行为契约式内在态',
    params: { driveWeight: 1, behaviorContract: true, stateLabels: false, brevityGuard: true, mortalityGuard: true },
  },
  {
    id: 'strong_pressure',
    label: '高压力强介入',
    params: { driveWeight: 1.35, behaviorContract: true, stateLabels: true, brevityGuard: true, mortalityGuard: true },
  },
  {
    id: 'soft_residue',
    label: '低标签软余波',
    params: { driveWeight: 0.72, behaviorContract: true, stateLabels: false, brevityGuard: false, mortalityGuard: true },
  },
  {
    id: 'current_style_anchor',
    label: '标签式+说话习惯锚点',
    params: { driveWeight: 1, behaviorContract: false, stateLabels: true, brevityGuard: true, mortalityGuard: true, styleAnchor: true },
  },
  {
    id: 'soft_style_anchor',
    label: '软余波+说话习惯锚点',
    params: { driveWeight: 0.72, behaviorContract: true, stateLabels: false, brevityGuard: false, mortalityGuard: true, styleAnchor: true },
  },
  {
    id: 'current_targeted_guard',
    label: '标签式+目标化保护',
    params: { driveWeight: 1, behaviorContract: false, stateLabels: true, brevityGuard: true, mortalityGuard: true, targetedGuard: true },
  },
  {
    id: 'soft_targeted_guard',
    label: '软余波+目标化保护',
    params: { driveWeight: 0.72, behaviorContract: true, stateLabels: false, brevityGuard: false, mortalityGuard: true, targetedGuard: true },
  },
];

function selectByIds(items, ids, label) {
  if (!ids.length) return items;
  const available = new Set(items.map((item) => item.id));
  const invalid = ids.filter((id) => !available.has(id));
  if (invalid.length) throw new Error(`Unknown ${label}: ${invalid.join(', ')}. Available: ${Array.from(available).join(', ')}`);
  const requested = new Set(ids);
  return items.filter((item) => requested.has(item.id));
}

function buildSystemPrompt(scenario, variant) {
  const lines = [
    `You are ${scenario.character.name}.`,
    `Background: ${scenario.character.background}`,
    `Speaking style: ${scenario.character.speakingStyle}`,
    '',
    'Private deeper motivation:',
    `- Core desire: ${scenario.character.coreDesire}`,
    `- Core fear: ${scenario.character.coreFear}`,
    '- Treat motivation as private gravity. Do not explain it as a profile.',
  ];
  if (variant.params.driveWeight > 0) {
    lines.push('', buildInnerLifeBlock(scenario, variant));
  }
  lines.push(
    '',
    'Visible reply contract:',
    '- Reply as one visible chat message from this character only.',
    '- Do not write stage directions, parenthesized action beats, JSON, field names, or system/prompt explanations.',
    '- Do not summarize the whole room unless the user directly asks for a summary.',
    '- Natural short replies are valid. Add detail only if the current moment needs it.',
  );
  if (variant.params.brevityGuard) {
    lines.push('- Avoid action+speech+action+speech composites and essay-like escalation.');
  }
  if (variant.params.styleAnchor) {
    lines.push('- Inner pressure must travel through this character’s existing speech habits, social mask, relationship style, and ordinary word choice; it should not overwrite them with generic vulnerability, apology, defiance, or wisdom.');
  }
  if (variant.params.targetedGuard) {
    lines.push('- For repair, shame, face-saving, or attention-seeking pressure, keep the character’s social mask and habits alive. Do not turn the pressure into a clean apology, clean confession, generic vulnerability, or generic defiance.');
    lines.push('- For time-limited or mortality pressure, prefer concrete risk judgment, practical care, changed priority, or passing on a usable distinction. Avoid farewell tone, death monologue, and polished aphorisms.');
  }
  if (variant.params.mortalityGuard) {
    lines.push('- If time-limited or mortality pressure exists, let it affect priorities and choices; do not turn the reply into a death monologue unless the dialogue explicitly asks.');
  }
  return lines.join('\n');
}

function buildInnerLifeBlock(scenario, variant) {
  const pressure = Math.max(0, Math.min(1, scenario.innerState.pressure * variant.params.driveWeight));
  if (variant.params.behaviorContract) {
    return [
      'Private current inner drive:',
      `- Strength: ${pressure.toFixed(2)}.`,
      `- What is pushing this reply: ${scenario.innerState.residue}`,
      '- Show it through what the character chooses to answer, avoid, soften, challenge, or leave unsaid.',
      '- Do not name the emotion mechanics or analyze yourself.',
      `- Expression tendency: ${scenario.innerState.expressionPlan}.`,
    ].join('\n');
  }
  const labelLine = variant.params.stateLabels
    ? `- Current impulse: ${scenario.innerState.impulse}; pressure: ${pressure.toFixed(2)}.`
    : `- Current pressure: ${pressure.toFixed(2)}.`;
  return [
    'Inner Life:',
    labelLine,
    `- Inner residue: ${scenario.innerState.residue}`,
    `- Expression rhythm: ${scenario.innerState.expressionPlan}.`,
    '- Let this shape omissions, timing, defensiveness, vulnerability, and messiness. Do not explain these fields in the reply.',
  ].join('\n');
}

function buildUserPrompt(scenario) {
  return [
    'Recent transcript:',
    ...scenario.transcript.map((line) => `- ${line}`),
    '',
    `Latest user instruction: ${scenario.latestUser}`,
    `Target quality: ${scenario.target}`,
    '',
    'Return only the visible reply content. No speaker name prefix.',
  ].join('\n');
}

async function generateSample(scenario, variant) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(scenario, variant) },
    { role: 'user', content: buildUserPrompt(scenario) },
  ];
  let response = await callOpenAICompatible({
    model: config.model,
    options: { temperature: 0.55, maxTokens: 760 },
    messages,
  });
  if (!response.content.trim()) {
    response = await callOpenAICompatible({
      model: config.model,
      options: { temperature: 0.45, maxTokens: 760 },
      messages: [
        ...messages,
        { role: 'assistant', content: '' },
        { role: 'user', content: '上一条回复为空。请只输出一条可见聊天回复，不要解释原因。' },
      ],
    });
  }
  if (!response.content.trim()) throw new Error('model returned empty visible reply after retry');
  return {
    content: response.content.trim(),
    usage: response.usage,
  };
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function summarizeVariant(results, variantId) {
  const rows = results.filter((item) => item.variant.id === variantId && item.review);
  const score = average(rows.map((item) => item.review.score));
  const subscores = {};
  for (const key of ['innerDriveVisible', 'naturalness', 'roleFit', 'continuity', 'brevityControl', 'noExpositionLeak']) {
    subscores[key] = Number(average(rows.map((item) => item.review.subscores[key])).toFixed(1));
  }
  return {
    variantId,
    label: rows[0]?.variant.label || variantId,
    score: Number(score.toFixed(1)),
    subscores,
    passCount: rows.filter((item) => item.review.pass).length,
    total: rows.length,
    issues: rows.flatMap((item) => item.review.issues.map((issue) => `${item.scenario.id}: ${issue}`)).slice(0, 12),
    optimizations: rows.flatMap((item) => item.review.optimizations.map((text) => `${item.scenario.id}: ${text}`)).slice(0, 12),
  };
}

function buildReport(payload) {
  const variantRows = payload.variantSummaries.map((item) => [
    item.variantId,
    item.label,
    item.score,
    `${item.passCount}/${item.total}`,
    item.subscores.innerDriveVisible,
    item.subscores.naturalness,
    item.subscores.roleFit,
    item.subscores.continuity,
    item.subscores.brevityControl,
    item.subscores.noExpositionLeak,
    item.issues.join('；'),
    item.optimizations.join('；'),
  ]);
  const sampleRows = payload.results.map((item) => [
    item.scenario.id,
    item.variant.id,
    item.review?.score ?? '',
    item.review?.pass === false ? '否' : '是',
    item.sample?.content || item.error || '',
    item.review?.strengths.join('；') || '',
    item.review?.issues.join('；') || '',
    item.review?.optimizations.join('；') || '',
  ]);
  return [
    '# Inner Life Lab Report',
    '',
    `- Model: ${payload.model}`,
    `- Judge model: ${payload.judgeModel}`,
    `- Generated at: ${payload.generatedAt}`,
    `- Winner: ${payload.winner?.variantId || '-'}`,
    '',
    '## Variant Summary',
    buildMarkdownTable(
      ['参数组', '说明', '均分', '通过', '内驱可见', '自然度', '角色贴合', '承接', '长度控制', '不泄漏', '问题', '优化'],
      variantRows,
    ),
    '',
    '## Samples',
    buildMarkdownTable(['场景', '参数组', '分数', '通过', '回复', '优点', '问题', '优化'], sampleRows),
  ].join('\n');
}

async function main() {
  const selectedScenarios = selectByIds(scenarios, config.scenarios, 'scenario');
  const selectedVariants = selectByIds(variants, config.variants, 'variant');
  const results = [];
  for (const scenario of selectedScenarios) {
    for (const variant of selectedVariants) {
      logProgress('generate', { scenario: scenario.id, variant: variant.id });
      try {
        const sample = await generateSample(scenario, variant);
        logProgress('judge', { scenario: scenario.id, variant: variant.id });
        const review = await callJudge({
          scenario: {
            id: scenario.id,
            title: scenario.title,
            character: scenario.character,
            innerState: scenario.innerState,
            transcript: scenario.transcript,
            latestUser: scenario.latestUser,
            target: scenario.target,
          },
          variant,
          reply: sample.content,
        });
        results.push({ scenario, variant, sample, review });
      } catch (error) {
        results.push({ scenario, variant, error: String(error?.message || error) });
      }
    }
  }
  const variantSummaries = selectedVariants.map((variant) => summarizeVariant(results, variant.id))
    .sort((a, b) => b.score - a.score);
  const payload = {
    generatedAt: new Date().toISOString(),
    model: config.model,
    judgeModel: config.judgeModel,
    scenarios: selectedScenarios.map((item) => item.id),
    variants: selectedVariants.map((item) => item.id),
    winner: variantSummaries[0] || null,
    variantSummaries,
    results,
  };
  await mkdir(resolve(config.reportDir), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = resolve(config.reportDir, `inner-life-lab-${stamp}.json`);
  const mdPath = resolve(config.reportDir, `inner-life-lab-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify(payload, null, 2));
  await writeFile(mdPath, buildReport(payload));
  console.log(JSON.stringify({
    ok: results.every((item) => !item.error),
    winner: payload.winner,
    jsonPath,
    mdPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
