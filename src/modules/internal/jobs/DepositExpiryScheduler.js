const orderRepository = require('../../user/delivery/repositories/OrderRepository');
const orderController = require('../../user/delivery/controllers/OrderController');

async function runExpiredDepositCancels() {
  let cancelled = 0;
  const members = new Set();
  for (let i = 0; i < 20; i += 1) {
    const batch = await orderRepository.cancelExpiredUnpaidDeposits({ limit: 100 });
    cancelled += batch.length;
    batch.forEach((row) => {
      if (row.mbId) members.add(row.mbId);
    });
    if (batch.length < 100) break;
  }
  members.forEach((mbId) => orderController.invalidateOrderListCache(mbId));
  if (cancelled) {
    console.log('[DepositExpiryScheduler] 입금기한 초과 취소', { cancelled });
  }
}

/** 입금기한은 23:59:59에 끝나므로 1분마다 지난 결제대기 주문을 취소한다. */
function startDepositExpiryScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runExpiredDepositCancels();
    } catch (error) {
      console.error('[DepositExpiryScheduler] 실패:', error?.message || error);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, 60 * 1000);
  console.log('[DepositExpiryScheduler] 시작 — 1분마다 입금기한 초과 주문 취소');
}

module.exports = {
  startDepositExpiryScheduler,
  runExpiredDepositCancels,
};
