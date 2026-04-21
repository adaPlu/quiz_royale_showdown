import { create } from 'zustand';

export const CANONICAL_POWER_UP_CODES = [
  'DOUBLE_DOWN',
  'FIFTY_FIFTY',
  'TIME_FREEZE',
  'SHIELD',
  'SABOTAGE',
] as const;

export type PowerUpCode = (typeof CANONICAL_POWER_UP_CODES)[number];

interface EquippedCosmetics {
  avatarFrameId?: string;
  cardBackId?: string;
  titleId?: string;
}

export type PowerupInventoryItem = {
  code: PowerUpCode;
  quantity: number;
  powerUpId?: string;
  name?: string;
  description?: string;
  rarity?: string;
};

export type PowerupInventory = Record<PowerUpCode, PowerupInventoryItem>;

export type PowerupInventoryApiItem = {
  powerUpId?: string;
  code?: string;
  name?: string;
  description?: string;
  rarity?: string;
  quantity?: number;
  powerUp?: {
    id?: string;
    code?: string;
    name?: string;
    description?: string;
    rarity?: string;
  };
};

const isPowerUpCode = (code: string): code is PowerUpCode =>
  (CANONICAL_POWER_UP_CODES as readonly string[]).includes(code);

const createEmptyInventory = (): PowerupInventory =>
  CANONICAL_POWER_UP_CODES.reduce((inventory, code) => {
    inventory[code] = { code, quantity: 0 };
    return inventory;
  }, {} as PowerupInventory);

export const normalizePowerupInventory = (items: PowerupInventoryApiItem[] = []): PowerupInventory => {
  const inventory = createEmptyInventory();

  for (const item of items) {
    const code = (item.code ?? item.powerUp?.code)?.toUpperCase();
    if (!code || !isPowerUpCode(code)) continue;

    inventory[code] = {
      code,
      quantity: Math.max(0, item.quantity ?? 0),
      powerUpId: item.powerUp?.id ?? item.powerUpId,
      name: item.name ?? item.powerUp?.name,
      description: item.description ?? item.powerUp?.description,
      rarity: item.rarity ?? item.powerUp?.rarity,
    };
  }

  return inventory;
};

const EMPTY_INVENTORY = createEmptyInventory();

const decrementInventoryItem = (
  inventory: PowerupInventory,
  codeOrId: string,
): PowerupInventory => {
  const code = CANONICAL_POWER_UP_CODES.find(
    (candidate) => candidate === codeOrId || inventory[candidate].powerUpId === codeOrId,
  );
  if (!code) return inventory;

  const item = inventory[code];
  return {
    ...inventory,
    [code]: {
      ...item,
      quantity: Math.max(0, item.quantity - 1),
    },
  };
};

interface ProfilePatch {
  level?: number;
  xp?: number;
  xpToNextLevel?: number;
  seasonRank?: string | null;
  equippedCosmetics?: EquippedCosmetics;
  powerupInventory?: PowerupInventory;
}

interface ProfileState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  seasonRank: string | null;
  equippedCosmetics: EquippedCosmetics;
  powerupInventory: PowerupInventory;
  setProfile: (data: ProfilePatch) => void;
  setPowerupInventory: (items: PowerupInventoryApiItem[]) => void;
  decrementPowerupInventory: (codeOrId: string) => void;
  updateXp: (newXp: number, newLevel: number) => void;
  equip: (type: keyof EquippedCosmetics, id: string) => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  level: 1,
  xp: 0,
  xpToNextLevel: 1000,
  seasonRank: null,
  equippedCosmetics: {},
  powerupInventory: EMPTY_INVENTORY,
  setProfile: (data) => set((s) => ({ ...s, ...data })),
  setPowerupInventory: (items) => set({ powerupInventory: normalizePowerupInventory(items) }),
  decrementPowerupInventory: (codeOrId) => set((state) => ({
    powerupInventory: decrementInventoryItem(state.powerupInventory, codeOrId),
  })),
  updateXp: (newXp, newLevel) => set({ xp: newXp, level: newLevel }),
  equip: (type, id) => set((s) => ({
    equippedCosmetics: { ...s.equippedCosmetics, [type]: id },
  })),
  reset: () => set({ level: 1, xp: 0, xpToNextLevel: 1000, seasonRank: null,
                     equippedCosmetics: {}, powerupInventory: createEmptyInventory() }),
}));
