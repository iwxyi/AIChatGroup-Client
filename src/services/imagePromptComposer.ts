const FOOD_KEYWORDS = [
  '炒', '煎', '煮', '蒸', '烤', '炸', '炖', '焖', '烩', '拌', '菜', '饭', '面', '汤', '甜品', '点心', '美食', '料理', '餐', '火锅', '烧烤',
  'rice', 'noodle', 'soup', 'dish', 'meal', 'food', 'cuisine', 'dessert', 'cake', 'burger', 'pizza', 'salad', 'steak',
];

const PORTRAIT_KEYWORDS = [
  '人像', '肖像', '半身', '全身', '自拍', '合照', '证件照', '人物', '角色', 'portrait', 'selfie', 'photo', 'group photo', 'headshot',
];

const PRODUCT_KEYWORDS = [
  '产品', '商品', '物件', '道具', '包装', '海报', '封面', 'logo', 'logo', 'product', 'studio', 'packshot', 'packaging',
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

export function enhanceImagePrompt(prompt: string, options: { caption?: string; subject?: string } = {}) {
  const normalized = normalizeText(prompt);
  if (!normalized) return normalized;

  const subject = normalizeText(options.subject || options.caption || normalized);
  const body = `${normalized}\n${options.caption || ''}`.trim();
  if (normalized.length >= 160 || normalized.split('\n').length > 1 || /(?:composition|lighting|style|camera|photography|illustration|render|studio|cinematic)/i.test(normalized)) {
    return normalized;
  }

  if (keywordMatch(body, FOOD_KEYWORDS)) return buildFoodPrompt(subject, options.caption);
  if (keywordMatch(body, PORTRAIT_KEYWORDS)) return buildPortraitPrompt(subject, options.caption);
  if (keywordMatch(body, PRODUCT_KEYWORDS)) return buildProductPrompt(subject, options.caption);
  if (keywordMatch(body, SCENE_KEYWORDS)) return buildScenePrompt(subject, options.caption);
  return buildGenericPrompt(subject, options.caption);
}
