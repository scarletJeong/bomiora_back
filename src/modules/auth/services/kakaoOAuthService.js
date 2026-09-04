const kakaoOAuthStore = require('./kakaoOAuthStore');

class KakaoOAuthService {
  getConfig(req) {
    const clientId = String(process.env.KAKAO_REST_API_KEY || '').trim();
    const clientSecret = String(process.env.KAKAO_CLIENT_SECRET || '').trim();
    const callbackUrl = String(process.env.KAKAO_CALLBACK_URL || '').trim()
      || `${req.protocol}://${req.get('host')}/api/auth/kakao/callback`;

    if (!clientId) {
      throw new Error('KAKAO_REST_API_KEY 설정이 필요합니다.');
    }

    return { clientId, clientSecret, callbackUrl };
  }

  getAllowedReturnOrigins() {
    const raw = String(process.env.CORS_ORIGINS || '').trim();
    const defaults = [
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5000',
      'https://bomiora.kr',
      'https://bomiora.net',
      'https://www.bomiora.kr',
    ];
    const fromEnv = raw
      ? raw.split(',').map((v) => v.trim()).filter(Boolean)
      : [];
    return new Set([...defaults, ...fromEnv]);
  }

  sanitizeReturnTo(rawReturnTo, req) {
    const fallback = `${req.protocol}://${req.get('host')}/login`;
    const value = String(rawReturnTo || '').trim();
    if (!value) {
      return fallback;
    }

    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return fallback;
      }
      const allowed = this.getAllowedReturnOrigins();
      if (!allowed.has(parsed.origin)) {
        return fallback;
      }
      return parsed.toString();
    } catch (_) {
      return fallback;
    }
  }

  appendQueryParam(url, key, value) {
    const parsed = new URL(url);
    parsed.searchParams.set(key, String(value ?? ''));
    return parsed.toString();
  }

  buildAuthorizeUrl({ clientId, callbackUrl, state }) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      state,
      scope: 'profile_nickname,profile_image,account_email',
    });
    return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode({ code, clientId, clientSecret, callbackUrl }) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      code: String(code || ''),
    });
    if (clientSecret) {
      params.set('client_secret', clientSecret);
    }

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: params.toString(),
    });
    const data = await response.json();

    if (!response.ok || data.error || !data.access_token) {
      const message = data.error_description || data.error || '카카오 토큰 발급에 실패했습니다.';
      throw new Error(message);
    }

    return data;
  }

  async fetchProfile(accessToken) {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });
    const data = await response.json();

    if (!response.ok || data.id == null) {
      const message = data.msg || data.message || '카카오 사용자 정보를 가져오지 못했습니다.';
      throw new Error(message);
    }

    return data;
  }

  mapProfileToClient(profile, accessToken) {
    const account = profile.kakao_account || {};
    const kakaoProfile = account.profile || {};

    return {
      kakaoId: String(profile.id),
      email: this.nullIfEmpty(account.email),
      nickname: this.nullIfEmpty(kakaoProfile.nickname),
      profileImageUrl: this.nullIfEmpty(
        kakaoProfile.profile_image_url || kakaoProfile.thumbnail_image_url
      ),
      accessToken: accessToken || null,
    };
  }

  nullIfEmpty(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  buildRedirectHtml({ title, message, redirectUrl }) {
    const safeTitle = this.escapeHtml(title);
    const safeMessage = this.escapeHtml(message);

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f9f9f9; }
    .box { text-align: center; padding: 32px; max-width: 420px; }
    .spinner { width: 36px; height: 36px; border: 3px solid #eee;
               border-top-color: #FEE500; border-radius: 50%;
               animation: kakaoSpin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes kakaoSpin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2 style="margin:0 0 12px;color:#222;font-size:1.1rem;">${safeTitle}</h2>
    <p style="margin:0;color:#555;font-size:0.95rem;">${safeMessage}</p>
  </div>
  <script>
    (function () {
      var url = ${JSON.stringify(redirectUrl)};
      setTimeout(function () {
        try { window.location.replace(url); } catch (e) { window.location.href = url; }
      }, 300);
    })();
  </script>
</body>
</html>`;
  }

  createAuthorizeRedirect(req) {
    const config = this.getConfig(req);
    const returnTo = this.sanitizeReturnTo(req.query.returnTo, req);
    const pending = kakaoOAuthStore.createPending({ returnTo });
    const authUrl = this.buildAuthorizeUrl({
      clientId: config.clientId,
      callbackUrl: config.callbackUrl,
      state: pending.token,
    });
    return { authUrl, token: pending.token, returnTo };
  }

  async handleCallback(req) {
    const config = this.getConfig(req);
    const state = String(req.query.state || '').trim();
    const code = String(req.query.code || '').trim();
    const oauthError = String(req.query.error || '').trim();
    const oauthErrorDescription = String(req.query.error_description || '').trim();

    const session = kakaoOAuthStore.getSession(state);
    if (!session) {
      throw new Error('만료되었거나 유효하지 않은 카카오 로그인 요청입니다.');
    }

    const returnTo = session.returnTo || this.sanitizeReturnTo('', req);

    if (oauthError) {
      const message = oauthErrorDescription || oauthError || '카카오 로그인이 취소되었습니다.';
      kakaoOAuthStore.saveResult(state, {
        status: 'failed',
        error: message,
      });
      return {
        redirectUrl: this.appendQueryParam(returnTo, 'kakao_auth_error', message),
        html: this.buildRedirectHtml({
          title: '카카오 로그인',
          message: '로그인 화면으로 이동합니다…',
          redirectUrl: this.appendQueryParam(returnTo, 'kakao_auth_error', message),
        }),
      };
    }

    if (!code) {
      throw new Error('카카오 인증 코드가 없습니다.');
    }

    const tokenData = await this.exchangeCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      callbackUrl: config.callbackUrl,
    });

    const profile = await this.fetchProfile(tokenData.access_token);
    const mapped = this.mapProfileToClient(profile, tokenData.access_token);

    kakaoOAuthStore.saveResult(state, {
      status: 'completed',
      profile: mapped,
      accessToken: tokenData.access_token,
    });

    const redirectUrl = this.appendQueryParam(returnTo, 'kakao_auth_token', state);
    return {
      redirectUrl,
      html: this.buildRedirectHtml({
        title: '카카오 로그인 완료',
        message: '앱으로 돌아갑니다…',
        redirectUrl,
      }),
    };
  }

  getResultForClient(token) {
    const entry = kakaoOAuthStore.consumeResult(token);
    if (!entry) {
      return {
        status: 404,
        body: {
          success: false,
          message: '만료되었거나 이미 사용된 카카오 로그인 요청입니다.',
        },
      };
    }

    if (entry.status === 'failed') {
      return {
        status: 400,
        body: {
          success: false,
          message: entry.error || '카카오 로그인에 실패했습니다.',
        },
      };
    }

    if (entry.status !== 'completed' || !entry.profile) {
      return {
        status: 400,
        body: {
          success: false,
          message: '카카오 로그인 결과가 아직 준비되지 않았습니다.',
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: entry.profile,
      },
    };
  }
}

module.exports = new KakaoOAuthService();
