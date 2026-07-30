import { describe, expect, it } from 'vitest';
import {
  getAppCommandToolPrompt,
  normalizeAppCommandActionRisk,
  validateAppCommandPlan,
  shouldConfirmAppCommandTool,
} from './toolRegistry';
import type { LocalActionPlan } from './commandTypes';

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
    expect(getAppCommandToolPrompt('assistant')).toContain('search_chats');
  });

  it('validates planner plans with tool-specific required fields', () => {
    expect(validateAppCommandPlan({
      action: 'search_chats',
    } as LocalActionPlan)?.reasonType).toBe('missing_chat_query');
    expect(validateAppCommandPlan({
      action: 'read_character_info',
      characterQuery: '皇帝',
    } as LocalActionPlan)).toBeNull();
    expect(validateAppCommandPlan({
      action: 'open_existing_chat',
      chatQuery: '世界杯',
    } as LocalActionPlan)).toBeNull();
  });
});
