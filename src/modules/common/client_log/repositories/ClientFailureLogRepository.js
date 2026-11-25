const pool = require('../../../../config/database');

const TABLE = 'bomiora_client_failure_log';

const ACTION_LABEL = {
  'payment.checkout.load': '결제 화면 불러오기',
  'payment.request': '결제 요청',
  'payment.window': '결제 창',
  'payment.result': '결제 결과 확인',
  'payment.shipping': '배송비 계산',
  'payment.address': '결제 배송지 불러오기',
  'payment.coupon': '결제 쿠폰 조회',
  'payment.coupon.cache': '결제 쿠폰 캐시',
  'payment.complete.load': '결제완료 화면 불러오기',
  'payment.complete.error': '결제완료 처리',
  'payment.complete.memo': '결제완료 배송요청사항 변경',
  'payment.complete.address': '결제완료 배송지 변경',
  'payment.complete.reservation': '결제완료 예약 시간 변경',
  'payment.complete.cancel': '결제완료 주문 취소',
  'order.list': '주문내역 불러오기',
  'order.detail': '주문상세 불러오기',
  'order.products': '주문 상품 불러오기',
  'order.receipt': '수령 확인',
  'order.cancel': '주문 취소',
  'order.cancel.detail': '취소 전 주문 정보 불러오기',
  'order.cancel_price': '취소 금액 확인',
  'order.memo': '배송요청사항 변경',
  'order.address': '주문 배송지 변경',
  'order.tracking': '배송조회',
  'order.reservation': '예약 시간 변경',
  'order.reservation.settings': '예약 가능 시간 불러오기',
  'order.reservation.detail': '예약 변경용 주문 불러오기',
  'order.review': '주문 리뷰 여부 확인',
  'order.reorder': '다시 담기',
  'order.reorder.rollback': '다시 담기 되돌리기',
  'order.refund_account.save': '취소 중 환불계좌 저장',
  'refund.fetch': '환불계좌 조회',
  'refund.save': '환불계좌 저장',
  'cart.list': '장바구니 불러오기',
  'prescription.prepare': '처방 예약 준비',
  'prescription.profile': '처방 예약 중 문진표 저장',
  'prescription.reserve': '처방 예약 저장',
  'coupon.list': '쿠폰 목록 불러오기',
  'coupon.register': '쿠폰 등록',
  'point.balance': '포인트 잔액 조회',
  'point.history': '포인트 내역 조회',
  'menu.cart.history': '처방 구매 이력 조회',
  'auth.login': '로그인',
  'auth.socialLogin': '소셜 로그인',
  'auth.signup': '회원가입',
  'auth.socialRegister': '소셜 회원 등록',
  'auth.checkEmail': '이메일 중복 확인',
  'auth.otpSend': '인증번호 발송',
  'auth.otpVerify': '인증번호 확인',
  'auth.kcpPrepare': '본인인증 준비',
  'auth.findId': '아이디 찾기',
  'auth.forgotPassword': '비밀번호 찾기',
  'auth.resetPassword': '비밀번호 재설정',
  'profile.save': '프로필 저장',
  'address.list': '배송지 목록 불러오기',
  'address.search': '주소 검색',
  'address.save': '배송지 저장',
  'address.delete': '배송지 삭제',
  'product.list': '상품 목록 불러오기',
  'product.list.more': '상품 목록 더보기',
  'product.detail': '상품상세 불러오기',
  'product.option': '상품 옵션 불러오기',
  'product.supply': '추가상품 불러오기',
  'product.category': '상품 카테고리 불러오기',
  'product.recommend': '추천상품 불러오기',
  'product.review.list': '상품 리뷰 목록 불러오기',
  'product.review.more': '상품 리뷰 더보기',
  'review.create': '리뷰 등록',
  'review.update': '리뷰 수정',
  'review.delete': '리뷰 삭제',
  'review.my.list': '내 리뷰 목록 불러오기',
  'review.helpCoupon': '리뷰 도움 쿠폰',
  'review.best.list': '베스트 리뷰 목록 불러오기',
  'review.best.more': '베스트 리뷰 더보기',
  'home.new_products': '홈 신상품 불러오기',
  'home.md_pick': '홈 MD픽 불러오기',
  'home.category': '홈 카테고리 불러오기',
  'home.category.products': '홈 카테고리 상품 불러오기',
  'home.banner': '홈 배너 불러오기',
  'home.content': '가이드북 불러오기',
  'home.review': '홈 리뷰 불러오기',
  'home.event': '홈 이벤트 불러오기',
  'home.announcement': '홈 공지 불러오기',
  'search.list': '검색',
  'search.more': '검색 더보기',
  'announcement.list': '공지 목록 불러오기',
  'announcement.detail': '공지 상세 불러오기',
  'event.list': '이벤트 목록 불러오기',
  'event.list.more': '이벤트 더보기',
  'event.detail': '이벤트 상세 불러오기',
  'wish.list': '찜 목록 불러오기',
  'wish.remove': '찜 해제',
  'recent.list': '최근 본 상품 불러오기',
  'menu.admin': '관리자 메뉴 확인',
  'notification.list': '알림 목록 불러오기',
  'notification.read': '알림 읽음 처리',
  'notification.delete': '알림 삭제',
  'notification.settings.load': '알림 설정 불러오기',
  'notification.settings.save': '알림 설정 저장',
  'qa.list': '문의 목록 불러오기',
  'qa.detail': '문의 상세 불러오기',
  'qa.replies': '문의 답변 불러오기',
  'qa.create': '문의 등록',
  'qa.delete': '문의 삭제',
  'qa.select': '문의 상품 선택',
  'health.food.list': '식단 목록 불러오기',
  'health.menstrual.list': '생리 목록 불러오기',
  'health.weight.list': '체중 목록 불러오기',
  'health.steps.list': '걸음 목록 불러오기',
  'health.blood_pressure.list': '혈압 목록 불러오기',
  'health.blood_sugar.list': '혈당 목록 불러오기',
  'health.heart_rate.list': '심박수 목록 불러오기',
  'health.goal.load': '건강 목표 불러오기',
  'health_goal.save': '건강 목표 저장',
  'health_profile.list': '문진표 목록 불러오기',
  'health_profile.form': '문진표 작성',
  'health_profile.save': '문진표 저장',
  'health_profile.date': '문진표 날짜 처리',
};

function actionLabel(code) {
  const key = String(code || '').trim();
  return ACTION_LABEL[key] || key;
}

function pageLabel(page) {
  const path = String(page || '').split('?')[0];
  if (!path || path === '/' || path === '/home' || path === '/enter-home') return '홈';
  if (path === '/login') return '로그인';
  if (path.startsWith('/find-account')) return '아이디 찾기';
  if (path === '/find-password-reset') return '비밀번호 재설정';
  if (path === '/signup' || path.startsWith('/social-signup')) return '회원가입';
  if (path === '/signup-done') return '가입 완료';
  if (path === '/kcp-cert') return '본인인증';
  if (path === '/kcp-pay' || path === '/pay') return '결제';
  if (path === '/payment-complete') return '결제완료';
  if (path === '/cart') return '처방 장바구니';
  if (path === '/generalCart') return '일반 장바구니';
  if (path.startsWith('/order-detail')) return '주문상세';
  if (path === '/order') return '주문내역';
  if (path === '/my_page') return '마이페이지';
  if (path === '/profile') return '문진표';
  if (path === '/health') return '건강';
  if (path === '/favorite') return '찜';
  if (path === '/coupon') return '쿠폰';
  if (path === '/point') return '포인트';
  if (path === '/my_reviews') return '내 리뷰';
  if (path.startsWith('/qa')) return '1:1 문의';
  if (path.startsWith('/address')) return '배송지';
  if (path.startsWith('/announcement')) return '공지';
  if (path.startsWith('/event')) return '이벤트';
  if (path.startsWith('/content')) return '가이드북';
  if (path.startsWith('/search')) return '검색';
  if (path.startsWith('/product')) return '상품';
  if (path === '/bomiora-introduce') return '보미오라 소개';
  if (path.startsWith('/withdraw') || path.startsWith('/cancel-member')) return '회원탈퇴';
  return path;
}

function toMysqlDateTime(value) {
  const text = String(value || '').trim();
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (!matched) return null;
  return `${matched[1]} ${matched[2]}`;
}

class ClientFailureLogRepository {
  constructor() {
    this.ensured = false;
  }

  async ensureTable() {
    if (this.ensured) return;
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
         id BIGINT NOT NULL AUTO_INCREMENT,
         mb_id VARCHAR(50) NOT NULL DEFAULT '',
         phone VARCHAR(30) NOT NULL DEFAULT '',
         occurred_at DATETIME NOT NULL,
         page VARCHAR(255) NOT NULL DEFAULT '',
         page_label VARCHAR(80) NOT NULL DEFAULT '',
         action_code VARCHAR(120) NOT NULL DEFAULT '',
         action_label VARCHAR(120) NOT NULL DEFAULT '',
         reason MEDIUMTEXT NOT NULL,
         detail MEDIUMTEXT NULL,
         device TEXT NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_mb_id (mb_id),
         KEY idx_occurred_at (occurred_at),
         KEY idx_action_code (action_code)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    this.ensured = true;
  }

  async insert(entry) {
    await this.ensureTable();
    const occurredAt = toMysqlDateTime(entry.occurredAt);
    const code = String(entry.code || '').trim();
    const page = String(entry.page || '');
    let detailText = null;
    if (entry.detail != null) {
      detailText = typeof entry.detail === 'string'
        ? entry.detail
        : JSON.stringify(entry.detail);
    }
    await pool.query(
      `INSERT INTO ${TABLE}
         (mb_id, phone, occurred_at, page, page_label, action_code, action_label, reason, detail, device)
       VALUES (?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(entry.mbId || ''),
        String(entry.phone || ''),
        occurredAt,
        page,
        pageLabel(page),
        code,
        actionLabel(code),
        entry.reason == null ? '' : String(entry.reason),
        detailText,
        entry.device == null ? null : String(entry.device),
      ]
    );
  }
}

module.exports = new ClientFailureLogRepository();
