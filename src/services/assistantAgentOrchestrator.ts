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
import type { Message, MessageAttachment } from '../types/message';
import type { APIConfig } from '../types/settings';
import { generateResponse } from './aiClient';
import { enhanceImagePrompt } from './imagePromptComposer';
import { normalizeAssistantHtmlRuntime } from '../features/assistantHtml/assistantHtmlValidation';

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
  artifactId?: string;
  mimeType?: string;
  altText: string;
  caption?: string;
  promptText?: string;
  semanticSummary?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  urlKind: 'data' | 'remote' | 'local' | 'unknown';
}

interface ImageAttachmentRef extends CompactImageAttachmentRef {
  url: string;
}

function imageArtifactIdForAttachment(message: Message, attachment: MessageAttachment) {
  if (attachment.targetArtifactId) return attachment.targetArtifactId;
  return message.type === 'ai' ? `assistant-image-artifact-${message.id}-${attachment.id}` : undefined;
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

function withLatestUserMessage(messages: Message[], userMessage: Message) {
  return messages.some((message) => message.id === userMessage.id)
    ? messages
    : [...messages, userMessage];
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
    artifactId: ref.artifactId,
    mimeType: ref.mimeType,
    altText: ref.altText,
    caption: ref.caption,
    ...(ref.promptText ? { promptText: ref.promptText } : {}),
    ...(ref.semanticSummary ? { semanticSummary: ref.semanticSummary } : {}),
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
      artifactId: imageArtifactIdForAttachment(message, attachment),
      url: attachment.url as string,
      mimeType: attachment.mimeType,
      altText: attachment.altText,
      caption: attachment.caption,
      promptText: attachment.promptText?.trim().slice(0, 800),
      semanticSummary: attachment.semanticSummary?.trim().slice(0, 800),
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
    '1g. 如果 interactionFocus.selectedArtifactId 存在且用户说“这个/刚才那个/当前产物/标题大一点/改成...”等相对指代，必须优先把该产物作为 update 目标。',
    '2. 需要创建产物输出 intent=create。',
    '2a. 用户要求生成图片、海报、插画、照片、图像素材，或要求基于上一张/刚才那张/某张参考图生成变体时，也属于 intent=create；Planner 只规划，不输出图片提示词正文。',
    '2b. 用户要求生成文档、方案、表格、网页、代码、图表、JSON、可沉淀资料时，属于 intent=create，不要退回普通聊天。',
    '2c. 每轮必须选择 responseExperience，它描述最合适的回答体验，而不是用户是否提到 HTML。direct_answer 用于文字/Markdown 已足够清楚；source_code 只用于用户明确要源码、示例、教程、解释、调试或复制代码。source_code 输出 intent=chat、assistantMessage 为空，让普通回复模型生成代码块，禁止创建可运行产物。',
    '2d. structured_input 用于完成任务前缺少一组结构化信息，应该主动提供少量字段让用户填写，而不是追问用户打一大段文字。例如“帮我制定旅行计划”缺少目的地、预算、天数和偏好时。使用 intent=create。',
    '2e. interactive_workspace 用于试卷、问卷、计算器、配置器、练习、审批等完整操作流程，或结果需要提交、批改和持续版本化时。例如“给我做一套高三英语试卷”。使用 intent=create/update。',
    '2f. visual_explanation 用于天梯图、复杂对比表、数据可视化、复杂公式、交互图表等视觉表达明显优于纯文字的内容。例如“显卡天梯图”。使用 intent=create/update。不要要求用户说网页、HTML、产物或交互。',
    '2g. responseExperience 必须从用户真正想完成的任务推断。用户说“我想去旅游，帮我制定计划”时可以主动选择 structured_input 收集必要信息；用户说“给我做一套符合高三的英语试卷”时选择 interactive_workspace；用户说“给我看看显卡天梯图”时选择 visual_explanation。HTML 只是内部实现手段，不是用户目标。',
    '3. 需要修改一个或多个现有产物输出 intent=update，scope.artifactIds 可以是多个。',
    '3a. 如果没有 selectedArtifactId，但 artifactRegistry 中只有一个明显相关产物，可以直接 update；如果有多个相关产物且用户没有点名，必须 clarify。',
    '4. 目标不明确且会影响多个候选时输出 intent=clarify，并给 clarificationQuestion；不要猜 target。',
    '5. 不允许猜 target。低置信度、多候选、缺少焦点时必须 clarify。',
    '6. Planner 不输出产物正文，不输出 patch；只有 intent=chat/clarify 时 assistantMessage 才作为用户可见回复。',
    '',
    '输出格式：',
    '{"intent":"chat|create|update|clarify|search","assistantMessage":"普通聊天或澄清时的可见回复；source_code 时为空","responseExperience":"direct_answer|source_code|structured_input|interactive_workspace|visual_explanation","searchQuery":"搜索时使用的具体查询；非搜索为空","localFilePaths":[{"directoryId":"...","path":"相对路径"}],"scope":{"targetMode":"single|multi|workspace|selection|unknown","artifactIds":[]},"operations":[{"kind":"style_change|content_edit|structure_edit|create|export|review|search|other","instruction":"..."}],"requiresConfirmation":false,"clarificationQuestion":"","confidence":0.0,"rationale":"..."}',
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
  const responseExperience = ['direct_answer', 'source_code', 'structured_input', 'interactive_workspace', 'visual_explanation'].includes(String(raw.responseExperience))
    ? raw.responseExperience as NonNullable<AssistantAgentChangePlan['responseExperience']>
    : undefined;
  return {
    intent: normalizedIntent,
    assistantMessage: text(raw.assistantMessage, 8000),
    scope: { targetMode, artifactIds },
    operations,
    requiresConfirmation: Boolean(raw.requiresConfirmation) || normalizedIntent === 'clarify',
    clarificationQuestion: text(raw.clarificationQuestion, 300),
    searchQuery: text(raw.searchQuery, 300),
    localFilePaths,
    responseExperience,
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
    '6.2 assistantMessage 不要重复输出 patches[].content 或 files[].content 的完整正文/源码。产物正文只放在 patch content/files 中；assistantMessage 只写简短说明、必要的前言或图片槽位。',
    '7. 如需生成图片，不要把图片当作 markdown 文档或代码块，必须输出 mediaTasks；图片提示词由文本模型生成，图片由独立图片模型执行。',
    '7.1 assistantMessage 是展示给用户看的自然回复，必须直接回应用户请求；如果回复是一篇文章、报告、教程或多图说明，可以用 Markdown 把图片槽位自然插入正文中。',
    '7.2 mediaTasks.prompt 是给图片模型的完整提示词；aspectRatio、imageSize、referenceImageIds 等图片要求只能放在 mediaTasks 中，不要混入聊天正文。',
    '7.3 每个图片任务必须有稳定 slotId，例如 image-1、cover、step-2；assistantMessage 中用 Markdown 图片占位符引用：![给用户看的图片说明](attachment:slotId)。slotId 必须和 mediaTasks[].slotId 完全一致。',
    '7.4 mediaTasks.userCaption 是该图片在正文中的用户可见说明，应和 Markdown 图片占位符的 alt 文本一致或高度接近；不得写图片模型提示词。',
    '7.5 一次最多输出 9 个 mediaTasks。复合指令应拆成多张独立图片任务，例如封面、步骤图、风格 A/B/C，而不是把多张图塞进一个 prompt。',
    '7.6 mediaTasks.prompt 必须是完整、专业、可直接给图片模型执行的最终提示词，不是对图片模型说“请你再写提示词”。',
    '7.7 生成 mediaTasks.prompt 前，必须先在内部梳理：用户本轮真正要生成/修改什么、最近对话中已经确定的主题/角色/风格/禁忌/数量/用途、用户偏好的审美词、哪些历史图片或产物被明确指代、哪些上下文只是聊天噪音不能继承。只把结论写进最终 prompt，不要把分析过程输出给用户。',
    '7.8 用户只给出很短的主题时，要结合 recentConversation、userMessage、imageReferenceRegistry、artifactRegistry 和 changePlan 自动扩写为具体视觉方案；但必须按内容智能选择、增删和组合属性，这些只是可选层级，不是固定清单：主体身份、场景动作、构图/版式、镜头或渲染风格、光线、色彩、材质细节、情绪、质量层级与禁用项。文本图、UI图、OCR/读图、清晰化、锐化、修复、保真编辑应优先准确性、可读性和保留原貌，不要硬塞电影光影、情绪、镜头、奢华风格等无关词；保留用户指定的风格词和具体物件，但不能擅自换成另一个主体或目标。',
    '7.9 如果用户已经给出高密度、完整、风格明确的生图提示词，mediaTasks.prompt 应尽量保留原文和结构，只做必要的上下文补全、冲突消解和安全约束；不要为了“优化”而改写成另一套审美。',
    '8. imageReferenceRegistry 是最近聊天图片的轻量注册表；不要默认把所有历史图片当参考图。只有当用户当前指令、最近上下文、图片说明、消息顺序或显式选择能明确定位时，才选择其中的图片。',
    '8.1 用户本轮手动上传或通过“放到参考图”加入的 userMessage.imageAttachments 优先级最高，通常作为 referenceImageIds 或 targetImageIds 使用。',
    '8.2 用户说“上一张/刚才那张/这张/把它/标题大一点/杯子改成这个样式”等相对指代时，必须先从 imageReferenceRegistry 结合 messageRole、messageContentPreview、altText、caption、artifactId 判断目标图。能唯一判断则使用；多候选或无法一一对应时 assistantMessage 提出澄清，mediaTasks 为空。',
    '8.2a 用户说“把图片里的 A 改成 B / 图里的文字改为 B / 照片里的人名替换成 B”这类明确编辑图片内容的请求，即使没有说“上一张”，也默认 target 是 imageReferenceRegistry 中最新的一张可用图片；只有当用户同时指向多张图、或修改会影响多张候选且无法判断时才澄清。',
    '8.3 图片编辑或变体任务必须区分 targetImageIds、referenceImageIds、styleImageIds：target 是要被修改的图；reference 是要借鉴内容/局部元素的图；style 是要借鉴风格的图。输出 ID 必须来自 imageReferenceRegistry[].refId，不要输出 URL，不要虚构 ID。',
    '8.4 如果 target 图对应 imageReferenceRegistry[].artifactId，且用户是在修改同一张图或同一组图，必须把 mediaTasks[].targetArtifactId 设置为该 artifactId；这样图片完成后会追加为同一产物的新版本。批量修改多张图时，每个 mediaTask 对应一个 targetArtifactId。',
    '9. 当前没有可靠蒙版/区域标注能力时，局部修改只能作为“参考原图重新生成整体变体”。必须在 assistantMessage 中说明是整体变体；如果用户明确要求精确局部编辑且缺少区域信息，先澄清。',
    '10. 图片任务可按用户自然语言要求输出 aspectRatio 和 imageSize。aspectRatio 仅可为 1:1、2:3、3:2、3:4、4:3、4:5、5:4、9:16、16:9、21:9；imageSize 仅可为 1K、2K、4K。用户没有要求时省略。',
    '11. 如果 assistantMessage、patch content 或 files 中需要写应用内链接，必须使用跨平台 AppLink：ssmm://character/{id}?action=edit、ssmm://chat/{id}?action=open、ssmm://settings?action=open&tab=models&card=models。禁止输出 /characters/...、/chats/...、#/...、http://localhost/... 或任何平台私有路由。',
    '11.1 只有当 ID 来自用户输入、recentConversation、artifactRegistry、targetArtifacts、localFiles 或其他明确上下文时，才能写入 AppLink；禁止编造角色、会话、产物或文件 ID。外部网页来源继续使用 https:// 链接。',
    '12. 遵循 changePlan.responseExperience。structured_input 生成简洁 HTML 表单片段；interactive_workspace 生成 <!doctype html>/<html> 完整交互文档；visual_explanation 根据内容规模生成 HTML 片段或完整文档，并优先可读、可比较的视觉表达。这三类使用 kind=html；需要提交时输出 htmlRuntime。不要在用户可见文案中谈论 HTML、网页、全屏、气泡、presentation 或 viewport。source_code 不应进入 Writer；若意外收到，必须返回 patches=[]。',
    '12.1 HTML 不得包含 script、onclick/onchange 等事件属性、iframe/object/embed、外部 src/href、网络请求或表单 action。交互只使用标准 input/select/textarea/form，以及 data-pneumata-action=save|submit|reset|open_fullscreen|close。',
    '12.2 htmlRuntime.executionMode 固定为 declarative。submission.fields 必须完整列出允许提交的字段名、类型、必填、长度和选项，并与 HTML 中 name 属性一致。',
    '12.3 如果 userMessage.htmlSubmission 存在，本轮必须 update 其目标 HTML 产物，baseVersionId 使用提交版本，生成包含审批、批改、分析、结果或下一步交互的完整新版本；不得创建无关的新产物。',
    '12.4 HTML 正文只能放在 patches[].content，严禁放进 assistantMessage 的 Markdown 代码块或直接正文。assistantMessage 只保留一句简短说明；程序会提供产物打开入口。',
    '12.5 HTML 必须使用少量语义 CSS 变量统一表达页面颜色，至少包括 --pneumata-bg、--pneumata-surface、--pneumata-text、--pneumata-muted、--pneumata-border、--pneumata-accent；元素样式引用变量，不散落重复硬编码颜色。必须同时提供 html[data-pneumata-theme="light"]、html[data-pneumata-theme="dark"] 两组变量覆盖和 @media (prefers-color-scheme: dark) 变量覆盖：属性选择器供应用查看器明确切换并优先于系统主题，媒体查询保证下载导出后独立使用。不要复制两套结构或完整样式，只覆盖变量。',
    '',
    '输出格式：',
    '{"assistantMessage":"面向用户的自然回复文案","patches":[{"action":"create|update","artifactId":"...","kind":"document|code|diagram|html|table|json|text","title":"...","summary":"...","language":"...","content":"完整内容","files":[{"id":"...","path":"...","language":"...","content":"完整文件内容"}],"baseVersionId":"...","changeSummary":"...","htmlRuntime":{"schemaVersion":1,"executionMode":"declarative","autosave":{"enabled":true,"debounceMs":900},"submission":{"interactionId":"stable-id","label":"提交","resultType":"form|quiz|selection|custom","fields":[{"name":"answer","type":"text|textarea|number|boolean|single_choice|multi_choice","label":"回答","required":true,"maxLength":8000,"options":[]}],"sendToAssistant":true,"createArtifactVersion":true}}}],"mediaTasks":[]}',
  ].join('\n');
}

function looksLikeImplicitLatestImageEdit(textValue: string) {
  const normalized = textValue.replace(/\s+/g, '');
  if (!normalized) return false;
  const imageScope = /(图片|照片|相片|截图|图像|图里|图中|画面|海报|头像)/i.test(normalized);
  const editAction = /(改成|改为|修改为|替换成|换成|变成|P成|p成|去掉|删掉|删除|擦除|加上|添加|放大|缩小|调大|调小|变大|变小)/i.test(normalized);
  return imageScope && editAction;
}

function createImplicitLatestImageEditTask(params: {
  userMessage: Message;
  imageReferenceRegistry: Map<string, ImageAttachmentRef>;
}): AssistantAgentMediaTask | null {
  if (!looksLikeImplicitLatestImageEdit(params.userMessage.content)) return null;
  const latestImage = latestUniqueImageReference(params.imageReferenceRegistry);
  if (!latestImage) return null;
  const caption = latestImage.caption || latestImage.altText || '上一张图片';
  return {
    kind: 'image',
    slotId: 'image-1',
    prompt: enhanceImagePrompt(params.userMessage.content, {
      caption,
      subject: `基于${caption}进行图片编辑：${params.userMessage.content}`,
    }),
    altText: '图片编辑结果',
    userCaption: '图片编辑结果',
    targetArtifactId: latestImage.artifactId,
    targetImageIds: [latestImage.refId],
    referenceImages: [{
      url: latestImage.url,
      mimeType: latestImage.mimeType,
      label: caption,
    }],
  };
}

function latestUniqueImageReference(imageReferenceRegistry: Map<string, ImageAttachmentRef>) {
  const seen = new Set<string>();
  for (const ref of Array.from(imageReferenceRegistry.values()).reverse()) {
    if (seen.has(ref.refId)) continue;
    seen.add(ref.refId);
    return ref;
  }
  return null;
}

function withImplicitLatestImageTarget(
  mediaTasks: AssistantAgentMediaTask[],
  userMessage: Message | undefined,
  imageReferenceRegistry: Map<string, ImageAttachmentRef>,
) {
  if (!userMessage || !mediaTasks.length || !looksLikeImplicitLatestImageEdit(userMessage.content)) return mediaTasks;
  const latestImage = latestUniqueImageReference(imageReferenceRegistry);
  if (!latestImage) return mediaTasks;
  return mediaTasks.map((task) => {
    if (task.targetImageIds?.length || task.referenceImageIds?.length || task.styleImageIds?.length || task.referenceImages?.length) return task;
    const caption = latestImage.caption || latestImage.altText || '上一张图片';
    return {
      ...task,
      targetArtifactId: task.targetArtifactId || latestImage.artifactId,
      targetImageIds: [latestImage.refId],
      referenceImages: [{
        url: latestImage.url,
        mimeType: latestImage.mimeType,
        label: caption,
      }],
    };
  });
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
    const imageIdsFrom = (input: unknown) => Array.isArray(input)
      ? input.flatMap((entry): string[] => {
          const refId = text(entry, 240);
          return refId && imageReferenceRegistry.has(refId) ? [refId] : [];
        }).slice(0, 8)
      : [];
    const targetImageIds = imageIdsFrom(item.targetImageIds);
    const referenceImageIds = imageIdsFrom(item.referenceImageIds);
    const styleImageIds = imageIdsFrom(item.styleImageIds);
    const selectedImageIds = Array.from(new Set([...targetImageIds, ...referenceImageIds, ...styleImageIds])).slice(0, 8);
    const targetArtifactId = text(item.targetArtifactId, 180);
    const inferredTargetArtifactId = targetArtifactId || targetImageIds
      .map((refId) => imageReferenceRegistry.get(refId)?.artifactId)
      .find((artifactId): artifactId is string => Boolean(artifactId));
    const referenceImagesFromIds = selectedImageIds.flatMap((refId): NonNullable<AssistantAgentMediaTask['referenceImages']> => {
      const ref = imageReferenceRegistry.get(refId);
      if (!ref) return [];
      return [{
        url: ref.url,
        mimeType: ref.mimeType,
        label: ref.caption || ref.altText || (targetImageIds.includes(refId) ? '待修改图片' : '参考图'),
      }];
    });
    const resolvedReferenceImages = referenceImagesFromIds.slice(0, 8);
    return [{
      kind: 'image',
      slotId,
      prompt: enhanceImagePrompt(prompt, { caption: userCaption, subject: altText }),
      altText,
      userCaption,
      aspectRatio: SUPPORTED_IMAGE_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : undefined,
      imageSize: SUPPORTED_IMAGE_SIZES.has(imageSize) ? imageSize : undefined,
      targetArtifactId: inferredTargetArtifactId,
      targetImageIds: targetImageIds.length ? targetImageIds : undefined,
      referenceImageIds: referenceImageIds.length ? referenceImageIds : undefined,
      styleImageIds: styleImageIds.length ? styleImageIds : undefined,
      referenceImages: resolvedReferenceImages.length ? resolvedReferenceImages : undefined,
    }];
  });
}

function markdownAltText(value: string) {
  return value
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'AI 图片';
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

function stripHtmlArtifactSourceFromAssistantMessage(message: string, patches: AssistantAgentPatch[]) {
  const htmlPatches = patches.filter((patch) => patch.kind === 'html');
  if (!htmlPatches.length) return message.trim();
  const cleaned = message
    .replace(/```(?:html|htm)\s*[\s\S]*?```/gi, '')
    .replace(/```\s*(?=(?:<!doctype\s+html\b|<html\b))[\s\S]*?```/gi, '')
    .replace(/<!doctype\s+html\b[\s\S]*$/gi, '')
    .replace(/<html\b[\s\S]*?<\/html\s*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (cleaned) return cleaned;
  const primary = htmlPatches[0];
  return `${primary.action === 'update' ? '已更新' : '已创建'}「${primary.title}」。`;
}

function normalizePatchSet(raw: unknown, imageReferenceRegistry = new Map<string, ImageAttachmentRef>(), userMessage?: Message, plan?: AssistantAgentChangePlan): AssistantAgentPatchSet {
  if (!isRecord(raw)) return { assistantMessage: '没有可提交的产物变更。', patches: [], mediaTasks: [] };
  const patches = Array.isArray(raw.patches) ? raw.patches.slice(0, MAX_PATCHES).flatMap((item): AssistantAgentPatch[] => {
    if (!isRecord(item)) return [];
    const action = item.action === 'update' ? 'update' : item.action === 'create' ? 'create' : null;
    const kind = normalizeKind(item.kind);
    const content = text(item.content, MAX_CONTENT_CHARS);
    const files = normalizeFiles(item.files);
    if (!action || !kind || (!content && !files?.length)) return [];
    if (kind === 'html' && plan?.responseExperience === 'source_code') return [];
    const preferredMode = plan?.responseExperience === 'structured_input'
      ? 'inline_interaction'
      : plan?.responseExperience === 'interactive_workspace'
        ? 'artifact_page'
        : undefined;
    const htmlRuntime = kind === 'html' ? normalizeAssistantHtmlRuntime(isRecord(item.htmlRuntime) ? item.htmlRuntime : {}, content, preferredMode) : undefined;
    if (kind === 'html' && plan?.responseExperience === 'structured_input' && !htmlRuntime?.submission) return [];
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
      htmlRuntime,
      versionStage: kind === 'html' && action === 'update' ? 'ai_result' : kind === 'html' ? 'generated' : undefined,
    }];
  }) : [];
  let mediaTasks = withImplicitLatestImageTarget(normalizeMediaTasks(raw.mediaTasks, imageReferenceRegistry), userMessage, imageReferenceRegistry);
  if (!patches.length && !mediaTasks.length && userMessage) {
    const implicitTask = createImplicitLatestImageEditTask({ userMessage, imageReferenceRegistry });
    if (implicitTask) mediaTasks = [implicitTask];
  }
  const visibleAssistantMessage = stripHtmlArtifactSourceFromAssistantMessage(
    text(raw.assistantMessage, MAX_ASSISTANT_VISIBLE_MESSAGE_CHARS),
    patches,
  );
  return {
    assistantMessage: ensureMediaTaskPlaceholders(visibleAssistantMessage, mediaTasks)
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
  const htmlSubmission = params.userMessage.metadata?.assistantHtmlSubmission;
  const submittedArtifact = htmlSubmission
    ? params.existingArtifacts.find((artifact) => artifact.id === htmlSubmission.artifactId && artifact.chatId === params.chatId && artifact.kind === 'html' && artifact.deletedAt == null)
    : null;
  if (htmlSubmission && submittedArtifact) {
    return {
      intent: 'update',
      assistantMessage: '',
      scope: { targetMode: 'single', artifactIds: [submittedArtifact.id] },
      operations: [{ kind: 'content_edit', instruction: `处理用户提交的 ${htmlSubmission.resultType} 交互结果，并生成同一 HTML 产物的新版本。` }],
      responseExperience: 'interactive_workspace',
      requiresConfirmation: false,
      confidence: 1,
      rationale: '用户通过 HTML 交互提交了结构化数据，目标产物和基准版本已明确。',
    } satisfies AssistantAgentChangePlan;
  }
  const payload = {
    chatId: params.chatId,
    userMessage: {
      id: params.userMessage.id,
      content: params.userMessage.content,
      imageAttachments: buildCompactImageAttachmentRefs(params.userMessage),
      htmlSubmission: params.userMessage.metadata?.assistantHtmlSubmission,
    },
    recentConversation: recentConversation(params.messages),
    imageReferenceRegistry: buildCompactImageReferenceRegistry(withLatestUserMessage(params.messages, params.userMessage)),
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
  const registryMessages = withLatestUserMessage(params.messages, params.userMessage);
  const imageReferenceRegistry = buildImageReferenceRegistry(registryMessages);
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
    userMessage: {
      id: params.userMessage.id,
      content: params.userMessage.content,
      imageAttachments: buildCompactImageAttachmentRefs(params.userMessage),
      htmlSubmission: params.userMessage.metadata?.assistantHtmlSubmission,
    },
    recentConversation: recentConversation(params.messages),
    imageReferenceRegistry: buildCompactImageReferenceRegistry(registryMessages),
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
    patchSet: normalizePatchSet(safeJsonParse(raw), imageReferenceRegistry, params.userMessage, params.plan),
    plan: params.plan,
    existingArtifacts: params.existingArtifacts,
    blockedUpdateArtifactIds,
  });
}
