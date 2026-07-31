import { describe, expect, it } from 'vitest';
import { composeImagePrompt, enhanceImagePrompt } from './imagePromptComposer';

describe('imagePromptComposer', () => {
  it('wraps terse requests with model-guided expansion instead of local keyword templates', () => {
    const prompt = enhanceImagePrompt('番茄炒蛋');

    expect(prompt).toContain('Original user image request: 番茄炒蛋');
    expect(prompt).toContain('Use adaptive judgement');
    expect(prompt).toContain('Do not infer a fixed category from local keywords');
    expect(prompt).not.toContain('premium food photography');
    expect(prompt).not.toContain('soft natural side light');
  });

  it('keeps already detailed prompts intact', () => {
    const prompt = 'A cinematic portrait, soft rim light, shallow depth of field, editorial photography';

    expect(enhanceImagePrompt(prompt)).toBe(prompt);
  });

  it('does not treat poster-like words as local semantic categories', () => {
    const plan = composeImagePrompt('做一张茶饮新品包装海报');

    expect(plan).toMatchObject({
      strategy: 'model_guided_expansion',
      preservedOriginal: false,
      appliedModules: ['needs_model_expansion'],
      warnings: ['semantic_expansion_deferred_to_model'],
    });
    expect(plan.finalPrompt).toContain('Original user image request: 做一张茶饮新品包装海报');
    expect(plan.finalPrompt).not.toContain('Text/layout requirements');
    expect(plan.finalPrompt).not.toContain('Product/object requirements');
  });

  it('does not force reaction-image styling from local keywords', () => {
    const prompt = enhanceImagePrompt('一张轻松逗趣、表情夸张、带有动图感的卖萌反应图');

    expect(prompt).toContain('Original user image request');
    expect(prompt).toContain('add only visual details that directly help this specific image');
    expect(prompt).not.toContain('chat-bubble size');
    expect(prompt).not.toContain('expressive reaction image');
  });

  it('does not force text-layout styling from local keywords', () => {
    const prompt = enhanceImagePrompt('做一张活动流程说明图，标题是周末茶会');

    expect(prompt).toContain('Preserve any user-provided wording');
    expect(prompt).toContain('Do not force photography terms');
    expect(prompt).not.toContain('readable typography');
    expect(prompt).not.toContain('do not use cinematic lighting');
  });

  it('keeps edit requests faithful without local repair templates', () => {
    const prompt = enhanceImagePrompt('把这张图变清晰，锐化文字边缘');

    expect(prompt).toContain('If the request is an edit or uses reference images');
    expect(prompt).toContain('keep identity, composition, text, and non-target areas stable');
    expect(prompt).not.toContain('Fidelity/edit requirements');
    expect(prompt).not.toContain('do not redesign the image');
  });

  it('keeps detailed Chinese prompts intact instead of rewriting user intent', () => {
    const prompt = '多宫格杂志写真，眼镜猫娘cosplay，白色猫耳，银白色长发，精致金属细框眼镜，主图占据画面约60%，其余照片围绕主体排列，白色细边框，柔和漫射光，85mm人像镜头，f1.8，低饱和电影色调，1:1';

    expect(enhanceImagePrompt(prompt)).toBe(prompt);
    expect(composeImagePrompt(prompt)).toMatchObject({
      strategy: 'preserve_detailed',
      preservedOriginal: true,
      appliedModules: ['preserve_user_prompt', 'has_detail_signals'],
    });
  });

  it('keeps long but underspecified requests model-guided instead of guessing a category', () => {
    const prompt = '帮我做一张红烧肉图片，要看起来非常好吃，适合发给朋友看，让人一眼就想吃，最好有一点家常但又不普通的感觉，整体舒服一点，不要太乱，也不要太假';
    const enhanced = enhanceImagePrompt(prompt);

    expect(enhanced).toContain(prompt);
    expect(enhanced).toContain('Generate the image directly from this request');
    expect(enhanced).not.toContain('premium food photography');
  });

  it('returns a structured plan for evaluation and diagnostics', () => {
    const plan = composeImagePrompt('做一张信息图，中间嵌入一组眼镜猫娘杂志写真', { source: 'agent' });

    expect(plan).toMatchObject({
      strategy: 'model_guided_expansion',
      preservedOriginal: false,
      appliedModules: ['needs_model_expansion'],
      warnings: ['semantic_expansion_deferred_to_model'],
    });
    expect(plan.finalPrompt).toContain('Do not infer a fixed category from local keywords');
    expect(plan.finalPrompt).toContain('Do not force photography terms');
  });

  it('keeps optional caption as context without replacing the user request', () => {
    const plan = composeImagePrompt('标题再大一点', { caption: '上一张生成图：红色活动海报' });

    expect(plan.finalPrompt).toContain('Original user image request: 标题再大一点');
    expect(plan.finalPrompt).toContain('Conversation/context hint: 上一张生成图：红色活动海报');
    expect(plan.appliedModules).toEqual(['needs_model_expansion', 'has_reference_context']);
  });

  it('surfaces empty prompt warnings for later evaluation', () => {
    const plan = composeImagePrompt('   ');

    expect(plan).toMatchObject({
      strategy: 'empty',
      preservedOriginal: true,
      appliedModules: ['empty_guard'],
      warnings: ['empty_prompt'],
    });
  });

  it.each([
    '红烧肉照片',
    '赛博城市夜景',
    '把上一张图里的标题改大一点，保持其它内容不变',
    '做一张茶饮新品包装海报',
    '海报',
  ])('defers semantic prompt expansion to the model: %s', (input) => {
    const plan = composeImagePrompt(input);

    expect(plan.strategy).toBe('model_guided_expansion');
    expect(plan.appliedModules).toEqual(['needs_model_expansion']);
    expect(plan.finalPrompt).toContain(input);
    expect(plan.finalPrompt).not.toContain('Food requirements');
    expect(plan.finalPrompt).not.toContain('Product/object requirements');
    expect(plan.finalPrompt).not.toContain('Text/layout requirements');
  });
});
