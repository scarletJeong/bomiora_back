function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) {
    return '';
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return String(value || '').trim();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
  const first = raw.split(',')[0].trim();
  const ip = first || req.ip || req.connection?.remoteAddress || '';
  return String(ip).replace('::ffff:', '').trim();
}

function getKstDateTimeString() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function getKstDateString() {
  return getKstDateTimeString().slice(0, 10);
}

function isWithdrawnMember(user) {
  if (!user) {
    return false;
  }

  const leaveDateRaw = String(user.leaveDate || '').trim();
  if (!leaveDateRaw) {
    return false;
  }

  const leaveDateDigits = leaveDateRaw.replace(/[^0-9]/g, '').slice(0, 8);
  if (leaveDateDigits.length !== 8) {
    return true;
  }

  const todayDigits = getKstDateString().replace(/-/g, '');
  return leaveDateDigits <= todayDigits;
}

function normalizeSex(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'm' || v === 'male' || v === '1') return 'M';
  if (v === 'f' || v === 'female' || v === '2') return 'F';
  return '';
}

function normalizeBirth(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    return digits;
  }
  return '';
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  getClientIp,
  getKstDateTimeString,
  getKstDateString,
  isWithdrawnMember,
  normalizeSex,
  normalizeBirth,
};
