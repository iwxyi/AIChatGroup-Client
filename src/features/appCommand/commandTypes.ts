import type { NavigateFunction } from 'react-router-dom';
import type { APIConfig, AIModelProfile } from '../../types/settings';

export type CommandSource = 'home' | 'assistant';

export type AppCommandAction =
  | 'create_character'
  | 'create_characters'
  | 'create_group_chat'
  | 'create_direct_chat'
  | 'open_existing_chat'
  | 'query_ai_balance'
  | 'update_theme'
  | 'set_ai_model_key'
  | 'navigate'
  | 'assistant_chat';

export type AppCommandRiskLevel = 'low' | 'medium' | 'high';

export interface PlannedCharacter {
  name: string;
  group?: string | null;
  roleHint?: string;
}

export interface LocalActionPlan {
  action: Exclude<AppCommandAction, 'assistant_chat'>;
  title?: string;
  summary?: string;
  characterName?: string;
  characters?: PlannedCharacter[];
  groupName?: string;
  groupTopic?: string;
  groupStyle?: 'free' | 'debate' | 'brainstorm' | 'roleplay';
  chatQuery?: string;
  chatTypePreference?: 'group' | 'direct' | 'assistant' | 'any';
  theme?: 'light' | 'dark' | 'system';
  providerHint?: string;
  modelHint?: string;
  apiKeyRef?: string;
  routePath?: string;
}

export type AppCommandRoute =
  | {
      mode: 'local_action';
      action: LocalActionPlan['action'];
      plan: LocalActionPlan;
      riskLevel: AppCommandRiskLevel;
      requiresConfirmation: boolean;
      confirmationText?: string;
    }
  | {
      mode: 'assistant_agent';
      initialMessage: string;
      preferredAgentMode?: 'chat' | 'image' | 'research' | 'tool';
      reason?: string;
    };

export type AppCommandExecutionStatus = 'success' | 'info' | 'needs_confirmation';

export interface AppCommandExecutionResult {
  status: AppCommandExecutionStatus;
  title: string;
  message: string;
  markdown?: string;
  navigateTo?: string;
}

export interface AppCommandContext {
  source: CommandSource;
  input: string;
  navigate?: NavigateFunction;
  apiConfig: APIConfig;
  aiProfiles: AIModelProfile[];
}
