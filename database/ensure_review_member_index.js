const pool = require('../src/config/database');

async function ensureReviewMemberIndex() {
  const [rows] = await pool.query(
    `SHOW INDEX FROM bomiora_shop_item_use WHERE Key_name = 'idx_review_mb_is'`
  );
  if (rows.length > 0) {
    console.log('skip idx_review_mb_is (exists)');
    return;
  }
  console.log('create idx_review_mb_is...');
  await pool.query(
    `ALTER TABLE bomiora_shop_item_use ADD INDEX idx_review_mb_is (mb_id, is_id)`
  );
  console.log('ok idx_review_mb_is');
}

if (require.main === module) {
  ensureReviewMemberIndex()
    .catch((e) => {
      console.error('fail idx_review_mb_is:', e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { ensureReviewMemberIndex };
