import { create } from 'zustand';

interface EquippedCosmetics {
  avatarFrameId?: string;
  cardBackId?: string;
  titleId?: string;
}

interface PowerupInventory {
  fifty_fifty: number;
  shield: number;
  time_boost: number;
  reveal: number;
  second_chance: number;
}

interface ProfileState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  seasonRank: string | null;
  equippedCosmetics: EquippedCosmetics;
  powerupInventory: PowerupInventory;
  setProfile: (data: Partial<ProfileState>) => void;
  updateXp: (newXp: number, newLevel: number) => void;
  equip: (type: keyof EquippedCosmetics, id: string) => void;
  reset: () => void;
}

const EMPTY_INVENTORY: PowerupInventory = {
  fifty_fifty: 0, shield: 0, time_boost: 0, reveal: 0, second_chance: 0,
};

export const useProfileStore = create<ProfileState>((set) => ({
  level: 1,
  xp: 0,
  xpToNextLevel: 1000,
  seasonRank: null,
  equippedCosmetics: {},
  powerupInventory: EMPTY_INVENTORY,
  setProfile: (data) => set((s) => ({ ...s, ...data })),
  updateXp: (newXp, newLevel) => set({ xp: newXp, level: newLevel }),
  equip: (type, id) => set((s) => ({
    equippedCosmetics: { ...s.equippedCosmetics, [type]: id },
  })),
  reset: () => set({ level: 1, xp: 0, xpToNextLevel: 1000, seasonRank: null,
                     equippedCosmetics: {}, powerupInventory: EMPTY_INVENTORY }),
}));
