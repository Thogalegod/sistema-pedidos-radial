import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentTaskDateKey, getTaskDueStatus } from './task-due';

describe('task due status', () => {
  it.each([
    ['2026-09-21', 'overdue'],
    ['2026-09-22', 'today'],
    ['2026-09-23', 'upcoming'],
  ] as const)('classifies %s as %s against the local day', (dueDate, expected) => {
    expect(getTaskDueStatus({ completed: false, dueDate }, '2026-09-22')).toBe(expected);
  });

  it('does not include completed tasks in temporal attention', () => {
    expect(getTaskDueStatus({ completed: true, dueDate: '2026-09-21' }, '2026-09-22')).toBe('completed');
  });

  it('uses the real local calendar day instead of a fixed date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 22, 15, 30));
    expect(getCurrentTaskDateKey()).toBe('2026-09-22');
  });
});

afterEach(() => vi.useRealTimers());
