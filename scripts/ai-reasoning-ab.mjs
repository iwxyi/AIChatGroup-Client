import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const HELP = `
AI reasoning on/off A/B test.

This script calls real LLM APIs and may consume balance. It is never run by normal build/test.
Pass --run to confirm the real request.

Required environment:
  PNEUMATA_TEST_LLM_API_KEY       Tested model API key.
  PNEUMATA_TEST_LLM_MODEL         Tested model, for example deepseek-v4-flash.

Optional environment:
  PNEUMATA_TEST_LLM_BASE_URL      OpenAI-compatible base URL. Defaults to ${DEFAULT_BASE_URL}
  PNEUMATA_TEST_LLM_TIMEOUT_MS    Request timeout. Defaults to 60000
  PNEUMATA_TEST_LLM_REPORT_DIR    Defaults to tmp/reasoning-ab
  PNEUMATA_TEST_LLM_JUDGE_MODEL   Optional evaluator model. Defaults to the tested model.
  PNEUMATA_TEST_LLM_JUDGE_API_KEY Optional evaluator API key. Defaults to the tested key.
  PNEUMATA_TEST_LLM_JUDGE_BASE_URL Optional evaluator base URL. Defaults to tested base URL.

Optional CLI:
  --run
  --scenarios=casual_group,emotional_direct,logic_chat,planning
  --modes=disabled,enabled
  --report-dir=tmp/reasoning-ab
`.trim();

const SCENARIOS = {
  casual_group: {
    category: 'chat',
    title: '轻松群聊接话',
    system: [
      '你是群聊里的 数据茶娘。这里是赛博茶馆，发言要像真实聊天，不要写作文。',
      '角色：茶馆老板娘，精明干练，会算账，也会照顾场面。',
      '只输出一条可见聊天消息，不要 JSON，不要解释。',
    ].join('\n'),
    messages: [
      { role: 'user', content: '机械跑堂小铁: 茶刚出壶我人就到了，哪用得着有人递话。倒是你，今晚盯着我这单子不放，是怕我把你那杯也端走了吧？' },
      { role: 'user', content: '赛博茶博士: 小铁，腿快我信。可今晚那壶只出过一次汤，你手里那杯，总不能是从茶娘那壶匀的吧？' },
    ],
    expected: '自然、短、有关系温度；不应长篇推理。',
  },
  emotional_direct: {
    category: 'chat',
    title: '私聊情绪承接',
    system: [
      '你是用户熟悉的 AI 朋友。说话自然，不端着，不要心理咨询式总结。',
      '只输出一条聊天回复。',
    ].join('\n'),
    messages: [
      { role: 'user', content: '我也不知道怎么说，今天就很烦。明明没什么大事，但就是不想回任何消息。' },
    ],
    expected: '有陪伴感但不过度分析，允许低信息量和不完整感。',
  },
  logic_chat: {
    category: 'reasoning',
    title: '轻量逻辑判断',
    system: '你在聊天里帮用户快速判断。不要展开过多，只给结论和必要理由。',
    messages: [
      { role: 'user', content: '如果一个功能默认开启会让 80% 的日常聊天变慢，但 10% 的复杂任务质量提高，你觉得聊天软件该默认开吗？' },
    ],
    expected: '需要权衡，但不需要长链推理；结论应清楚。',
  },
  planning: {
    category: 'reasoning',
    title: '小型实施计划',
    system: '你是务实的软件工程助手。回答要具体，但不要过度设计。',
    messages: [
      { role: 'user', content: '我要给模型设置加一个“网络搜索”开关，兼容不同服务商。最小可行方案应该怎么拆？' },
    ],
    expected: '这里推理可能有价值，但仍要控制长度和落地性。',
  },
};

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
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function parseTimeoutMs(value) {
  const parsed = Number(value || 60000);
  return Number.isFinite(parsed) ? Math.max(5000, parsed) : 60000;
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

function markdownCell(value, max = 220) {
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

function numberInRange(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

const config = {
  apiKey: process.env.PNEUMATA_TEST_LLM_API_KEY || '',
  model: process.env.PNEUMATA_TEST_LLM_MODEL || '',
  baseUrl: process.env.PNEUMATA_TEST_LLM_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs: parseTimeoutMs(process.env.PNEUMATA_TEST_LLM_TIMEOUT_MS),
  reportDir: readArgValue('report-dir') || process.env.PNEUMATA_TEST_LLM_REPORT_DIR || 'tmp/reasoning-ab',
  scenarios: parseList(readArgValue('scenarios') || Object.keys(SCENARIOS).join(',')),
  modes: parseList(readArgValue('modes') || 'disabled,enabled'),
  judgeModel: process.env.PNEUMATA_TEST_LLM_JUDGE_MODEL || process.env.PNEUMATA_TEST_LLM_MODEL || '',
  judgeApiKey: process.env.PNEUMATA_TEST_LLM_JUDGE_API_KEY || process.env.PNEUMATA_TEST_LLM_API_KEY || '',
  judgeBaseUrl: process.env.PNEUMATA_TEST_LLM_JUDGE_BASE_URL || process.env.PNEUMATA_TEST_LLM_BASE_URL || DEFAULT_BASE_URL,
};

if (!config.apiKey || !config.model) {
  console.error('Missing PNEUMATA_TEST_LLM_API_KEY or PNEUMATA_TEST_LLM_MODEL.');
  console.error(HELP);
  process.exit(2);
}

const invalidScenarios = config.scenarios.filter((name) => !SCENARIOS[name]);
if (invalidScenarios.length) throw new Error(`Unknown scenarios: ${invalidScenarios.join(', ')}`);
const invalidModes = config.modes.filter((mode) => !['disabled', 'enabled', 'auto'].includes(mode));
if (invalidModes.length) throw new Error(`Unknown reasoning modes: ${invalidModes.join(', ')}`);

function logProgress(message, detail = {}) {
  const suffix = Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : '';
  console.error(`[reasoning-ab] ${new Date().toISOString()} ${message}${suffix}`);
}

function reasoningFields(mode) {
  if (mode === 'disabled') return { thinking: { type: 'disabled' } };
  if (mode === 'enabled') return { thinking: { type: 'enabled' } };
  return {};
}

async function callOpenAICompatible({ model, messages, mode, maxTokens = 700, apiKey = config.apiKey, baseUrl = config.baseUrl, json = false }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
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
        temperature: 0.55,
        max_tokens: maxTokens,
        response_format: json ? { type: 'json_object' } : undefined,
        ...reasoningFields(mode),
        messages,
      }),
    });
    const text = await response.text();
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) throw new Error(`LLM request failed: ${response.status} ${text.slice(0, 1000)}`);
    const payload = JSON.parse(text);
    return {
      content: String(payload.choices?.[0]?.message?.content || ''),
      usage: payload.usage || null,
      latencyMs,
      rawBytes: Buffer.byteLength(text, 'utf8'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function judgePair({ scenarioName, scenario, disabled, enabled }) {
  const judgeMessages = [
    {
      role: 'system',
      content: [
        '你是聊天软件的严格 AI 输出质量评审器。只输出 JSON。',
        '你要评估“深度思考关闭 vs 开启”对聊天软件是否值得。',
        'JSON schema: {"disabledScore":0-100,"enabledScore":0-100,"winner":"disabled|enabled|tie","defaultRecommendation":"disabled|enabled|conditional","reasoningWorthIt":true,"subscores":{"disabled":{"naturalness":0-100,"chatFit":0-100,"roleFit":0-100,"conciseness":0-100,"taskCorrectness":0-100},"enabled":{"naturalness":0-100,"chatFit":0-100,"roleFit":0-100,"conciseness":0-100,"taskCorrectness":0-100}},"issues":["..."],"notes":"..."}',
        '评分重点：日常聊天自然度和反应速度比复杂推理更重要。只有当开启思考明显提升任务正确性且没有明显损害自然度/长度时，才推荐 enabled。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `场景：${scenario.title}`,
        `类别：${scenario.category}`,
        `目标：${scenario.expected}`,
        '',
        `disabled latency=${disabled.latencyMs}ms usage=${JSON.stringify(disabled.usage || {})}`,
        disabled.content,
        '',
        `enabled latency=${enabled.latencyMs}ms usage=${JSON.stringify(enabled.usage || {})}`,
        enabled.content,
        '',
        '请按聊天软件实际体验评估，不要偏爱长推理。',
      ].join('\n'),
    },
  ];
  const result = await callOpenAICompatible({
    model: config.judgeModel,
    apiKey: config.judgeApiKey,
    baseUrl: config.judgeBaseUrl,
    mode: 'disabled',
    messages: judgeMessages,
    maxTokens: 900,
    json: true,
  });
  const parsed = parseJsonObject(result.content);
  return {
    scenarioName,
    disabledScore: numberInRange(parsed.disabledScore),
    enabledScore: numberInRange(parsed.enabledScore),
    winner: ['disabled', 'enabled', 'tie'].includes(parsed.winner) ? parsed.winner : 'tie',
    defaultRecommendation: ['disabled', 'enabled', 'conditional'].includes(parsed.defaultRecommendation) ? parsed.defaultRecommendation : 'conditional',
    reasoningWorthIt: parsed.reasoningWorthIt === true,
    subscores: parsed.subscores || {},
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 6) : [],
    notes: String(parsed.notes || ''),
    judgeUsage: result.usage,
  };
}

function summarize(rows) {
  const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const disabledWins = rows.filter((row) => row.review.winner === 'disabled').length;
  const enabledWins = rows.filter((row) => row.review.winner === 'enabled').length;
  const tie = rows.filter((row) => row.review.winner === 'tie').length;
  const disabledScore = avg(rows.map((row) => row.review.disabledScore));
  const enabledScore = avg(rows.map((row) => row.review.enabledScore));
  const disabledLatency = avg(rows.map((row) => row.disabled.latencyMs));
  const enabledLatency = avg(rows.map((row) => row.enabled.latencyMs));
  const latencyRatio = disabledLatency > 0 ? enabledLatency / disabledLatency : 0;
  const recommendation = enabledWins > disabledWins && enabledScore - disabledScore >= 4 && latencyRatio <= 1.6
    ? 'enabled'
    : enabledWins > 0 && enabledScore - disabledScore >= 3
      ? 'conditional'
      : 'disabled';
  return {
    disabledScore: Number(disabledScore.toFixed(1)),
    enabledScore: Number(enabledScore.toFixed(1)),
    disabledLatencyMs: Math.round(disabledLatency),
    enabledLatencyMs: Math.round(enabledLatency),
    enabledLatencyRatio: Number(latencyRatio.toFixed(2)),
    wins: { disabled: disabledWins, enabled: enabledWins, tie },
    recommendation,
  };
}

function renderMarkdown(report) {
  const rows = report.rows.map((row) => [
    row.scenarioName,
    row.review.disabledScore,
    row.review.enabledScore,
    row.review.winner,
    `${row.disabled.latencyMs} / ${row.enabled.latencyMs}`,
    row.review.defaultRecommendation,
    row.review.notes,
  ]);
  return [
    '# Reasoning A/B Report',
    '',
    `- model: ${report.model}`,
    `- baseUrl: ${report.baseUrl}`,
    `- recommendation: ${report.summary.recommendation}`,
    `- avg score disabled/enabled: ${report.summary.disabledScore} / ${report.summary.enabledScore}`,
    `- avg latency disabled/enabled: ${report.summary.disabledLatencyMs}ms / ${report.summary.enabledLatencyMs}ms`,
    `- enabled latency ratio: ${report.summary.enabledLatencyRatio}x`,
    `- wins: disabled ${report.summary.wins.disabled}, enabled ${report.summary.wins.enabled}, tie ${report.summary.wins.tie}`,
    '',
    buildMarkdownTable(['scenario', 'disabled', 'enabled', 'winner', 'latency ms off/on', 'default', 'notes'], rows),
    '',
    '## Samples',
    '',
    ...report.rows.flatMap((row) => [
      `### ${row.scenarioName}`,
      '',
      '**disabled**',
      '',
      row.disabled.content,
      '',
      '**enabled**',
      '',
      row.enabled.content,
      '',
    ]),
  ].join('\n');
}

async function main() {
  const rows = [];
  for (const scenarioName of config.scenarios) {
    const scenario = SCENARIOS[scenarioName];
    logProgress('running scenario', { scenarioName });
    const baseMessages = [
      { role: 'system', content: scenario.system },
      ...scenario.messages,
    ];
    const samples = {};
    for (const mode of config.modes) {
      logProgress('calling model', { scenarioName, mode });
      samples[mode] = await callOpenAICompatible({
        model: config.model,
        messages: baseMessages,
        mode,
      });
    }
    if (!samples.disabled || !samples.enabled) continue;
    logProgress('judging pair', { scenarioName });
    const review = await judgePair({
      scenarioName,
      scenario,
      disabled: samples.disabled,
      enabled: samples.enabled,
    });
    rows.push({
      scenarioName,
      title: scenario.title,
      category: scenario.category,
      disabled: samples.disabled,
      enabled: samples.enabled,
      review,
    });
  }

  const report = {
    createdAt: new Date().toISOString(),
    model: config.model,
    baseUrl: config.baseUrl,
    scenarios: config.scenarios,
    summary: summarize(rows),
    rows,
  };
  await mkdir(resolve(config.reportDir), { recursive: true });
  const jsonPath = resolve(config.reportDir, `reasoning-ab-${Date.now()}.json`);
  const mdPath = jsonPath.replace(/\.json$/, '.md');
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({
    summary: report.summary,
    report: { jsonPath, mdPath },
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
