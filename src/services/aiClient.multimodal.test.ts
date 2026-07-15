import { afterEach, describe, expect, it } from 'vitest';
import { generateResponse } from './aiClient';

const fetchMock = globalThis.fetch;

describe('aiClient multimodal requests', () => {
  afterEach(() => {
    globalThis.fetch = fetchMock;
  });

  it('builds OpenAI-compatible image message content', async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init || {});
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    await generateResponse({ provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' }, 'system', [{
      role: 'user',
      content: '看这张图',
      attachments: [{ url: 'data:image/png;base64,AAA', mimeType: 'image/png' }],
    }]);

    const body = JSON.parse(String(calls[0]?.body || '{}'));
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: '看这张图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ]);
  });

  it('builds Anthropic image content with base64 source', async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init || {});
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    await generateResponse({ provider: 'anthropic', apiKey: 'k', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-0' }, 'system', [{
      role: 'user',
      content: '看图',
      attachments: [{ url: 'data:image/jpeg;base64,BBB', mimeType: 'image/jpeg' }],
    }]);

    const body = JSON.parse(String(calls[0]?.body || '{}'));
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: '看图' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBB' } },
    ]);
  });

  it('builds Gemini image parts with inlineData', async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init || {});
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    await generateResponse({ provider: 'google', apiKey: 'k', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' }, 'system', [{
      role: 'user',
      content: '图片里是什么',
      attachments: [{ url: 'data:image/webp;base64,CCC', mimeType: 'image/webp' }],
    }]);

    const body = JSON.parse(String(calls[0]?.body || '{}'));
    expect(body.contents[0].parts).toEqual([
      { text: '图片里是什么' },
      { inlineData: { mimeType: 'image/webp', data: 'CCC' } },
    ]);
  });

  it('rejects inline image data in text content before making a text request', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    await expect(generateResponse(
      { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
      'system',
      [{
        role: 'user',
        content: `参考图：data:image/png;base64,${'A'.repeat(2048)}`,
      }],
    )).rejects.toThrow(/inline image data/i);
    expect(called).toBe(false);
  });

  it('rejects oversized text payloads before making a request', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    await expect(generateResponse(
      { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
      'system',
      [{ role: 'user', content: 'x'.repeat(128) }],
      undefined,
      { maxInputChars: 32 },
    )).rejects.toThrow(/too large/i);
    expect(called).toBe(false);
  });
});
