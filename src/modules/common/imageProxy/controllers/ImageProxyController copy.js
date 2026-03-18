const fs = require('fs/promises');
const path = require('path');

class ImageProxyController {
  normalizeUpstreamUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.host.toLowerCase();
      const path = (parsed.pathname || '').toLowerCase();

      // TODO: 운영 전환 시 upstream canonical host를 bomiora.kr로 변경
      const canonicalHost = 'bomiora0.mycafe24.com';
      const isBomioraDomain =
        host === 'bomiora.kr' ||
        host === 'www.bomiora.kr' ||
        host === 'bomiora0.mycafe24.com';
      const isStaticImagePath =
        path.startsWith('/data/item/') ||
        path.startsWith('/data/itemuse/') ||
        path.startsWith('/data/editor/');

      if (isBomioraDomain && isStaticImagePath) {
        parsed.protocol = 'https:';
        parsed.host = canonicalHost;
        return parsed.toString();
      }

      return url;
    } catch (_) {
      return url;
    }
  }

  isAllowedUrl(url) {
    try {
      const parsed = new URL(url);
      const origin = `${parsed.protocol}//${parsed.host}`.toLowerCase();
      const allowedOrigins = new Set([
        'https://bomiora0.mycafe24.com',
        'http://bomiora0.mycafe24.com',
        'https://bomiora.kr',
        'https://www.bomiora.kr',
        'http://bomiora.kr',
        'http://www.bomiora.kr',
        'https://localhost',
        'http://localhost',
        'https://127.0.0.1',
        'http://127.0.0.1'
      ]);

      if (!allowedOrigins.has(origin)) return false;

      // 로컬 XAMPP 경로는 /bomiora/www 하위만 허용
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return parsed.pathname.toLowerCase().startsWith('/bomiora/www/');
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  detectContentType(url, headerContentType) {
    if (headerContentType) return headerContentType;
    const lower = url.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  isLocalXamppUrl(url) {
    return (
      url.startsWith('https://localhost/bomiora/www/') ||
      url.startsWith('http://localhost/bomiora/www/') ||
      url.startsWith('https://127.0.0.1/bomiora/www/') ||
      url.startsWith('http://127.0.0.1/bomiora/www/')
    );
  }

  resolveLocalFilePath(targetUrl) {
    const parsed = new URL(targetUrl);
    const prefix = '/bomiora/www/';
    const pathname = parsed.pathname || '';
    if (!pathname.toLowerCase().startsWith(prefix)) {
      return null;
    }

    const relativePart = pathname.substring(prefix.length);
    const xamppRoot = path.resolve('C:/xampp/htdocs/bomiora/www');
    const filePath = path.resolve(xamppRoot, relativePart);

    // 경로 탈출 방지
    if (!filePath.toLowerCase().startsWith(xamppRoot.toLowerCase())) {
      return null;
    }
    return filePath;
  }

  async proxyImage(req, res) {
    try {
      const rawUrl = req.query.url;
      if (!rawUrl) {
        return res.sendStatus(403);
      }

      // 일부 데이터는 이미 인코딩된 URL이 들어오므로 한번 decode를 시도하고,
      // fetch 호출 전 URL-safe 형태로 정규화한다.
      let targetUrl = String(rawUrl).trim();
      try {
        targetUrl = decodeURIComponent(targetUrl);
      } catch (_) {
        // decode 불가능한 경우 원본 사용
      }

      let requestUrl;
      try {
        requestUrl = encodeURI(this.normalizeUpstreamUrl(targetUrl));
      } catch (_) {
        return res.sendStatus(400);
      }

      if (!this.isAllowedUrl(requestUrl)) {
        return res.sendStatus(403);
      }

      // localhost XAMPP 이미지는 로컬 파일에서 직접 읽어 반환
      if (this.isLocalXamppUrl(String(requestUrl))) {
        const filePath = this.resolveLocalFilePath(String(requestUrl));
        if (!filePath) {
          return res.sendStatus(400);
        }
        try {
          const bytes = await fs.readFile(filePath);
          const contentType = this.detectContentType(String(requestUrl), null);
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.status(200).send(bytes);
        } catch (error) {
          if (error && error.code === 'ENOENT') {
            return res.sendStatus(404);
          }
          return res.sendStatus(500);
        }
      }
      const fetchWithTimeout = async (url, headers = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          return await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers
          });
        } finally {
          clearTimeout(timeout);
        }
      };

      const upstreamUrl = new URL(requestUrl);
      const upstreamOrigin = `${upstreamUrl.protocol}//${upstreamUrl.host}`;

      // 1차: upstream 기준 Referer/Origin으로 요청 (핫링크 정책 대응)
      let response = await fetchWithTimeout(requestUrl, {
        'User-Agent': 'BomioraImageProxy/1.0 (+https://bomiora.net)',
        'Referer': `${upstreamOrigin}/`,
        'Origin': upstreamOrigin
      });

      // 2차: HTML 페이지가 내려오면 헤더를 최소화해 재시도
      let headerContentType = (response.headers.get('content-type') || '').toLowerCase();
      if (response.ok && headerContentType.includes('text/html')) {
        response = await fetchWithTimeout(requestUrl, {
          'User-Agent': 'Mozilla/5.0'
        });
        headerContentType = (response.headers.get('content-type') || '').toLowerCase();
      }

      if (!response.ok) {
        return res.sendStatus(response.status);
      }

      const contentType = this.detectContentType(String(requestUrl), response.headers.get('content-type'));
      if (!contentType.toLowerCase().startsWith('image/')) {
        return res.status(502).json({
          error: 'UPSTREAM_NOT_IMAGE',
          message: '원본 서버가 이미지 대신 HTML/기타 응답을 반환했습니다.',
          url: requestUrl,
          contentType
        });
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(bytes);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return res.sendStatus(504);
      }
      return res.sendStatus(500);
    }
  }
}

module.exports = new ImageProxyController();
