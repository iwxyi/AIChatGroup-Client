import { api } from './api';

export type SpeechSynthesisRequest = Parameters<typeof api.synthesizeSpeech>[0];
export type SpeechTranscriptionRequest = Parameters<typeof api.transcribeSpeech>[0];

export async function synthesizeSpeech(request: SpeechSynthesisRequest) {
  return api.synthesizeSpeech(request);
}

export async function transcribeSpeech(request: SpeechTranscriptionRequest) {
  return api.transcribeSpeech(request);
}
