import type {
  AssistantAgentChangePlan,
  AssistantAgentLocalFileContext,
  AssistantAgentMediaTask,
  AssistantAgentPatch,
  AssistantAgentPatchSet,
  AssistantArtifactFile,
  AssistantArtifactItem,
  AssistantArtifactKind,
} from '../types/assistantArtifact';
import type { Message } from '../types/message';
import type { APIConfig } from '../types/settings';
import { generateResponse } from './aiClient';

const VALID_ARTIFACT_KINDS = new Set<AssistantArtifactKind>(['document', 'code', 'diagram', 'html', 'table', 'json', 'text', 'image']);
const MAX_RECENT_MESSAGES = 12;
const MAX_IMAGE_REFERENCES = 48;
const MAX_ARTIFACTS_IN_REGISTRY = 120;
const MAX_PATCHES = 20;
const MAX_MEDIA_TASKS = 9;
const SUPPORTED_IMAGE_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
const SUPPORTED_IMAGE_SIZES = new Set(['1K', '2K', '4K']);
const MAX_CONTENT_CHARS = 120_000;
const MAX_FILE_CONTENT_CHARS = 120_000;
const MAX_ASSISTANT_VISIBLE_MESSAGE_CHARS = 12_000;
const MAX_AGENT_REQUEST_CHARS = 420_000;
const MAX_TOTAL_TARGET_CONTEXT_CHARS = 180_000;
const MAX_SINGLE_TARGET_CONTEXT_CHARS = 80_000;
const MAX_LOCAL_WORKSPACE_FILES_IN_REGISTRY = 160;
const MAX_LOCAL_FILE_CONTEXT_CHARS = 120_000;

export interface CompactImageAttachmentRef {
  id: string;
  messageId: string;
  refId: string;
  mimeType?: string;
  altText: string;
  caption?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  urlKind: 'data' | 'remote' | 'local' | 'unknown';
}

interface ImageAttachmentRef extends CompactImageAttachmentRef {
  url: string;
}

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

function compactContextText(value: string, max: number) {
  if (value.length <= max) {
    return { content: value, truncated: false, originalLength: value.length };
  }
  if (max <= 1200) {
    return {
      content: value.slice(0, max),
      truncated: true,
      originalLength: value.length,
    };
  }
  const headLength = Math.floor(max * 0.65);
  const tailLength = max - headLength - 220;
  return {
    content: [
      value.slice(0, headLength),
      `\n\n[上下文已裁剪：原始长度 ${value.length} 字符，中间内容未发送给模型。若修改需要完整正文，必须拒绝生成 patch 并要求用户缩小范围。]\n\n`,
      value.slice(Math.max(headLength, value.length - Math.max(0, tailLength))),
    ].join(''),
    truncated: true,
    originalLength: value.length,
  };
}

function stringifyAgentPayload(payload: Record<string, unknown>, label: string) {
  const content = JSON.stringify(payload);
  if (content.length > MAX_AGENT_REQUEST_CHARS) {
    throw new Error(`${label} payload is too large (${content.length} chars, limit ${MAX_AGENT_REQUEST_CHARS}). Reduce artifact context before calling the model.`);
  }
  return content;
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
      imageAttachments: buildCompactImageAttachmentRefs(message),
    }));
}

function getImageUrlKind(url: string): CompactImageAttachmentRef['urlKind'] {
  if (url.startsWith('data:image/')) return 'data';
  if (/^https?:\/\//i.test(url)) return 'remote';
  if (url.startsWith('blob:') || url.startsWith('filesystem:')) return 'local';
  return 'unknown';
}

function compactImageAttachmentRef(ref: ImageAttachmentRef): CompactImageAttachmentRef {
  return {
    id: ref.id,
    messageId: ref.messageId,
    refId: ref.refId,
    mimeType: ref.mimeType,
    altText: ref.altText,
    caption: ref.caption,
    width: ref.width,
    height: ref.height,
    sizeBytes: ref.sizeBytes,
    urlKind: ref.urlKind,
  };
}

function imageAttachmentRefsWithUrls(message: Message): ImageAttachmentRef[] {
  return (message.metadata?.attachments || [])
    .filter((attachment) => attachment.kind === 'image' && attachment.status === 'ready' && attachment.url)
    .slice(0, 6)
    .map((attachment) => ({
      id: attachment.id,
      messageId: message.id,
      refId: `${message.id}:${attachment.id}`,
      url: attachment.url as string,
      mimeType: attachment.mimeType,
      altText: attachment.altText,
      caption: attachment.caption,
      width: attachment.width,
      height: attachment.height,
      sizeBytes: attachment.sizeBytes,
      urlKind: getImageUrlKind(attachment.url as string),
    }));
}

export function buildCompactImageAttachmentRefs(message: Message) {
  return imageAttachmentRefsWithUrls(message).map(compactImageAttachmentRef);
}

function buildImageReferenceRegistry(messages: Message[]) {
  const registry = new Map<string, ImageAttachmentRef>();
  for (const message of messages) {
    for (const ref of imageAttachmentRefsWithUrls(message)) {
      registry.set(ref.refId, ref);
      registry.set(ref.id, ref);
    }
  }
  return registry;
}

export function buildCompactImageReferenceRegistry(messages: Message[]) {
  return messages
    .filter((message) => !message.isDeleted)
    .sort((left, right) => right.timestamp - left.timestamp)
    .flatMap((message) => buildCompactImageAttachmentRefs(message).map((ref) => ({
      ...ref,
      messageRole: message.type === 'ai' ? 'assistant' : message.type === 'user' || message.type === 'god' ? 'user' : 'other',
      messageContentPreview: message.content.trim().slice(0, 240),
      messageTimestamp: message.timestamp,
    })))
    .slice(0, MAX_IMAGE_REFERENCES);
}

function buildPlannerPrompt() {
  return [
    '你是企业级 Agent Orchestrator 的 Intent Planner。',
    '你只负责决策，不生成产物正文。必须只输出严格 JSON，不要 Markdown，不要解释。',
    '',
    '你会收到：用户最近对话、图片引用注册表、完整产物注册表、交互焦点、用户最新输入。',
    '你也会收到 toolCapabilities，表示本会话当前允许使用哪些底层能力。',
    '不要假设用户会说“流程图/文件/产物”。用户可能只说“字体大了”“这个太挤”“把它改成横向”。',
    '必须结合交互焦点、当前可见/最近触达/当前活跃产物、图片引用注册表、产物注册表来判断。',
    '',
    '规则：',
    '1. 普通问答输出 intent=chat，并在 assistantMessage 中直接给出用户可见回答。',
    '1a. 如果用户需要最新消息、实时事实、网页资料、外部来源核验，且 toolCapabilities.webSearch=true，必须输出 intent=search，并给 searchQuery。不要在 assistantMessage 中声称无法联网。',
    '1b. 如果需要搜索但 toolCapabilities.webSearch=false，输出 intent=chat，并说明当前未开启搜索能力。',
    '1c. 如果用户要求处理本地授权文件夹里的文件，而 toolCapabilities.localWorkspace=true，但用户没有明确文件、目录、选择范围或交互焦点，必须输出 intent=clarify；不要假装已经读取文件。',
    '1d. 如果需要本地文件但 toolCapabilities.localWorkspace=false，输出 intent=chat，并说明当前未授权本地工作区。',
    '1e. 如果用户明确要求读取、总结、转换、比较或基于本地文件生成产物，且 localWorkspaceFileRegistry 中能定位到文件，必须在 localFilePaths 中列出要读取的文件相对路径。不要选择目录；不要选择未出现在 registry 中的路径。',
    '1f. 如果 interactionFocus.selectedLocalWorkspaceFiles 非空，优先使用这些用户显式选择的文件；除非用户明确要求别的文件，否则不要改选。',
    '2. 需要创建产物输出 intent=create。',
    '2a. 用户要求生成图片、海报、插画、照片、图像素材，或要求基于上一张/刚才那张/某张参考图生成变体时，也属于 intent=create；Planner 只规划，不输出图片提示词正文。',
    '3. 需要修改一个或多个现有产物输出 intent=update，scope.artifactIds 可以是多个。',
    '4. 目标不明确且会影响多个候选时输出 intent=clarify，并给 clarificationQuestion。',
    '5. 不允许猜 target。低置信度、多候选、缺少焦点时必须 clarify。',
    '6. Planner 不输出产物正文，不输出 patch；只有 intent=chat/clarify 时 assistantMessage 才作为用户可见回复。',
    '',
    '输出格式：',
    '{"intent":"chat|create|update|clarify|search","assistantMessage":"普通聊天或澄清时的可见回复","searchQuery":"搜索时使用的具体查询；非搜索为空","localFilePaths":[{"directoryId":"...","path":"相对路径"}],"scope":{"targetMode":"single|multi|workspace|selection|unknown","artifactIds":[]},"operations":[{"kind":"style_change|content_edit|structure_edit|create|export|review|search|other","instruction":"..."}],"requiresConfirmation":false,"clarificationQuestion":"","confidence":0.0,"rationale":"..."}',
  ].join('\n');
}

function normalizePlan(raw: unknown, existingArtifacts: AssistantArtifactItem[], localWorkspaceFileRegistry: Array<{ directoryId: string; path: string; kind: string }> = []): AssistantAgentChangePlan {
  const existingIds = new Set(existingArtifacts.filter((item) => item.deletedAt == null).map((item) => item.id));
  const validLocalFileKeys = new Set(localWorkspaceFileRegistry.filter((item) => item.kind === 'file').map((item) => `${item.directoryId}:${item.path}`));
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
  const intent = raw.intent === 'create' || raw.intent === 'update' || raw.intent === 'clarify' || raw.intent === 'search' ? raw.intent : 'chat';
  const rawScope = isRecord(raw.scope) ? raw.scope : {};
  const targetMode = ['single', 'multi', 'workspace', 'selection', 'unknown'].includes(String(rawScope.targetMode))
    ? rawScope.targetMode as AssistantAgentChangePlan['scope']['targetMode']
    : 'unknown';
  const artifactIds = Array.isArray(rawScope.artifactIds)
    ? rawScope.artifactIds.filter((id): id is string => typeof id === 'string' && existingIds.has(id))
    : [];
  const operations = Array.isArray(raw.operations) ? raw.operations.flatMap((item): AssistantAgentChangePlan['operations'] => {
    if (!isRecord(item)) return [];
    const kind = ['style_change', 'content_edit', 'structure_edit', 'create', 'export', 'review', 'search', 'other'].includes(String(item.kind))
      ? item.kind as AssistantAgentChangePlan['operations'][number]['kind']
      : 'other';
    const instruction = text(item.instruction, 500);
    return instruction ? [{ kind, instruction }] : [];
  }) : [];
  const localFilePaths = Array.isArray(raw.localFilePaths)
    ? raw.localFilePaths.flatMap((item): NonNullable<AssistantAgentChangePlan['localFilePaths']> => {
        if (!isRecord(item)) return [];
        const directoryId = text(item.directoryId, 160);
        const path = text(item.path, 480).replace(/^\/+/, '');
        if (!directoryId || !path || !validLocalFileKeys.has(`${directoryId}:${path}`)) return [];
        return [{ directoryId, path }];
      }).slice(0, 12)
    : [];
  const normalizedIntent = intent === 'update' && artifactIds.length === 0 ? 'clarify' : intent;
  return {
    intent: normalizedIntent,
    assistantMessage: text(raw.assistantMessage, 8000),
    scope: { targetMode, artifactIds },
    operations,
    requiresConfirmation: Boolean(raw.requiresConfirmation) || normalizedIntent === 'clarify',
    clarificationQuestion: text(raw.clarificationQuestion, 300),
    searchQuery: text(raw.searchQuery, 300),
    localFilePaths,
    confidence: numberInRange(raw.confidence, 0),
    rationale: text(raw.rationale, 500),
  };
}

function buildWriterPrompt() {
  return [
    '你是企业级 Artifact Patch Writer。',
    '必须只输出严格 JSON，不要 Markdown，不要解释。',
    '根据 changePlan、用户输入、最近对话、图片引用注册表、产物注册表和必要的当前版本正文，生成可提交的 patch set。',
    '如果 localFiles 非空，可以把它们作为用户授权的文件内容使用；localFiles 之外的本地文件都没有读取权限，不能假装知道。',
    '',
    '规则：',
    '1. 只对 changePlan.scope.artifactIds 中的现有产物执行 update。',
    '2. create 可以创建新产物。',
    '3. update 必须带 artifactId 和 baseVersionId。',
    '4. content 必须是完整新版本，不能是说明、占位、省略或“参考上文”。',
    '5. 多文件产物可以输出 files；单文件/文档可以只输出 content。',
    '6. 不确定时 assistantMessage 说明无法安全修改，patches 为空。',
    '6.1 如果 targetArtifacts 中 currentVersionContentTruncated 或 currentVersionFiles[].contentTruncated 为 true，说明完整正文未发送给你；任何 update patch 仍然必须输出完整新版本。若无法基于已发送内容安全重建完整版本，必须返回 patches=[] 并要求用户缩小修改范围或打开具体文件后重试，禁止编造缺失正文。',
    '7. 如需生成图片，不要把图片当作 markdown 文档或代码块，必须输出 mediaTasks；图片提示词由文本模型生成，图片由独立图片模型执行。',
    '7.1 assistantMessage 是展示给用户看的自然回复，必须直接回应用户请求；如果回复是一篇文章、报告、教程或多图说明，可以用 Markdown 把图片槽位自然插入正文中。',
    '7.2 mediaTasks.prompt 是给图片模型的完整提示词；aspectRatio、imageSize、referenceImageIds 等图片要求只能放在 mediaTasks 中，不要混入聊天正文。',
    '7.3 每个图片任务必须有稳定 slotId，例如 image-1、cover、step-2；assistantMessage 中用 Markdown 图片占位符引用：![给用户看的图片说明](attachment:slotId)。slotId 必须和 mediaTasks[].slotId 完全一致。',
    '7.4 mediaTasks.userCaption 是该图片在正文中的用户可见说明，应和 Markdown 图片占位符的 alt 文本一致或高度接近；不得写图片模型提示词。',
    '7.5 一次最多输出 9 个 mediaTasks。复合指令应拆成多张独立图片任务，例如封面、步骤图、风格 A/B/C，而不是把多张图塞进一个 prompt。',
    '8. 用户消息、最近对话或 imageReferenceRegistry 里的图片可作为参考图。必须使用 imageAttachments[].refId 或 imageReferenceRegistry[].refId 写入 mediaTasks[].referenceImageIds，不要输出 URL，不要虚构 URL。',
    '8.1 用户说“刚才那张图”“上一张图”“这张图”时，优先选择 imageReferenceRegistry 中最近且语义最匹配的图片；如果多个候选都合理且会影响结果，assistantMessage 提问澄清，mediaTasks 为空。',
    '9. 当前只支持新建图片任务。用户要求局部修改、蒙版编辑或指定区域编辑时，如果没有明确可用的编辑能力和区域标注，assistantMessage 说明当前只能参考原图重新生成，mediaTasks 为空或生成整体变体。',
    '10. 图片任务可按用户自然语言要求输出 aspectRatio 和 imageSize。aspectRatio 仅可为 1:1、2:3、3:2、3:4、4:3、4:5、5:4、9:16、16:9、21:9；imageSize 仅可为 1K、2K、4K。用户没有要求时省略。',
    '',
    '输出格式：',
    '{"assistantMessage":"面向用户的自然回复文案，可包含图片槽位，例如：下面是一份红烧肉图文介绍。\\n\\n![红烧肉成品图](attachment:image-1)\\n\\n这张图突出肥瘦相间和酱汁光泽。","patches":[{"action":"create|update","artifactId":"...","kind":"document|code|diagram|html|table|json|text","title":"...","summary":"...","language":"...","content":"完整内容","files":[{"id":"...","path":"...","language":"...","content":"完整文件内容"}],"baseVersionId":"...","changeSummary":"..."}],"mediaTasks":[{"kind":"image","slotId":"image-1","userCaption":"红烧肉成品图","prompt":"给图片模型的完整提示词","altText":"图片标题或替代文本","aspectRatio":"16:9","imageSize":"2K","referenceImageIds":["message-id:attachment-id"]}]}',
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

function normalizeMediaTasks(value: unknown, imageReferenceRegistry = new Map<string, ImageAttachmentRef>()): AssistantAgentMediaTask[] {
  if (!Array.isArray(value)) return [];
  const usedSlotIds = new Set<string>();
  const uniqueSlotId = (rawSlotId: string, index: number) => {
    const fallback = `image-${index + 1}`;
    const base = (rawSlotId.replace(/[^\w.-]/g, '') || fallback).slice(0, 80);
    if (!usedSlotIds.has(base)) {
      usedSlotIds.add(base);
      return base;
    }
    for (let suffix = 2; suffix <= MAX_MEDIA_TASKS + 1; suffix += 1) {
      const candidate = `${base}-${suffix}`.slice(0, 80);
      if (!usedSlotIds.has(candidate)) {
        usedSlotIds.add(candidate);
        return candidate;
      }
    }
    const candidate = `${fallback}-${usedSlotIds.size + 1}`.slice(0, 80);
    usedSlotIds.add(candidate);
    return candidate;
  };
  return value.slice(0, MAX_MEDIA_TASKS).flatMap((item, index): AssistantAgentMediaTask[] => {
    if (!isRecord(item) || item.kind !== 'image') return [];
    const prompt = text(item.prompt, 4000);
    const slotId = uniqueSlotId(text(item.slotId, 80), index);
    const altText = text(item.altText, 160) || text(item.title, 160) || 'AI 图片';
    const userCaption = text(item.userCaption, 240) || text(item.caption, 240) || altText;
    const aspectRatio = text(item.aspectRatio, 16);
    const imageSize = text(item.imageSize, 8).toUpperCase();
    if (!prompt) return [];
    const referenceImageIds = Array.isArray(item.referenceImageIds)
      ? item.referenceImageIds.flatMap((entry): string[] => {
          const refId = text(entry, 240);
          return refId && imageReferenceRegistry.has(refId) ? [refId] : [];
        }).slice(0, 8)
      : [];
    const referenceImagesFromIds = referenceImageIds.flatMap((refId): NonNullable<AssistantAgentMediaTask['referenceImages']> => {
      const ref = imageReferenceRegistry.get(refId);
      if (!ref) return [];
      return [{
        url: ref.url,
        mimeType: ref.mimeType,
        label: ref.caption || ref.altText || '参考图',
      }];
    });
    const resolvedReferenceImages = referenceImagesFromIds.slice(0, 8);
    return [{
      kind: 'image',
      slotId,
      prompt,
      altText,
      userCaption,
      aspectRatio: SUPPORTED_IMAGE_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : undefined,
      imageSize: SUPPORTED_IMAGE_SIZES.has(imageSize) ? imageSize : undefined,
      referenceImageIds: referenceImageIds.length ? referenceImageIds : undefined,
      referenceImages: resolvedReferenceImages.length ? resolvedReferenceImages : undefined,
    }];
  });
}

function markdownAltText(value: string) {
  return value.replace(/[\[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'AI 图片';
}

function ensureMediaTaskPlaceholders(assistantMessage: string, mediaTasks: AssistantAgentMediaTask[]) {
  let content = assistantMessage.trim();
  const missingPlaceholders = mediaTasks.flatMap((task): string[] => {
    const slotId = task.slotId?.trim();
    if (!slotId) return [];
    if (content.includes(`attachment:${slotId}`)) return [];
    return [`![${markdownAltText(task.userCaption || task.altText || 'AI 图片')}](attachment:${slotId})`];
  });
  if (!missingPlaceholders.length) return content;
  content = [content, missingPlaceholders.join('\n\n')].filter(Boolean).join('\n\n');
  return text(content, MAX_ASSISTANT_VISIBLE_MESSAGE_CHARS);
}

function compactLocalFilesForPrompt(localFiles: AssistantAgentLocalFileContext[] | undefined) {
  let remaining = MAX_LOCAL_FILE_CONTEXT_CHARS;
  return (localFiles || []).flatMap((file) => {
    if (remaining <= 0) return [];
    const content = file.content.slice(0, remaining);
    remaining -= content.length;
    return [{
      directoryId: file.directoryId,
      path: file.path,
      name: file.name,
      mimeType: file.mimeType || '',
      sizeBytes: file.sizeBytes,
      content,
      truncated: file.truncated || content.length < file.content.length,
      originalLength: file.originalLength,
    }];
  });
}

function normalizePatchSet(raw: unknown, imageReferenceRegistry = new Map<string, ImageAttachmentRef>()): AssistantAgentPatchSet {
  if (!isRecord(raw)) return { assistantMessage: '没有可提交的产物变更。', patches: [], mediaTasks: [] };
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
  const mediaTasks = normalizeMediaTasks(raw.mediaTasks, imageReferenceRegistry);
  return {
    assistantMessage: ensureMediaTaskPlaceholders(text(raw.assistantMessage, MAX_ASSISTANT_VISIBLE_MESSAGE_CHARS), mediaTasks)
      || (mediaTasks.length && !patches.length ? '我已根据你的要求准备生成图片。' : patches.length ? '已完成产物变更。' : '没有可提交的产物变更。'),
    patches,
    mediaTasks,
  };
}

export function validateAssistantAgentPatchSet(params: {
  patchSet: AssistantAgentPatchSet;
  plan: AssistantAgentChangePlan;
  existingArtifacts: AssistantArtifactItem[];
  blockedUpdateArtifactIds?: Set<string>;
}) {
  const existingById = new Map(params.existingArtifacts.filter((item) => item.deletedAt == null).map((item) => [item.id, item]));
  const allowedUpdateIds = new Set(params.plan.scope.artifactIds);
  const blockedUpdateArtifactIds = params.blockedUpdateArtifactIds || new Set<string>();
  const validPatches = params.patchSet.patches.filter((patch) => {
    if (!VALID_ARTIFACT_KINDS.has(patch.kind)) return false;
    if (!patch.content && !patch.files?.length) return false;
    if (patch.action === 'create') return params.plan.intent === 'create';
    if (patch.action !== 'update' || !patch.artifactId) return false;
    if (blockedUpdateArtifactIds.has(patch.artifactId)) return false;
    const target = existingById.get(patch.artifactId);
    if (!target || !allowedUpdateIds.has(patch.artifactId)) return false;
    if (patch.baseVersionId && patch.baseVersionId !== target.currentVersionId) return false;
    return true;
  });
  const rejectedForTruncatedContext = params.patchSet.patches.some((patch) => (
    patch.action === 'update'
    && patch.artifactId
    && blockedUpdateArtifactIds.has(patch.artifactId)
  ));
  return {
    assistantMessage: rejectedForTruncatedContext
      ? '这个产物内容较长，当前上下文不足以安全生成完整新版本。请缩小修改范围或打开具体文件后再试。'
      : params.patchSet.assistantMessage,
    patches: validPatches,
    mediaTasks: params.patchSet.mediaTasks || [],
  } satisfies AssistantAgentPatchSet;
}

export async function planAssistantAgentChange(params: {
  api: APIConfig;
  chatId: string;
  messages: Message[];
  userMessage: Message;
  existingArtifacts: AssistantArtifactItem[];
  interactionFocus?: Record<string, unknown>;
  toolCapabilities?: {
    webSearch?: boolean;
    localWorkspace?: boolean;
    localWorkspaceDirectories?: Array<{ id: string; name: string; isDefault: boolean }>;
  };
  localWorkspaceFileRegistry?: Array<{
    directoryId: string;
    path: string;
    name: string;
    kind: 'file' | 'directory';
    depth: number;
    sizeBytes?: number;
    mimeType?: string;
    updatedAt?: number;
  }>;
  signal?: AbortSignal;
}) {
  const payload = {
    chatId: params.chatId,
    userMessage: { id: params.userMessage.id, content: params.userMessage.content, imageAttachments: buildCompactImageAttachmentRefs(params.userMessage) },
    recentConversation: recentConversation(params.messages),
    imageReferenceRegistry: buildCompactImageReferenceRegistry([...params.messages, params.userMessage]),
    artifactRegistry: artifactRegistry(params.existingArtifacts),
    toolCapabilities: {
      webSearch: Boolean(params.toolCapabilities?.webSearch),
      localWorkspace: Boolean(params.toolCapabilities?.localWorkspace),
    },
    localWorkspaceRegistry: (params.toolCapabilities?.localWorkspaceDirectories || []).slice(0, 12),
    localWorkspaceFileRegistry: (params.localWorkspaceFileRegistry || []).slice(0, MAX_LOCAL_WORKSPACE_FILES_IN_REGISTRY),
    interactionFocus: params.interactionFocus || {},
  };
  const raw = await generateResponse(
    params.api,
    buildPlannerPrompt(),
    [{ role: 'user', content: stringifyAgentPayload(payload, 'Assistant Agent planner') }],
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
  return normalizePlan(safeJsonParse(raw), params.existingArtifacts, params.localWorkspaceFileRegistry);
}

export async function writeAssistantAgentPatchSet(params: {
  api: APIConfig;
  chatId: string;
  messages: Message[];
  userMessage: Message;
  plan: AssistantAgentChangePlan;
  existingArtifacts: AssistantArtifactItem[];
  localFiles?: AssistantAgentLocalFileContext[];
  signal?: AbortSignal;
}) {
  const imageReferenceRegistry = buildImageReferenceRegistry([...params.messages, params.userMessage]);
  const blockedUpdateArtifactIds = new Set<string>();
  const activeTargetArtifacts = params.existingArtifacts
    .filter((artifact) => params.plan.scope.artifactIds.includes(artifact.id));
  const perTargetBudget = Math.max(
    12_000,
    Math.min(MAX_SINGLE_TARGET_CONTEXT_CHARS, Math.floor(MAX_TOTAL_TARGET_CONTEXT_CHARS / Math.max(1, activeTargetArtifacts.length))),
  );
  const targetArtifacts = params.existingArtifacts
    .filter((artifact) => params.plan.scope.artifactIds.includes(artifact.id))
    .map((artifact) => {
      const currentVersion = artifactCurrentVersion(artifact);
      const files = currentVersion?.files || [];
      const contentBudget = files.length ? Math.floor(perTargetBudget * 0.25) : perTargetBudget;
      const fileBudget = files.length ? Math.max(2000, Math.floor((perTargetBudget - contentBudget) / files.length)) : 0;
      const compactedContent = compactContextText(currentVersion?.content || '', contentBudget);
      let hasTruncatedContext = compactedContent.truncated;
      const currentVersionFiles = files.map((file) => {
        const compactedFile = compactContextText(file.content, fileBudget);
        if (compactedFile.truncated) hasTruncatedContext = true;
        return {
          ...file,
          content: compactedFile.content,
          contentTruncated: compactedFile.truncated,
          contentOriginalLength: compactedFile.originalLength,
        };
      });
      if (hasTruncatedContext) blockedUpdateArtifactIds.add(artifact.id);
      return {
        ...artifactRegistry([artifact])[0],
        currentVersionContent: compactedContent.content,
        currentVersionContentTruncated: compactedContent.truncated,
        currentVersionContentOriginalLength: compactedContent.originalLength,
        currentVersionFiles,
      };
    });
  const payload = {
    chatId: params.chatId,
    userMessage: { id: params.userMessage.id, content: params.userMessage.content, imageAttachments: buildCompactImageAttachmentRefs(params.userMessage) },
    recentConversation: recentConversation(params.messages),
    imageReferenceRegistry: buildCompactImageReferenceRegistry([...params.messages, params.userMessage]),
    changePlan: params.plan,
    artifactRegistry: artifactRegistry(params.existingArtifacts),
    targetArtifacts,
    localFiles: compactLocalFilesForPrompt(params.localFiles),
  };
  const raw = await generateResponse(
    params.api,
    buildWriterPrompt(),
    [{ role: 'user', content: stringifyAgentPayload(payload, 'Assistant Agent writer') }],
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
    patchSet: normalizePatchSet(safeJsonParse(raw), imageReferenceRegistry),
    plan: params.plan,
    existingArtifacts: params.existingArtifacts,
    blockedUpdateArtifactIds,
  });
}
