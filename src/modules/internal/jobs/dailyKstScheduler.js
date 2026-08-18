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

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 매일 KST 지정 시각에 1회 실행 (node-cron 없이 1분마다 시각만 확인).
 * 기본: 08:00
 */
function startDailyKstJob({
  name,
  hourEnv,
  minuteEnv,
  defaultHour = 8,
  defaultMinute = 0,
  run,
}) {
  let lastRunDate = '';
  let running = false;
  const sharedHour = Number(process.env.DAILY_JOB_HOUR);
  const sharedMinute = Number(process.env.DAILY_JOB_MINUTE);
  const targetHour = Number(
    process.env[hourEnv] ?? (Number.isFinite(sharedHour) ? sharedHour : defaultHour)
  );
  const targetMinute = Number(
    process.env[minuteEnv] ?? (Number.isFinite(sharedMinute) ? sharedMinute : defaultMinute)
  );
  const timeLabel = `${pad2(targetHour)}:${pad2(targetMinute)}`;

  const tick = async () => {
    if (running) return;
    try {
      const today = kstDateYmd();
      if (lastRunDate === today) return;

      const [hh, mm] = kstHourMinute().split(':').map((v) => Number(v));
      if (hh !== targetHour || mm !== targetMinute) return;

      running = true;
      lastRunDate = today;
      console.log(`[${name}] ${today} ${timeLabel} 잡 시작`);
      await run();
    } catch (error) {
      console.error(`[${name}] 실패:`, error?.message || error);
      lastRunDate = '';
    } finally {
      running = false;
    }
  };

  setInterval(tick, 60 * 1000);
  setTimeout(tick, 5000);
  console.log(`[${name}] 시작 — 매일 KST ${timeLabel} 실행`);
}

module.exports = {
  startDailyKstJob,
  kstHourMinute,
  kstDateYmd,
};
