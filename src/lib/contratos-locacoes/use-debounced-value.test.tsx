import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  it('keeps the previous value until the delay elapses after the latest change', () => {
    vi.useFakeTimers();

    try {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 300),
        { initialProps: { value: 'a' } }
      );

      expect(result.current).toBe('a');

      rerender({ value: 'ab' });
      act(() => {
        vi.advanceTimersByTime(299);
      });

      expect(result.current).toBe('a');

      rerender({ value: 'abc' });
      act(() => {
        vi.advanceTimersByTime(299);
      });

      expect(result.current).toBe('a');

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(result.current).toBe('abc');
    } finally {
      vi.useRealTimers();
    }
  });
});
