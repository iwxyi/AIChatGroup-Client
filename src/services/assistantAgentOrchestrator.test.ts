import { describe, expect, it } from 'vitest';
import type { AssistantAgentChangePlan, AssistantAgentPatchSet, AssistantArtifactItem } from '../types/assistantArtifact';
import { validateAssistantAgentPatchSet } from './assistantAgentOrchestrator';

function artifact(overrides: Partial<AssistantArtifactItem> = {}): AssistantArtifactItem {
  return {
    id: 'artifact-a',
    chatId: 'chat-a',
    kind: 'diagram',
    title: '注册流程',
    summary: '注册流程图',
    language: 'mermaid',
    currentVersionId: 'version-a',
    sourceMessageId: 'message-a',
    createdAt: 1,
    updatedAt: 1,
    versions: [{
      id: 'version-a',
      artifactId: 'artifact-a',
      content: 'flowchart TD\nA-->B',
      language: 'mermaid',
      sourceMessageId: 'message-a',
      createdAt: 1,
    }],
    deletedAt: null,
    ...overrides,
  };
}

describe('assistantAgentOrchestrator validation', () => {
  it('rejects update patches outside the planned artifact scope', () => {
    const plan: AssistantAgentChangePlan = {
      intent: 'update',
      scope: { targetMode: 'single', artifactIds: ['artifact-a'] },
      operations: [{ kind: 'style_change', instruction: '字体小一些' }],
      requiresConfirmation: false,
      confidence: 0.92,
    };
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '已调整。',
      patches: [{
        action: 'update',
        artifactId: 'artifact-b',
        kind: 'diagram',
        title: '注册流程',
        language: 'mermaid',
        content: 'flowchart TD\nA-->B',
        baseVersionId: 'version-b',
      }],
    };

    expect(validateAssistantAgentPatchSet({
      patchSet,
      plan,
      existingArtifacts: [artifact()],
    }).patches).toEqual([]);
  });

  it('rejects stale update patches when base version does not match', () => {
    const plan: AssistantAgentChangePlan = {
      intent: 'update',
      scope: { targetMode: 'single', artifactIds: ['artifact-a'] },
      operations: [{ kind: 'content_edit', instruction: '增加审批节点' }],
      requiresConfirmation: false,
      confidence: 0.92,
    };
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '已调整。',
      patches: [{
        action: 'update',
        artifactId: 'artifact-a',
        kind: 'diagram',
        title: '注册流程',
        language: 'mermaid',
        content: 'flowchart TD\nA-->B-->C',
        baseVersionId: 'old-version',
      }],
    };

    expect(validateAssistantAgentPatchSet({
      patchSet,
      plan,
      existingArtifacts: [artifact()],
    }).patches).toEqual([]);
  });
});
