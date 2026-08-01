import { useGameStore } from '@/stores/gameStore';
import { LevelUpToast } from './LevelUpToast';

export function ToastManager() {
  const levelUpQueue = useGameStore((s) => s.levelUpQueue);
  const dismissLevelUp = useGameStore((s) => s.dismissLevelUp);

  const nextLevelUp = levelUpQueue[0];

  return (
    <>
      {nextLevelUp && (
        <LevelUpToast level={nextLevelUp.newLevel} onDismiss={dismissLevelUp} />
      )}
    </>
  );
}
