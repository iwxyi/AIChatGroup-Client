import { describe, expect, it } from 'vitest';
import { shouldRenderDeveloperEvent } from './eventMessagePresentation';

const baseFlags = {
  showRelationshipEvents: false,
  showAffectEvents: false,
  showConflictEvents: false,
  showStateEvents: false,
  showMemoryDistillationEvents: false,
  showCalendarEvents: false,
  showMemoryDebug: false,
  showLocalInterceptionHints: false,
};

describe('eventMessagePresentation', () => {
  it('renders analysis run policy events through the state-event switch', () => {
    expect(shouldRenderDeveloperEvent({ eventType: 'analysis_run_policy' }, baseFlags)).toBe(false);
    expect(shouldRenderDeveloperEvent({ eventType: 'analysis_run_policy' }, { ...baseFlags, showStateEvents: true })).toBe(true);
  });
});
