const { runCouponExpiryReminderJob } = require('../../user/notification/services/CouponExpiryReminderJob');
const { startDailyKstJob } = require('./dailyKstScheduler');

/**
 * 매일 KST 08:00에 쿠폰 만료 하루 전 푸시 1회 실행.
 */
function startCouponExpiryScheduler() {
  startDailyKstJob({
    name: 'CouponExpiryScheduler',
    hourEnv: 'COUPON_EXPIRY_PUSH_HOUR',
    minuteEnv: 'COUPON_EXPIRY_PUSH_MINUTE',
    run: runCouponExpiryReminderJob,
  });
}

module.exports = {
  startCouponExpiryScheduler,
  runCouponExpiryReminderJob,
};
