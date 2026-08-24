import type { EnginePromptAdapter } from '../promptContextAssembler';
import { buildCrossModeMemoryPrompt } from '../promptBuilder';

function isPracticeRequest(messages: Parameters<EnginePromptAdapter['buildSystemPrompt']>[0]['messages']) {
  const latestLearnerMessage = messages
    .filter((message) => !message.isDeleted && (message.type === 'user' || message.type === 'god'))
    .at(-1)?.content || '';
  return /(测试|测一下|模拟测试|模拟考|出题|练习|小测|试卷|题目|test|quiz|practice|mock exam|mock test)/i.test(latestLearnerMessage);
}

export const studyPromptAdapter: EnginePromptAdapter = {
  key: 'learning-progress',
  buildSystemPrompt: ({ character, chat, messages, characters }) => {
    const learning = chat.scenarioState?.learning;
    const role = chat.memberIds.find((id) => id !== 'user') === character.id ? 'teacher' : 'student';
    const knowledge = learning?.knowledgeItems?.slice(0, 24).map((item) => `${item.title}（${item.status}）`).join('、') || '尚未建立知识点地图';
    const recent = messages.slice(-8).map((message) => `${message.senderName}: ${message.content}`).join('\n');
    const memoryPrompt = buildCrossModeMemoryPrompt(character, chat, messages, characters);
    const practiceRequest = isPracticeRequest(messages);
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
      practiceRequest
        ? '6. The learner has explicitly requested a test or practice. Give the actual first set of answerable questions in this reply (not merely a plan or an offer). State the task type, number of questions, and exact answer format. Do not reveal the answer key until the learner responds. If listening audio is unavailable, use a text-based reading, vocabulary, grammar, writing, or speaking diagnostic instead of promising listening questions you cannot provide.'
        : '6. Do not start a full test unless the learner asks for one; keep the next step small and interactive.',
      `Recent exchange:\n${recent || 'No messages yet.'}`,
    ].join('\n\n');
  },
};
