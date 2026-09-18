const appleIdentityService = require('../services/appleIdentityService');

class AppleOAuthController {
  collectParams(req) {
    const merged = { ...(req.query || {}), ...(req.body || {}) };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value == null || value === '') return;
      if (typeof value === 'object') {
        params.set(key, JSON.stringify(value));
        return;
      }
      params.set(key, String(value));
    });
    return params;
  }

  androidIntentUrl(params) {
    const pkg = String(process.env.APPLE_ANDROID_PACKAGE || 'com.bomiora.app').trim();
    return `intent://callback?${params.toString()}#Intent;package=${pkg};scheme=signinwithapple;end`;
  }

  callbackPage({ intentUrl, queryString }) {
    const safeIntent = String(intentUrl || '').replace(/</g, '');
    const safeQuery = String(queryString || '').replace(/</g, '');
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apple 로그인</title>
</head>
<body>
  <p>Apple 로그인 결과를 앱으로 전달합니다…</p>
  <script>
    (function () {
      var intentUrl = ${JSON.stringify(safeIntent)};
      var query = ${JSON.stringify(safeQuery)};
      try {
        window.location.replace(intentUrl);
      } catch (e) {}
      setTimeout(function () {
        if (window.opener) {
          window.opener.postMessage({ type: 'apple-signin', query: query }, '*');
        }
      }, 300);
    })();
  </script>
</body>
</html>`;
  }

  callback(req, res) {
    try {
      const params = this.collectParams(req);
      const intentUrl = this.androidIntentUrl(params);
      const ua = String(req.headers['user-agent'] || '');
      if (/android/i.test(ua)) {
        return res.redirect(307, intentUrl);
      }
      return res
        .status(200)
        .type('html')
        .send(this.callbackPage({
          intentUrl,
          queryString: params.toString(),
        }));
    } catch (error) {
      console.error('❌ [AppleOAuthController.callback] 오류:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Apple 로그인 콜백 처리 중 오류가 발생했습니다.',
      });
    }
  }

  async verify(req, res) {
    try {
      const result = await appleIdentityService.verifyFromRequest(req);
      if (!result.ok) {
        return res.status(401).json({
          success: false,
          message: result.message,
        });
      }
      return res.json({
        success: true,
        appleId: result.sub,
        email: result.email || '',
      });
    } catch (error) {
      console.error('❌ [AppleOAuthController.verify] 오류:', error);
      return res.status(500).json({
        success: false,
        message: 'Apple 토큰 검증 중 오류가 발생했습니다.',
      });
    }
  }
}

module.exports = new AppleOAuthController();
