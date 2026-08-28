export type ComposerPhase = 'idle' | 'queued' | 'cancelling' | 'branching' | 'committing' | 'waiting_turn' | 'generating' | 'processing_media' | 'submitting_artifact' | 'paused' | 'error';
export interface ComposerState {
  phase: ComposerPhase;
  label?: string;
  hint?: string;
  canSend?: boolean;
  canDraft?: boolean;
  canCancel?: boolean;
  canSwitchBranch?: boolean;
}
