const addressSearchService = require('../services/AddressSearchService');

class AddressSearchController {
  constructor() {
    this.postcodeBridgeStore = new Map();
  }

  async search(req, res) {
    try {
      const query = req.query.q;
      const page = req.query.page;
      const size = req.query.size;
      const clientKey = this.resolveClientKey(req);

      const data = await addressSearchService.search({
        query,
        page,
        size,
        clientKey,
      });

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status >= 500) {
        console.error('❌ [ADDRESS SEARCH] 오류:', error.message);
      }

      return res.status(status).json({
        success: false,
        message: status >= 500
          ? '주소 검색 중 오류가 발생했습니다.'
          : error.message,
      });
    }
  }

  async resolve(req, res) {
    try {
      const data = await addressSearchService.resolve(req.body || {});
      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status >= 500) {
        console.error('❌ [ADDRESS RESOLVE] 오류:', error.message);
      }

      return res.status(status).json({
        success: false,
        message: status >= 500
          ? '주소 정규화 중 오류가 발생했습니다.'
          : error.message,
      });
    }
  }

  renderPostcodeBridge(req, res) {
    const token = this.normalizeBridgeToken(req.query?.token);
    const resultPath = `${req.baseUrl}/postcode-bridge/result`;
    // Flutter Web의 iframe/webview에서 브리지 페이지를 열 수 있도록 프레임 관련 헤더를 완화한다.
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' https: http: data: blob: 'unsafe-inline' 'unsafe-eval'; script-src 'self' https://t1.daumcdn.net https://*.daumcdn.net https://*.daum.net 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https: http:; img-src 'self' data: blob: https: http:; connect-src 'self' https: http:; frame-src 'self' https://postcode.map.kakao.com http://postcode.map.kakao.com https://*.daum.net http://*.daum.net https://*.kakao.com http://*.kakao.com; child-src 'self' https://postcode.map.kakao.com http://postcode.map.kakao.com https://*.daum.net http://*.daum.net; frame-ancestors *;"
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>주소 검색</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; }
    #postcode-root { width: 100%; height: 100%; }
  </style>
  <script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
</head>
<body>
  <div id="postcode-root"></div>
  <script>
    (function() {
      function moveResult(params) {
        var qs = new URLSearchParams(params);
        location.replace('${resultPath}?' + qs.toString());
      }

      function buildExtraAddress(data) {
        var extra = '';
        if (data.userSelectedType === 'R') {
          if (data.bname && /[동|로|가]$/.test(data.bname)) {
            extra += data.bname;
          }
          if (data.buildingName && data.apartment === 'Y') {
            extra += (extra !== '' ? ', ' + data.buildingName : data.buildingName);
          }
        }
        return extra;
      }

      new daum.Postcode({
        oncomplete: function(data) {
          moveResult({
            token: '${token}',
            postalCode: data.zonecode || '',
            roadAddress: data.roadAddress || '',
            jibunAddress: data.jibunAddress || '',
            extraAddress: buildExtraAddress(data)
          });
        },
        onclose: function(state) {
          if (state === 'FORCE_CLOSE') {
            moveResult({ token: '${token}', closed: '1' });
          }
        }
      }).embed(document.getElementById('postcode-root'));
    })();
  </script>
</body>
</html>`);
  }

  renderPostcodeBridgeResult(req, res) {
    const token = this.normalizeBridgeToken(req.query?.token);
    const payload = {
      token,
      postalCode: String(req.query?.postalCode || ''),
      roadAddress: String(req.query?.roadAddress || ''),
      jibunAddress: String(req.query?.jibunAddress || ''),
      extraAddress: String(req.query?.extraAddress || ''),
      closed: String(req.query?.closed || ''),
    };
    this.saveBridgeResult(token, payload);
    const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline'; frame-ancestors *;"
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>주소 선택 완료</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .text { color: #444; font-size: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="text">주소 선택이 완료되었습니다.<br/>잠시만 기다려주세요.</div>
  <script>
    (function() {
      var payload = ${serialized};
      try {
        console.log('POSTCODE_RESULT:' + JSON.stringify(payload));
      } catch (e) {}
    })();
  </script>
</body>
</html>`);
  }

  pollPostcodeBridge(req, res) {
    const token = this.normalizeBridgeToken(req.query?.token);
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'token이 필요합니다.',
      });
    }

    this.cleanupBridgeStore();
    const entry = this.postcodeBridgeStore.get(token);
    if (!entry) {
      return res.json({
        success: true,
        status: 'pending',
      });
    }

    this.postcodeBridgeStore.delete(token);
    return res.json({
      success: true,
      status: 'completed',
      ...entry.payload,
    });
  }

  normalizeBridgeToken(raw) {
    return String(raw || '').trim().slice(0, 64);
  }

  saveBridgeResult(token, payload) {
    if (!token) {
      return;
    }
    this.cleanupBridgeStore();
    this.postcodeBridgeStore.set(token, {
      payload,
      createdAt: Date.now(),
    });
  }

  cleanupBridgeStore() {
    const now = Date.now();
    const ttlMs = 5 * 60 * 1000;
    for (const [key, value] of this.postcodeBridgeStore.entries()) {
      if (now - Number(value.createdAt || 0) > ttlMs) {
        this.postcodeBridgeStore.delete(key);
      }
    }
  }

  resolveClientKey(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedRaw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
    const ip = forwardedRaw.split(',')[0].trim() || req.ip || req.connection?.remoteAddress || 'unknown';
    return String(ip).replace('::ffff:', '').trim() || 'unknown';
  }
}

module.exports = new AddressSearchController();
