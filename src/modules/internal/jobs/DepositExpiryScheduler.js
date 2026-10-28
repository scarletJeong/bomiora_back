const orderRepository = require('../../user/delivery/repositories/OrderRepository');
const orderController = require('../../user/delivery/controllers/OrderController');
const { kstHourMinute, kstDateYmd } = require('./dailyKstScheduler');

/** 새벽 12:30, 낮 12:30 (KST) */
const RUN_TIMES = new Set(['00:30', '12:30']);

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

/** 매일 KST 00:30, 12:30에만 입금기한이 지난 결제대기 주문을 취소한다. */
function startDepositExpiryScheduler() {
  let running = false;
  let lastRunKey = '';
  const tick = async () => {
    const hm = kstHourMinute();
    if (!RUN_TIMES.has(hm)) return;
    const runKey = `${kstDateYmd()} ${hm}`;
    if (running || lastRunKey === runKey) return;
    running = true;
    lastRunKey = runKey;
    try {
      console.log(`[DepositExpiryScheduler] ${runKey} 잡 시작`);
      await runExpiredDepositCancels();
    } catch (error) {
      console.error('[DepositExpiryScheduler] 실패:', error?.message || error);
      lastRunKey = '';
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, 60 * 1000);
  console.log('[DepositExpiryScheduler] 시작 — 매일 KST 00:30, 12:30 입금기한 초과 주문 취소');
}

module.exports = {
  startDepositExpiryScheduler,
  runExpiredDepositCancels,
};
