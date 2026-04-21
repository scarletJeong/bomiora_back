const path = require('path');
const { execFile } = require('child_process');

function runPhpBridge(payload) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'kcp_approval_bridge.php');
    const child = execFile(
      'php',
      [scriptPath],
      {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const stderrText = String(stderr || '').trim();
        if (error) {
          return reject(
            new Error(
              `KCP 승인 브리지 실행 실패: ${stderrText || error.message || 'unknown error'}`
            )
          );
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

