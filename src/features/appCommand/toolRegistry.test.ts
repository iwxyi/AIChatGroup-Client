import { describe, expect, it } from 'vitest';
import {
  getAppCommandToolPrompt,
  normalizeAppCommandActionRisk,
  shouldConfirmAppCommandTool,
} from './toolRegistry';

describe('appCommand tool registry', () => {
  it('derives risk from registered tool definitions', () => {
    expect(normalizeAppCommandActionRisk('delete_characters', 'low')).toBe('medium');
    expect(normalizeAppCommandActionRisk('delete_chats', 'low')).toBe('medium');
    expect(normalizeAppCommandActionRisk('rename_chat', 'low')).toBe('medium');
    expect(normalizeAppCommandActionRisk('update_characters', 'low')).toBe('high');
    expect(normalizeAppCommandActionRisk('read_character_info', 'low')).toBe('low');
  });

  it('centralizes confirmation policy by source and risk', () => {
    expect(shouldConfirmAppCommandTool({
      action: 'create_characters',
      source: 'home',
      riskLevel: 'medium',
    })).toBe(false);
    expect(shouldConfirmAppCommandTool({
      action: 'create_characters',
      source: 'assistant',
      riskLevel: 'medium',
    })).toBe(true);
    expect(shouldConfirmAppCommandTool({
      action: 'update_characters',
      source: 'home',
      riskLevel: 'high',
      requestedConfirmation: false,
    })).toBe(true);
  });

  it('exposes delete characters as a planner-visible real tool', () => {
    expect(getAppCommandToolPrompt('assistant')).toContain('delete_characters');
    expect(getAppCommandToolPrompt('assistant')).toContain('restore_characters');
    expect(getAppCommandToolPrompt('assistant')).toContain('manage_group_members');
  });
});
