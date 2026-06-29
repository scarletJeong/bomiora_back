const socialAuthService = require('../services/SocialAuthService');

class SocialAuthController {
  async login(req, res) {
    try {
      const result = await socialAuthService.login(req);
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error('❌ [SocialAuthController.login] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '소셜 로그인 처리 중 오류가 발생했습니다.',
      });
    }
  }

  async loginKakao(req, res) {
    try {
      const result = await socialAuthService.login(req, 'kakao');
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error('❌ [SocialAuthController.loginKakao] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '카카오 로그인 처리 중 오류가 발생했습니다.',
      });
    }
  }

  async loginNaver(req, res) {
    try {
      const result = await socialAuthService.login(req, 'naver');
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error('❌ [SocialAuthController.loginNaver] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '네이버 로그인 처리 중 오류가 발생했습니다.',
      });
    }
  }

  async register(req, res) {
    try {
      const result = await socialAuthService.register(req);
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error('❌ [SocialAuthController.register] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '소셜 회원가입 처리 중 오류가 발생했습니다.',
      });
    }
  }
}

module.exports = new SocialAuthController();
