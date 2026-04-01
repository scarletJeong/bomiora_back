class AddressSearchService {
  constructor() {
    this.cache = new Map();
    this.requestLog = new Map();
  }

  getConfig() {
    return {
      provider: String(process.env.ADDRESS_PROVIDER || 'kakao').toLowerCase(),
      kakaoRestApiKey: String(process.env.KAKAO_REST_API_KEY || '').trim(),
      kakaoEndpoint: String(
        process.env.KAKAO_ADDRESS_SEARCH_URL || 'https://dapi.kakao.com/v2/local/search/address.json'
      ).trim(),
      minQueryLength: this.toPositiveInt(process.env.ADDRESS_SEARCH_MIN_QUERY_LENGTH, 2),
      maxPageSize: this.toPositiveInt(process.env.ADDRESS_SEARCH_MAX_PAGE_SIZE, 10),
      cacheTtlMs: this.toPositiveInt(process.env.ADDRESS_SEARCH_CACHE_TTL_MS, 300000),
      rateLimitWindowMs: this.toPositiveInt(process.env.ADDRESS_SEARCH_RATE_LIMIT_WINDOW_MS, 1000),
      rateLimitMaxRequests: this.toPositiveInt(process.env.ADDRESS_SEARCH_RATE_LIMIT_MAX_REQUESTS, 5),
    };
  }

  toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  normalizeQuery(query) {
    return String(query || '').trim().replace(/\s+/g, ' ');
  }

  normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  parsePage(value) {
    const page = Number.parseInt(String(value || '1'), 10);
    if (!Number.isFinite(page) || page < 1) {
      return 1;
    }
    return page;
  }

  parseSize(value, maxPageSize) {
    const size = Number.parseInt(String(value || maxPageSize), 10);
    if (!Number.isFinite(size) || size < 1) {
      return maxPageSize;
    }
    return Math.min(size, maxPageSize);
  }

  checkRateLimit(clientKey, config) {
    const now = Date.now();
    const windowStart = now - config.rateLimitWindowMs;
    const recent = (this.requestLog.get(clientKey) || []).filter((t) => t >= windowStart);

    if (recent.length >= config.rateLimitMaxRequests) {
      return false;
    }

    recent.push(now);
    this.requestLog.set(clientKey, recent);
    return true;
  }

  getCachedResult(cacheKey, cacheTtlMs) {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }

    const isExpired = Date.now() - cached.cachedAt > cacheTtlMs;
    if (isExpired) {
      this.cache.delete(cacheKey);
      return null;
    }

    return {
      ...cached.data,
      meta: {
        ...cached.data.meta,
        cached: true,
      },
    };
  }

  setCachedResult(cacheKey, data) {
    this.cache.set(cacheKey, {
      cachedAt: Date.now(),
      data,
    });
  }

  mapKakaoDocument(document) {
    const road = document.road_address || {};
    const jibun = document.address || {};
    const x = road.x || jibun.x;
    const y = road.y || jibun.y;

    const mapped = {
      postalCode: String(road.zone_no || ''),
      roadAddress: String(road.address_name || ''),
      jibunAddress: String(jibun.address_name || ''),
      extraAddress: '',
      buildingName: String(road.building_name || ''),
      region1DepthName: String(jibun.region_1depth_name || ''),
      region2DepthName: String(jibun.region_2depth_name || ''),
      region3DepthName: String(jibun.region_3depth_name || ''),
      latitude: y ? Number.parseFloat(y) : null,
      longitude: x ? Number.parseFloat(x) : null,
      source: 'kakao',
    };

    if (mapped.buildingName) {
      mapped.extraAddress = mapped.buildingName;
    }

    return mapped;
  }

  async search({ query, page = 1, size, clientKey = 'anonymous' }) {
    const config = this.getConfig();

    if (config.provider !== 'kakao') {
      const error = new Error('지원하지 않는 주소 서비스 공급자입니다.');
      error.status = 500;
      throw error;
    }

    if (!config.kakaoRestApiKey) {
      const error = new Error('KAKAO_REST_API_KEY 설정이 필요합니다.');
      error.status = 500;
      throw error;
    }

    const normalizedQuery = this.normalizeQuery(query);
    if (normalizedQuery.length < config.minQueryLength) {
      const error = new Error(`검색어는 최소 ${config.minQueryLength}글자 이상 입력해 주세요.`);
      error.status = 400;
      throw error;
    }

    if (!this.checkRateLimit(clientKey, config)) {
      const error = new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      error.status = 429;
      throw error;
    }

    const normalizedPage = this.parsePage(page);
    const normalizedSize = this.parseSize(size, config.maxPageSize);
    const cacheKey = `${normalizedQuery}:${normalizedPage}:${normalizedSize}`;
    const cached = this.getCachedResult(cacheKey, config.cacheTtlMs);

    if (cached) {
      return cached;
    }

    const endpoint = new URL(config.kakaoEndpoint);
    endpoint.searchParams.set('query', normalizedQuery);
    endpoint.searchParams.set('page', String(normalizedPage));
    endpoint.searchParams.set('size', String(normalizedSize));
    endpoint.searchParams.set('analyze_type', 'similar');

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Authorization: `KakaoAK ${config.kakaoRestApiKey}`,
      },
    });

    if (!response.ok) {
      const bodyText = await response.text();
      const error = new Error(`주소 검색 API 호출 실패 (${response.status}): ${bodyText}`);
      error.status = 502;
      throw error;
    }

    const payload = await response.json();
    const results = Array.isArray(payload.documents)
      ? payload.documents.map((doc) => this.mapKakaoDocument(doc))
      : [];

    const data = {
      query: normalizedQuery,
      results,
      meta: {
        page: normalizedPage,
        size: normalizedSize,
        totalCount: Number(payload.meta?.total_count || 0),
        pageableCount: Number(payload.meta?.pageable_count || 0),
        isEnd: Boolean(payload.meta?.is_end),
        cached: false,
      },
    };

    this.setCachedResult(cacheKey, data);
    return data;
  }

  buildFullAddress(roadAddress, detailAddress) {
    const road = this.normalizeText(roadAddress);
    const detail = this.normalizeText(detailAddress);
    return [road, detail].filter(Boolean).join(' ');
  }

  async resolveCoordinates(addressText, config) {
    const endpoint = new URL(config.kakaoEndpoint);
    endpoint.searchParams.set('query', this.normalizeText(addressText));
    endpoint.searchParams.set('page', '1');
    endpoint.searchParams.set('size', '1');
    endpoint.searchParams.set('analyze_type', 'similar');

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Authorization: `KakaoAK ${config.kakaoRestApiKey}`,
      },
    });

    if (!response.ok) {
      return { latitude: null, longitude: null };
    }

    const payload = await response.json();
    const first = Array.isArray(payload.documents) && payload.documents.length > 0
      ? payload.documents[0]
      : null;

    if (!first) {
      return { latitude: null, longitude: null };
    }

    const road = first.road_address || {};
    const jibun = first.address || {};
    const x = road.x || jibun.x;
    const y = road.y || jibun.y;

    return {
      latitude: y ? Number.parseFloat(y) : null,
      longitude: x ? Number.parseFloat(x) : null,
    };
  }

  async resolve(payload = {}) {
    const config = this.getConfig();
    const postalCode = this.normalizeText(payload.postalCode);
    const roadAddress = this.normalizeText(payload.roadAddress);
    const jibunAddress = this.normalizeText(payload.jibunAddress);
    const detailAddress = this.normalizeText(payload.detailAddress);
    const extraAddress = this.normalizeText(payload.extraAddress);

    if (!postalCode) {
      const error = new Error('postalCode는 필수입니다.');
      error.status = 400;
      throw error;
    }

    if (!roadAddress) {
      const error = new Error('roadAddress는 필수입니다.');
      error.status = 400;
      throw error;
    }

    let latitude = Number.isFinite(Number(payload.latitude))
      ? Number.parseFloat(String(payload.latitude))
      : null;
    let longitude = Number.isFinite(Number(payload.longitude))
      ? Number.parseFloat(String(payload.longitude))
      : null;

    if ((latitude == null || longitude == null) && config.kakaoRestApiKey) {
      const resolved = await this.resolveCoordinates(roadAddress || jibunAddress, config);
      latitude = resolved.latitude;
      longitude = resolved.longitude;
    }

    return {
      address: {
        postalCode,
        roadAddress,
        jibunAddress,
        detailAddress,
        extraAddress,
        fullAddress: this.buildFullAddress(roadAddress, detailAddress),
        latitude,
        longitude,
      },
    };
  }
}

module.exports = new AddressSearchService();
