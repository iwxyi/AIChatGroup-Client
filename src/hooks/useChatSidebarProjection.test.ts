import { describe, expect, it } from 'vitest';
import { resolveLightweightSidebarTab, resolveStorySidebarTab, shouldShowSessionSidebarTab, splitSidebarActions } from './useChatSidebarProjection';
import type { GroupChat } from '../types/chat';

describe('resolveStorySidebarTab', () => {
  it('keeps explicit story asset tabs', () => {
    expect(resolveStorySidebarTab('narrative')).toBe('session');
    expect(resolveStorySidebarTab('chapters')).toBe('chapters');
    expect(resolveStorySidebarTab('clues')).toBe('clues');
    expect(resolveStorySidebarTab('roles')).toBe('roles');
    expect(resolveStorySidebarTab('developer')).toBe('developer');
  });

  it('maps ordinary chat tabs to the story overview instead of member management', () => {
    expect(resolveStorySidebarTab('members')).toBe('session');
    expect(resolveStorySidebarTab('world')).toBe('session');
    expect(resolveStorySidebarTab('actions')).toBe('session');
    expect(resolveStorySidebarTab('activities')).toBe('session');
  });
});

describe('resolveLightweightSidebarTab', () => {
  it('keeps the narrative tab selected in lightweight direct and open-chat sidebars', () => {
    expect(resolveLightweightSidebarTab({
      rightPanelTab: 'narrative',
      showMemberTab: true,
      showRuntimeTab: true,
      showActionTab: false,
    })).toBe('narrative');

    expect(resolveLightweightSidebarTab({
      rightPanelTab: 'narrative',
      showMemberTab: true,
      showRuntimeTab: true,
      showActionTab: true,
    })).toBe('narrative');
  });

  it('falls back to members only when the requested lightweight tab is not available', () => {
    expect(resolveLightweightSidebarTab({
      rightPanelTab: 'chapters',
      showMemberTab: true,
      showRuntimeTab: true,
      showActionTab: false,
    })).toBe('members');
  });
});

describe('splitSidebarActions', () => {
  it('keeps gameplay actions in the session tab and private thread actions in activities', () => {
    const groups = splitSidebarActions([
      { type: 'question_member', label: '质询成员' },
      { type: 'start_private_thread', label: '发起 AI 私聊' },
      { type: 'summarize_discussion', label: '总结审议' },
      { type: 'attention_followup_user', label: '跟进用户' },
    ]);

    expect(groups.sessionActions.map((action) => action.type)).toEqual(['question_member', 'summarize_discussion']);
    expect(groups.activityActions.map((action) => action.type)).toEqual(['start_private_thread', 'attention_followup_user']);
  });
});

describe('shouldShowSessionSidebarTab', () => {
  it('keeps the deliberation tab visible even when an analysis room has no session actions', () => {
    expect(shouldShowSessionSidebarTab({
      sessionKind: { topology: 'group', family: 'analysis', scenarioId: 'opinion-review', surfaceProfile: 'text' },
    } as GroupChat, false)).toBe(true);
  });

  it('does not add an empty session tab to ordinary conversation rooms', () => {
    expect(shouldShowSessionSidebarTab({
      sessionKind: { topology: 'group', family: 'conversation', scenarioId: 'open-chat', surfaceProfile: 'text' },
    } as GroupChat, false)).toBe(false);
  });
});
