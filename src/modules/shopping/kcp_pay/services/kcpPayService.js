class KcpPayService {
  getConfig() {
    const siteCd = (process.env.KCP_PAY_SITE_CD || process.env.KCP_SITE_CD || '').trim();
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

    if (!siteCd) {
      throw new Error('KCP_PAY_SITE_CD 환경변수가 필요합니다.');
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

  mapMethod(method) {
    switch (String(method || '').toLowerCase()) {
      case 'bank':
        return { payMethod: '010000000000', settleCase: '계좌이체' };
      case 'vbank':
        return { payMethod: '001000000000', settleCase: '가상계좌' };
      default:
        return { payMethod: '100000000000', settleCase: '신용카드' };
    }
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
    basketCount,
  }) {
    const fields = {
      req_tx: 'pay',
      site_cd: siteCd,
      def_site_cd: siteCd,
      site_name: siteName,
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
      rcvr_zipx: receiver.zip || '',
      rcvr_add1: receiver.addr1 || '',
      rcvr_add2: receiver.addr2 || '',
      currency: 'WON',
      module_type: '01',
      res_cd: '',
      res_msg: '',
      tno: '',
      trace_no: '',
      enc_info: '',
      enc_data: '',
      ret_pay_method: '',
      tran_cd: '',
      use_pay_method: '',
      app_time: '',
      app_no: '',
      card_name: '',
      bank_name: '',
      bankname: '',
      account: '',
      va_date: '',
      cash_yn: '',
      cash_tr_code: '',
      cash_id_info: '',
      escw_used: 'Y',
      pay_mod: escrowUse ? 'O' : 'N',
      deli_term: '03',
      bask_cntx: String(basketCount),
      good_info: '',
      kcp_token: token,
    };

    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${this.escape(key)}" value="${this.escape(value)}" />`)
      .join('\n');

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KCP 결제</title>
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
<body style="font-family: sans-serif; padding: 24px;">
  <h3 style="margin-top: 0;">결제창을 여는 중입니다…</h3>
  <p style="margin:8px 0 16px;color:#666;font-size:13px;">
    잠시 후 KCP 결제창이 열립니다. 열리지 않으면 아래 버튼을 눌러 주세요.<br />
  </p>
  <form id="kcp_form" name="kcp_form" method="post">
    ${inputs}
  </form>
  <button type="button" onclick="openKcp()" style="height:44px; padding:0 16px;">결제창 열기</button>
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
