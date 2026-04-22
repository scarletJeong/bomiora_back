const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

function resolvePhpBinary() {
  const fromEnv = String(process.env.PHP_PATH || process.env.PHP_BINARY || '').trim();
  if (fromEnv) {
    const isWinPathOnUnix =
      process.platform !== 'win32' && /^[a-zA-Z]:[\\/]/.test(fromEnv);
    if (isWinPathOnUnix) {
      console.warn(
        '[kcpApprovalService] PHP_PATH looks like a Windows path on',
        process.platform,
        '— ignored. On Linux set e.g. PHP_PATH=/usr/bin/php'
      );
    } else if (fs.existsSync(fromEnv)) {
      return fromEnv;
    } else {
      console.warn('[kcpApprovalService] PHP_PATH not found, will try system php:', fromEnv);
    }
  }
  if (process.platform === 'win32') {
    const winCandidates = [
      'C:\\xampp\\php\\php.exe',
      'C:\\wamp64\\bin\\php\\php8.3.0\\php.exe',
      'C:\\wamp64\\bin\\php\\php8.2.0\\php.exe',
      'C:\\wamp64\\bin\\php\\php8.1.0\\php.exe',
    ];
    for (const c of winCandidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  const linuxCandidates = [
    '/usr/bin/php',
    '/usr/bin/php8.4',
    '/usr/bin/php8.3',
    '/usr/bin/php8.2',
    '/usr/bin/php8.1',
    '/usr/bin/php8.0',
    '/bin/php',
  ];
  for (const c of linuxCandidates) {
    if (fs.existsSync(c)) return c;
  }
  if (process.platform !== 'win32') {
    try {
      const out = execFileSync('/usr/bin/which', ['php'], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
      }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch (_) {
      /* which 실패 */
    }
    try {
      const sh = execFileSync('/bin/sh', ['-c', 'command -v php 2>/dev/null'], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
      }).trim();
      if (sh && fs.existsSync(sh)) return sh;
    } catch (_) {
      /* 없음 */
    }
  }
  return 'php';
}

function runPhpBridge(payload) {
  return new Promise((resolve, reject) => {
    const phpBin = resolvePhpBinary();
    const scriptPath = path.join(__dirname, 'kcp_approval_bridge.php');
    const child = execFile(
      phpBin,
      [scriptPath],
      {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const stderrText = String(stderr || '').trim();
        if (error) {
          const msg = String(stderrText || error.message || 'unknown error');
          const hint =
            (error.code === 'ENOENT' && String(phpBin) === 'php') ||
            msg.includes('ENOENT')
              ? ' (서버에 PHP CLI가 없거나 PATH에 없습니다. Ubuntu: sudo apt update && sudo apt install -y php-cli, 그다음 .env에 PHP_PATH=/usr/bin/php 후 pm2 restart)'
              : '';
          return reject(new Error(`KCP 승인 브리지 실행 실패: ${msg}${hint}`));
        }

        const text = String(stdout || '').trim();
        if (!text) {
          return reject(
            new Error(`KCP 승인 브리지 응답이 비어 있습니다.${stderrText ? ` stderr=${stderrText}` : ''}`)
          );
        }

        try {
          const parsed = JSON.parse(text);
          return resolve(parsed);
        } catch (parseError) {
          return reject(
            new Error(
              `KCP 승인 브리지 응답 파싱 실패: ${parseError.message} / raw=${text.slice(0, 500)}`
            )
          );
        }
      }
    );

    child.stdin.write(JSON.stringify(payload || {}));
    child.stdin.end();
  });
}

class KcpApprovalService {
  async approve({ orderId, amount, tranCd, encData, encInfo, clientIp }) {
    const payload = {
      req_tx: 'pay',
      tran_cd: String(tranCd || '').trim(),
      ordr_idxx: String(orderId || '').trim(),
      good_mny: Number(amount || 0),
      enc_data: String(encData || '').trim(),
      enc_info: String(encInfo || '').trim(),
      cust_ip: String(clientIp || '').trim(),
    };

    const missing = [];
    if (!payload.tran_cd) missing.push('tran_cd');
    if (!payload.ordr_idxx) missing.push('order_id');
    if (!payload.enc_data) missing.push('enc_data');
    if (!payload.enc_info) missing.push('enc_info');
    if (missing.length > 0) {
      throw new Error(`KCP 승인 요청값 누락: ${missing.join(', ')}`);
    }

    const result = await runPhpBridge({
      action: 'approve',
      ...payload,
    });
    return {
      success: String(result.res_cd || '') === '0000',
      ...result,
    };
  }

  async cancel({ orderId, tno, modType, modDesc, clientIp }) {
    const payload = {
      action: 'cancel',
      ordr_idxx: String(orderId || '').trim(),
      tno: String(tno || '').trim(),
      mod_type: String(modType || 'STSC').trim(),
      mod_desc: String(modDesc || 'AUTO_CANCEL').trim(),
      cust_ip: String(clientIp || '').trim(),
    };

    if (!payload.tno) {
      throw new Error('KCP 자동취소 요청값(tno)이 누락되었습니다.');
    }

    const result = await runPhpBridge(payload);
    return {
      success: String(result.res_cd || '') === '0000',
      ...result,
    };
  }
}

module.exports = new KcpApprovalService();

