const pool = require('../src/config/database');

const INDEXES = [
  {
    table: 'bomiora_shop_item_new',
    name: 'idx_item_new_home',
    sql: 'ALTER TABLE bomiora_shop_item_new ADD INDEX idx_item_new_home (it_type3, it_use, it_order, it_id)',
  },
  {
    table: 'bomiora_shop_item_new',
    name: 'idx_item_best_home',
    sql: 'ALTER TABLE bomiora_shop_item_new ADD INDEX idx_item_best_home (it_type4, it_use, it_order, it_id)',
  },
  {
    table: 'bomiora_shop_item_new',
    name: 'idx_item_md_home',
    sql: 'ALTER TABLE bomiora_shop_item_new ADD INDEX idx_item_md_home (it_type5, it_use, it_kind, it_order, it_id)',
  },
  {
    table: 'bm_banner',
    name: 'idx_banner_active',
    sql: 'ALTER TABLE bm_banner ADD INDEX idx_banner_active (placement, is_deleted, is_use, begin_time, end_time, sort_order)',
  },
];

async function hasIndex(table, name) {
  const [rows] = await pool.query(
    `SHOW INDEX FROM ?? WHERE Key_name = ?`,
    [table, name]
  );
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
