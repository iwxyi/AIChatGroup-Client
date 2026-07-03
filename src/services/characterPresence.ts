import type { AICharacter, CharacterPresenceState } from '../types/character';
import type { DriverMessageCommitTransition } from '../types/chat';
import type { MessagePresenceUpdate } from '../types/message';

const MIN_AWAY_MINUTES = 3;
const MAX_AWAY_MINUTES = 12 * 60;

function normalizeDurationMinutes(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 30;
  return Math.max(MIN_AWAY_MINUTES, Math.min(MAX_AWAY_MINUTES, Math.round(value)));
}

function cleanPresenceText(value: string | undefined, max = 80) {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return normalized ? normalized.slice(0, max) : undefined;
}

export function buildPresencePatchFromMessage(params: {
  message: Pick<import('../types/message').Message, 'id' | 'senderId' | 'metadata'>;
  now?: number;
}): Partial<AICharacter> | null {
  const update = params.message.metadata?.presenceUpdate;
  if (!update || params.message.senderId === 'user') return null;
  const now = typeof params.now === 'number' && Number.isFinite(params.now) ? Math.round(params.now) : Date.now();
  const status = update.status === 'away' ? 'away' : 'online';
  const presence: CharacterPresenceState = {
    status,
    activity: cleanPresenceText(update.activity, 60),
    reason: cleanPresenceText(update.reason, 100),
    unavailableUntil: status === 'away'
      ? now + normalizeDurationMinutes(update.durationMinutes) * 60_000
      : undefined,
    updatedAt: now,
    sourceMessageId: params.message.id,
  };
  return { presence };
}

export function applyPresenceUpdateToTransition(params: {
  transition: DriverMessageCommitTransition;
  message: Pick<import('../types/message').Message, 'id' | 'senderId' | 'metadata'>;
  now?: number;
}): DriverMessageCommitTransition {
  const patch = buildPresencePatchFromMessage({ message: params.message, now: params.now });
  if (!patch || !params.message.senderId) return params.transition;
  const characterPatches = [...params.transition.characterPatches];
  const existingIndex = characterPatches.findIndex((item) => item.characterId === params.message.senderId);
  if (existingIndex >= 0) {
    characterPatches[existingIndex] = {
      ...characterPatches[existingIndex],
      patch: {
        ...characterPatches[existingIndex].patch,
        ...patch,
      },
    };
  } else {
    characterPatches.push({
      characterId: params.message.senderId,
      patch,
    });
  }
  return {
    ...params.transition,
    characterPatches,
  };
}

export function getEffectiveCharacterPresence(character: Pick<AICharacter, 'presence'>, now = Date.now()): CharacterPresenceState {
  const presence = character.presence;
  if (!presence || presence.status !== 'away') return { status: 'online', updatedAt: presence?.updatedAt || 0 };
  if (presence.unavailableUntil && presence.unavailableUntil <= now) {
    return {
      ...presence,
      status: 'online',
    };
  }
  return presence;
}

export function isCharacterAvailableForScheduling(character: Pick<AICharacter, 'presence'>, now = Date.now()) {
  return getEffectiveCharacterPresence(character, now).status !== 'away';
}

export function normalizePresenceUpdate(value: MessagePresenceUpdate | null | undefined): MessagePresenceUpdate | null {
  if (!value || typeof value !== 'object') return null;
  const status = value.status === 'away' ? 'away' : value.status === 'online' ? 'online' : null;
  if (!status) return null;
  return {
    status,
    activity: cleanPresenceText(value.activity, 60),
    reason: cleanPresenceText(value.reason, 100),
    durationMinutes: status === 'away' ? normalizeDurationMinutes(value.durationMinutes) : undefined,
  };
}
