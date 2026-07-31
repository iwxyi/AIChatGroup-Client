const FOOD_KEYWORDS = [
  '炒', '煎', '煮', '蒸', '烤', '炸', '炖', '焖', '烩', '凉拌', '菜品', '饭菜', '米饭', '面条', '汤品', '甜品', '点心', '美食', '料理', '餐厅', '午餐', '晚餐', '早餐', '火锅', '烧烤',
  '红烧肉', '肉', '牛排', '鸡肉', '鱼', '虾', '蛋', '豆腐', '饺子', '包子', '蛋糕', '饮品', '奶茶', '咖啡',
  'rice', 'noodle', 'soup', 'dish', 'meal', 'food', 'cuisine', 'dessert', 'cake', 'burger', 'pizza', 'salad', 'steak',
];

const PORTRAIT_KEYWORDS = [
  '人像', '肖像', '半身', '全身', '自拍', '合照', '证件照', '人物', '角色', 'portrait', 'selfie', 'photo', 'group photo', 'headshot',
];

const PRODUCT_KEYWORDS = [
  '产品', '商品', '物件', '道具', '包装', '海报', '封面', 'logo', 'logo', 'product', 'studio', 'packshot', 'packaging',
];

const EDITORIAL_COSPLAY_KEYWORDS = [
  '猫娘', '兽耳', 'cos', 'cosplay', '漫展', '写真', '杂志', '封面', '多宫格', '拼贴', 'magazine', 'editorial', 'cover', 'collage', 'coser',
];

const REACTION_IMAGE_KEYWORDS = [
  '反应图', '表情包', '动图感', '卖萌', '逗趣', '搞笑', 'meme', 'reaction', 'sticker', 'emoji',
];

const TEXT_LAYOUT_KEYWORDS = [
  '文字', '文本', '标题', '海报字', '排版', '信息图', '说明图', '流程说明', '清单', '菜单', '公告', '课件', 'ppt', 'PPT', 'typography', 'infographic', 'poster text',
];

const IMAGE_REPAIR_KEYWORDS = [
  '变清晰', '更清晰', '清晰化', '锐化', '去模糊', '修复', '放大', '超分', '降噪', '去噪', '增强', 'restore', 'upscale', 'sharpen', 'denoise', 'deblur',
];

const SCENE_KEYWORDS = [
  '城市', '街道', '建筑', '室内', '房间', '客厅', '卧室', '风景', '山', '海', '森林', '星空', '夜景', '赛博', 'cinematic', 'landscape', 'interior',
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function keywordMatch(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
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

function buildFoodPrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Subject: ${subjectText}.`,
    'Visual direction: premium food photography of a freshly cooked home-style Chinese dish.',
    'Composition: close-up plated dish, appetizing balance of foreground texture and clean negative space, slight 45-degree angle or top-down food-shot framing.',
    'Lighting: soft natural side light, warm highlights, subtle steam, glossy surface detail, crisp texture on eggs, tomatoes, rice grains, or sauce as relevant.',
    'Style: editorial food photography, realistic, high detail, clean table setting, tasteful props only, no clutter.',
    'Mood: warm, inviting, fresh, rich, delicious, restaurant-quality presentation with believable everyday authenticity.',
    'Constraints: no text, no watermark, no UI, no hands, no chopsticks unless requested, no messy background, no distorted food shapes.',
  ].join('\n');
}

function buildPortraitPrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Subject: ${subjectText}.`,
    'Visual direction: cinematic portrait with clear facial expression and believable identity.',
    'Composition: subject centered or rule-of-thirds framing, clean background separation, shallow depth of field, natural pose and readable silhouette.',
    'Lighting: soft key light with gentle rim light, flattering skin tone, controlled contrast, realistic catchlights.',
    'Style: editorial portrait photography, high detail, refined colors, natural texture, no glamour exaggeration.',
    'Constraints: no text, no watermark, no extra limbs, no duplicated faces, no distorted hands, no UI elements.',
  ].join('\n');
}

function buildEditorialCosplayPrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Subject: ${subjectText}.`,
    'Creative direction: high-end cosplay fashion editorial with a coherent original character design, magazine cover energy, polished yet believable convention photography.',
    'Character design: highly recognizable subject, refined costume details, expressive eyes, elegant accessories, clean hair silhouette, readable materials and fabric folds, cute but intelligent temperament.',
    'Layout: multi-panel magazine collage, one hero image occupying about 60% of the canvas, 4-6 supporting frames around it, varied crop sizes, slight photo-border tilt, thin white borders, generous negative space.',
    'Shot list: close half-body hero portrait with direct eye contact and a playful wink; supporting images include front gaze, half-body standing pose, side-profile glance back, hand lightly touching hair, natural standing pose, close bust portrait, and back-view hairstyle detail as space allows.',
    'Photography: editorial portrait photography, realistic convention snapshot atmosphere, 85mm portrait lens, f/1.8 shallow depth of field, soft diffused key light, subtle rim light, natural skin texture, matte finish, realistic hair strands and costume texture.',
    'Color and finish: cool white unified palette, low-saturation cinematic grade, cool gray-blue color grading, refined luxury magazine feeling, crisp but not over-sharpened, HDR-like dynamic range.',
    'Graphic design: tasteful English magazine title, month/date, small logo, barcode, signature-style accent text, modern fashion editorial typography. Text may be decorative and layout-focused; avoid unreadable clutter.',
    'Quality: photorealistic, ultra realistic, professional photography, editorial photography, luxury magazine, best quality, masterpiece.',
    'Constraints: no oily skin shine, no plastic skin, no distorted hands, no extra limbs, no duplicated face, no broken glasses, no messy UI, no watermark, no random Chinese text, no low-resolution collage artifacts.',
  ].join('\n');
}

function buildReactionImagePrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Subject: ${subjectText}.`,
    'Creative direction: expressive reaction image with a clear emotional punchline, cute playful energy, exaggerated but controlled facial expression, instantly readable at chat-bubble size.',
    'Character and action: one primary subject reacting to the situation with a charming over-the-top expression, playful body language, slight motion-comic timing, dynamic pose, lively eyes, readable silhouette.',
    'Composition: square-friendly framing, clean central focus, large expressive face or upper body, enough negative space for chat display, no tiny details that disappear on mobile.',
    'Style: polished sticker/reaction-image aesthetic with subtle animated-GIF feeling captured in a single frame, crisp edges, appealing shapes, soft highlights, lively but not chaotic.',
    'Lighting and color: bright friendly lighting, balanced contrast, clear color hierarchy, warm/cute accent colors, no muddy shadows.',
    'Constraints: no watermark, no UI screenshot, no random text unless explicitly requested, no distorted anatomy, no extra limbs, no uncanny expression, no cluttered background.',
  ].join('\n');
}

function buildTextLayoutPrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Task: create a clean text-first graphic for: ${subjectText}.`,
    'Priority: readable typography, accurate hierarchy, clean spacing, stable layout, and faithful handling of any user-provided wording.',
    'Layout: clear title area, structured sections, consistent alignment, sufficient margins, high contrast, mobile-readable text size.',
    'Style: simple modern graphic design. Use decoration only if it supports readability.',
    'Constraints: do not add unrelated objects, do not invent extra claims, do not use cinematic lighting or photography effects, avoid warped letters, avoid unreadable microtext, no watermark, no UI chrome unless requested.',
  ].join('\n');
}

function buildImageRepairPrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Task: improve image fidelity according to the user request: ${subjectText}.`,
    'Priority: preserve the original subject, composition, identity, text placement, colors, and intent while improving clarity only where requested.',
    'Edits: sharpen important edges, reduce blur/noise, recover readable details, keep natural texture, avoid over-processing.',
    'Constraints: do not redesign the image, do not change the subject, do not add dramatic lighting, do not alter text content, do not invent new objects, no watermark.',
  ].join('\n');
}

function buildProductPrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Subject: ${subjectText}.`,
    'Visual direction: premium studio product shot with a polished, market-ready look.',
    'Composition: clean hero framing, stable silhouette, controlled reflections, tidy background, strong product emphasis.',
    'Lighting: softbox studio lighting, gentle shadows, crisp edges, balanced highlights, no harsh glare unless intentional.',
    'Style: commercial photography, minimal yet elegant, high detail, trustworthy and modern.',
    'Constraints: no text, no watermark, no UI, no clutter, no warped geometry, no accidental labels.',
  ].join('\n');
}

function buildScenePrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Subject: ${subjectText}.`,
    'Visual direction: cinematic scene with a clear spatial sense and strong atmosphere.',
    'Composition: layered foreground, midground, and background, believable scale, strong depth, balanced focal point.',
    'Lighting: atmospheric natural light or carefully designed cinematic lighting, depending on the subject.',
    'Style: high-end illustration or photoreal scene, rich detail, clean color separation, visually expressive but not noisy.',
    'Constraints: no text, no watermark, no UI, no blur-heavy stock look, no overexposed highlights, no impossible geometry.',
  ].join('\n');
}

function buildGenericPrompt(subject: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  return [
    `Subject: ${subjectText}.`,
    'Visual direction: polished image-generation prompt with a clear subject, strong composition, refined lighting, and believable detail.',
    'Style: high quality, visually coherent, natural texture, balanced colors, no clutter, no unnecessary text or interface elements.',
    'Constraints: no watermark, no UI, no blurry stock-photo feel, no distorted anatomy or objects.',
  ].join('\n');
}

function buildAdaptiveHybridPrompt(subject: string, body: string, caption?: string) {
  const subjectText = caption && caption !== subject ? `${subject}，${caption}` : subject;
  const sections = [
    `Subject and user goal: ${subjectText}.`,
    'Prompt strategy: combine only the visual requirements that serve this exact request; do not force every possible style attribute.',
  ];
  if (keywordMatch(body, TEXT_LAYOUT_KEYWORDS)) {
    sections.push(
      'Text/layout requirements: readable typography, accurate hierarchy, clean spacing, stable layout, sufficient margins, high contrast, and faithful handling of any user-provided wording.',
    );
  }
  if (keywordMatch(body, EDITORIAL_COSPLAY_KEYWORDS)) {
    sections.push(
      'Editorial/cosplay requirements: coherent character styling, refined costume and accessory details, magazine-like layout energy, varied photo crops when collage or multi-panel presentation is requested.',
      'Photography for character panels: realistic convention/editorial portrait feel, natural pose, readable face and silhouette, soft diffused light, realistic hair strands and fabric texture.',
    );
  } else if (keywordMatch(body, PORTRAIT_KEYWORDS)) {
    sections.push(
      'Portrait requirements: clear identity, natural pose, readable expression, clean background separation, realistic face and body proportions.',
    );
  }
  if (keywordMatch(body, PRODUCT_KEYWORDS)) {
    sections.push(
      'Product/object requirements: stable silhouette, clean hero framing, controlled reflections, accurate material detail, no warped geometry or accidental labels.',
    );
  }
  if (keywordMatch(body, FOOD_KEYWORDS)) {
    sections.push(
      'Food requirements: appetizing texture, believable plating, fresh ingredients, natural surface detail, clean table setting, no messy background.',
    );
  }
  if (keywordMatch(body, SCENE_KEYWORDS)) {
    sections.push(
      'Scene requirements: clear spatial depth, coherent foreground/midground/background, believable scale, atmosphere that supports the requested subject.',
    );
  }
  if (keywordMatch(body, REACTION_IMAGE_KEYWORDS)) {
    sections.push(
      'Reaction-image requirements: instantly readable emotion at chat size, expressive face/body language, simple silhouette, lively but uncluttered composition.',
    );
  }
  if (keywordMatch(body, IMAGE_REPAIR_KEYWORDS)) {
    sections.push(
      'Fidelity/edit requirements: preserve original subject, identity, composition, text placement, and colors; improve only the requested clarity or repair target; do not redesign the image.',
    );
  }
  sections.push(
    'Quality and constraints: keep details coherent and useful for the requested output; avoid unrelated decorations, unreadable microtext, distorted anatomy, warped objects, random text, UI chrome unless requested, and watermarks.',
  );
  return sections.join('\n');
}

export function enhanceImagePrompt(prompt: string, options: { caption?: string; subject?: string } = {}) {
  const normalized = normalizeText(prompt);
  if (!normalized) return normalized;

  const subject = normalizeText(options.subject || options.caption || normalized);
  const body = `${normalized}\n${options.caption || ''}`.trim();
  if (normalized.split('\n').length > 1 || isDetailedPrompt(normalized) || /(?:composition|lighting|style|camera|photography|illustration|render|studio|cinematic)/i.test(normalized)) {
    return normalized;
  }

  const matchedGroups = [
    keywordMatch(body, TEXT_LAYOUT_KEYWORDS),
    keywordMatch(body, EDITORIAL_COSPLAY_KEYWORDS) || keywordMatch(body, PORTRAIT_KEYWORDS),
    keywordMatch(body, PRODUCT_KEYWORDS),
    keywordMatch(body, FOOD_KEYWORDS),
    keywordMatch(body, SCENE_KEYWORDS),
    keywordMatch(body, REACTION_IMAGE_KEYWORDS),
    keywordMatch(body, IMAGE_REPAIR_KEYWORDS),
  ].filter(Boolean).length;
  if (matchedGroups >= 2) return buildAdaptiveHybridPrompt(subject, body, options.caption);

  if (keywordMatch(body, IMAGE_REPAIR_KEYWORDS)) return buildImageRepairPrompt(subject, options.caption);
  if (keywordMatch(body, TEXT_LAYOUT_KEYWORDS)) return buildTextLayoutPrompt(subject, options.caption);
  if (keywordMatch(body, EDITORIAL_COSPLAY_KEYWORDS)) return buildEditorialCosplayPrompt(subject, options.caption);
  if (keywordMatch(body, REACTION_IMAGE_KEYWORDS)) return buildReactionImagePrompt(subject, options.caption);
  if (keywordMatch(body, FOOD_KEYWORDS)) return buildFoodPrompt(subject, options.caption);
  if (keywordMatch(body, PORTRAIT_KEYWORDS)) return buildPortraitPrompt(subject, options.caption);
  if (keywordMatch(body, PRODUCT_KEYWORDS)) return buildProductPrompt(subject, options.caption);
  if (keywordMatch(body, SCENE_KEYWORDS)) return buildScenePrompt(subject, options.caption);
  return buildGenericPrompt(subject, options.caption);
}
