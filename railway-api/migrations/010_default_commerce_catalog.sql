INSERT INTO cosmetic_items(cosmetic_id, cosmetic_type, display_name, rarity, payload, sort_order)
VALUES
  ('frame-neon-cyan', 'avatar_frame', 'Neon Cyan Frame', 'common', '{"accent":"cyan"}'::jsonb, 10),
  ('frame-royal-gold', 'avatar_frame', 'Royal Gold Frame', 'rare', '{"accent":"gold"}'::jsonb, 20),
  ('frame-crimson-crown', 'avatar_frame', 'Crimson Crown Frame', 'epic', '{"accent":"crimson"}'::jsonb, 30),
  ('banner-night-arena', 'banner', 'Night Arena Banner', 'common', '{"theme":"night-arena"}'::jsonb, 40),
  ('banner-champion-light', 'banner', 'Champion Light Banner', 'rare', '{"theme":"champion-light"}'::jsonb, 50),
  ('title-early-challenger', 'title', 'Early Challenger', 'common', '{"title":"Early Challenger"}'::jsonb, 60),
  ('title-royale-master', 'title', 'Royale Master', 'epic', '{"title":"Royale Master"}'::jsonb, 70),
  ('badge-founding-player', 'badge', 'Founding Player Badge', 'legendary', '{"badge":"founding-player"}'::jsonb, 80)
ON CONFLICT (cosmetic_id)
DO UPDATE SET cosmetic_type = EXCLUDED.cosmetic_type,
              display_name = EXCLUDED.display_name,
              rarity = EXCLUDED.rarity,
              payload = EXCLUDED.payload,
              sort_order = EXCLUDED.sort_order,
              active = true;

INSERT INTO store_items(item_id, item_type, display_name, description, currency, price, payload, sort_order)
VALUES
  ('powerup-pack-small', 'POWERUP_CHARGE', 'Small Power-Up Pack', 'Adds 3 power-up charges.', 'coins', 150, '{"charges":3}'::jsonb, 10),
  ('powerup-pack-medium', 'POWERUP_CHARGE', 'Medium Power-Up Pack', 'Adds 6 power-up charges.', 'coins', 275, '{"charges":6}'::jsonb, 20),
  ('powerup-pack-large', 'POWERUP_CHARGE', 'Large Power-Up Pack', 'Adds 10 power-up charges.', 'gems', 20, '{"charges":10}'::jsonb, 30),
  ('cosmetic-frame-neon-cyan', 'COSMETIC', 'Neon Cyan Frame', 'Unlocks the Neon Cyan avatar frame.', 'coins', 300, '{"cosmeticId":"frame-neon-cyan"}'::jsonb, 40),
  ('cosmetic-frame-royal-gold', 'COSMETIC', 'Royal Gold Frame', 'Unlocks the Royal Gold avatar frame.', 'gems', 40, '{"cosmeticId":"frame-royal-gold"}'::jsonb, 50),
  ('cosmetic-frame-crimson-crown', 'COSMETIC', 'Crimson Crown Frame', 'Unlocks the Crimson Crown avatar frame.', 'seasonalTickets', 12, '{"cosmeticId":"frame-crimson-crown"}'::jsonb, 60),
  ('cosmetic-banner-night-arena', 'COSMETIC', 'Night Arena Banner', 'Unlocks the Night Arena profile banner.', 'coins', 500, '{"cosmeticId":"banner-night-arena"}'::jsonb, 70),
  ('cosmetic-banner-champion-light', 'COSMETIC', 'Champion Light Banner', 'Unlocks the Champion Light profile banner.', 'gems', 55, '{"cosmeticId":"banner-champion-light"}'::jsonb, 80),
  ('cosmetic-title-royale-master', 'COSMETIC', 'Royale Master Title', 'Unlocks the Royale Master title.', 'seasonalTickets', 18, '{"cosmeticId":"title-royale-master"}'::jsonb, 90),
  ('season-pass-active', 'SEASON_PASS', 'Active Season Pass', 'Unlocks premium season access.', 'gems', 100, '{"seasonId":"active"}'::jsonb, 100)
ON CONFLICT (item_id)
DO UPDATE SET item_type = EXCLUDED.item_type,
              display_name = EXCLUDED.display_name,
              description = EXCLUDED.description,
              currency = EXCLUDED.currency,
              price = EXCLUDED.price,
              payload = EXCLUDED.payload,
              sort_order = EXCLUDED.sort_order,
              active = true;
