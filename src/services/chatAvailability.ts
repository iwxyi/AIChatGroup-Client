import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import { isReservedNonCharacterActorId } from './actorRefPresentation';

function hasLiveCharacter(characters: AICharacter[], characterId: string) {
  return characters.some((character) => character.id === characterId && character.deletedAt == null);
}

function getRequiredCharacterIds(chat: Pick<GroupChat, 'type' | 'memberIds'>) {
  const memberIds = (chat.memberIds || []).filter((memberId) => !isReservedNonCharacterActorId(memberId));
  if (chat.type === 'direct' || chat.type === 'ai_direct' || chat.type === 'group') return memberIds;
  return [];
}

export function getMissingRequiredCharacterIds(chat: Pick<GroupChat, 'type' | 'memberIds'>, characters: AICharacter[]) {
  return getRequiredCharacterIds(chat).filter((memberId) => !hasLiveCharacter(characters, memberId));
}

export function isChatBlockedByMissingRequiredCharacters(chat: Pick<GroupChat, 'type' | 'memberIds'> | null | undefined, characters: AICharacter[]) {
  if (!chat) return false;
  const requiredCharacterIds = getRequiredCharacterIds(chat);
  if (!requiredCharacterIds.length) return false;
  // Direct chats need their named counterpart. A group can continue with
  // surviving members, but becomes read-only when every character was deleted.
  if (chat.type === 'group') return requiredCharacterIds.every((memberId) => !hasLiveCharacter(characters, memberId));
  return requiredCharacterIds.some((memberId) => !hasLiveCharacter(characters, memberId));
}

export function canRecreateMissingCloudChat(chat: Pick<GroupChat, 'type' | 'memberIds'> | null | undefined, characters: AICharacter[]) {
  if (!chat) return false;
  return !isChatBlockedByMissingRequiredCharacters(chat, characters);
}
