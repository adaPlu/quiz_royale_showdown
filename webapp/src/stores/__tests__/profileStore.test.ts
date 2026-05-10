import { beforeEach, describe, expect, it } from 'vitest';

import { useProfileStore } from '../profileStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function reset() {
  useProfileStore.getState().reset();
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(reset);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('profileStore', () => {
  describe('updateXp', () => {
    it('adds xpDelta to current xp, sets new level, and updates xpToNextLevel', () => {
      // Initial state: xp=0, level=1, xpToNextLevel=1000
      // Seed xp=50 via setProfile first
      useProfileStore.getState().setProfile({ xp: 50 });

      useProfileStore.getState().updateXp(100, 2, 900);

      const state = useProfileStore.getState();
      expect(state.xp).toBe(150);
      expect(state.level).toBe(2);
      expect(state.xpToNextLevel).toBe(900);
    });

    it('accumulates xp correctly across two consecutive updateXp calls', () => {
      useProfileStore.getState().setProfile({ xp: 0 });

      useProfileStore.getState().updateXp(200, 1, 800);
      useProfileStore.getState().updateXp(300, 2, 500);

      const state = useProfileStore.getState();
      expect(state.xp).toBe(500);
      expect(state.level).toBe(2);
      expect(state.xpToNextLevel).toBe(500);
    });
  });

  describe('setProfile', () => {
    it('sets all provided fields on the store', () => {
      useProfileStore.getState().setProfile({
        level: 5,
        xp: 4200,
        xpToNextLevel: 300,
        seasonRank: 'Gold',
        equippedCosmetics: { avatarFrameId: 'frame-1', titleId: 'title-legendary' },
      });

      const state = useProfileStore.getState();
      expect(state.level).toBe(5);
      expect(state.xp).toBe(4200);
      expect(state.xpToNextLevel).toBe(300);
      expect(state.seasonRank).toBe('Gold');
      expect(state.equippedCosmetics.avatarFrameId).toBe('frame-1');
      expect(state.equippedCosmetics.titleId).toBe('title-legendary');
    });
  });

  describe('reset', () => {
    it('restores all fields to their initial defaults', () => {
      // Modify state first
      useProfileStore.getState().setProfile({
        level: 10,
        xp: 9999,
        xpToNextLevel: 1,
        seasonRank: 'Diamond',
      });
      useProfileStore.getState().reset();

      const state = useProfileStore.getState();
      expect(state.level).toBe(1);
      expect(state.xp).toBe(0);
      expect(state.xpToNextLevel).toBe(1000);
      expect(state.seasonRank).toBeNull();
      expect(state.equippedCosmetics).toEqual({});
      expect(state.powerupInventory).toEqual({
        fifty_fifty: 0,
        shield: 0,
        time_boost: 0,
        reveal: 0,
        second_chance: 0,
      });
    });
  });
});
