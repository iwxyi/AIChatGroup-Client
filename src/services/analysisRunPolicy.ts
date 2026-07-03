import type { GroupChat } from '../types/chat';
import type { DriverEventPayload } from '../types/chat';
import type { Message } from '../types/message';
import { resolveSessionFamilyKey } from './sessionEngineKeys';

export interface SessionLoopDecision {
  canRun: boolean;
  runAction: boolean;
  runChat: boolean;
  actionFirst: boolean;
}

export interface AnalysisRunPolicyTrace {
  applies: boolean;
  manualActivation: boolean;
  structuralContinuation: boolean;
  latestVisibleType: Message['type'] | null;
  latestHasArtifacts: boolean;
  latestHasLanding: boolean;
  reason: 'not_analysis' | 'raw_allows_run' | 'manual_activation' | 'structural_continuation' | 'no_structural_progress';
}

function getLatestVisibleMessage(messages: Message[]) {
  return [...messages].reverse().find((message) => !message.isDeleted && message.type !== 'system' && message.type !== 'event') || null;
}

function hasDeliberationArtifactMaterial(message: Message | null) {
  const artifacts = message?.metadata?.deliberationArtifacts;
  if (!artifacts) return false;
  return Boolean(
    artifacts.claims?.length
    || artifacts.evidence?.length
    || artifacts.issues?.length
    || artifacts.verdicts?.length
    || artifacts.summary?.text?.trim(),
  );
}

function hasDeliberationLanding(message: Message | null) {
  const artifacts = message?.metadata?.deliberationArtifacts;
  if (!artifacts) return false;
  return Boolean(artifacts.verdicts?.length || artifacts.summary?.text?.trim());
}

function shouldContinueFromStructure(latestVisible: Message | null) {
  void latestVisible;
  return true;
}

function shouldStartManualActivation(chat: GroupChat, latestVisible: Message | null, iterationCount: number) {
  if (resolveSessionFamilyKey(chat) !== 'analysis') return false;
  if (iterationCount !== 1) return false;
  void latestVisible;
  return true;
}

export function applyAnalysisRunPolicy(params: {
  chat: GroupChat;
  messages: Message[];
  iterationCount: number;
  rawDecision: SessionLoopDecision;
}): { decision: SessionLoopDecision; trace: AnalysisRunPolicyTrace } {
  const latestVisible = getLatestVisibleMessage(params.messages);
  const applies = resolveSessionFamilyKey(params.chat) === 'analysis';
  const latestHasArtifacts = hasDeliberationArtifactMaterial(latestVisible);
  const latestHasLanding = hasDeliberationLanding(latestVisible);
  const manualActivation = applies && shouldStartManualActivation(params.chat, latestVisible, params.iterationCount);
  const structuralContinuation = applies && !manualActivation && shouldContinueFromStructure(latestVisible);
  const overridden = applies && !params.rawDecision.canRun && (manualActivation || structuralContinuation);
  const reason: AnalysisRunPolicyTrace['reason'] = !applies
    ? 'not_analysis'
    : params.rawDecision.canRun
      ? 'raw_allows_run'
      : manualActivation
        ? 'manual_activation'
        : structuralContinuation
          ? 'structural_continuation'
          : 'no_structural_progress';

  return {
    decision: overridden
      ? { canRun: true, runChat: true, runAction: false, actionFirst: false }
      : params.rawDecision,
    trace: {
      applies,
      manualActivation,
      structuralContinuation,
      latestVisibleType: latestVisible?.type || null,
      latestHasArtifacts,
      latestHasLanding,
      reason,
    },
  };
}

export function buildAnalysisRunPolicyEvent(trace: AnalysisRunPolicyTrace): DriverEventPayload | null {
  void trace;
  return null;
}
