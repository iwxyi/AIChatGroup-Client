import type { NavigateFunction } from 'react-router-dom';
import type { APIConfig, AIModelProfile } from '../../types/settings';

export type CommandSource = 'home' | 'assistant';

export type AppCommandAction =
  | 'create_character'
  | 'create_characters'
  | 'create_group_chat'
  | 'create_direct_chat'
  | 'open_existing_chat'
  | 'search_chats'
  | 'read_character_info'
  | 'compare_characters'
  | 'update_characters'
  | 'delete_characters'
  | 'restore_characters'
  | 'open_character'
  | 'rename_character'
  | 'delete_chats'
  | 'restore_chats'
  | 'rename_chat'
  | 'create_assistant_chat'
  | 'manage_group_members'
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

export interface AppCommandChoicePlan {
  action?: LocalActionPlan['action'];
  plan?: Partial<LocalActionPlan>;
  confirmationText?: string;
}

export type AppCommandChoiceKind = 'confirm' | 'cancel' | 'execute' | 'clarify';

export interface AppCommandChoice {
  id: string;
  label: string;
  description?: string;
  kind?: AppCommandChoiceKind;
  plan?: AppCommandChoicePlan;
  input?: string;
  url?: string;
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
  includeUserAsMember?: boolean;
  showRoleActions?: boolean;
  roomTemplateKey?: string;
  scenarioId?: string;
  roomKind?: string;
  storyBackground?: string;
  storyDirection?: string;
  storyOutline?: string;
  studyGoalLabel?: string;
  agentGoalLabel?: string;
  werewolfRoleConfig?: string;
  werewolfPostGameMode?: string;
  mysteryScript?: string;
  mysteryRoleMappingMode?: string;
  boardColumns?: number;
  boardRows?: number;
  deductionFactionCount?: number;
  mysteryClueCount?: number;
  chatQuery?: string;
  chatId?: string;
  chatTypePreference?: 'group' | 'direct' | 'assistant' | 'any';
  characterQuery?: string;
  characterQueryMode?: 'single' | 'collection';
  sourceGroup?: string;
  targetGroup?: string;
  updateInstruction?: string;
  compareQuestion?: string;
  chatName?: string;
  newName?: string;
  memberOperation?: 'add' | 'remove' | 'set';
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
      choices?: AppCommandChoice[];
      choicePresentation?: 'chips' | 'list' | 'select';
    }
  | {
      mode: 'workflow';
      title?: string;
      summary?: string;
      steps: Array<{
        action: LocalActionPlan['action'];
        plan: LocalActionPlan;
        riskLevel: AppCommandRiskLevel;
        requiresConfirmation: boolean;
        confirmationText?: string;
      }>;
      riskLevel: AppCommandRiskLevel;
      requiresConfirmation: boolean;
      confirmationText?: string;
      choices?: AppCommandChoice[];
      choicePresentation?: 'chips' | 'list' | 'select';
    }
  | {
      mode: 'assistant_agent';
      initialMessage: string;
      preferredAgentMode?: 'chat' | 'image' | 'research' | 'tool';
      reason?: string;
    }
  | {
      mode: 'final_response';
      title: string;
      message: string;
    };

export type AppCommandExecutionStatus = 'success' | 'info' | 'needs_confirmation';

export interface AppCommandCandidate {
  id: string;
  label: string;
  description?: string;
  url?: string;
  score?: number;
  kind?: string;
}

export interface AppCommandExecutionResult {
  status: AppCommandExecutionStatus;
  title: string;
  message: string;
  markdown?: string;
  navigateTo?: string;
  candidates?: AppCommandCandidate[];
  choices?: AppCommandChoice[];
  choicePresentation?: 'chips' | 'list' | 'select';
  recoverable?: boolean;
  reasonType?: string;
  observation?: Record<string, unknown>;
}

export interface AppCommandContext {
  source: CommandSource;
  input: string;
  chatId?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  navigate?: NavigateFunction;
  apiConfig: APIConfig;
  aiProfiles: AIModelProfile[];
}
