const path = require('path');
const fs = require('fs');

const admin = require('firebase-admin');

function resolveCredentialPath() {
  const fromEnv = (process.env.FIREBASE_CREDENTIAL_PATH || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(__dirname, 'firebase-bomiora.json');
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin;
  }

  const credPath = resolveCredentialPath();
  if (!fs.existsSync(credPath)) {
    console.warn(`[FCM] credential 파일 없음: ${credPath}`);
    return null;
  }

  const serviceAccount = require(credPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('[FCM] Firebase Admin 초기화 완료');
  return admin;
}

module.exports = { admin, initFirebaseAdmin };
