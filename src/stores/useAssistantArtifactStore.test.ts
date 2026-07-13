import { beforeEach, describe, expect, it } from 'vitest';
import { useAssistantArtifactStore } from './useAssistantArtifactStore';

describe('useAssistantArtifactStore', () => {
  beforeEach(() => {
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
});
