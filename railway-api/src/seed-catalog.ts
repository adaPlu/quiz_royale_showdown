import { pool } from "./db.js";
import { defaultCosmetics, defaultStoreItems } from "./admin-data.js";

async function main(): Promise<void> {
  for (const item of defaultCosmetics) {
    await pool.query(
      `INSERT INTO cosmetic_items(cosmetic_id, cosmetic_type, display_name, rarity, payload, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cosmetic_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, rarity = EXCLUDED.rarity,
                     payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order, active = true`,
      [item[0], item[1], item[2], item[3], JSON.stringify(item[4]), item[5]],
    );
  }
  for (const item of defaultStoreItems) {
    await pool.query(
      `INSERT INTO store_items(item_id, item_type, display_name, description, currency, price, payload, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (item_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
                     currency = EXCLUDED.currency, price = EXCLUDED.price, payload = EXCLUDED.payload,
                     sort_order = EXCLUDED.sort_order, active = true`,
      [item[0], item[1], item[2], item[3], item[4], item[5], JSON.stringify(item[6]), item[7]],
    );
  }
  console.log(JSON.stringify({ ok: true, cosmetics: defaultCosmetics.length, storeItems: defaultStoreItems.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
