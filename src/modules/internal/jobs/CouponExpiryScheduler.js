const { runCouponExpiryReminderJob } = require('../../user/notification/services/CouponExpiryReminderJob');

/** KST 기준 시각 문자열 HH:mm */
function kstHourMinute() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

function kstDateYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * 매일 KST 10:00대에 쿠폰 만료 하루 전 푸시 1회 실행.
 * (node-cron 없이 setInterval로 동작)
 */
function startCouponExpiryScheduler() {
  let lastRunDate = '';
  const targetHour = Number(process.env.COUPON_EXPIRY_PUSH_HOUR || 10);

  const tick = async () => {
    try {
      const today = kstDateYmd();
      if (lastRunDate === today) return;

      const [hh] = kstHourMinute().split(':').map((v) => Number(v));
      if (hh !== targetHour) return;

      lastRunDate = today;
      console.log(`[CouponExpiryScheduler] ${today} ${targetHour}시 잡 시작`);
      await runCouponExpiryReminderJob();
    } catch (error) {
      console.error('[CouponExpiryScheduler] 실패:', error?.message || error);
      // 실패 시 같은 날 재시도 허용
      lastRunDate = '';
    }
  };

  setInterval(tick, 60 * 1000);
  setTimeout(tick, 5000);
  console.log(
    `[CouponExpiryScheduler] 시작 — 매일 KST ${targetHour}:00 전후 실행`
  );
}

module.exports = {
  startCouponExpiryScheduler,
  runCouponExpiryReminderJob,
};
