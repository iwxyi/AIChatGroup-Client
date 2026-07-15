import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AICharacter } from '../types/character';
import type { Message } from '../types/message';
import type { AIModelProfile } from '../types/settings';
import { processRichMessageMedia, retryRichMessageMedia } from './richMessageMedia';
import { generateImageWithAdapter } from './aiGenerationAdapter';
import { api } from './api';

vi.mock('./api', () => ({
  api: {
    createMediaAsset: vi.fn(),
    updateMessageMetadata: vi.fn(),
  },
}));

vi.mock('./aiGenerationAdapter', () => ({
  generateImageWithAdapter: vi.fn(),
  synthesizeSpeechWithAdapter: vi.fn(),
}));

const imageProfile: AIModelProfile = {
  id: 'image-default',
  name: '默认图片',
  type: 'image',
  provider: 'openai',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'image-model',
  isDefault: true,
};

const chatStoreState = vi.hoisted(() => ({
  chats: [] as Array<Record<string, unknown>>,
}));

const artifactStoreState = vi.hoisted(() => ({
  createImageArtifactFromAttachment: vi.fn(),
}));

vi.mock('../stores/useChatStore', () => ({
  useChatStore: { getState: () => chatStoreState },
}));

vi.mock('../stores/useAssistantArtifactStore', () => ({
  useAssistantArtifactStore: { getState: () => artifactStoreState },
}));

const character = {
  id: 'mei',
  name: '美羊羊',
  avatar: '',
  modelProfileIds: {},
} as AICharacter;

const subjectCharacter = {
  id: 'hui',
  name: '灰太狼',
  avatar: '',
  visualIdentity: {
    description: '灰色狼，黄色补丁帽，两撇胡子',
    negativePrompt: 'no sheep ears',
    seed: 777,
  },
} as AICharacter;

function buildQueuedImageMessage(patch: Partial<Message> = {}): Message {
  return {
    id: patch.id || 'm-image',
    chatId: 'chat-1',
    type: 'ai',
    senderId: 'mei',
    senderName: '美羊羊',
    content: '我把图发你看。',
    emotion: 0,
    timestamp: 123,
    isDeleted: false,
    metadata: {
      attachments: [{
        id: 'image-1',
        kind: 'image',
        status: 'queued',
        promptText: '灰太狼证件照',
        altText: '灰太狼证件照',
        createdAt: 123,
        updatedAt: 123,
      }],
    },
    ...patch,
  };
}

describe('processRichMessageMedia', () => {
  const localStorageMock = (() => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    };
  })();

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
    vi.clearAllMocks();
    localStorage.clear();
    chatStoreState.chats = [];
    artifactStoreState.createImageArtifactFromAttachment.mockReset();
    vi.mocked(api.updateMessageMetadata).mockResolvedValue({});
  });

  it('marks the message-level generation state as failed when image generation cannot run', async () => {
    const upserts: Message[] = [];

    await processRichMessageMedia({
      message: buildQueuedImageMessage(),
      character,
      aiProfiles: [],
      upsertMessage: (message) => upserts.push(message),
    });

    expect(upserts).toHaveLength(2);
    expect(upserts[0]?.metadata?.attachments?.[0]?.status).toBe('generating');
    expect(upserts[0]?.metadata?.generation?.status).toBe('generating');
    expect(upserts[1]?.metadata?.attachments?.[0]?.status).toBe('failed');
    expect(upserts[1]?.metadata?.attachments?.[0]?.error).toBe('图片模型未配置');
    expect(upserts[1]?.metadata?.generation?.status).toBe('failed');
  });

  it('marks the message-level generation state as ready after a generated image is attached', async () => {
    vi.mocked(generateImageWithAdapter).mockResolvedValue([{
      dataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
    }]);
    const upserts: Message[] = [];

    await processRichMessageMedia({
      message: buildQueuedImageMessage(),
      character,
      aiProfiles: [imageProfile],
      upsertMessage: (message) => upserts.push(message),
    });

    expect(upserts.at(-1)?.metadata?.attachments?.[0]).toMatchObject({
      status: 'ready',
      url: 'data:image/png;base64,abc',
      mimeType: 'image/png',
    });
    expect(upserts.at(-1)?.metadata?.generation?.status).toBe('ready');
  });

  it('keeps the generated data url visible if media asset creation returns no url', async () => {
    vi.mocked(generateImageWithAdapter).mockResolvedValue([{
      dataUrl: 'data:image/png;base64,fallback',
      mimeType: 'image/png',
    }]);
    const { api } = await import('./api');
    vi.mocked(api.createMediaAsset).mockResolvedValue({
      id: 'asset-missing-url',
      url: '',
      mimeType: 'image/png',
      sizeBytes: 1234,
    });
    localStorage.setItem('pneumata-auth-mode', 'cloud');
    localStorage.setItem('pneumata-cloud-sync-enabled', '1');
    const upserts: Message[] = [];

    await processRichMessageMedia({
      message: buildQueuedImageMessage(),
      character,
      aiProfiles: [imageProfile],
      upsertMessage: (message) => upserts.push(message),
    });

    expect(upserts.at(-1)?.metadata?.attachments?.[0]).toMatchObject({
      status: 'ready',
      assetId: 'asset-missing-url',
      url: 'data:image/png;base64,fallback',
    });
  });

  it('registers generated assistant images as image artifacts when agent artifacts are enabled', async () => {
    chatStoreState.chats = [{
      id: 'chat-1',
      type: 'assistant',
      modeState: { assistantCapabilities: { agent: true, artifacts: true } },
    }];
    artifactStoreState.createImageArtifactFromAttachment.mockReturnValue({
      id: 'artifact-image-1',
      kind: 'image',
      title: '灰太狼证件照',
    });
    vi.mocked(generateImageWithAdapter).mockResolvedValue([{
      dataUrl: 'data:image/png;base64,cloud',
      mimeType: 'image/png',
    }]);
    const { api } = await import('./api');
    vi.mocked(api.createMediaAsset).mockResolvedValue({
      id: 'asset-1',
      url: '/uploads/media/u/chat/image.png',
      mimeType: 'image/png',
      sizeBytes: 1234,
      checksum: 'hash',
    });
    localStorage.setItem('pneumata-auth-mode', 'cloud');
    localStorage.setItem('pneumata-cloud-sync-enabled', '1');
    const upserts: Message[] = [];

    await processRichMessageMedia({
      message: buildQueuedImageMessage(),
      character,
      aiProfiles: [imageProfile],
      upsertMessage: (message) => upserts.push(message),
    });

    expect(artifactStoreState.createImageArtifactFromAttachment).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 'chat-1',
      attachment: expect.objectContaining({ assetId: 'asset-1', status: 'ready' }),
    }));
    expect(upserts.at(-1)?.metadata?.assistant?.artifacts?.[0]).toMatchObject({
      id: 'artifact-image-1',
      kind: 'image',
      title: '灰太狼证件照',
    });
  });

  it('uses referenced subject characters for image generation instead of the sending character', async () => {
    vi.mocked(generateImageWithAdapter).mockResolvedValue([{
      dataUrl: 'data:image/png;base64,subject',
      mimeType: 'image/png',
    }]);
    const upserts: Message[] = [];

    await processRichMessageMedia({
      message: buildQueuedImageMessage({
        metadata: {
          attachments: [{
            id: 'image-1',
            kind: 'image',
            status: 'queued',
            promptText: '灰太狼证件照',
            altText: '灰太狼证件照',
            referenceCharacterIds: ['hui'],
            createdAt: 123,
            updatedAt: 123,
          }],
        },
      }),
      character,
      characters: [character, subjectCharacter],
      aiProfiles: [imageProfile],
      upsertMessage: (message) => upserts.push(message),
    });

    expect(generateImageWithAdapter).toHaveBeenCalledWith(expect.objectContaining({
      character: null,
      characters: [subjectCharacter],
      negativePrompt: 'no sheep ears',
      seed: 777,
    }));
    expect(upserts.at(-1)?.metadata?.attachments?.[0]).toMatchObject({
      status: 'ready',
      url: 'data:image/png;base64,subject',
    });
  });

  it('passes explicit reference images from the message attachment to the image adapter', async () => {
    vi.mocked(generateImageWithAdapter).mockResolvedValue([{
      dataUrl: 'data:image/png;base64,referenced',
      mimeType: 'image/png',
    }]);
    const upserts: Message[] = [];

    await processRichMessageMedia({
      message: buildQueuedImageMessage({
        metadata: {
          attachments: [{
            id: 'image-1',
            kind: 'image',
            status: 'queued',
            promptText: '按参考图风格生成海报',
            altText: '参考图海报',
            referenceImages: [{ url: 'https://example.test/reference.png', mimeType: 'image/png', label: '用户参考图' }],
            createdAt: 123,
            updatedAt: 123,
          }],
        },
      }),
      aiProfiles: [imageProfile],
      upsertMessage: (message) => upserts.push(message),
    });

    expect(generateImageWithAdapter).toHaveBeenCalledWith(expect.objectContaining({
      referenceImages: [{ url: 'https://example.test/reference.png', mimeType: 'image/png', label: '用户参考图' }],
    }));
    expect(upserts.at(-1)?.metadata?.attachments?.[0]?.status).toBe('ready');
  });

  it('retries a failed media attachment by resetting it to queued and running the same pipeline', async () => {
    vi.mocked(generateImageWithAdapter).mockResolvedValue([{
      dataUrl: 'data:image/png;base64,retry',
      mimeType: 'image/png',
    }]);
    const failedMessage = buildQueuedImageMessage({
      metadata: {
        attachments: [{
          id: 'image-1',
          kind: 'image',
          status: 'failed',
          promptText: '灰太狼证件照',
          altText: '灰太狼证件照',
          error: '上次生成失败',
          createdAt: 123,
          updatedAt: 124,
        }],
        generation: { status: 'failed', updatedAt: 124 },
      },
    });
    const upserts: Message[] = [];

    await retryRichMessageMedia({
      message: failedMessage,
      attachmentId: 'image-1',
      character,
      aiProfiles: [imageProfile],
      upsertMessage: (message) => upserts.push(message),
    });

    expect(upserts[0]?.metadata?.attachments?.[0]).toMatchObject({
      status: 'queued',
      error: undefined,
      url: undefined,
    });
    expect(upserts[1]?.metadata?.attachments?.[0]?.status).toBe('generating');
    expect(upserts.at(-1)?.metadata?.attachments?.[0]).toMatchObject({
      status: 'ready',
      url: 'data:image/png;base64,retry',
    });
    expect(upserts.at(-1)?.metadata?.generation?.status).toBe('ready');
  });
});
