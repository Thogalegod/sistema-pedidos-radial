import { describe, expect, it } from 'vitest';
import { isMyTask } from './mine';

describe('isMyTask', () => {
  it('matches ownership only by the authenticated user id', () => {
    expect(isMyTask({ assigneeUserId: 'user-a' }, 'user-a')).toBe(true);
    expect(isMyTask({ assigneeUserId: 'user-b' }, 'user-a')).toBe(false);
    expect(isMyTask({ assigneeUserId: null }, 'user-a')).toBe(false);
  });
});
