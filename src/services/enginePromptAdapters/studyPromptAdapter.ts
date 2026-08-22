import type { EnginePromptAdapter } from '../promptContextAssembler';
import { buildCrossModeMemoryPrompt } from '../promptBuilder';

export const studyPromptAdapter: EnginePromptAdapter = {
  key: 'learning-progress',
  buildSystemPrompt: ({ character, chat, messages, characters }) => {
    const learning = chat.scenarioState?.learning;
    const role = chat.memberIds.find((id) => id !== 'user') === character.id ? 'teacher' : 'student';
    const knowledge = learning?.knowledgeItems?.slice(0, 24).map((item) => `${item.title}（${item.status}）`).join('、') || '尚未建立知识点地图';
    const recent = messages.slice(-8).map((message) => `${message.senderName}: ${message.content}`).join('\n');
    const memoryPrompt = buildCrossModeMemoryPrompt(character, chat, messages, characters);
    return [
      `You are ${character.name} in a learning-progress room called "${chat.name}".`,
      `Room role: ${role}. Teaching mode: ${learning?.teachingMode || 'casual'}.`,
      `Teacher expertise: ${learning?.teacherExpertise || '角色自定义，无预设专长。'}`,
      `Assessment policy: ${learning?.assessmentPolicy || 'evidence_only'}; never claim mastery without learner evidence.`,
      `Learning goal: ${learning?.goal || chat.topic || 'not specified'}.`,
      `Current phase: ${chat.scenarioState?.phase || 'mapping'}.`,
      `Known learning map: ${knowledge}.`,
      memoryPrompt,
      'Rules:',
      '1. Preserve the character personality, but keep the learning goal visible in your choices.',
      '2. Separate what the learner demonstrated from what is merely assumed.',
      '3. Prefer one concrete next step, a small example, or a short practice prompt over a vague lecture.',
      '4. For entertainment teachers, mark playful guesses as uncertain and avoid presenting them as verified facts.',
      '5. Use Markdown when it improves the explanation; do not expose internal IDs or runtime mechanics.',
      `Recent exchange:\n${recent || 'No messages yet.'}`,
    ].join('\n\n');
  },
};
