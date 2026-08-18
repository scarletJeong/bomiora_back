const {
  runReviewRequestReminderJob,
  delayMinutes,
} = require('../../user/notification/services/ReviewRequestReminderJob');
const { startDailyKstJob } = require('./dailyKstScheduler');

async function runReviewRequestBatches() {
  for (let i = 0; i < 20; i += 1) {
    const summary = await runReviewRequestReminderJob();
    if (!summary?.scanned) break;
    if (summary.scanned < 50) break;
  }
}

/**
 * 매일 KST 08:00에 배송중 전환 후 30분(설정값) 경과 주문 리뷰 요청 푸시.
 */
function startReviewRequestScheduler() {
  startDailyKstJob({
    name: 'ReviewRequestScheduler',
    hourEnv: 'REVIEW_REQUEST_PUSH_HOUR',
    minuteEnv: 'REVIEW_REQUEST_PUSH_MINUTE',
    run: runReviewRequestBatches,
  });
  console.log(
    `[ReviewRequestScheduler] 대상: 배송중 후 ${delayMinutes()}분 경과 주문`
  );
}

module.exports = {
  startReviewRequestScheduler,
  runReviewRequestReminderJob,
};
