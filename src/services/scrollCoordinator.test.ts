import { describe, expect, it } from 'vitest';
import { SCROLL_INTENT_PRIORITY, shouldBlockScrollWrite } from './scrollCoordinator';

describe('scrollCoordinator', () => {
  const base = { now: 100, active: null, userMomentum: false, settleMs: 160 };

  it('blocks tail follow while an explicit jump transaction is active', () => {
    expect(shouldBlockScrollWrite({
      ...base,
      intent: 'tailFollow',
      transaction: { id: 'branch-1', intent: 'explicitJump', startedAt: 0 },
    })).toBe('transaction-active');
  });

  it('lets the explicit jump write through during its own transaction', () => {
    expect(shouldBlockScrollWrite({
      ...base,
      intent: 'explicitJump',
      transaction: { id: 'branch-1', intent: 'explicitJump', startedAt: 0 },
    })).toBeNull();
  });

  it('blocks low priority writes during user momentum', () => {
    expect(shouldBlockScrollWrite({ ...base, intent: 'resizePreserve', userMomentum: true })).toBe('user-scroll-active');
  });

  it('blocks a lower priority write during the settling window', () => {
    expect(shouldBlockScrollWrite({
      ...base,
      intent: 'tailFollow',
      active: { intent: 'explicitJump', priority: SCROLL_INTENT_PRIORITY.explicitJump, startedAt: 0 },
    })).toBe('higher-priority-active');
  });

  it('allows writes after the settling window', () => {
    expect(shouldBlockScrollWrite({
      ...base,
      intent: 'tailFollow',
      active: { intent: 'explicitJump', priority: SCROLL_INTENT_PRIORITY.explicitJump, startedAt: 0 },
      now: 161,
    })).toBeNull();
  });
});
