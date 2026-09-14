const pool = require('../src/config/database');

const INDEXES = [
  {
    table: 'bomiora_shop_order',
    name: 'idx_order_mb_od',
    sql: 'ALTER TABLE bomiora_shop_order ADD INDEX idx_order_mb_od (mb_id, od_id)',
  },
  {
    table: 'bomiora_shop_cart',
    name: 'idx_cart_od_mb',
    sql: 'ALTER TABLE bomiora_shop_cart ADD INDEX idx_cart_od_mb (od_id, mb_id)',
  },
  {
    table: 'bomiora_shop_health_profiles_cart',
    name: 'idx_hpc_mb_od',
    sql: 'ALTER TABLE bomiora_shop_health_profiles_cart ADD INDEX idx_hpc_mb_od (mb_id, od_id)',
  },
  {
    table: 'bomiora_shop_item_use',
    name: 'idx_review_mb_od',
    sql: 'ALTER TABLE bomiora_shop_item_use ADD INDEX idx_review_mb_od (mb_id, od_id, it_id)',
  },
];

async function hasIndex(table, name) {
  const [rows] = await pool.query('SHOW INDEX FROM ?? WHERE Key_name = ?', [
    table,
    name,
  ]);
  return rows.length > 0;
}

async function main() {
  for (const spec of INDEXES) {
    try {
      if (await hasIndex(spec.table, spec.name)) {
        console.log(`skip ${spec.name} (exists)`);
        continue;
      }
      console.log(`create ${spec.name}...`);
      await pool.query(spec.sql);
      console.log(`ok ${spec.name}`);
    } catch (e) {
      console.error(`fail ${spec.name}:`, e.message);
    }
  }
  await pool.end();
}

main();
