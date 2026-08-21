export type CharacterCompletionKind = 'text' | 'image';
export type CharacterCompletionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface CharacterCompletionTask {
  id: string;
  kind: CharacterCompletionKind;
  characterId: string;
  characterName: string;
  field: string;
  label: string;
  status: CharacterCompletionStatus;
  error?: string;
}

export interface CharacterCompletionSummary {
  text: { total: number; completed: number; failed: number; active: number; current?: string };
  image: { total: number; completed: number; failed: number; active: number; current?: string };
}

type Runner = () => Promise<void>;
const queues: Record<CharacterCompletionKind, Array<{ task: CharacterCompletionTask; run: Runner }>> = { text: [], image: [] };
const running: Record<CharacterCompletionKind, boolean> = { text: false, image: false };
const allTasks = new Map<string, CharacterCompletionTask>();
const listeners = new Set<(summary: CharacterCompletionSummary) => void>();

function summaryFor(kind: CharacterCompletionKind) {
  const tasks = [...allTasks.values()].filter((task) => task.kind === kind);
  const active = tasks.find((task) => task.status === 'running');
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === 'succeeded').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
    active: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length,
    current: active ? `${active.characterName} · ${active.label}` : undefined,
  };
}

export function getCharacterCompletionSummary(): CharacterCompletionSummary {
  return { text: summaryFor('text'), image: summaryFor('image') };
}

export function getCharacterCompletionTaskStatus(characterId: string, field: string): CharacterCompletionStatus | null {
  const task = [...allTasks.values()]
    .reverse()
    .find((item) => item.characterId === characterId && item.field === field && (item.status === 'queued' || item.status === 'running'));
  return task?.status || null;
}

export function subscribeCharacterCompletionQueue(listener: (summary: CharacterCompletionSummary) => void) {
  listeners.add(listener);
  listener(getCharacterCompletionSummary());
  return () => listeners.delete(listener);
}

function publish() {
  const summary = getCharacterCompletionSummary();
  listeners.forEach((listener) => listener(summary));
}

async function pump(kind: CharacterCompletionKind) {
  if (running[kind]) return;
  const entry = queues[kind].shift();
  if (!entry) return;
  running[kind] = true;
  entry.task.status = 'running';
  publish();
  try {
    await entry.run();
    entry.task.status = 'succeeded';
  } catch (error) {
    entry.task.status = 'failed';
    entry.task.error = error instanceof Error ? error.message : String(error);
  } finally {
    running[kind] = false;
    publish();
    void pump(kind);
  }
}

export function enqueueCharacterCompletionTask(input: Omit<CharacterCompletionTask, 'id' | 'status'> & { run: Runner }) {
  const task: CharacterCompletionTask = { ...input, id: `character-completion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: 'queued' };
  allTasks.set(task.id, task);
  queues[task.kind].push({ task, run: input.run });
  publish();
  void pump(task.kind);
  return task.id;
}

export function clearCompletedCharacterCompletionTasks() {
  [...allTasks.entries()].forEach(([id, task]) => { if (task.status === 'succeeded' || task.status === 'failed') allTasks.delete(id); });
  publish();
}
