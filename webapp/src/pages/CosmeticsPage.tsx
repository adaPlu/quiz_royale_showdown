import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@services/apiClient';

interface CosmeticItem {
  id: string;
  name: string;
  type: string;
  rarity: string;
  previewUrl?: string;
}

interface OwnedCosmetic {
  cosmeticId: string;
  equipped?: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'text-game-muted border-game-border',
  UNCOMMON: 'text-green-400 border-green-400/40',
  RARE: 'text-blue-400 border-blue-400/40',
  EPIC: 'text-purple-400 border-purple-400/40',
  LEGENDARY: 'text-gold border-gold/40',
};

export default function CosmeticsPage() {
  const [catalog, setCatalog] = useState<CosmeticItem[]>([]);
  const [owned, setOwned] = useState<OwnedCosmetic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);

  const fetchOwned = useCallback(async () => {
    const res = await api.get<OwnedCosmetic[]>('/cosmetics/owned');
    setOwned(res.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<CosmeticItem[]>('/cosmetics'),
      api.get<OwnedCosmetic[]>('/cosmetics/owned'),
    ])
      .then(([catalogRes, ownedRes]) => {
        if (cancelled) return;
        setCatalog(catalogRes.data);
        setOwned(ownedRes.data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load cosmetics. Try again later.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const handleEquip = async (cosmeticId: string) => {
    setEquipping(cosmeticId);
    try {
      await api.post('/cosmetics/equip', { cosmeticId });
      await fetchOwned();
    } catch {
      // silently ignore equip errors for now
    } finally {
      setEquipping(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-game-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-game-bg flex items-center justify-center">
        <p className="text-answer-wrong text-center">{error}</p>
      </div>
    );
  }

  const ownedIds = new Set(owned.map((o) => o.cosmeticId));
  const equippedIds = new Set(owned.filter((o) => o.equipped).map((o) => o.cosmeticId));

  return (
    <div className="min-h-screen bg-game-bg p-4 max-w-2xl mx-auto">
      <h1 className="text-white text-2xl font-black mb-6">Cosmetics</h1>

      {catalog.length === 0 && (
        <p className="text-game-muted text-center py-8">No cosmetics available yet.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {catalog.map((item) => {
          const isOwned = ownedIds.has(item.id);
          const isEquipped = equippedIds.has(item.id);
          const rarityClass = RARITY_COLORS[item.rarity.toUpperCase()] ?? RARITY_COLORS.COMMON;

          return (
            <div
              key={item.id}
              className="bg-game-surface border border-game-border rounded-2xl p-4 flex flex-col gap-3"
            >
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="w-full h-20 object-contain rounded-xl bg-black/20"
                />
              ) : (
                <div className="w-full h-20 rounded-xl bg-black/20 flex items-center justify-center text-3xl">
                  🎨
                </div>
              )}

              <div className="flex-1">
                <p className="text-white font-semibold text-sm truncate">{item.name}</p>
                <span
                  className={`inline-block text-xs font-bold uppercase border rounded px-1.5 py-0.5 mt-1 ${rarityClass}`}
                >
                  {item.rarity}
                </span>
              </div>

              {isOwned ? (
                isEquipped ? (
                  <button
                    disabled
                    className="w-full py-2 rounded-xl bg-brand/30 text-brand text-sm font-semibold cursor-default"
                  >
                    Equipped
                  </button>
                ) : (
                  <button
                    onClick={() => void handleEquip(item.id)}
                    disabled={equipping === item.id}
                    className="w-full py-2 rounded-xl bg-brand text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {equipping === item.id ? 'Equipping…' : 'Equip'}
                  </button>
                )
              ) : (
                <button
                  disabled
                  className="w-full py-2 rounded-xl border border-game-border text-game-muted text-sm font-semibold cursor-default"
                >
                  🔒 Locked
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
