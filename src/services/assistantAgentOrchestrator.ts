import type {
  AssistantAgentChangePlan,
  AssistantAgentPatch,
  AssistantAgentPatchSet,
  AssistantArtifactFile,
  AssistantArtifactItem,
  AssistantArtifactKind,
} from '../types/assistantArtifact';
import type { Message } from '../types/message';
import type { APIConfig } from '../types/settings';
import { generateResponse } from './aiClient';

const VALID_ARTIFACT_KINDS = new Set<AssistantArtifactKind>(['document', 'code', 'diagram', 'html', 'table', 'json', 'text']);
const MAX_RECENT_MESSAGES = 12;
const MAX_ARTIFACTS_IN_REGISTRY = 120;
const MAX_PATCHES = 20;
const MAX_CONTENT_CHARS = 120_000;
const MAX_FILE_CONTENT_CHARS = 120_000;

function safeJsonParse(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
    if (fenced) return JSON.parse(fenced);
    const objectMatch = trimmed.match(/\{[\s\S]*}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);
    throw new Error('Agent returned invalid JSON');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numberInRange(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function artifactCurrentVersion(item: AssistantArtifactItem) {
  return item.versions.find((version) => version.id === item.currentVersionId) || item.versions[item.versions.length - 1] || null;
}

function artifactRegistry(artifacts: AssistantArtifactItem[]) {
  return artifacts
    .filter((artifact) => artifact.deletedAt == null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_ARTIFACTS_IN_REGISTRY)
    .map((artifact) => {
      const currentVersion = artifactCurrentVersion(artifact);
      return {
        id: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
        summary: artifact.summary || '',
        language: artifact.language || null,
        versionCount: artifact.versions.length,
        currentVersionId: artifact.currentVersionId,
        currentVersionSummary: currentVersion?.changeSummary || artifact.summary || '',
        files: currentVersion?.files?.map((file) => ({
          id: file.id,
          path: file.path,
          language: file.language || null,
          size: file.content.length,
        })) || [],
        updatedAt: artifact.updatedAt,
      };
    });
}

function recentConversation(messages: Message[]) {
  return messages
    .filter((message) => !message.isDeleted && message.type !== 'system' && message.type !== 'event' && message.content.trim())
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => ({
      id: message.id,
      role: message.type === 'ai' ? 'assistant' : 'user',
      content: message.content.slice(0, 6000),
    }));
}

function buildPlannerPrompt() {
  return [
    '你是企业级 Agent Orchestrator 的 Intent Planner。',
    '你只负责决策，不生成产物正文。必须只输出严格 JSON，不要 Markdown，不要解释。',
    '',
    '你会收到：用户最近对话、完整产物注册表、交互焦点、用户最新输入。',
    '不要假设用户会说“流程图/文件/产物”。用户可能只说“字体大了”“这个太挤”“把它改成横向”。',
    '必须结合交互焦点、当前可见/最近触达/当前活跃产物、产物注册表来判断。',
    '',
    '规则：',
    '1. 普通问答输出 intent=chat，并在 assistantMessage 中直接给出用户可见回答。',
    '2. 需要创建产物输出 intent=create。',
    '3. 需要修改一个或多个现有产物输出 intent=update，scope.artifactIds 可以是多个。',
    '4. 目标不明确且会影响多个候选时输出 intent=clarify，并给 clarificationQuestion。',
    '5. 不允许猜 target。低置信度、多候选、缺少焦点时必须 clarify。',
    '6. Planner 不输出产物正文，不输出 patch；只有 intent=chat/clarify 时 assistantMessage 才作为用户可见回复。',
    '',
    '输出格式：',
    '{"intent":"chat|create|update|clarify","assistantMessage":"普通聊天或澄清时的可见回复","scope":{"targetMode":"single|multi|workspace|selection|unknown","artifactIds":[]},"operations":[{"kind":"style_change|content_edit|structure_edit|create|export|review|other","instruction":"..."}],"requiresConfirmation":false,"clarificationQuestion":"","confidence":0.0,"rationale":"..."}',
  ].join('\n');
}

function normalizePlan(raw: unknown, existingArtifacts: AssistantArtifactItem[]): AssistantAgentChangePlan {
  const existingIds = new Set(existingArtifacts.filter((item) => item.deletedAt == null).map((item) => item.id));
  if (!isRecord(raw)) {
    return {
      intent: 'chat',
      assistantMessage: '',
      scope: { targetMode: 'unknown', artifactIds: [] },
      operations: [],
      requiresConfirmation: false,
      confidence: 0,
    };
  }
  const intent = raw.intent === 'create' || raw.intent === 'update' || raw.intent === 'clarify' ? raw.intent : 'chat';
  const rawScope = isRecord(raw.scope) ? raw.scope : {};
  const targetMode = ['single', 'multi', 'workspace', 'selection', 'unknown'].includes(String(rawScope.targetMode))
    ? rawScope.targetMode as AssistantAgentChangePlan['scope']['targetMode']
    : 'unknown';
  const artifactIds = Array.isArray(rawScope.artifactIds)
    ? rawScope.artifactIds.filter((id): id is string => typeof id === 'string' && existingIds.has(id))
    : [];
  const operations = Array.isArray(raw.operations) ? raw.operations.flatMap((item): AssistantAgentChangePlan['operations'] => {
    if (!isRecord(item)) return [];
    const kind = ['style_change', 'content_edit', 'structure_edit', 'create', 'export', 'review', 'other'].includes(String(item.kind))
      ? item.kind as AssistantAgentChangePlan['operations'][number]['kind']
      : 'other';
    const instruction = text(item.instruction, 500);
    return instruction ? [{ kind, instruction }] : [];
  }) : [];
  const normalizedIntent = intent === 'update' && artifactIds.length === 0 ? 'clarify' : intent;
  return {
    intent: normalizedIntent,
    assistantMessage: text(raw.assistantMessage, 8000),
    scope: { targetMode, artifactIds },
    operations,
    requiresConfirmation: Boolean(raw.requiresConfirmation) || normalizedIntent === 'clarify',
    clarificationQuestion: text(raw.clarificationQuestion, 300),
    confidence: numberInRange(raw.confidence, 0),
    rationale: text(raw.rationale, 500),
  };
}

function buildWriterPrompt() {
  return [
    '你是企业级 Artifact Patch Writer。',
    '必须只输出严格 JSON，不要 Markdown，不要解释。',
    '根据 changePlan、用户输入、最近对话、产物注册表和必要的当前版本正文，生成可提交的 patch set。',
    '',
    '规则：',
    '1. 只对 changePlan.scope.artifactIds 中的现有产物执行 update。',
    '2. create 可以创建新产物。',
    '3. update 必须带 artifactId 和 baseVersionId。',
    '4. content 必须是完整新版本，不能是说明、占位、省略或“参考上文”。',
    '5. 多文件产物可以输出 files；单文件/文档可以只输出 content。',
    '6. 不确定时 assistantMessage 说明无法安全修改，patches 为空。',
    '',
    '输出格式：',
    '{"assistantMessage":"面向用户的简短结果说明","patches":[{"action":"create|update","artifactId":"...","kind":"document|code|diagram|html|table|json|text","title":"...","summary":"...","language":"...","content":"完整内容","files":[{"id":"...","path":"...","language":"...","content":"完整文件内容"}],"baseVersionId":"...","changeSummary":"..."}]}',
  ].join('\n');
}

function normalizeKind(value: unknown): AssistantArtifactKind | null {
  if (typeof value !== 'string') return null;
  return VALID_ARTIFACT_KINDS.has(value as AssistantArtifactKind) ? value as AssistantArtifactKind : null;
}

function normalizeFiles(value: unknown): AssistantArtifactFile[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files = value.flatMap((item, index): AssistantArtifactFile[] => {
    if (!isRecord(item)) return [];
    const path = text(item.path, 240);
    const content = text(item.content, MAX_FILE_CONTENT_CHARS);
    if (!path || !content) return [];
    return [{
      id: text(item.id, 120) || `file-${index + 1}`,
      path,
      content,
      language: text(item.language, 32) || null,
    }];
  });
  return files.length ? files : undefined;
}

function normalizePatchSet(raw: unknown): AssistantAgentPatchSet {
  if (!isRecord(raw)) return { assistantMessage: '没有可提交的产物变更。', patches: [] };
  const patches = Array.isArray(raw.patches) ? raw.patches.slice(0, MAX_PATCHES).flatMap((item): AssistantAgentPatch[] => {
    if (!isRecord(item)) return [];
    const action = item.action === 'update' ? 'update' : item.action === 'create' ? 'create' : null;
    const kind = normalizeKind(item.kind);
    const content = text(item.content, MAX_CONTENT_CHARS);
    const files = normalizeFiles(item.files);
    if (!action || !kind || (!content && !files?.length)) return [];
    return [{
      action,
      artifactId: text(item.artifactId, 160) || null,
      kind,
      title: text(item.title, 120) || '未命名产物',
      summary: text(item.summary, 240),
      language: text(item.language, 32) || null,
      content,
      files,
      baseVersionId: text(item.baseVersionId, 200) || null,
      changeSummary: text(item.changeSummary, 240),
    }];
  }) : [];
  return {
    assistantMessage: text(raw.assistantMessage, 800) || (patches.length ? '已完成产物变更。' : '没有可提交的产物变更。'),
    patches,
  };
}

export function validateAssistantAgentPatchSet(params: {
  patchSet: AssistantAgentPatchSet;
  plan: AssistantAgentChangePlan;
  existingArtifacts: AssistantArtifactItem[];
}) {
  const existingById = new Map(params.existingArtifacts.filter((item) => item.deletedAt == null).map((item) => [item.id, item]));
  const allowedUpdateIds = new Set(params.plan.scope.artifactIds);
  const validPatches = params.patchSet.patches.filter((patch) => {
    if (!VALID_ARTIFACT_KINDS.has(patch.kind)) return false;
    if (!patch.content && !patch.files?.length) return false;
    if (patch.action === 'create') return params.plan.intent === 'create';
    if (patch.action !== 'update' || !patch.artifactId) return false;
    const target = existingById.get(patch.artifactId);
    if (!target || !allowedUpdateIds.has(patch.artifactId)) return false;
    if (patch.baseVersionId && patch.baseVersionId !== target.currentVersionId) return false;
    return true;
  });
  return {
    assistantMessage: params.patchSet.assistantMessage,
    patches: validPatches,
  } satisfies AssistantAgentPatchSet;
}

export async function planAssistantAgentChange(params: {
  api: APIConfig;
  chatId: string;
  messages: Message[];
  userMessage: Message;
  existingArtifacts: AssistantArtifactItem[];
  interactionFocus?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  const payload = {
    chatId: params.chatId,
    userMessage: { id: params.userMessage.id, content: params.userMessage.content },
    recentConversation: recentConversation(params.messages),
    artifactRegistry: artifactRegistry(params.existingArtifacts),
    interactionFocus: params.interactionFocus || {},
  };
  const raw = await generateResponse(
    params.api,
    buildPlannerPrompt(),
    [{ role: 'user', content: JSON.stringify(payload) }],
    undefined,
    {
      responseFormat: 'json',
      maxTokens: 1600,
      signal: params.signal,
      aiUsage: {
        type: 'assistant_chat',
        label: '助手Agent意图规划',
        scope: 'chat',
        resourceId: params.chatId,
      },
    },
  );
  return normalizePlan(safeJsonParse(raw), params.existingArtifacts);
}

export async function writeAssistantAgentPatchSet(params: {
  api: APIConfig;
  chatId: string;
  messages: Message[];
  userMessage: Message;
  plan: AssistantAgentChangePlan;
  existingArtifacts: AssistantArtifactItem[];
  signal?: AbortSignal;
}) {
  const targetArtifacts = params.existingArtifacts
    .filter((artifact) => params.plan.scope.artifactIds.includes(artifact.id))
    .map((artifact) => {
      const currentVersion = artifactCurrentVersion(artifact);
      return {
        ...artifactRegistry([artifact])[0],
        currentVersionContent: currentVersion?.content || '',
        currentVersionFiles: currentVersion?.files || [],
      };
    });
  const payload = {
    chatId: params.chatId,
    userMessage: { id: params.userMessage.id, content: params.userMessage.content },
    recentConversation: recentConversation(params.messages),
    changePlan: params.plan,
    artifactRegistry: artifactRegistry(params.existingArtifacts),
    targetArtifacts,
  };
  const raw = await generateResponse(
    params.api,
    buildWriterPrompt(),
    [{ role: 'user', content: JSON.stringify(payload) }],
    undefined,
    {
      responseFormat: 'json',
      maxTokens: 8192,
      signal: params.signal,
      aiUsage: {
        type: 'assistant_chat',
        label: '助手Agent补丁生成',
        scope: 'chat',
        resourceId: params.chatId,
      },
    },
  );
  return validateAssistantAgentPatchSet({
    patchSet: normalizePatchSet(safeJsonParse(raw)),
    plan: params.plan,
    existingArtifacts: params.existingArtifacts,
  });
}
