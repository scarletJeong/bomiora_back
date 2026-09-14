const pool = require('../src/config/database');

async function ensureMemberRefundIndex() {
  const [rows] = await pool.query(
    `SHOW INDEX FROM bomiora_member WHERE Key_name = 'idx_member_refund'`
  );
  if (rows.length > 0) {
    console.log('skip idx_member_refund (exists)');
    return;
  }
  console.log('create idx_member_refund...');
  await pool.query(
    `ALTER TABLE bomiora_member
       ADD INDEX idx_member_refund (mb_id, mb_refund_bank, mb_refund_account, mb_refund_holder)`
  );
  console.log('ok idx_member_refund');
}

if (require.main === module) {
  ensureMemberRefundIndex()
    .catch((e) => {
      console.error('fail idx_member_refund:', e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { ensureMemberRefundIndex };
