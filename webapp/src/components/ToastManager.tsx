import type { PowerUpType } from './PowerUpTray';
import { useGameStore } from '@/stores/gameStore';
import { LevelUpToast } from './LevelUpToast';
import { LootDropToast } from './LootDropToast';

export function ToastManager() {
  const levelUpQueue = useGameStore((s) => s.levelUpQueue);
  const dismissLevelUp = useGameStore((s) => s.dismissLevelUp);
  const lootDrop = useGameStore((s) => s.lootDrop);
  const clearLootDrop = useGameStore((s) => s.clearLootDrop);

  const nextLevelUp = levelUpQueue[0];

  return (
    <>
      {nextLevelUp && (
        <LevelUpToast level={nextLevelUp.newLevel} onDismiss={dismissLevelUp} />
      )}
      {lootDrop && (
        <LootDropToast
          powerupCode={lootDrop.powerupCode.toLowerCase() as PowerUpType}
          onDismiss={clearLootDrop}
        />
      )}
    </>
  );
}
