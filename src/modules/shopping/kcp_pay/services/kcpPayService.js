class KcpPayService {
  getConfig() {
    let siteCd = (process.env.KCP_PAY_SITE_CD || process.env.KCP_SITE_CD || '').trim();
    const isTestSiteCode = /^T000/i.test(siteCd);
    const testMode = String(
      process.env.KCP_PAY_TEST_MODE || (isTestSiteCode ? 'true' : 'false')
    ).toLowerCase() !== 'false';
    const siteKey = process.env.KCP_PAY_SITE_KEY || '';
    const siteName = process.env.KCP_PAY_SITE_NAME || 'BOMIORA';
    const jsUrl = process.env.KCP_PAY_JS_URL || (testMode
      ? 'https://testpay.kcp.co.kr/plugin/payplus_web.jsp'
      : 'https://pay.kcp.co.kr/plugin/payplus_web.jsp');
    const callbackUrl = process.env.KCP_PAY_CALLBACK_URL || '';
    const siteCdAsIs = String(process.env.KCP_PAY_SITE_CD_AS_IS || '').toLowerCase() === '1'
      || String(process.env.KCP_PAY_SITE_CD_AS_IS || '').toLowerCase() === 'true';

    if (!siteCd) {
      throw new Error('KCP_PAY_SITE_CD 환경변수가 필요합니다.');
    }

    // 그누보드 `settle_kcp.inc.php`: 운영 상점은 site_cd가 SR 로 시작(환경에는 미포함 저장된 경우 SR 접두)
    if (!siteCdAsIs && !isTestSiteCode && !testMode && siteCd && !/^SR/i.test(siteCd)) {
      siteCd = `SR${siteCd}`;
    }

    return {
      testMode,
      siteCd,
      siteKey,
      siteName,
      jsUrl,
      callbackUrl,
    };
  }

  /**
   * 영카트 `orderform.sub.php` (에스크로 good_info) 와 동일한 형식
   * @param {string} orderId
   * @param {Array<{ it_name?: string, ct_qty?: number, ct_price?: number }>} cartRows
   */
  buildGoodInfo(orderId, cartRows) {
    if (!Array.isArray(cartRows) || !cartRows.length) return '';
    const RS = String.fromCharCode(30);
    const US = String.fromCharCode(31);
    const esc = (s) => String(s ?? '').replace(/[\r\n\x1E\x1F]/g, ' ').replace(/"/g, "'");
    let out = '';
    cartRows.forEach((row, i) => {
      if (i > 0) out += RS;
      const seq = i + 1;
      out += `seq=${seq}${US}ordr_numb=${orderId}_${String(i).padStart(4, '0')}${US}good_name=${esc(row.it_name)}${US}good_cntx=${row.ct_qty ?? 1}${US}good_amtx=${row.ct_price ?? 0}${US}`;
    });
    return out;
  }

  rcvrZipx(receiver) {
    if (!receiver || typeof receiver !== 'object') return '';
    if (receiver.zip) return String(receiver.zip).replace(/[^0-9]/g, '');
    const a = String(receiver.zip1 || '').replace(/[^0-9]/g, '');
    const b = String(receiver.zip2 || '').replace(/[^0-9]/g, '');
    return `${a}${b}`;
  }

  /**
   * 영카트 `orderform.sub.php` 와 동일한 KCP `pay_method` 12자리.
   * @param {string} method - `card`|`bank`|`vbank` 또는 `신용카드`|`계좌이체`|`가상계좌`
   * @param {string} [explicitPayMethod] - `pay_method` 12자리(선택). `payment_method`와 일치할 때만 반영
   */
  mapMethod(method, explicitPayMethod) {
    const fromText = this._mapMethodFromText(method);
    const bits = String(explicitPayMethod || '').trim();
    const allowed = new Set(['100000000000', '010000000000', '001000000000']);
    if (!/^\d{12}$/.test(bits) || !allowed.has(bits)) {
      return fromText;
    }
    if (bits === fromText.payMethod) {
      return { payMethod: bits, settleCase: fromText.settleCase };
    }
    if (!String(method || '').trim()) {
      return { payMethod: bits, settleCase: this.settleCaseFromPayMethodBits(bits) };
    }
    // 충돌 시 `payment_method` 기준(위조된 pay_method 무시)
    return fromText;
  }

  _mapMethodFromText(method) {
    const raw = String(method || '').trim();
    const key = raw.toLowerCase();
    if (key === 'bank' || raw === '계좌이체') {
      return { payMethod: '010000000000', settleCase: '계좌이체' };
    }
    if (key === 'vbank' || raw === '가상계좌') {
      return { payMethod: '001000000000', settleCase: '가상계좌' };
    }
    if (key === 'card' || raw === '신용카드') {
      return { payMethod: '100000000000', settleCase: '신용카드' };
    }
    return { payMethod: '100000000000', settleCase: '신용카드' };
  }

  settleCaseFromPayMethodBits(bits) {
    switch (String(bits)) {
      case '010000000000':
        return '계좌이체';
      case '001000000000':
        return '가상계좌';
      case '000010000000':
        return '휴대폰';
      case '100000000000':
      default:
        return '신용카드';
    }
  }

  /**
   * 모바일 SmartPay 결제수단 코드 (trade/register.do + PayUrl 폼)
   * @param {string} payMethodBits - 12자리 PC pay_method
   */
  toMobilePayCodes(payMethodBits) {
    switch (String(payMethodBits || '')) {
      case '010000000000':
        return { payMethod: 'BANK', actionResult: 'acnt' };
      case '001000000000':
        return { payMethod: 'VCNT', actionResult: 'vcnt' };
      case '000010000000':
        return { payMethod: 'MOBX', actionResult: 'mobx' };
      case '100000000000':
      default:
        return { payMethod: 'CARD', actionResult: 'card' };
    }
  }

  getMobileTradeRegisterUrl(testMode) {
    return testMode
      ? 'https://testsmpay.kcp.co.kr/trade/register.do'
      : 'https://smpay.kcp.co.kr/trade/register.do';
  }

  /**
   * KCP 모바일 필수: 거래등록 후 PayUrl / approvalKey 수령
   * @returns {Promise<{ approvalKey: string, payUrl: string, raw: object }>}
   */
  async registerMobileTrade({
    siteCd,
    orderId,
    amount,
    goodsName,
    payMethodCode,
    retUrl,
    escrowUse = false,
  }) {
    const { testMode } = this.getConfig();
    const url = this.getMobileTradeRegisterUrl(testMode);
    const body = {
      site_cd: siteCd,
      ordr_idxx: String(orderId),
      good_mny: String(amount),
      good_name: String(goodsName || '').slice(0, 100),
      pay_method: String(payMethodCode || 'CARD'),
      Ret_URL: String(retUrl),
      escw_used: escrowUse ? 'Y' : 'N',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(
        `KCP 모바일 거래등록 응답 파싱 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`
      );
    }

    const code = String(
      data.Code ?? data.code ?? data.res_cd ?? data.ResCd ?? ''
    ).trim();
    const message = String(
      data.Message ?? data.message ?? data.res_msg ?? data.ResMsg ?? ''
    ).trim();
    const approvalKey = String(
      data.approvalKey ?? data.approval_key ?? data.ApprovalKey ?? ''
    ).trim();
    const payUrl = String(
      data.PayUrl ?? data.payUrl ?? data.pay_url ?? ''
    ).trim();

    if (code !== '0000' || !approvalKey || !payUrl) {
      throw new Error(
        `KCP 모바일 거래등록 실패 [${code || '????'}] ${message || '응답 오류'}`.trim()
      );
    }

    return { approvalKey, payUrl, raw: data };
  }

  /**
   * 모바일: PayUrl 로 order_info 자동 POST (payplus_web PC 레이어 미사용)
   */
  buildMobileRequestHtml({
    callbackUrl,
    token,
    siteCd,
    siteName,
    orderId,
    goodsName,
    amount,
    buyer,
    receiver,
    payMethodBits,
    escrowUse,
    shopUserId,
    approvalKey,
    payUrl,
  }) {
    const mobile = this.toMobilePayCodes(payMethodBits);
    const retUrl = (() => {
      const base = String(callbackUrl || '').trim();
      if (!base) return '';
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}token=${encodeURIComponent(token)}`;
    })();

    const fields = {
      site_cd: siteCd,
      pay_method: mobile.payMethod,
      ActionResult: mobile.actionResult,
      currency: '410',
      shop_name: siteName,
      Ret_URL: retUrl,
      approval_key: approvalKey,
      PayUrl: payUrl,
      ordr_idxx: orderId,
      good_name: goodsName,
      good_cd: '00',
      good_mny: String(amount),
      buyr_name: buyer?.name || '',
      buyr_mail: buyer?.email || '',
      buyr_tel1: buyer?.tel || '',
      buyr_tel2: buyer?.hp || '',
      rcvr_name: receiver?.name || '',
      rcvr_tel1: receiver?.tel || '',
      rcvr_tel2: receiver?.hp || '',
      rcvr_mail: buyer?.email || '',
      rcvr_zipx: this.rcvrZipx(receiver),
      rcvr_add1: receiver?.addr1 || '',
      rcvr_add2: receiver?.addr2 || '',
      shop_user_id: String(shopUserId || '').trim(),
      tablet_size: '1.0',
      escw_used: escrowUse ? 'Y' : 'N',
      pay_mod: escrowUse ? 'O' : 'N',
      deli_term: '03',
      param_opt_1: token,
      param_opt_2: '',
      param_opt_3: '',
      kcp_token: token,
      enc_info: '',
      enc_data: '',
      res_cd: '',
      res_msg: '',
      tran_cd: '',
      use_pay_method: '',
    };

    const inputs = Object.entries(fields)
      .map(
        ([key, value]) =>
          `<input type="hidden" name="${this.escape(key)}" value="${this.escape(value)}" />`
      )
      .join('\n');

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>KCP 모바일 결제</title>
  <style>
    body { margin: 0; padding: 0; background: transparent; }
    .box { display: none !important; }
  </style>
</head>
<body>
  <div class="box">
    <h3>모바일 결제창을 여는 중입니다…</h3>
    <p>잠시만 기다려 주세요.</p>
  </div>
  <form id="order_info" name="order_info" method="post">
    ${inputs}
  </form>
  <script>
    (function () {
      function callPayForm() {
        var v_frm = document.order_info || document.getElementById('order_info');
        if (!v_frm) return;
        var payUrl = (v_frm.PayUrl && v_frm.PayUrl.value) || '';
        try {
          if (payUrl) {
            var base = payUrl.substring(0, payUrl.lastIndexOf('/'));
            v_frm.action = base + '/jsp/encodingFilter/encodingFilter.jsp';
          }
        } catch (e) {
          v_frm.action = payUrl;
        }
        if (!v_frm.action && payUrl) v_frm.action = payUrl;
        v_frm.method = 'post';
        v_frm.acceptCharset = 'UTF-8';
        v_frm.submit();
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callPayForm);
      } else {
        callPayForm();
      }
    })();
  </script>
</body>
</html>`;
  }

  buildRequestHtml({
    jsUrl,
    callbackUrl,
    token,
    siteCd,
    siteName,
    orderId,
    goodsName,
    amount,
    buyer,
    receiver,
    payMethod,
    escrowUse,
    basketLineCount,
    goodInfo,
    shopUserId,
    userAgent = 'Android',
  }) {
    const rcvrZipx = this.rcvrZipx(receiver);
    const lineCount = Math.max(1, Number(basketLineCount) || 1);

    const fields = {
      req_tx: 'pay',
      site_cd: siteCd,
      site_name: siteName,
      def_site_cd: siteCd,
      pay_method: payMethod,
      ordr_idxx: orderId,
      good_name: goodsName,
      good_mny: String(amount),
      buyr_name: buyer.name || '',
      buyr_mail: buyer.email || '',
      buyr_tel1: buyer.tel || '',
      buyr_tel2: buyer.hp || '',
      rcvr_name: receiver.name || '',
      rcvr_tel1: receiver.tel || '',
      rcvr_tel2: receiver.hp || '',
      rcvr_mail: buyer.email || '',
      rcvr_zipx: rcvrZipx,
      rcvr_add1: receiver.addr1 || '',
      rcvr_add2: receiver.addr2 || '',
      payco_direct: '',
      naverpay_direct: 'A',
      kakaopay_direct: 'A',
      quotaopt: '12',
      currency: 'WON',
      module_type: '01',
      epnt_issu: '',
      res_cd: '',
      res_msg: '',
      tno: '',
      trace_no: '',
      enc_info: '',
      enc_data: '',
      ret_pay_method: '',
      tran_cd: '',
      bank_name: '',
      bank_issu: '',
      use_pay_method: '',
      cash_tsdtime: '',
      cash_yn: '',
      cash_authno: '',
      cash_tr_code: '',
      cash_id_info: '',
      good_expr: '0',
      shop_user_id: String(shopUserId || '').trim(),
      pt_memcorp_cd: '',
      escw_used: 'Y',
      pay_mod: escrowUse ? 'O' : 'N',
      deli_term: '03',
      bask_cntx: String(lineCount),
      good_info: goodInfo || '',
      kcp_noint: 'N',
      used_card_YN: 'N',
      used_card: 'CCXA:CCXB:CCXC',
      wish_vbank_list: '',
      vcnt_expire_term: '1',
      vcnt_expire_term_time: '235959',
      disp_tax_yn: 'N',
      site_logo: '',
      eng_flag: 'N',
      skin_indx: '1',
      // 가맹점 커스텀 값 — 모바일 Ret_URL 분기 시에도 토큰 복구용
      param_opt_1: token,
      param_opt_2: '',
      param_opt_3: '',
      kcp_token: token,
    };

    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${this.escape(key)}" value="${this.escape(value)}" />`)
      .join('\n');

    // PC payplus_web — 앱은 mobile SmartPay 경로를 사용하므로 UA 스푸핑 없음
    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KCP 결제</title>
  <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}</style>
  <script>
    function m_Completepayment(FormOrJson, closeEvent) {
      var form = document.kcp_form || document.getElementById('kcp_form');
      try {
        GetField(form, FormOrJson);
      } catch (e) {}

      function normalizeValue(value) {
        if (value == null) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        if (typeof value === 'object') {
          if (typeof value.value !== 'undefined') {
            return String(value.value || '');
          }
          if (Array.isArray(value) && value.length > 0) {
            var first = value[0];
            if (first && typeof first.value !== 'undefined') {
              return String(first.value || '');
            }
          }
        }
        return '';
      }

      function setIfEmpty(name, value) {
        if (!form || !form[name] || value == null) return;
        var normalized = normalizeValue(value);
        if (!normalized) return;
        if (!normalizeValue(form[name])) {
          form[name].value = normalized;
        }
      }

      function valueOf(name) {
        if (!form || !form[name]) return '';
        return normalizeValue(form[name]).trim();
      }

      var resCd = valueOf('res_cd');
      var resMsg = valueOf('res_msg');

      if (!resCd) {
        var raw = FormOrJson;
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw);
          } catch (e) {}
        }
        if (raw && typeof raw === 'object') {
          setIfEmpty('res_cd', raw.res_cd || raw.resCode || raw.code);
          setIfEmpty('res_msg', raw.res_msg || raw.resMsg || raw.message);
          setIfEmpty('tran_cd', raw.tran_cd || raw.tr_cd || raw.tx_cd || raw.tranCd);
          setIfEmpty('tno', raw.tno);
          setIfEmpty('app_no', raw.app_no);
          setIfEmpty('app_time', raw.app_time);
          setIfEmpty('use_pay_method', raw.use_pay_method);
          setIfEmpty('card_name', raw.card_name);
          setIfEmpty('bank_name', raw.bank_name);
          setIfEmpty('bankname', raw.bankname);
          setIfEmpty('account', raw.account);
          setIfEmpty('va_date', raw.va_date);
          setIfEmpty('ret_pay_method', raw.ret_pay_method);
          setIfEmpty('enc_info', raw.enc_info || raw.encInfo || raw.ENC_INFO);
          setIfEmpty('enc_data', raw.enc_data || raw.encData || raw.ENC_DATA);
        }
        resCd = valueOf('res_cd');
        resMsg = valueOf('res_msg');
      }

      if (resCd === '0000') {
        // 일부 브라우저/환경에서 tran_cd가 비어 들어오는 케이스를 방어
        if (!valueOf('tran_cd') && form.tran_cd) {
          form.tran_cd.value = '00100000';
        }
        form.action = '${this.escape(callbackUrl)}';
        form.method = 'post';
        form.submit();
      } else {
        alert('[' + (resCd || 'NO_CODE') + '] ' + (resMsg || '결제 결과를 수신하지 못했습니다.'));
        if (typeof closeEvent === 'function') closeEvent();
      }
    }

    function openKcp() {
      try {
        KCP_Pay_Execute(document.getElementById('kcp_form'));
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.top = '0';
      } catch (e) {
        alert('결제창을 여는 중 오류가 발생했습니다. 브라우저 팝업 차단을 해제한 뒤 다시 시도해 주세요.');
      }
    }

    /** payplus_web.jsp 로드 후 자동으로 결제창 오픈 (그누보드 orderform.1.php와 동일 흐름) */
    function autoOpenKcpWhenReady() {
      var tries = 0;
      var maxTries = 100;
      function tick() {
        tries += 1;
        if (typeof KCP_Pay_Execute === 'function') {
          openKcp();
          return;
        }
        if (tries < maxTries) {
          setTimeout(tick, 50);
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          setTimeout(tick, 0);
        });
      } else {
        setTimeout(tick, 0);
      }
    }
  </script>
  <script src="${this.escape(jsUrl)}"></script>
</head>
<body>
  <form id="kcp_form" name="kcp_form" method="post">
    ${inputs}
  </form>
  <script>
    autoOpenKcpWhenReady();
  </script>
</body>
</html>`;
  }

  buildCallbackHtml({ token, success, message }) {
    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KCP 결제 결과</title>
</head>
<body data-kcp-token="${this.escape(token || '')}" data-kcp-success="${success ? 'true' : 'false'}">
  <div style="padding:20px;font-family:sans-serif;">
    <h3>${success ? '결제가 완료되었습니다.' : '결제가 완료되지 않았습니다.'}</h3>
    <p>${this.escape(message || '')}</p>
  </div>
  <script>
    (function() {
      var payload = {
        source: 'kcp-pay-callback',
        token: '${this.escape(token || '')}',
        success: ${success ? 'true' : 'false'},
        message: '${this.escape(message || '')}'
      };
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, '*');
        }
      } catch (e) {}
      setTimeout(function() {
        try { window.close(); } catch (e) {}
      }, 700);
    })();
  </script>
</body>
</html>`;
  }

  escape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = new KcpPayService();
