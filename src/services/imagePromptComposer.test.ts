import { describe, expect, it } from 'vitest';
import { enhanceImagePrompt } from './imagePromptComposer';

describe('imagePromptComposer', () => {
  it('expands terse food prompts into a more polished food photography prompt', () => {
    const prompt = enhanceImagePrompt('番茄炒蛋');

    expect(prompt).toContain('premium food photography');
    expect(prompt).toContain('soft natural side light');
    expect(prompt).toContain('番茄炒蛋');
    expect(prompt).not.toBe('番茄炒蛋');
  });

  it('keeps already detailed prompts intact', () => {
    const prompt = 'A cinematic portrait, soft rim light, shallow depth of field, editorial photography';

    expect(enhanceImagePrompt(prompt)).toBe(prompt);
  });

  it('expands terse reaction image prompts into a concrete production prompt', () => {
    const prompt = enhanceImagePrompt('一张轻松逗趣、表情夸张、带有动图感的卖萌反应图');

    expect(prompt).toContain('expressive reaction image');
    expect(prompt).toContain('chat-bubble size');
    expect(prompt).toContain('no watermark');
    expect(prompt).not.toContain('premium food photography');
  });

  it('expands terse cosplay magazine prompts with editorial layout details', () => {
    const prompt = enhanceImagePrompt('眼镜猫娘cosplay多宫格杂志写真，1:1');

    expect(prompt).toContain('multi-panel magazine collage');
    expect(prompt).toContain('one hero image occupying about 60%');
    expect(prompt).toContain('85mm portrait lens');
    expect(prompt).toContain('眼镜猫娘cosplay多宫格杂志写真');
  });

  it('keeps text-first graphics focused on readability instead of cinematic styling', () => {
    const prompt = enhanceImagePrompt('做一张活动流程说明图，标题是周末茶会');

    expect(prompt).toContain('text-first graphic');
    expect(prompt).toContain('readable typography');
    expect(prompt).toContain('do not use cinematic lighting');
    expect(prompt).not.toContain('85mm portrait lens');
  });

  it('keeps clarity edits faithful instead of adding aesthetic requirements', () => {
    const prompt = enhanceImagePrompt('把这张图变清晰，锐化文字边缘');

    expect(prompt).toContain('Fidelity/edit requirements');
    expect(prompt).toContain('preserve original subject');
    expect(prompt).toContain('do not redesign the image');
    expect(prompt).not.toContain('cinematic portrait');
  });

  it('combines relevant modules for hybrid requests instead of using a single fixed type', () => {
    const prompt = enhanceImagePrompt('做一张信息图，中间嵌入一组眼镜猫娘杂志写真');

    expect(prompt).toContain('Text/layout requirements');
    expect(prompt).toContain('readable typography');
    expect(prompt).toContain('Editorial/cosplay requirements');
    expect(prompt).toContain('Photography for character panels');
    expect(prompt).not.toContain('do not use cinematic lighting');
  });

  it('keeps detailed Chinese prompts intact instead of rewriting user intent', () => {
    const prompt = '多宫格杂志写真，眼镜猫娘cosplay，白色猫耳，银白色长发，精致金属细框眼镜，主图占据画面约60%，其余照片围绕主体排列，白色细边框，柔和漫射光，85mm人像镜头，f1.8，低饱和电影色调，1:1';

    expect(enhanceImagePrompt(prompt)).toBe(prompt);
  });

  it('still enhances long but underspecified requests', () => {
    const prompt = '帮我做一张红烧肉图片，要看起来非常好吃，适合发给朋友看，让人一眼就想吃，最好有一点家常但又不普通的感觉，整体舒服一点，不要太乱，也不要太假';
    const enhanced = enhanceImagePrompt(prompt);

    expect(enhanced).toContain('premium food photography');
    expect(enhanced).toContain(prompt);
  });
});
