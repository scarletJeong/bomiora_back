const pool = require('../src/config/database');

const INDEXES = [
  {
    table: 'bm_notice',
    name: 'idx_notice_list',
    sql: 'ALTER TABLE bm_notice ADD INDEX idx_notice_list (is_deleted, is_notice, created_at, id)',
  },
  {
    table: 'bomiora_point',
    name: 'idx_point_mb_po',
    sql: 'ALTER TABLE bomiora_point ADD INDEX idx_point_mb_po (mb_id, po_id)',
  },
  {
    table: 'bomiora_shop_order_address',
    name: 'idx_address_mb_ad',
    sql: 'ALTER TABLE bomiora_shop_order_address ADD INDEX idx_address_mb_ad (mb_id, ad_id)',
  },
  {
    table: 'bomiora_shop_order_address',
    name: 'idx_address_mb_default',
    sql: 'ALTER TABLE bomiora_shop_order_address ADD INDEX idx_address_mb_default (mb_id, ad_default)',
  },
  {
    table: 'bomiora_shop_wish',
    name: 'idx_wish_mb_time',
    sql: 'ALTER TABLE bomiora_shop_wish ADD INDEX idx_wish_mb_time (mb_id, wi_time)',
  },
  {
    table: 'bomiora_shop_coupon',
    name: 'idx_coupon_mb_end',
    sql: 'ALTER TABLE bomiora_shop_coupon ADD INDEX idx_coupon_mb_end (mb_id, cp_end, cp_no)',
  },
  {
    table: 'bomiora_shop_coupon_log',
    name: 'idx_coupon_log_mb_cp',
    sql: 'ALTER TABLE bomiora_shop_coupon_log ADD INDEX idx_coupon_log_mb_cp (mb_id, cp_id)',
  },
  {
    table: 'bomiora_shop_item_new',
    name: 'idx_item_list_cat',
    sql: 'ALTER TABLE bomiora_shop_item_new ADD INDEX idx_item_list_cat (ca_id, it_kind, it_use, it_order, it_id)',
  },
  {
    table: 'bomiora_shop_recent_view',
    name: 'idx_recent_mb_time',
    sql: 'ALTER TABLE bomiora_shop_recent_view ADD INDEX idx_recent_mb_time (mb_id, rv_time)',
  },
];

async function ensureListIndexes() {
  for (const spec of INDEXES) {
    try {
      const [rows] = await pool.query(
        'SHOW INDEX FROM ?? WHERE Key_name = ?',
        [spec.table, spec.name]
      );
      if (rows.length) {
        console.log(`skip ${spec.name} (exists)`);
        continue;
      }
      console.log(`create ${spec.name}...`);
      await pool.query(spec.sql);
      console.log(`ok ${spec.name}`);
    } catch (e) {
      console.warn(`fail ${spec.name}:`, e.message);
    }
  }
}

if (require.main === module) {
  ensureListIndexes()
    .catch((e) => {
      console.error('fail list indexes:', e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { ensureListIndexes };
