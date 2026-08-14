import type { CharacterVoiceConfig } from '../types/character';
import { api } from './api';

export type GeneratedVoiceProfile = NonNullable<CharacterVoiceConfig['voiceProfile']>;

export async function assignGeneratedVoiceProfile(profile: GeneratedVoiceProfile, key = 'character', usedVoiceIds: string[] = [], providerCode?: string) {
  try {
    const result = await api.assignSpeechVoices({
      profiles: [{ key, profile }],
      providerCode,
      usedVoiceIds,
      candidateLimit: 60,
    });
    const assignment = result.assignments[0];
    if (!assignment?.selected) {
      return { voiceConfig: { enabled: false, voiceProfile: profile, voiceSource: 'pending' as const, assignmentStatus: 'unavailable' as const }, candidates: assignment?.candidates || [], providerCode: result.provider };
    }
    return {
      voiceConfig: {
        enabled: true,
        voiceName: assignment.selected.id,
        role: assignment.selected.name,
        providerCode: result.provider,
        voiceProfile: profile,
        voiceSource: 'auto' as const,
        assignmentStatus: 'assigned' as const,
      },
      candidates: assignment.candidates,
      providerCode: result.provider,
    };
  } catch (error) {
    console.warn('[speech-voice-assignment:unavailable]', error instanceof Error ? error.message : 'unknown error');
    return { voiceConfig: { enabled: false, voiceProfile: profile, voiceSource: 'pending' as const, assignmentStatus: 'pending' as const }, candidates: [], providerCode: undefined };
  }
}

export async function assignGeneratedVoiceProfiles(profiles: Array<{ key: string; profile: GeneratedVoiceProfile }>, usedVoiceIds: string[] = [], providerCode?: string) {
  try {
    const result = await api.assignSpeechVoices({ profiles, usedVoiceIds, candidateLimit: 60, providerCode });
    return {
      providerCode: result.provider,
      assignments: result.assignments.map((assignment) => ({
        key: assignment.key,
        candidates: assignment.candidates,
        voiceConfig: assignment.selected
          ? { enabled: true, voiceName: assignment.selected.id, role: assignment.selected.name, providerCode: result.provider, voiceSource: 'auto' as const, assignmentStatus: 'assigned' as const }
          : { enabled: false, voiceSource: 'pending' as const, assignmentStatus: 'unavailable' as const },
      })),
    };
  } catch (error) {
    console.warn('[speech-voice-assignment:batch:unavailable]', error instanceof Error ? error.message : 'unknown error');
    return { providerCode: undefined, assignments: profiles.map((item) => ({ key: item.key, candidates: [], voiceConfig: { enabled: false, voiceSource: 'pending' as const, assignmentStatus: 'pending' as const } })) };
  }
}
