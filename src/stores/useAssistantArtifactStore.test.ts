import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantArtifactStore } from './useAssistantArtifactStore';

const apiMocks = vi.hoisted(() => ({
  upsertAssistantArtifact: vi.fn(),
  upsertAssistantArtifacts: vi.fn(),
  getAssistantArtifacts: vi.fn(),
}));

vi.mock('../services/api', () => ({ api: apiMocks }));
vi.mock('../services/cloudSyncPreference', () => ({ isCloudSyncEnabled: () => true }));
vi.mock('../services/assistantArtifactCloudSyncPreference', () => ({ isAssistantArtifactCloudSyncEnabled: () => true }));

describe('useAssistantArtifactStore', () => {
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
    localStorage.clear();
    apiMocks.upsertAssistantArtifact.mockReset();
    apiMocks.upsertAssistantArtifacts.mockReset();
    apiMocks.getAssistantArtifacts.mockReset();
    localStorage.setItem('pneumata-auth-mode', 'cloud');
    useAssistantArtifactStore.setState({ items: [] });
  });

  it('does not merge new artifacts by title without an explicit update target', () => {
    const store = useAssistantArtifactStore.getState();
    store.commitPatchSet({
      chatId: 'chat-a',
      messageId: 'message-a',
      timestamp: 100,
      patches: [{
        action: 'create',
        kind: 'diagram',
        title: '流程图',
        language: 'mermaid',
        content: 'flowchart TD\nA-->B',
      }, {
        action: 'create',
        kind: 'diagram',
        title: '流程图',
        language: 'mermaid',
        content: 'flowchart TD\nC-->D',
      }],
    });

    const artifacts = useAssistantArtifactStore.getState().getArtifactsForChat('chat-a');
    expect(artifacts).toHaveLength(2);
    expect(artifacts.every((artifact) => artifact.versions.length === 1)).toBe(true);
  });

  it('adds a new version only when update specifies an existing artifact id', () => {
    const store = useAssistantArtifactStore.getState();
    const [created] = store.commitPatchSet({
      chatId: 'chat-a',
      messageId: 'message-a',
      timestamp: 100,
      patches: [{
        action: 'create',
        kind: 'diagram',
        title: '流程图',
        language: 'mermaid',
        content: 'flowchart TD\nA-->B',
      }],
    });
    useAssistantArtifactStore.getState().commitPatchSet({
      chatId: 'chat-a',
      messageId: 'message-b',
      timestamp: 200,
      patches: [{
        action: 'update',
        artifactId: created.id,
        kind: 'diagram',
        title: '流程图',
        language: 'mermaid',
        content: 'flowchart TD\nA-->B-->C',
        baseVersionId: created.currentVersionId,
      }],
    });

    const artifacts = useAssistantArtifactStore.getState().getArtifactsForChat('chat-a');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].versions).toHaveLength(2);
  });

  it('merges server revision after a cloud push', async () => {
    const [created] = useAssistantArtifactStore.getState().commitPatchSet({
      chatId: 'chat-a',
      messageId: 'message-a',
      timestamp: 100,
      patches: [{
        action: 'create',
        kind: 'document',
        title: '报告',
        content: '# 报告',
      }],
    });
    apiMocks.upsertAssistantArtifact.mockResolvedValueOnce({
      accepted: true,
      status: 'accepted',
      item: { ...created, revision: 7, updatedAt: 120 },
    });

    await useAssistantArtifactStore.getState().pushArtifactsToCloud('chat-a', [created.id]);

    expect(apiMocks.upsertAssistantArtifact).toHaveBeenCalledWith(expect.objectContaining({
      id: created.id,
      baseRevision: null,
      operationId: expect.stringContaining(created.id),
    }));
    expect(useAssistantArtifactStore.getState().items.find((item) => item.id === created.id)?.revision).toBe(7);
  });

  it('creates an image artifact from a ready assistant media asset reference', () => {
    const message = {
      id: 'message-image',
      chatId: 'chat-a',
      type: 'ai',
      senderId: 'assistant',
      senderName: '助手',
      content: '图片已生成',
      emotion: 0,
      timestamp: 100,
      isDeleted: false,
    } as const;
    const item = useAssistantArtifactStore.getState().createImageArtifactFromAttachment({
      chatId: 'chat-a',
      message,
      attachment: {
        id: 'image-1',
        kind: 'image',
        status: 'ready',
        altText: '流程图预览图',
        assetId: 'asset-1',
        url: '/uploads/media/u/chat/image.png',
        mimeType: 'image/png',
        sizeBytes: 1234,
        createdAt: 100,
        updatedAt: 120,
      },
      timestamp: 130,
    });

    expect(item?.kind).toBe('image');
    expect(item?.versions[0]?.media?.[0]).toMatchObject({ assetId: 'asset-1', mimeType: 'image/png' });
    expect(useAssistantArtifactStore.getState().getArtifactsForChat('chat-a')).toHaveLength(1);
  });
});
