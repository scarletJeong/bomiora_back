const naverOAuthService = require('../services/naverOAuthService');

class NaverOAuthController {
  authorize(req, res) {
    try {
      const { authUrl } = naverOAuthService.createAuthorizeRedirect(req);
      return res.redirect(authUrl);
    } catch (error) {
      console.error('❌ [NaverOAuthController.authorize] 오류:', error);
      return res.status(500).json({
        success: false,
        message: error.message || '네이버 로그인 시작 중 오류가 발생했습니다.',
      });
    }
  }

  async callback(req, res) {
    try {
      const result = await naverOAuthService.handleCallback(req);
      return res.status(200).type('html').send(result.html);
    } catch (error) {
      console.error('❌ [NaverOAuthController.callback] 오류:', error);
      const returnTo = naverOAuthService.sanitizeReturnTo(req.query.returnTo, req);
      const message = error.message || '네이버 로그인 처리 중 오류가 발생했습니다.';
      const redirectUrl = naverOAuthService.appendQueryParam(returnTo, 'naver_auth_error', message);
      return res
        .status(200)
        .type('html')
        .send(
          naverOAuthService.buildRedirectHtml({
            title: '네이버 로그인 오류',
            message: '로그인 화면으로 이동합니다…',
            redirectUrl,
          })
        );
    }
  }

  result(req, res) {
    try {
      const token = String(req.params.token || '').trim();
      const outcome = naverOAuthService.getResultForClient(token);
      return res.status(outcome.status).json(outcome.body);
    } catch (error) {
      console.error('❌ [NaverOAuthController.result] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '네이버 로그인 결과 조회 중 오류가 발생했습니다.',
      });
    }
  }
}

module.exports = new NaverOAuthController();
