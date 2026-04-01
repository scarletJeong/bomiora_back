const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const iconv = require('iconv-lite');

class KcpService {
  constructor() {
    this.defaultCertUrl = 'https://testcert.kcp.co.kr/kcp_cert/cert_view.jsp';
  }

  getConfig() {
    const fallbackHomeDir = path.join(process.cwd(), 'kcp');
    const envHomeDir = process.env.KCP_HOME_DIR || process.env.KCP_CTCLI_HOME_DIR || '';
    const homeDir = this.resolveHomeDir(envHomeDir, fallbackHomeDir);
    const explicitBinary = process.env.KCP_CTCLI_PATH || '';
    const isTestMode = String(process.env.KCP_TEST_MODE || 'true').toLowerCase() !== 'false';
    const certUrl = process.env.KCP_CERT_URL || (isTestMode
      ? this.defaultCertUrl
      : 'https://cert.kcp.co.kr/kcp_cert/cert_view.jsp');
    const siteCd = process.env.KCP_SITE_CD || '';
    const webSiteId = process.env.KCP_WEB_SITEID || '';
    const encKey = process.env.KCP_ENC_KEY || '';
    const callbackUrl = process.env.KCP_CALLBACK_URL || '';
    const certOtpUse = process.env.KCP_CERT_OTP_USE || 'Y';
    const certEncUse = process.env.KCP_CERT_ENC_USE || 'Y';
    const certEncUseExt = String(process.env.KCP_CERT_ENC_USE_EXT || '').toUpperCase() === 'Y';
    const orderPrefix = process.env.KCP_ORDER_PREFIX || 'KCP';

    if (!siteCd) {
      throw new Error('KCP_SITE_CD 설정이 필요합니다.');
    }

    return {
      envHomeDir,
      homeDir,
      explicitBinary,
      fallbackHomeDir,
      isTestMode,
      certUrl,
      siteCd,
      webSiteId,
      encKey,
      callbackUrl,
      certOtpUse,
      certEncUse,
      certEncUseExt,
      orderPrefix,
    };
  }

  resolveHomeDir(envHomeDir, fallbackHomeDir) {
    const candidates = [
      envHomeDir,
      path.join(process.cwd(), 'kcp'),
      path.resolve(__dirname, '../../../../kcp'),
      fallbackHomeDir,
    ]
      .filter(Boolean)
      .map((p) => path.resolve(String(p)));

    for (const candidate of candidates) {
      const binOldPath = path.join(candidate, 'bin_old');
      if (fs.existsSync(binOldPath) && fs.statSync(binOldPath).isDirectory()) {
        return candidate;
      }
    }

    // 유효한 경로를 찾지 못한 경우에도 fallback을 반환하고,
    // 최종 에러 메시지에서 탐색 경로를 함께 안내한다.
    return path.resolve(String(envHomeDir || fallbackHomeDir));
  }

  resolveBinaryPath(config = this.getConfig()) {
    if (config.explicitBinary) {
      return config.explicitBinary;
    }

    const isWindows = process.platform === 'win32';
    const is64Bit = os.arch() === 'x64';
    const binaryCandidates = isWindows
      ? ['ct_cli_exe.exe', 'ct_cli_x64', 'ct_cli']
      : (is64Bit ? ['ct_cli_x64', 'ct_cli'] : ['ct_cli', 'ct_cli_x64']);

    for (const binaryName of binaryCandidates) {
      const candidatePath = path.join(config.homeDir, 'bin_old', binaryName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    return path.join(config.homeDir, 'bin_old', binaryCandidates[0]);
  }

  async makeHashData(homeDir, key, str) {
    const args = key
      ? [homeDir, 'lf_CT_CLI__make_hash_data', key, str]
      : ['lf_CT_CLI__make_hash_data', str];
    const output = await this.runCtCli(args, { homeDir });

    if (!output) {
      return 'HS01';
    }

    return output;
  }

  async checkValidHash(homeDir, key, hashData, str) {
    const args = key
      ? [homeDir, 'lf_CT_CLI__check_valid_hash', key, hashData, str]
      : ['lf_CT_CLI__check_valid_hash', hashData, str];
    const output = await this.runCtCli(args, { homeDir });

    if (!output) {
      return 'HS02';
    }

    return output;
  }

  async decryptEncCert(homeDir, key, siteCd, certNo, encCertData, opt = '1') {
    const isWindows = process.platform === 'win32';
    let args;

    if (key) {
      args = isWindows
        ? [homeDir, 'lf_CT_CLI__decrypt_enc_cert', key, siteCd, certNo, encCertData]
        : [homeDir, 'lf_CT_CLI__decrypt_enc_cert', key, siteCd, certNo, encCertData, opt];
    } else {
      args = isWindows
        ? ['lf_CT_CLI__decrypt_enc_cert', siteCd, certNo, encCertData]
        : ['lf_CT_CLI__decrypt_enc_cert', siteCd, certNo, encCertData, opt];
    }

    const output = await this.runCtCli(args, { homeDir });

    if (!output || output === 'HS01') {
      return {
        raw: 'HS03',
        parsed: {},
      };
    }

    return {
      raw: output,
      parsed: this.parseDecryptedData(output),
    };
  }

  async getLibVersion(homeDir) {
    return this.runCtCli(['lf_CT_CLI__get_kcp_lib_ver'], { homeDir });
  }

  async createRequestPayload({ callbackUrl, token, paramOpt2 = '', paramOpt3 = '' }) {
    const config = this.getConfig();
    const orderId = this.generateOrderId(config.orderPrefix);
    const hashSource = `${config.siteCd}${orderId}000000`;
    const upHash = await this.makeHashData(config.homeDir, config.encKey, hashSource);

    const fields = {
      user_name: '',
      ordr_idxx: orderId,
      req_tx: 'cert',
      cert_type: '01',
      web_siteid: config.webSiteId,
      site_cd: config.siteCd,
      Ret_URL: callbackUrl || config.callbackUrl,
      cert_otp_use: config.certOtpUse,
      cert_enc_use: config.certEncUse,
      res_cd: '',
      res_msg: '',
      up_hash: upHash,
      veri_up_hash: upHash,
      web_siteid_hashYN: '',
      param_opt_1: token,
      param_opt_2: paramOpt2,
      param_opt_3: paramOpt3,
    };

    if (!fields.Ret_URL) {
      throw new Error('KCP callback URL을 확인할 수 없습니다.');
    }

    if (config.certEncUseExt) {
      fields.cert_enc_use_ext = 'Y';
      fields.kcp_cert_lib_ver = await this.getLibVersion(config.homeDir);
    }

    return {
      token,
      orderId,
      certUrl: config.certUrl,
      siteCd: config.siteCd,
      upHash,
      fields,
      html: this.buildAutoSubmitHtml({
        certUrl: config.certUrl,
        fields,
      }),
    };
  }

  generateOrderId(prefix = 'KCP') {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}${timestamp}${randomSuffix}`.slice(0, 40);
  }

  parseDecryptedData(raw) {
    return String(raw || '')
      .split('\x1f')
      .reduce((acc, pair) => {
        if (!pair) {
          return acc;
        }

        const separatorIndex = pair.indexOf('=');
        if (separatorIndex < 0) {
          return acc;
        }

        const key = pair.slice(0, separatorIndex);
        const value = pair.slice(separatorIndex + 1);
        acc[key] = value;
        return acc;
      }, {});
  }

  buildAutoSubmitHtml({ certUrl, fields }) {
    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${this.escapeHtml(key)}" value="${this.escapeHtml(value)}" />`)
      .join('\n');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KCP 본인인증 요청</title>
</head>
<body>
  <form id="kcp-auth-form" method="post" action="${this.escapeHtml(certUrl)}">
    ${inputs}
  </form>
  <script>
    window.onload = function () {
      document.getElementById('kcp-auth-form').submit();
    };
  </script>
</body>
</html>`;
  }

  buildCallbackHtml({ token, success, message }) {
    const title = success ? '본인인증이 완료되었습니다.' : '본인인증 처리 중 오류가 발생했습니다.';
    const bodyMessage = message || (success
      ? '앱으로 돌아가 결과를 확인해 주세요.'
      : '잠시 후 다시 시도해 주세요.');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KCP 인증 결과</title>
</head>
<body data-kcp-token="${this.escapeHtml(token || '')}" data-kcp-success="${success ? 'true' : 'false'}">
  <div style="padding:24px;font-family:sans-serif;">
    <h2 style="margin:0 0 12px;">${this.escapeHtml(title)}</h2>
    <p style="margin:0;color:#555;">${this.escapeHtml(bodyMessage)}</p>
  </div>
</body>
</html>`;
  }

  async runCtCli(args, { homeDir }) {
    const config = this.getConfig();
    const binaryPath = this.resolveBinaryPath(config);
    const binDir = path.dirname(binaryPath);

    if (!fs.existsSync(binaryPath)) {
      const searched = [
        config.envHomeDir ? `env=${config.envHomeDir}` : null,
        `resolved=${config.homeDir}`,
        `fallback=${config.fallbackHomeDir}`,
      ].filter(Boolean).join(', ');

      throw new Error(
        `KCP 바이너리를 찾을 수 없습니다: ${binaryPath} (${searched})`
      );
    }

    const env = {
      ...process.env,
      g_conf_home_dir: homeDir || config.homeDir,
    };

    if (process.platform === 'win32') {
      return this.runCtCliOnWindows({ binaryPath, args, env, cwd: binDir });
    }

    return this.runCtCliOnUnix({ binaryPath, args, env, cwd: binDir });
  }

  runCtCliOnUnix({ binaryPath, args, env, cwd }) {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdoutChunks = [];
      const stderrChunks = [];

      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        const lastLine = this.extractLastNonEmptyLine(stdout);

        if (code !== 0 && !lastLine) {
          return reject(new Error(stderr || `ct_cli 실행 실패 (exit: ${code})`));
        }

        resolve(lastLine || stdout || stderr);
      });
    });
  }

  runCtCliOnWindows({ binaryPath, args, env, cwd }) {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args.map((arg) => String(arg ?? '')), {
        cwd,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdoutChunks = [];
      const stderrChunks = [];

      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        const stdoutBuffer = Buffer.concat(stdoutChunks);
        const stderrBuffer = Buffer.concat(stderrChunks);
        const stdout = iconv.decode(stdoutBuffer, 'cp949').trim();
        const stderr = iconv.decode(stderrBuffer, 'cp949').trim();
        const lastLine = this.extractLastNonEmptyLine(stdout);

        if (code !== 0 && !lastLine) {
          return reject(new Error(stderr || `ct_cli 실행 실패 (exit: ${code})`));
        }

        resolve(lastLine || stdout || stderr);
      });
    });
  }

  extractLastNonEmptyLine(output) {
    return String(output || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() || '';
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = new KcpService();
