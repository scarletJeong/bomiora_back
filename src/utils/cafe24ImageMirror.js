const fs = require('fs');
const https = require('https');
const http = require('http');

const IMAGE_MIRROR_URL = (process.env.IMAGE_MIRROR_URL || '').trim();

const IMAGE_MIRROR_SECRET = (
  process.env.IMAGE_MIRROR_SECRET ||
  process.env.INTERNAL_NOTIFY_SECRET ||
  ''
).trim();

const CAFE24_PUBLIC_BASE = (
  process.env.CAFE24_IMAGE_PUBLIC_BASE || 'https://bomiora0.mycafe24.com/data'
).replace(/\/$/, '');

/** Cafe24 data/ 하위 디렉터리 (app_image_mirror.php 화이트리스트와 동일) */
const SUBDIRS = {
  qa: 'qa_images',
  review: 'review_images',
  food: 'food_images',
  weight: 'weight_images',
  profile: 'profiles',
};

function isMirrorEnabled() {
  return Boolean(IMAGE_MIRROR_URL);
}

function getPublicUrl(subdir, filename, mbId) {
  const safeName = String(filename || '').trim();
  if (subdir === SUBDIRS.profile && mbId) {
    return `${CAFE24_PUBLIC_BASE}/profiles/${encodeURIComponent(String(mbId))}/${encodeURIComponent(safeName)}`;
  }
  return `${CAFE24_PUBLIC_BASE}/${subdir}/${encodeURIComponent(safeName)}`;
}

/** Cafe24 PHP 미러 엔드포인트로 base64 POST */
function mirrorImageToCafe24({ subdir, filename, buf, mime, mbId }) {
  if (!IMAGE_MIRROR_URL || !buf || !buf.length) return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      const params = {
        subdir,
        filename,
        data: buf.toString('base64'),
        mime: mime || 'application/octet-stream',
      };
      if (mbId) params.mb_id = String(mbId);

      const body = new URLSearchParams(params).toString();
      const target = new URL(IMAGE_MIRROR_URL);
      const lib = target.protocol === 'https:' ? https : http;

      const req = lib.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (target.protocol === 'https:' ? 443 : 80),
          path: `${target.pathname}${target.search || ''}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'X-Internal-Secret': IMAGE_MIRROR_SECRET,
          },
          timeout: 20000,
          rejectUnauthorized: false,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return resolve(false);
            }
            try {
              const parsed = JSON.parse(raw);
              return resolve(!!(parsed && parsed.success));
            } catch (_) {
              return resolve(false);
            }
          });
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.write(body);
      req.end();
    } catch (_) {
      resolve(false);
    }
  });
}

/** multer 업로드 파일 → Node 저장 후 Cafe24 미러(백그라운드), 공개 URL 즉시 반환 */
async function mirrorUploadedFile({ subdir, filePath, filename, mime, mbId, localUrl }) {
  if (!isMirrorEnabled()) return localUrl;

  const publicUrl = getPublicUrl(subdir, filename, mbId);
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (_) {
    return localUrl;
  }

  // Cafe24 HTTP 미러는 수 초~20초 걸릴 수 있음 — API 응답은 기다리지 않음
  mirrorImageToCafe24({ subdir, filename, buf, mime, mbId }).catch(() => {});

  return publicUrl;
}

module.exports = {
  SUBDIRS,
  isMirrorEnabled,
  getPublicUrl,
  mirrorImageToCafe24,
  mirrorUploadedFile,
};
