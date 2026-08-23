export const defaultRewardTrack = [
  { level: 2, coins: 100 },
  { level: 3, seasonalTickets: 2 },
  { level: 4, coins: 250 },
  { level: 5, gems: 10 },
  { level: 7, seasonalTickets: 4 },
  { level: 10, coins: 750, seasonalTickets: 8 },
];

export const defaultCosmetics = [
  ["frame-neon-cyan", "avatar_frame", "Neon Cyan Frame", "common", { accent: "cyan" }, 10],
  ["frame-royal-gold", "avatar_frame", "Royal Gold Frame", "rare", { accent: "gold" }, 20],
  ["frame-crimson-crown", "avatar_frame", "Crimson Crown Frame", "epic", { accent: "crimson" }, 30],
  ["banner-night-arena", "banner", "Night Arena Banner", "common", { theme: "night-arena" }, 40],
  ["banner-champion-light", "banner", "Champion Light Banner", "rare", { theme: "champion-light" }, 50],
  ["title-early-challenger", "title", "Early Challenger", "common", { title: "Early Challenger" }, 60],
  ["title-royale-master", "title", "Royale Master", "epic", { title: "Royale Master" }, 70],
  ["badge-founding-player", "badge", "Founding Player Badge", "legendary", { badge: "founding-player" }, 80],
] as const;

export const defaultStoreItems = [
  ["powerup-pack-small", "POWERUP_CHARGE", "Small Power-Up Pack", "Adds 3 power-up charges.", "coins", 150, { charges: 3 }, 10],
  ["powerup-pack-medium", "POWERUP_CHARGE", "Medium Power-Up Pack", "Adds 6 power-up charges.", "coins", 275, { charges: 6 }, 20],
  ["powerup-pack-large", "POWERUP_CHARGE", "Large Power-Up Pack", "Adds 10 power-up charges.", "gems", 20, { charges: 10 }, 30],
  ["cosmetic-frame-neon-cyan", "COSMETIC", "Neon Cyan Frame", "Unlocks the Neon Cyan avatar frame.", "coins", 300, { cosmeticId: "frame-neon-cyan" }, 40],
  ["cosmetic-frame-royal-gold", "COSMETIC", "Royal Gold Frame", "Unlocks the Royal Gold avatar frame.", "gems", 40, { cosmeticId: "frame-royal-gold" }, 50],
  ["cosmetic-frame-crimson-crown", "COSMETIC", "Crimson Crown Frame", "Unlocks the Crimson Crown avatar frame.", "seasonalTickets", 12, { cosmeticId: "frame-crimson-crown" }, 60],
  ["cosmetic-banner-night-arena", "COSMETIC", "Night Arena Banner", "Unlocks the Night Arena profile banner.", "coins", 500, { cosmeticId: "banner-night-arena" }, 70],
  ["cosmetic-banner-champion-light", "COSMETIC", "Champion Light Banner", "Unlocks the Champion Light profile banner.", "gems", 55, { cosmeticId: "banner-champion-light" }, 80],
  ["cosmetic-title-royale-master", "COSMETIC", "Royale Master Title", "Unlocks the Royale Master title.", "seasonalTickets", 18, { cosmeticId: "title-royale-master" }, 90],
  ["season-pass-active", "SEASON_PASS", "Active Season Pass", "Unlocks premium season access.", "gems", 100, { seasonId: "active" }, 100],
] as const;
