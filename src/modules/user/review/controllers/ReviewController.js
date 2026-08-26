const fs = require('fs');
const path = require('path');
const { SUBDIRS, mirrorUploadedFile } = require('../../../../utils/cafe24ImageMirror');
const reviewRepository = require('../repositories/ReviewRepository');
const mainReviewRepository = require('../repositories/MainReviewRepository');
const { TtlCache } = require('../../../../utils/ttlCache');

const REVIEW_UPLOAD_DIR =
  process.env.REVIEW_IMAGE_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'review_images');
const MAX_REVIEW_IMAGES = 3;

/** 리뷰 목록 한 번에 가져올 수 있는 최대 건수 (상품상세 all=1 폭주 방지) */
const MAX_REVIEW_PAGE_SIZE = 200;
const mainReviewHomeCache = new TtlCache(90_000);
const mainReviewBestCache = new TtlCache(60_000);
const memberReviewListCache = new TtlCache(60_000);
const productReviewListCache = new TtlCache(45_000);

class ReviewController {
  /** 0.1 단위 만족도 (DB DECIMAL(3,1) 권장; TINYINT면 소수 잘림) */
  _normalizeTenthScore(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 10) / 10;
  }

  /** DB total_is_score — null/빈값만 미설정. 0도 유효 값으로 취급 */
  _parseStoredTotal(rowOrValue) {
    const totalRaw =
      rowOrValue != null && typeof rowOrValue === 'object'
        ? rowOrValue.total_is_score
        : rowOrValue;
    if (totalRaw === undefined || totalRaw === null || String(totalRaw).trim() === '') {
      return null;
    }
    const n = Number(totalRaw);
    return Number.isFinite(n) ? n : null;
  }

  _avgFourScores(s1, s2, s3, s4) {
    const a = Number(s1 || 0);
    const b = Number(s2 || 0);
    const c = Number(s3 || 0);
    const d = Number(s4 || 0);
    return Math.round(((a + b + c + d) / 4) * 10) / 10;
  }

  _avgFourFromRow(row) {
    return this._avgFourScores(row.is_score1, row.is_score2, row.is_score3, row.is_score4);
  }

  /**
   * total_is_score 가 null 일 때만 4항 평균으로 채움.
   * is_score1~4 는 절대 수정하지 않음.
   */
  async _backfillTotalIfNull(isId, row) {
    if (!row || this._parseStoredTotal(row) != null) return row;
    const total = this._avgFourFromRow(row);
    return reviewRepository.updateById(isId, { total_is_score: total });
  }

  getUploadDir() {
    return REVIEW_UPLOAD_DIR;
  }

  /** POST /api/user/reviews/upload-image */
  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '이미지 업로드 실패: 파일이 없습니다.'
        });
      }

      const localUrl = `/api/user/reviews/images/${req.file.filename}`;
      const fileUrl = await mirrorUploadedFile({
        subdir: SUBDIRS.review,
        filePath: req.file.path,
        filename: req.file.filename,
        mime: req.file.mimetype || 'application/octet-stream',
        localUrl,
      });
      return res.json({
        success: true,
        filename: req.file.filename,
        url: fileUrl,
        message: '이미지 업로드 성공'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `이미지 업로드 실패: ${error.message}`
      });
    }
  }

  /** GET /api/user/reviews/images/:filename */
  async getImage(req, res) {
    try {
      const filePath = path.join(REVIEW_UPLOAD_DIR, req.params.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).end();
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
      };

      res.setHeader('Content-Type', contentTypeMap[ext] || 'image/jpeg');
      return res.sendFile(filePath);
    } catch (error) {
      return res.status(404).end();
    }
  }

  _normalizeReviewImages(images) {
    if (!Array.isArray(images)) return [];
    return images
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
      .slice(0, MAX_REVIEW_IMAGES);
  }

  /**
   * mysql2 가 BINARY/VARBINARY/BLOB 등을 Buffer 로 반환할 때 JSON 에는 { type, data } 로 나가
   * 앱에서 한글이 깨지므로 응답 직전 UTF-8 문자열로 통일
   */
  normalizeSqlUtf8(v) {
    if (v === undefined || v === null) return null;
    if (Buffer.isBuffer(v)) {
      const s = v.toString('utf8');
      return s.length ? s : null;
    }
    if (typeof v === 'object' && v && v.type === 'Buffer' && Array.isArray(v.data)) {
      const s = Buffer.from(v.data).toString('utf8');
      return s.length ? s : null;
    }
    return v;
  }

  trimSqlText(v) {
    const n = this.normalizeSqlUtf8(v);
    if (n === null || n === undefined) return '';
    const s = String(n).trim();
    return s;
  }

  /** bomiora_shop_item_new 조인 it_img1~9 중 첫 유효값 → 앱 productImage */
  _firstShopItemImage(row) {
    for (let i = 1; i <= 9; i += 1) {
      const t = this.trimSqlText(row[`it_img${i}`]);
      if (t) return t;
    }
    return null;
  }

  /** 디버그 로그용: 조인으로 넘어온 상품 이미지 컬럼만 (값 있을 때만 키 생성) */
  _shopItemImageFieldsForLog(row) {
    const out = {};
    for (let i = 1; i <= 9; i += 1) {
      const raw = this.normalizeSqlUtf8(row[`it_img${i}`]);
      if (raw == null || raw === '') continue;
      const s = String(raw).trim();
      if (!s) continue;
      out[`it_img${i}`] = s.length > 160 ? `${s.slice(0, 160)}…` : s;
    }
    return out;
  }

  /** it_kind 기준으로 앱에서 카드 타입이 갈리는지 로그용 힌트 */
  _reviewUiHintFromItKind(itKind) {
    const k = String(itKind ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '');
    if (!k) return 'empty_join_or_unknown';
    if (
      k.includes('prescription') ||
      k.includes('nonface') ||
      k === 'rx' ||
      k.includes('telemedicine')
    ) {
      return 'prescription_card';
    }
    if (k === 'general' || k === 'normal' || k === 'goods' || k === 'product') {
      return 'general_card';
    }
    return `other:${k}`;
  }

  toReviewResponse(row) {
    const images = [
      row.is_img1, row.is_img2, row.is_img3, row.is_img4, row.is_img5,
      row.is_img6, row.is_img7, row.is_img8, row.is_img9, row.is_img10
    ].filter((x) => x);

    /** total_is_score 가 null 일 때만 효과~편리함 평균 사용 (is_score1~4 는 응답에 그대로) */
    const totalNum = this._parseStoredTotal(row);
    const avgFour = this._avgFourFromRow(row);
    const averageScore = totalNum != null ? totalNum : avgFour;

    const itKindRaw = this.normalizeSqlUtf8(row.it_kind);
    const itKind =
      itKindRaw != null && String(itKindRaw).trim() !== '' ? String(itKindRaw).trim() : null;
    const productImage = this._firstShopItemImage(row);

    const rvkind = this.trimSqlText(row.is_rvkind) || row.is_rvkind || 'general';
    // is_rvkind=general 은 "비서포터 리뷰"이지 "일반상품 리뷰"가 아님
    const isGeneralProduct = this._reviewUiHintFromItKind(itKind) === 'general_card';

    let positive = this.normalizeSqlUtf8(row.is_positive_review_text);
    let negative = this.normalizeSqlUtf8(row.is_negative_review_text);
    let more = this.normalizeSqlUtf8(row.is_more_review_text);
    positive = positive != null && String(positive).trim() !== '' ? String(positive).trim() : null;
    negative = negative != null && String(negative).trim() !== '' ? String(negative).trim() : null;
    more = more != null && String(more).trim() !== '' ? String(more).trim() : null;

    // 일반 상품 리뷰만 단일 본문 (아쉬운점/꿀팁 미노출)
    if (isGeneralProduct) {
      if (!positive && more) positive = more;
      negative = null;
      more = null;
    }

    return {
      isId: row.is_id,
      itId: this.trimSqlText(row.it_id) || String(row.it_id ?? ''),
      itName: this.normalizeSqlUtf8(row.it_name),
      itKind,
      productImage,
      mbId: this.trimSqlText(row.mb_id) || String(row.mb_id ?? ''),
      isName: this.normalizeSqlUtf8(row.is_name),
      isTime: row.is_time,
      isConfirm: row.is_confirm,
      isScore1: row.is_score1,
      isScore2: row.is_score2,
      isScore3: row.is_score3,
      isScore4: row.is_score4,
      totalIsScore: totalNum != null ? totalNum : averageScore,
      averageScore,
      isRvkind: rvkind,
      isRecommend: row.is_recommend,
      isGood: row.is_good,
      czDownload: row.cz_download,
      isPositiveReviewText: positive,
      isNegativeReviewText: negative,
      isMoreReviewText: more,
      images,
      isBirthday: row.is_birthday,
      isWeight: row.is_weight,
      isHeight: row.is_height,
      isPayMthod: row.is_pay_mthod,
      isOutageNum: row.is_outage_num,
      odId: row.od_id != null ? String(row.od_id) : null
    };
  }

  pagePayload(page, size, total) {
    const safeSize = Math.max(1, size);
    const totalPages = Math.ceil(total / safeSize);
    return {
      currentPage: page,
      totalPages,
      totalElements: total,
      hasNext: page + 1 < totalPages
    };
  }

  _invalidateMemberReviewList(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return;
    const prefix = `member:${id}:`;
    for (const key of memberReviewListCache.store.keys()) {
      if (key.startsWith(prefix)) memberReviewListCache.store.delete(key);
    }
  }

  _invalidateProductReviewList(itId) {
    const id = String(itId || '').trim();
    if (!id) return;
    const prefix = `product:${id}:`;
    for (const key of productReviewListCache.store.keys()) {
      if (key.startsWith(prefix)) productReviewListCache.store.delete(key);
    }
  }

  /**
   * ?all=1 | true | yes → 0페이지부터 최대 MAX_REVIEW_PAGE_SIZE건
   * 그 외 ?size= 숫자 (1 ~ MAX), 기본 20
   */
  _reviewListPagination(req) {
    const allRaw = req.query.all;
    const all =
      allRaw === '1' ||
      allRaw === 'true' ||
      allRaw === 'yes' ||
      String(allRaw || '').toLowerCase() === 'all';
    let page = Number(req.query.page);
    if (!Number.isFinite(page) || page < 0) page = 0;
    if (all) {
      return { page: 0, size: MAX_REVIEW_PAGE_SIZE };
    }
    let size = Number(req.query.size);
    if (!Number.isFinite(size) || size < 1) size = 20;
    size = Math.min(size, MAX_REVIEW_PAGE_SIZE);
    return { page, size };
  }

  async createReview(req, res) {
    try {
      const mbId = req.body.mbId != null ? String(req.body.mbId).trim() : '';
      const itId = req.body.itId != null ? String(req.body.itId).trim() : '';
      const odIdRaw = req.body.odId ?? req.body.od_id;
      const odId =
        odIdRaw != null && String(odIdRaw).trim() !== ''
          ? String(odIdRaw).trim()
          : null;

      if (!mbId) {
        return res.json({ success: false, message: '회원 ID가 필요합니다.' });
      }
      if (!itId) {
        return res.json({ success: false, message: '상품 ID가 필요합니다.' });
      }

      // 주문당 1개가 아니라 (주문+상품) 단위로 중복 체크 — 복수 상품 리뷰 허용
      if (odId) {
        const exists = await reviewRepository.existsByMbIdOdIdItId(
          mbId,
          odId,
          itId
        );
        if (exists) {
          return res.json({
            success: false,
            message: '이미 해당 상품에 대한 리뷰를 작성하셨습니다.',
          });
        }
      }

      const images = this._normalizeReviewImages(req.body.images);
      const imageOrEmpty = (index) => images[index] || '';
      const s1 = this._normalizeTenthScore(req.body.isScore1) ?? 0;
      const s2 = this._normalizeTenthScore(req.body.isScore2) ?? 0;
      const s3 = this._normalizeTenthScore(req.body.isScore3) ?? 0;
      const s4 = this._normalizeTenthScore(req.body.isScore4) ?? 0;
      const isPrescription =
        String(req.body.isRvkind || '').toLowerCase() === 'prescription';
      // 처방: 효과·가성비·향/맛·편리함 평균 → total_is_score (is_score1~4 는 그대로 저장)
      // 일반: 클라이언트의 totalIsScore 사용 (없으면 4항 평균)
      let total;
      if (isPrescription) {
        total = this._avgFourScores(s1, s2, s3, s4);
      } else {
        total = this._normalizeTenthScore(req.body.totalIsScore);
        if (total == null) {
          total = this._avgFourScores(s1, s2, s3, s4);
        }
      }

      // DB is_score1~4 는 INT — 0.1 단위는 반올림해 저장 (기존 데이터와 동일)
      const scoreInt = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return Math.min(5, Math.max(0, Math.round(n)));
      };

      const saved = await reviewRepository.create({
        mb_id: mbId,
        od_id: odId,
        it_id: itId,
        is_name: req.body.isName || mbId,
        is_confirm: 0,
        is_score1: scoreInt(s1),
        is_score2: scoreInt(s2),
        is_score3: scoreInt(s3),
        is_score4: scoreInt(s4),
        total_is_score: total,
        is_rvkind: req.body.isRvkind || 'general',
        is_recommend: req.body.isRecommend || 'y',
        is_good: 0,
        is_positive_review_text:
          req.body.isPositiveReviewText != null &&
          String(req.body.isPositiveReviewText).trim() !== ''
            ? String(req.body.isPositiveReviewText).trim()
            : '',
        // DB NOT NULL — 일반 리뷰는 아쉬운점/꿀팁이 없어도 빈 문자열로 저장
        is_negative_review_text:
          req.body.isNegativeReviewText != null &&
          String(req.body.isNegativeReviewText).trim() !== ''
            ? String(req.body.isNegativeReviewText).trim()
            : '',
        is_more_review_text:
          req.body.isMoreReviewText != null &&
          String(req.body.isMoreReviewText).trim() !== ''
            ? String(req.body.isMoreReviewText).trim()
            : '',
        is_img1: imageOrEmpty(0),
        is_img2: imageOrEmpty(1),
        is_img3: imageOrEmpty(2),
        is_img4: imageOrEmpty(3),
        is_img5: imageOrEmpty(4),
        is_img6: imageOrEmpty(5),
        is_img7: imageOrEmpty(6),
        is_img8: imageOrEmpty(7),
        is_img9: imageOrEmpty(8),
        is_img10: imageOrEmpty(9),
        is_birthday: req.body.isBirthday || null,
        is_weight: req.body.isWeight || null,
        is_height: req.body.isHeight || null,
        is_pay_mthod: req.body.isPayMthod || null,
        is_outage_num: req.body.isOutageNum || null
      });

      // 집계 갱신 실패해도 리뷰 등록 자체는 성공 처리
      try {
        await reviewRepository.syncAggregatesForReviewItId(itId);
      } catch (aggErr) {
        console.error('[ReviewController.createReview] aggregate sync failed', {
          itId,
          message: aggErr?.message,
        });
      }

      this._invalidateMemberReviewList(mbId);
      this._invalidateProductReviewList(itId);
      return res.json({
        success: true,
        message: '리뷰가 성공적으로 작성되었습니다. 관리자 승인 후 게시됩니다.',
        review: this.toReviewResponse(saved)
      });
    } catch (error) {
      console.error('[ReviewController.createReview]', error);
      return res.json({
        success: false,
        message: `리뷰 작성 중 오류가 발생했습니다: ${error.message}`,
      });
    }
  }

  async getProductReviews(req, res) {
    try {
      const { page, size } = this._reviewListPagination(req);
      const itId = String(req.params.itId || '').trim();
      const rvkind = String(req.query.rvkind || '');
      const cacheKey = `product:${itId}:${rvkind}:${page}:${size}`;
      const payload = await productReviewListCache.getOrSet(cacheKey, async () => {
        const itIds = await reviewRepository.getReviewSourceItIds(itId);
        const result = await reviewRepository.findByProduct(itIds, req.query.rvkind, page, size);
        return {
          success: true,
          reviews: result.rows.map((r) => this.toReviewResponse(r)),
          ...this.pagePayload(page, size, result.total),
        };
      });
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.json({ success: false, message: `리뷰 목록 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async getMemberReviews(req, res) {
    try {
      const { page, size } = this._reviewListPagination(req);
      const mbId = String(req.params.mbId || '').trim();
      const cacheKey = `member:${mbId}:${page}:${size}`;
      const payload = await memberReviewListCache.getOrSet(cacheKey, async () => {
        const result = await reviewRepository.findByMember(mbId, page, size);
        return {
          success: true,
          reviews: result.rows.map((r) => this.toReviewResponse(r)),
          ...this.pagePayload(page, size, result.total),
        };
      });
      res.set('Cache-Control', 'private, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.json({ success: false, message: `리뷰 목록 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async getAllReviews(req, res) {
    try {
      const { page, size } = this._reviewListPagination(req);
      const result = await reviewRepository.findAll(req.query.rvkind, page, size);
      return res.json({
        success: true,
        reviews: result.rows.map((r) => this.toReviewResponse(r)),
        ...this.pagePayload(page, size, result.total)
      });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 목록 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  /**
   * 메인 홈 — bomiora_main_review 승인 건만 (썸네일·문구용)
   * ?size= 기본 8, 최대 50
   */
  toMainReviewRow(row) {
    const t = (x) => this.trimSqlText(x);
    const images = [
      row.mr_img1, row.mr_img2, row.mr_img3, row.mr_img4, row.mr_img5,
      row.mr_img6, row.mr_img7, row.mr_img8, row.mr_img9, row.mr_img10
    ]
      .map((x) => t(x))
      .filter(Boolean);
    const productImages = [
      row.it_img1,
      row.it_img2,
      row.it_img3,
      row.it_img4,
      row.it_img5
    ]
      .map((x) => t(x))
      .filter(Boolean);

    const s1 = Number(row.mr_score1 || 0);
    const s2 = Number(row.mr_score2 || 0);
    const s3 = Number(row.mr_score3 || 0);
    const s4 = Number(row.mr_score4 || 0);

    const title = t(row.mr_title);
    const content = t(row.mr_content);
    const summary = t(row.mr_summary);
    const link = t(row.mr_link);
    const itId = t(row.it_id);
    const mbId = t(row.mb_id);
    const infId = t(row.inf_id);
    const nick = t(row.inf_nick);
    const name = t(row.inf_name);
    // 표시명은 inf_id → bomiora_member 닉네임 (mb_id 아님)
    const displayName = nick || name || infId || '리뷰어';

    return {
      mrNo: row.mr_no,
      itId: itId || null,
      mbId: mbId || null,
      infId: infId || null,
      displayName,
      isInfluencer: Boolean(infId),
      mrScore1: s1,
      mrScore2: s2,
      mrScore3: s3,
      mrScore4: s4,
      averageScore: (s1 + s2 + s3 + s4) / 4,
      mrTitle: title || null,
      mrContent: content || null,
      mrSummary: summary || null,
      mrLink: link || null,
      mrDatetime: row.mr_datetime,
      mrOrderNum: row.mr_order_num,
      images,
      productImage: productImages[0] || null
    };
  }

  toMainReviewStats(row) {
    const n = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const avg1 = n(row.avg1);
    const avg2 = n(row.avg2);
    const avg3 = n(row.avg3);
    const avg4 = n(row.avg4);
    const averageScore = n(row.avgAll);
    return {
      totalCount: n(row.cnt),
      averageScore,
      score1Percent: Math.round(avg1 * 20),
      score2Percent: Math.round(avg2 * 20),
      score3Percent: Math.round(avg3 * 20),
      score4Percent: Math.round(avg4 * 20)
    };
  }

  async getMainReviews(req, res) {
    try {
      let size = Number(req.query.size);
      if (!Number.isFinite(size) || size < 1) size = 8;
      size = Math.min(size, 50);
      const payload = await mainReviewHomeCache.getOrSet(`main:${size}`, async () => {
        const rows = await mainReviewRepository.findPublished(size);
        rows.forEach((row, index) => {
          if (row.mr_no != null) {
            mainReviewBestCache.set(`idx:${row.mr_no}`, index, 90_000);
          }
        });
        return {
          success: true,
          reviews: rows.map((r) => this.toMainReviewRow(r)),
        };
      });
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.json({
        success: false,
        message: `메인 리뷰 조회 중 오류가 발생했습니다: ${error.message}`
      });
    }
  }

  /**
   * 베스트 리뷰 목록 페이지 — 페이지네이션 + 전체 통계
   * ?page=0&size=5&mrNo= (선택: 해당 리뷰가 속한 페이지 번호 반환)
   */
  async getMainReviewsBest(req, res) {
    try {
      let size = Number(req.query.size);
      if (!Number.isFinite(size) || size < 1) size = 5;
      size = Math.min(size, 50);

      let page = Number(req.query.page);
      if (!Number.isFinite(page) || page < 0) page = 0;

      const mrNoRaw = req.query.mrNo;
      let focusPage = null;
      if (mrNoRaw != null && String(mrNoRaw).trim() !== '') {
        const idx = await mainReviewBestCache.getOrSet(
          `idx:${mrNoRaw}`,
          () => mainReviewRepository.findPublishedIndex(mrNoRaw),
          60_000
        );
        if (idx >= 0) {
          focusPage = Math.floor(idx / size);
          // mrNo가 있으면 해당 리뷰가 있는 페이지로 이동 (홈 카드 진입용)
          page = focusPage;
        }
      }

      const payload = await mainReviewBestCache.getOrSet(
        `best:${page}:${size}`,
        async () => {
          const [totalElements, rows, statsRow] = await Promise.all([
            mainReviewBestCache.getOrSet('stats:count', () =>
              mainReviewRepository.countPublished()
            ),
            mainReviewRepository.findPublishedPage({ page, size }),
            mainReviewBestCache.getOrSet('stats:agg', () =>
              mainReviewRepository.getPublishedStats()
            ),
          ]);
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          return {
            success: true,
            reviews: rows.map((r) => this.toMainReviewRow(r)),
            currentPage: page,
            totalPages,
            totalElements,
            hasNext: page + 1 < totalPages,
            stats: this.toMainReviewStats(statsRow),
          };
        }
      );

      res.set('Cache-Control', 'public, max-age=30');
      return res.json({
        ...payload,
        currentPage: page,
        focusPage,
        hasNext: page + 1 < (payload.totalPages || 0),
      });
    } catch (error) {
      return res.json({
        success: false,
        message: `베스트 리뷰 목록 조회 중 오류가 발생했습니다: ${error.message}`
      });
    }
  }

  async getProductReviewStats(req, res) {
    try {
      const itIds = await reviewRepository.getReviewSourceItIds(req.params.itId);
      const stats = await reviewRepository.getProductStats(itIds);
      return res.json({ success: true, stats });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 통계 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async getReviewById(req, res) {
    try {
      const isId = Number(req.params.isId);
      let row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });
      // total_is_score 가 null 이면 4항 평균으로만 채움 (is_score1~4 미변경)
      row = await this._backfillTotalIfNull(isId, row);
      return res.json({ success: true, review: this.toReviewResponse(row) });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  /** DB/API에서 mb_id·mbId 타입이 숫자·문자열로 섞여 strict 비교 시 권한 오류가 나지 않도록 통일 */
  _isSameMember(dbRowMbId, bodyMbId) {
    if (bodyMbId === undefined || bodyMbId === null || String(bodyMbId).trim() === '') return false;
    if (dbRowMbId === undefined || dbRowMbId === null) return false;
    return String(dbRowMbId).trim() === String(bodyMbId).trim();
  }

  async updateReview(req, res) {
    try {
      const isId = Number(req.params.isId);
      const row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });
      if (!this._isSameMember(row.mb_id, req.body.mbId)) {
        return res.json({ success: false, message: '리뷰를 수정할 권한이 없습니다.' });
      }

      const images = req.body.images != null ? this._normalizeReviewImages(req.body.images) : null;
      const fields = {};
      // 일반 상품 리뷰만 세부점수(is_score1~4) 미갱신. is_rvkind(서포터/일반)와 무관
      const productKindHint = this._reviewUiHintFromItKind(row.it_kind);
      const isGeneralProduct = productKindHint === 'general_card';

      if (!isGeneralProduct) {
        if (req.body.isScore1 != null) {
          fields.is_score1 = this._normalizeTenthScore(req.body.isScore1) ?? 0;
        }
        if (req.body.isScore2 != null) {
          fields.is_score2 = this._normalizeTenthScore(req.body.isScore2) ?? 0;
        }
        if (req.body.isScore3 != null) {
          fields.is_score3 = this._normalizeTenthScore(req.body.isScore3) ?? 0;
        }
        if (req.body.isScore4 != null) {
          fields.is_score4 = this._normalizeTenthScore(req.body.isScore4) ?? 0;
        }
        // 처방: 효과~편리함 평균 → total_is_score (is_score1~4 값은 유지·갱신만)
        const s1 = fields.is_score1 != null ? fields.is_score1 : row.is_score1;
        const s2 = fields.is_score2 != null ? fields.is_score2 : row.is_score2;
        const s3 = fields.is_score3 != null ? fields.is_score3 : row.is_score3;
        const s4 = fields.is_score4 != null ? fields.is_score4 : row.is_score4;
        fields.total_is_score = this._avgFourScores(s1, s2, s3, s4);
      } else if (req.body.totalIsScore !== undefined && req.body.totalIsScore !== null) {
        fields.total_is_score = this._normalizeTenthScore(req.body.totalIsScore);
      } else if (this._parseStoredTotal(row) == null) {
        fields.total_is_score = this._avgFourFromRow(row);
      }
      if (req.body.isPositiveReviewText != null) {
        fields.is_positive_review_text = String(req.body.isPositiveReviewText);
      }
      if (req.body.isNegativeReviewText != null) {
        fields.is_negative_review_text = String(req.body.isNegativeReviewText);
      } else if (isGeneralProduct) {
        // 일반 리뷰 수정 시 null 로 덮지 않음 — NOT NULL 컬럼
        fields.is_negative_review_text = row.is_negative_review_text ?? '';
      }
      if (req.body.isMoreReviewText !== undefined) {
        const memo = req.body.isMoreReviewText;
        fields.is_more_review_text =
          memo != null && String(memo).trim() !== '' ? String(memo).trim() : '';
      }
      if (req.body.isRecommend != null) fields.is_recommend = req.body.isRecommend;
      if (images) {
        fields.is_img1 = images[0] || '';
        fields.is_img2 = images[1] || '';
        fields.is_img3 = images[2] || '';
        fields.is_img4 = images[3] || '';
        fields.is_img5 = images[4] || '';
        fields.is_img6 = images[5] || '';
        fields.is_img7 = images[6] || '';
        fields.is_img8 = images[7] || '';
        fields.is_img9 = images[8] || '';
        fields.is_img10 = images[9] || '';
      }

      const updated = await reviewRepository.updateById(isId, fields);
      if (updated?.it_id != null) {
        await reviewRepository.syncAggregatesForReviewItId(updated.it_id);
      }
      this._invalidateMemberReviewList(row.mb_id);
      if (updated?.it_id != null) this._invalidateProductReviewList(updated.it_id);
      else if (row.it_id != null) this._invalidateProductReviewList(row.it_id);
      return res.json({ success: true, message: '리뷰가 성공적으로 수정되었습니다.', review: this.toReviewResponse(updated) });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 수정 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async deleteReview(req, res) {
    try {
      const isId = Number(req.params.isId);
      const row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });
      if (!this._isSameMember(row.mb_id, req.query.mbId)) {
        return res.json({ success: false, message: '리뷰를 삭제할 권한이 없습니다.' });
      }
      const reviewItId = row.it_id;
      await reviewRepository.deleteById(isId);
      await reviewRepository.syncAggregatesForReviewItId(reviewItId);
      this._invalidateMemberReviewList(row.mb_id);
      this._invalidateProductReviewList(reviewItId);
      return res.json({ success: true, message: '리뷰가 성공적으로 삭제되었습니다.' });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 삭제 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async incrementReviewHelpful(req, res) {
    try {
      const isId = Number(req.params.isId);
      const mbId = req.body.mbId;
      if (!mbId || !String(mbId).trim()) return res.json({ success: false, message: '회원 ID가 필요합니다.' });

      const row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });

      const already = await reviewRepository.hasHelpful(row.it_id, isId, mbId);
      if (already) {
        return res.json({ success: false, message: '이미 추천 하신 리뷰 입니다.', isGood: row.is_good });
      }

      await reviewRepository.addHelpful(row.it_id, isId, mbId);
      const nextGood = Number(row.is_good || 0) + 1;
      await reviewRepository.updateById(isId, { is_good: nextGood });
      return res.json({ success: true, message: '도움이 돼요가 증가했습니다.', isGood: nextGood });
    } catch (error) {
      return res.json({ success: false, message: `처리 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async checkUserHelpful(req, res) {
    const hasHelpful = await reviewRepository.hasHelpful(req.query.itId, Number(req.params.isId), req.query.mbId);
    return res.json({ hasHelpful });
  }

  async checkReviewExists(req, res) {
    try {
      const mbId = String(req.query.mbId || '').trim();
      const odId = String(req.query.odId || '').trim();
      if (!mbId || !odId) {
        return res.json({
          success: false,
          message: 'mbId, odId가 필요합니다.',
          exists: false,
          reviewedItIds: [],
        });
      }
      const reviewedItIds = await reviewRepository.findReviewedItIdsByOdId(
        mbId,
        odId
      );
      return res.json({
        success: true,
        exists: reviewedItIds.length > 0,
        reviewedItIds,
      });
    } catch (error) {
      return res.json({
        success: false,
        message: `확인 중 오류가 발생했습니다: ${error.message}`,
        exists: false,
        reviewedItIds: [],
      });
    }
  }

  /** 여러 주문의 리뷰 작성 완료 it_id 일괄 조회 */
  async getReviewedItemsByOrders(req, res) {
    try {
      const mbId = String(req.query.mbId || req.body?.mbId || '').trim();
      const raw =
        req.query.odIds ||
        req.body?.odIds ||
        req.query.odId ||
        req.body?.odId ||
        '';
      const odIds = Array.isArray(raw)
        ? raw.map((x) => String(x).trim()).filter(Boolean)
        : String(raw)
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
      if (!mbId) {
        return res.json({
          success: false,
          message: 'mbId가 필요합니다.',
          byOrder: {},
        });
      }
      const byOrder = await reviewRepository.findReviewedItIdsByOdIds(
        mbId,
        odIds
      );
      return res.json({ success: true, byOrder });
    } catch (error) {
      return res.json({
        success: false,
        message: `확인 중 오류가 발생했습니다: ${error.message}`,
        byOrder: {},
      });
    }
  }
}

module.exports = new ReviewController();
