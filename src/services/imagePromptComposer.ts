export type ImagePromptModule =
  | 'empty_guard'
  | 'preserve_user_prompt'
  | 'needs_model_expansion'
  | 'has_reference_context'
  | 'has_detail_signals';

export type ImagePromptStrategy =
  | 'empty'
  | 'preserve_detailed'
  | 'model_guided_expansion';

export interface ImagePromptCompositionOptions {
  caption?: string;
  subject?: string;
  source?: 'agent' | 'chat' | 'manual' | string;
}

export interface ImagePromptPlan {
  originalPrompt: string;
  normalizedPrompt: string;
  finalPrompt: string;
  subject: string;
  caption?: string;
  strategy: ImagePromptStrategy;
  preservedOriginal: boolean;
  appliedModules: ImagePromptModule[];
  detailSignalCount: number;
  warnings: string[];
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueContextParts(parts: Array<string | undefined>) {
  const seen = new Set<string>();
  return parts.flatMap((part) => {
    const normalized = part ? normalizeText(part) : '';
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  }).join('；');
}

function countPromptDetailSignals(text: string) {
  const detailMarkers = [
    /构图|版式|排版|主图|辅图|画幅|边框|留白|比例|1:1|16:9|9:16/i,
    /镜头|焦段|光圈|f\d(?:\.\d)?|景深|虚化|散景|85mm|35mm|50mm/i,
    /光线|布光|漫射光|柔光|高光|阴影|色调|调色|HDR|RAW/i,
    /材质|质感|纹理|布料|褶皱|发丝|肌理|金属|玻璃/i,
    /photorealistic|ultra realistic|editorial|magazine|cinematic|professional photography|best quality|masterpiece/i,
  ];
  return detailMarkers.filter((pattern) => pattern.test(text)).length;
}

function isDetailedPrompt(text: string) {
  const signalCount = countPromptDetailSignals(text);
  const separatorCount = (text.match(/[，,、；;]/g) || []).length;
  return signalCount >= 3 || (text.length >= 90 && signalCount >= 2 && separatorCount >= 6);
}

function buildModelGuidedPrompt(originalRequest: string, context?: string) {
  const contextLine = context && context !== originalRequest ? `\nConversation/context hint: ${context}` : '';
  return [
    `Original user image request: ${originalRequest}${contextLine}`,
    '',
    'Generate the image directly from this request while applying professional image-prompt discipline.',
    'Use adaptive judgement: add only visual details that directly help this specific image, such as subject, composition, style, layout, lighting, color, camera, material, text handling, edit fidelity, or constraints when they are relevant.',
    'Do not infer a fixed category from local keywords. Do not force photography terms, cinematic lighting, collage layout, typography rules, or repair language unless the request actually needs them.',
    'Preserve any user-provided wording, names, quantities, style direction, aspect ratio, and edit target. If the request is an edit or uses reference images, keep identity, composition, text, and non-target areas stable unless the user asks to change them.',
    'Avoid changing the subject or goal. Avoid unrelated objects, accidental text, watermarks, UI chrome, distorted anatomy, warped objects, and unreadable text.',
  ].join('\n');
}

export function composeImagePrompt(prompt: string, options: ImagePromptCompositionOptions = {}): ImagePromptPlan {
  const normalized = normalizeText(prompt);
  const caption = options.caption ? normalizeText(options.caption) : undefined;
  const subject = normalizeText(options.subject || caption || normalized);
  const detailSignalCount = countPromptDetailSignals(normalized);
  if (!normalized) {
    return {
      originalPrompt: prompt,
      normalizedPrompt: normalized,
      finalPrompt: normalized,
      subject,
      caption,
      strategy: 'empty',
      preservedOriginal: true,
      appliedModules: ['empty_guard'],
      detailSignalCount,
      warnings: ['empty_prompt'],
    };
  }

  const appliedModules: ImagePromptModule[] = [];
  if (detailSignalCount > 0) appliedModules.push('has_detail_signals');
  if (caption && caption !== normalized) appliedModules.push('has_reference_context');

  if (
    normalized.split('\n').length > 1 ||
    isDetailedPrompt(normalized) ||
    /(?:composition|lighting|style|camera|photography|illustration|render|studio|cinematic)/i.test(normalized)
  ) {
    return {
      originalPrompt: prompt,
      normalizedPrompt: normalized,
      finalPrompt: normalized,
      subject,
      caption,
      strategy: 'preserve_detailed',
      preservedOriginal: true,
      appliedModules: ['preserve_user_prompt', ...appliedModules],
      detailSignalCount,
      warnings: [],
    };
  }

  return {
    originalPrompt: prompt,
    normalizedPrompt: normalized,
    finalPrompt: buildModelGuidedPrompt(normalized, subject && subject !== normalized ? uniqueContextParts([subject, caption]) : caption),
    subject,
    caption,
    strategy: 'model_guided_expansion',
    preservedOriginal: false,
    appliedModules: ['needs_model_expansion', ...appliedModules],
    detailSignalCount,
    warnings: ['semantic_expansion_deferred_to_model'],
  };
}

export function enhanceImagePrompt(prompt: string, options: ImagePromptCompositionOptions = {}) {
  return composeImagePrompt(prompt, options).finalPrompt;
}
