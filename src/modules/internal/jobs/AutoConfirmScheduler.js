const orderRepository = require('../../user/delivery/repositories/OrderRepository');
const { startDailyKstJob } = require('./dailyKstScheduler');

async function runDueAutoConfirms() {
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < 30; i += 1) {
    const result = await orderRepository.processDueAutoConfirms(100);
    processed += Number(result?.processed || 0);
    failed += Number(result?.failed || 0);
    const batch = Number(result?.processed || 0) + Number(result?.failed || 0);
    if (batch < 100) break;
  }
  if (processed || failed) {
    console.log('[AutoConfirmScheduler] 처리', { processed, failed });
  }
}

/**
 * 매일 KST 08:00에 auto_confirm_at 경과 주문 자동 수령확정 + 포인트.
 */
function startAutoConfirmScheduler() {
  startDailyKstJob({
    name: 'AutoConfirmScheduler',
    hourEnv: 'AUTO_CONFIRM_PUSH_HOUR',
    minuteEnv: 'AUTO_CONFIRM_PUSH_MINUTE',
    run: runDueAutoConfirms,
  });
}

module.exports = {
  startAutoConfirmScheduler,
};
