const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

sharp.cache(false);

const PROXY_CACHE_DIR = path.join(__dirname, '../../../../../uploads/image-proxy-cache');
const PROXY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ITEM_IMAGE_TTL_MS = 10 * 60 * 1000;
const OPTIMIZED_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
const PROXY_MEM_MAX = 80;

class ImageProxyController {
  constructor() {
    this._memCache = new Map();
    this._cacheDirReady = null;
    this._originInflight = new Map();
  }

  isAllowedHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (!host) return false;
    return (
      host === 'bomiora0.mycafe24.com' ||
      host === 'bomiora.kr' ||
      host === 'www.bomiora.kr' ||
      host === 'bomiora.net' ||
      host === 'www.bomiora.net' ||
      host.endsWith('.mycafe24.com') ||
      host.endsWith('.godohosting.com') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  }

  isAllowedUrl(url) {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      return this.isAllowedHost(parsed.hostname);
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

  /** 본문 바이트로 실제 이미지 여부 판별 (잘못된 Content-Type:text/html 대응) */
  sniffImageMimeFromBuffer(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    try {
      const head = buf.slice(0, 12).toString('ascii');
      if (head.startsWith('RIFF') && buf.slice(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
      }
    } catch (_) {}
    return null;
  }

  bufferLooksLikeHtml(buf) {
    const s = buf.slice(0, 512).toString('latin1').trimStart().toLowerCase();
    return (
      s.startsWith('<!') ||
      s.startsWith('<html') ||
      s.startsWith('<head') ||
      s.startsWith('<?xml') ||
      s.startsWith('<body')
    );
  }

  urlLooksLikeImagePath(url) {
    return /\.(png|jpe?g|jpeg|gif|webp|bmp)(\?|#|$)/i.test(String(url));
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

  isShopItemImageUrl(url) {
    try {
      return new URL(String(url)).pathname.toLowerCase().includes('/data/item/');
    } catch (_) {
      return false;
    }
  }

  cacheTtlFor(url) {
    return this.isShopItemImageUrl(url) ? ITEM_IMAGE_TTL_MS : PROXY_CACHE_TTL_MS;
  }

  async tryReadLocalDataEventFile(targetUrl) {
    try {
      const prefix = '/data/event/';
      const pathname = new URL(String(targetUrl)).pathname || '';
      const lower = pathname.toLowerCase();
      if (!lower.includes(prefix)) return null;

      const idx = lower.indexOf(prefix);
      const relative = pathname.substring(idx);
      const localUrl = `http://localhost/bomiora/www${relative}`;
      const filePath = this.resolveLocalFilePath(localUrl);
      if (!filePath) return null;
      return await fs.readFile(filePath);
    } catch (_) {
      return null;
    }
  }

  setImageCacheHeaders(res, shortLived = false, optimized = false) {
    if (optimized) {
      res.setHeader(
        'Cache-Control',
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      );
      res.setHeader('CDN-Cache-Control', 'public, max-age=86400');
    } else {
    res.setHeader(
      'Cache-Control',
      shortLived ? 'public, max-age=600' : 'public, max-age=86400, immutable',
    );
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  cacheKey(url) {
    return crypto.createHash('sha1').update(String(url)).digest('hex');
  }

  thumbWidth(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(1200, Math.max(32, Math.round(n)));
  }

  /** 검색 썸네일용. 원본이 10MB가 넘어도 가로만 줄여 jpeg로 보낸다. */
  async resizeForThumb(buf, width) {
    if (!width || !buf || !buf.length) return null;
    const large = width > 480;
    try {
      return await sharp(buf, { failOn: 'none', limitInputPixels: false, sequentialRead: true })
        .rotate()
        .resize({ width, withoutEnlargement: true, fastShrinkOnLoad: !large })
        .jpeg({ quality: large ? 85 : 60, mozjpeg: false, progressive: false })
        .toBuffer();
    } catch (_) {
      return null;
    }
  }

  /** 원본 해상도를 유지하고 전송 포맷만 고화질 WebP로 최적화한다. */
  async optimizeOriginalWebp(buf) {
    if (!buf || !buf.length) return null;
    try {
      return await sharp(buf, {
        failOn: 'none',
        limitInputPixels: false,
        sequentialRead: true,
      })
        .rotate()
        .webp({ quality: 92, effort: 4, smartSubsample: false })
        .toBuffer();
    } catch (_) {
      return null;
    }
  }

  async ensureCacheDir() {
    if (!this._cacheDirReady) {
      this._cacheDirReady = fs.mkdir(PROXY_CACHE_DIR, { recursive: true }).catch(() => {});
    }
    await this._cacheDirReady;
  }

  rememberMem(key, buf, type) {
    this._memCache.set(key, { buf, type, at: Date.now() });
    if (this._memCache.size <= PROXY_MEM_MAX) return;
    const oldest = this._memCache.keys().next().value;
    if (oldest) this._memCache.delete(oldest);
  }

  async readProxyCache(key, ttlMs = PROXY_CACHE_TTL_MS) {
    const mem = this._memCache.get(key);
    if (mem && Date.now() - mem.at < ttlMs) {
      return { buf: mem.buf, type: mem.type };
    }
    const file = path.join(PROXY_CACHE_DIR, `${key}.bin`);
    const meta = path.join(PROXY_CACHE_DIR, `${key}.json`);
    try {
      const st = await fs.stat(file);
      if (Date.now() - st.mtimeMs > ttlMs) return null;
      const [buf, metaRaw] = await Promise.all([
        fs.readFile(file),
        fs.readFile(meta, 'utf8').catch(() => '{}'),
      ]);
      let type = 'image/jpeg';
      try {
        type = JSON.parse(metaRaw).type || type;
      } catch (_) {}
      this.rememberMem(key, buf, type);
      return { buf, type };
    } catch (_) {
      return null;
    }
  }

  async writeProxyCache(key, buf, type) {
    this.rememberMem(key, buf, type);
    try {
      await this.ensureCacheDir();
      await Promise.all([
        fs.writeFile(path.join(PROXY_CACHE_DIR, `${key}.bin`), buf),
        fs.writeFile(
          path.join(PROXY_CACHE_DIR, `${key}.json`),
          JSON.stringify({ type: type || 'image/jpeg' }),
        ),
      ]);
    } catch (_) {}
  }

  async sendImageBytes(res, key, bytes, type, thumbW, shortLived = false) {
    let out = bytes;
    let outType = type || 'image/jpeg';
    if (thumbW) {
      const resized = await this.resizeForThumb(bytes, thumbW);
      if (!resized) return res.sendStatus(415);
      out = resized;
      outType = 'image/jpeg';
    }
    res.setHeader('Content-Type', outType);
    this.setImageCacheHeaders(res, shortLived);
    this.writeProxyCache(key, out, outType);
    return res.status(200).send(out);
  }

  async warmThumb(targetUrl, width) {
    if (!this.isAllowedUrl(targetUrl)) return false;
    const thumbW = this.thumbWidth(width);
    if (!thumbW) return false;
    const key = this.cacheKey(`${targetUrl}|w=${thumbW}`);
    const cached = await this.readProxyCache(key, this.cacheTtlFor(targetUrl));
    if (cached) return true;
    const origin = await this.loadOriginBytes(targetUrl);
    if (!origin || origin.status || !origin.buf) return false;
    const resized = await this.resizeForThumb(origin.buf, thumbW);
    if (!resized) return false;
    await this.writeProxyCache(key, resized, 'image/jpeg');
    return true;
  }

  async sendOptimizedWebp(res, key, bytes) {
    const out = await this.optimizeOriginalWebp(bytes);
    if (!out) return res.sendStatus(415);
    res.setHeader('Content-Type', 'image/webp');
    this.setImageCacheHeaders(res, false, true);
    this.writeProxyCache(key, out, 'image/webp');
    return res.status(200).send(out);
  }

  sendCachedImage(res, buf, type, shortLived = false, optimized = false) {
    res.setHeader('Content-Type', type || 'image/jpeg');
    this.setImageCacheHeaders(res, shortLived, optimized);
    res.setHeader('X-Proxy-Cache', 'HIT');
    return res.status(200).send(buf);
  }

  detailImageName(url) {
    try {
      const name = new URL(String(url)).pathname.split('/').filter(Boolean).pop() || 'image';
      return decodeURIComponent(name);
    } catch (_) {
      return 'image';
    }
  }

  logDetailImage(url, thumbW, phase, started, bytes) {
    if (thumbW || !this.isShopItemImageUrl(url)) return;
    const ms = Date.now() - started;
    const size = Number(bytes) > 0 ? `${bytes}B` : '0B';
    console.log(`[상세이미지] ${ms}ms ${phase} ${size} ${this.detailImageName(url)}`);
  }

  async proxyImage(req, res) {
    const started = Date.now();
    try {
      const targetUrl = req.query.url;
      if (!targetUrl || !this.isAllowedUrl(String(targetUrl))) {
        return res.sendStatus(403);
      }

      const thumbW = this.thumbWidth(req.query.w);
      const optimized = !thumbW && String(req.query.format || '').toLowerCase() === 'webp';
      const cacheSource = thumbW
        ? `${targetUrl}|w=${thumbW}`
        : optimized
          ? `${targetUrl}|format=webp|v=1`
          : String(targetUrl);
      const key = this.cacheKey(cacheSource);
      const shortLived = this.isShopItemImageUrl(targetUrl);
      const cacheTtl = optimized ? OPTIMIZED_IMAGE_TTL_MS : this.cacheTtlFor(targetUrl);
      const cached = await this.readProxyCache(key, cacheTtl);
      if (cached) {
        this.logDetailImage(targetUrl, thumbW, '캐시', started, cached.buf.length);
        return this.sendCachedImage(
          res,
          cached.buf,
          cached.type,
          shortLived,
          optimized,
        );
      }

      if (optimized) {
        const origin = await this.loadOriginBytes(String(targetUrl));
        if (!origin) return res.sendStatus(404);
        if (origin.status) return res.sendStatus(origin.status);
        const response = await this.sendOptimizedWebp(res, key, origin.buf);
        this.logDetailImage(targetUrl, 0, 'WebP', started, origin.buf.length);
        return response;
      }

      if (!thumbW) {
        return this.proxyOriginalStream(res, String(targetUrl), key, shortLived, started);
      }

      const origin = await this.loadOriginBytes(String(targetUrl));
      if (!origin) return res.sendStatus(404);
      if (origin.status) return res.sendStatus(origin.status);
      return this.sendImageBytes(res, key, origin.buf, origin.type, thumbW, shortLived);
    } catch (error) {
      return res.sendStatus(500);
    }
  }

  async proxyOriginalStream(res, targetUrl, key, shortLived, started) {
    const originKey = this.cacheKey(targetUrl);
    const pending = this._originInflight.get(originKey);
    if (pending) {
      const origin = await pending;
      const bytes = origin && origin.buf ? origin.buf.length : 0;
      this.logDetailImage(targetUrl, 0, origin && origin.status ? '실패' : '공유', started, bytes);
      if (!origin || origin.status) return res.sendStatus((origin && origin.status) || 404);
      return this.sendImageBytes(res, key, origin.buf, origin.type, 0, shortLived);
    }

    let resolveJob;
    const job = new Promise((resolve) => {
      resolveJob = resolve;
    });
    this._originInflight.set(originKey, job);
    const finish = (origin) => {
      resolveJob(origin);
      this._originInflight.delete(originKey);
      return origin;
    };

    if (this.isLocalXamppUrl(targetUrl)) {
      const origin = await this.fetchOriginBytes(targetUrl, originKey);
      finish(origin);
      const bytes = origin && origin.buf ? origin.buf.length : 0;
      this.logDetailImage(targetUrl, 0, origin && origin.status ? '실패' : '원본', started, bytes);
      if (!origin || origin.status) return res.sendStatus((origin && origin.status) || 404);
      return this.sendImageBytes(res, key, origin.buf, origin.type, 0, shortLived);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      if (!response.ok || !response.body) {
        clearTimeout(timer);
        if (await this.sendLocalEventImage(res, targetUrl, originKey, finish)) return undefined;
        const origin = { status: response.status || 502 };
        finish(origin);
        this.logDetailImage(targetUrl, 0, '실패', started, 0);
        return res.sendStatus(origin.status);
      }

      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      let type = null;
      let sent = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        chunks.push(buf);
        total += buf.length;
        if (!sent) {
          if (total < 12) continue;
          const head = Buffer.concat(chunks, total);
          if (this.bufferLooksLikeHtml(head)) {
            await reader.cancel().catch(() => {});
            clearTimeout(timer);
            if (await this.sendLocalEventImage(res, targetUrl, originKey, finish)) return undefined;
            const origin = { status: 415 };
            finish(origin);
            this.logDetailImage(targetUrl, 0, 'html', started, total);
            return res.sendStatus(415);
          }
          type = this.sniffImageMimeFromBuffer(head);
          if (!type) continue;
          res.status(200);
          res.setHeader('Content-Type', type);
          this.setImageCacheHeaders(res, shortLived);
          res.setHeader('X-Proxy-Cache', 'MISS');
          const len = response.headers.get('content-length');
          if (len) res.setHeader('Content-Length', len);
          res.write(head);
          sent = true;
          continue;
        }
        res.write(buf);
      }
      clearTimeout(timer);

      const all = Buffer.concat(chunks, total);
      if (!type) type = this.sniffImageMimeFromBuffer(all);
      if (!type || this.bufferLooksLikeHtml(all)) {
        const origin = { status: 415 };
        finish(origin);
        this.logDetailImage(targetUrl, 0, 'html', started, total);
        if (!res.headersSent) return res.sendStatus(415);
        return res.end();
      }
      if (!sent) {
        res.status(200);
        res.setHeader('Content-Type', type);
        this.setImageCacheHeaders(res, shortLived);
        res.setHeader('X-Proxy-Cache', 'MISS');
        res.write(all);
      }
      res.end();
      const origin = { buf: all, type };
      this.writeProxyCache(originKey, all, type);
      finish(origin);
      this.logDetailImage(targetUrl, 0, '원본', started, all.length);
      return undefined;
    } catch (_) {
      clearTimeout(timer);
      const origin = { status: 500 };
      finish(origin);
      this.logDetailImage(targetUrl, 0, '실패', started, 0);
      if (!res.headersSent) return res.sendStatus(500);
      return res.end();
    }
  }

  async sendLocalEventImage(res, targetUrl, originKey, finish) {
    const localBytes = await this.tryReadLocalDataEventFile(targetUrl);
    if (!localBytes) return false;
    const sniffed = this.sniffImageMimeFromBuffer(localBytes);
    const type = sniffed || this.detectContentType(targetUrl, null);
    const origin = { buf: localBytes, type };
    this.writeProxyCache(originKey, localBytes, type);
    finish(origin);
    if (!res.headersSent) {
      res.status(200);
      res.setHeader('Content-Type', type);
      this.setImageCacheHeaders(res, false);
      res.setHeader('X-Proxy-Cache', 'MISS');
    }
    res.end(localBytes);
    return true;
  }

  async loadOriginBytes(targetUrl) {
    const key = this.cacheKey(targetUrl);
    const cached = await this.readProxyCache(key, this.cacheTtlFor(targetUrl));
    if (cached) return cached;

    const pending = this._originInflight.get(key);
    if (pending) return pending;

    const job = this.fetchOriginBytes(targetUrl, key).finally(() => {
      this._originInflight.delete(key);
    });
    this._originInflight.set(key, job);
    return job;
  }

  async fetchOriginBytes(targetUrl, key) {
    if (this.isLocalXamppUrl(targetUrl)) {
      const filePath = this.resolveLocalFilePath(targetUrl);
      if (!filePath) return { status: 400 };
      try {
        const bytes = await fs.readFile(filePath);
        const contentType = this.detectContentType(targetUrl, null);
        this.writeProxyCache(key, bytes, contentType);
        return { buf: bytes, type: contentType };
      } catch (error) {
        if (error && error.code === 'ENOENT') return { status: 404 };
        return { status: 500 };
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
    } catch (_) {
      return { status: 500 };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const localBytes = await this.tryReadLocalDataEventFile(targetUrl);
      if (localBytes) {
        const type = this.detectContentType(targetUrl, null);
        this.writeProxyCache(key, localBytes, type);
        return { buf: localBytes, type };
      }
      return { status: response.status };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const urlLooksImage = this.urlLooksLikeImagePath(targetUrl);
    const sniffed = this.sniffImageMimeFromBuffer(bytes);
    if (sniffed) {
      this.writeProxyCache(key, bytes, sniffed);
      return { buf: bytes, type: sniffed };
    }

    const rawCt = response.headers.get('content-type') || '';
    const base = rawCt.split(';')[0].trim().toLowerCase();
    const isImage = base.startsWith('image/');
    const isBinaryImage =
      urlLooksImage &&
      (base === '' ||
        base === 'application/octet-stream' ||
        base === 'binary/octet-stream');
    const isBadDoc =
      base.includes('html') ||
      base === 'application/json' ||
      base.startsWith('text/');

    if (urlLooksImage && this.bufferLooksLikeHtml(bytes)) {
      const localBytes = await this.tryReadLocalDataEventFile(targetUrl);
      if (localBytes) {
        const sniffedLocal = this.sniffImageMimeFromBuffer(localBytes);
        const type = sniffedLocal || this.detectContentType(targetUrl, null);
        this.writeProxyCache(key, localBytes, type);
        return { buf: localBytes, type };
      }
      return { status: 415 };
    }

    if (!isImage && !isBinaryImage && (isBadDoc || !urlLooksImage)) {
      return { status: 415 };
    }

    const contentType = this.detectContentType(
      targetUrl,
      response.headers.get('content-type'),
    );
    this.writeProxyCache(key, bytes, contentType);
    return { buf: bytes, type: contentType };
  }
}

module.exports = new ImageProxyController();
