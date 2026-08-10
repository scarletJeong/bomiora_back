const pool = require('../../config/database');

let _ensured = false;
let _ensuring = null;

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function ensureColumn(table, column, ddlFragment) {
  if (await columnExists(table, column)) return;
  await pool.query(`ALTER TABLE \`${table}\` ${ddlFragment}`);
  console.log(`[SchemaEnsure] ${table}.${column} 추가`);
}

/**
 * 종속옵션·연결상품·장바구니 묶음에 필요한 스키마를 안전하게 보정합니다.
 * (이미 있으면 스킵)
 */
async function ensureSupplyDepoptSchema() {
  if (_ensured) return;
  if (_ensuring) return _ensuring;

  _ensuring = (async () => {
    try {
      // ct_kind → varchar(64)
      try {
        const [cols] = await pool.query(
          `SELECT COLUMN_TYPE AS ct
             FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'bomiora_shop_cart'
              AND COLUMN_NAME = 'ct_kind'
            LIMIT 1`
        );
        const colType = cols[0]?.ct ? String(cols[0].ct).toLowerCase() : '';
        if (colType.includes('enum') || (colType.startsWith('varchar') && !colType.includes('64'))) {
          await pool.query(
            `ALTER TABLE bomiora_shop_cart
             MODIFY ct_kind varchar(64) NOT NULL DEFAULT 'general'`
          );
          console.log('[SchemaEnsure] bomiora_shop_cart.ct_kind → varchar(64)');
        }
      } catch (e) {
        console.warn('[SchemaEnsure] ct_kind ALTER 스킵:', e.message);
      }

      // cart.parent — 추가상품의 부모 it_id (본품은 '')
      try {
        const hadParent = await columnExists('bomiora_shop_cart', 'parent');
        await ensureColumn(
          'bomiora_shop_cart',
          'parent',
          `ADD COLUMN parent varchar(32) NOT NULL DEFAULT '' AFTER ct_kind`
        );
        if (!hadParent) {
          // 신규 직후 1회: supply_add|부모 → parent 이관
          await pool.query(
            `UPDATE bomiora_shop_cart
             SET parent = TRIM(SUBSTRING(ct_kind, LENGTH('supply_add|') + 1))
             WHERE ct_kind LIKE 'supply_add|%'
               AND TRIM(IFNULL(parent, '')) = ''`
          );
          await pool.query(
            `UPDATE bomiora_shop_cart
             SET ct_kind = 'general'
             WHERE ct_kind LIKE 'supply_add|%'`
          );
          console.log('[SchemaEnsure] bomiora_shop_cart.parent 이관 완료');
        } else {
          // 이미 컬럼 있어도 legacy supply_add| 잔여분 정리
          const [legacy] = await pool.query(
            `SELECT COUNT(*) AS cnt FROM bomiora_shop_cart
             WHERE ct_kind LIKE 'supply_add|%'`
          );
          if (legacy[0] && Number(legacy[0].cnt) > 0) {
            await pool.query(
              `UPDATE bomiora_shop_cart
               SET parent = TRIM(SUBSTRING(ct_kind, LENGTH('supply_add|') + 1))
               WHERE ct_kind LIKE 'supply_add|%'
                 AND TRIM(IFNULL(parent, '')) = ''`
            );
            await pool.query(
              `UPDATE bomiora_shop_cart
               SET ct_kind = 'general'
               WHERE ct_kind LIKE 'supply_add|%'`
            );
            console.log('[SchemaEnsure] legacy supply_add| → parent 정리');
          }
        }
      } catch (e) {
        console.warn('[SchemaEnsure] parent 컬럼 스킵:', e.message);
      }

      await ensureColumn(
        'bomiora_shop_item_new',
        'it_supply_items',
        `ADD COLUMN it_supply_items varchar(255) NOT NULL DEFAULT ''`
      );
      await ensureColumn(
        'bomiora_shop_item_new',
        'it_depopt1_subject',
        `ADD COLUMN it_depopt1_subject varchar(255) NOT NULL DEFAULT ''`
      );
      await ensureColumn(
        'bomiora_shop_item_new',
        'it_depopt1_label',
        `ADD COLUMN it_depopt1_label varchar(100) NOT NULL DEFAULT ''`
      );
      await ensureColumn(
        'bomiora_shop_item_new',
        'it_depopt2_subject',
        `ADD COLUMN it_depopt2_subject varchar(255) NOT NULL DEFAULT ''`
      );
      await ensureColumn(
        'bomiora_shop_item_new',
        'it_depopt2_label',
        `ADD COLUMN it_depopt2_label varchar(100) NOT NULL DEFAULT ''`
      );

      _ensured = true;
    } catch (e) {
      console.warn('[SchemaEnsure] 실패(계속 진행):', e.message);
    } finally {
      _ensuring = null;
    }
  })();

  return _ensuring;
}

module.exports = { ensureSupplyDepoptSchema };
