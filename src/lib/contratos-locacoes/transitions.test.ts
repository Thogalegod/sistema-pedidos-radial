import { describe, expect, it } from 'vitest';
import { canTransitionContract, canCloseRental, canTransitionItem } from './transitions';

describe('transitions utility', () => {
  describe('canTransitionContract', () => {
    it('allows transitioning from active to closing_requested', () => {
      expect(canTransitionContract('active', 'closing_requested')).toBe(true);
    });

    it('denies transitioning from closed back to active', () => {
      expect(canTransitionContract('closed', 'active')).toBe(false);
    });

    it('allows same-state transitions (no-op)', () => {
      expect(canTransitionContract('active', 'active')).toBe(true);
      expect(canTransitionContract('draft', 'draft')).toBe(true);
    });

    it('allows draft to active or cancelled', () => {
      expect(canTransitionContract('draft', 'active')).toBe(true);
      expect(canTransitionContract('draft', 'cancelled')).toBe(true);
      expect(canTransitionContract('draft', 'closed')).toBe(false);
    });

    it('handles active contract flows without skipping closure steps', () => {
      expect(canTransitionContract('active', 'paused')).toBe(true);
      expect(canTransitionContract('active', 'cancelled')).toBe(true);
      expect(canTransitionContract('active', 'closed')).toBe(false);
    });

    it('handles paused contract flows', () => {
      expect(canTransitionContract('paused', 'active')).toBe(true);
      expect(canTransitionContract('paused', 'closing_requested')).toBe(true);
      expect(canTransitionContract('paused', 'cancelled')).toBe(true);
      expect(canTransitionContract('paused', 'closed')).toBe(false);
    });
  });

  describe('canCloseRental', () => {
    it('returns true when all items are returned or lost_damaged', () => {
      expect(
        canCloseRental([
          { status: 'returned' },
          { status: 'lost_damaged' },
        ])
      ).toBe(true);
    });

    it('returns true when all items are replaced or suspended_exempt', () => {
      expect(
        canCloseRental([
          { status: 'replaced' },
          { status: 'suspended_exempt' },
        ])
      ).toBe(true);
    });

    it('returns false if at least one item is still rented', () => {
      expect(
        canCloseRental([
          { status: 'returned' },
          { status: 'rented' },
        ])
      ).toBe(false);
    });

    it('returns false if the rental has no items resolved yet', () => {
      expect(canCloseRental([])).toBe(false);
    });
  });

  describe('canTransitionItem', () => {
    it('allows item to go from rented to any resolved state', () => {
      expect(canTransitionItem('rented', 'returned')).toBe(true);
      expect(canTransitionItem('rented', 'replaced')).toBe(true);
      expect(canTransitionItem('rented', 'lost_damaged')).toBe(true);
      expect(canTransitionItem('rented', 'suspended_exempt')).toBe(true);
    });

    it('allows correcting a resolved state back to rented', () => {
      expect(canTransitionItem('returned', 'rented')).toBe(true);
      expect(canTransitionItem('lost_damaged', 'rented')).toBe(true);
    });

    it('denies transition between resolved states directly', () => {
      expect(canTransitionItem('returned', 'lost_damaged')).toBe(false);
      expect(canTransitionItem('replaced', 'returned')).toBe(false);
    });
  });
});
