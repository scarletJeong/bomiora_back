const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const PROXY_CACHE_DIR = path.join(__dirname, '../../../../../uploads/image-proxy-cache');
const PROXY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROXY_MEM_MAX = 80;

class ImageProxyController {
  constructor() {
    this._memCache = new Map();
    this._cacheDirReady = null;
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

  setImageCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  cacheKey(url) {
    return crypto.createHash('sha1').update(String(url)).digest('hex');
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

  async readProxyCache(key) {
    const mem = this._memCache.get(key);
    if (mem && Date.now() - mem.at < PROXY_CACHE_TTL_MS) {
      return { buf: mem.buf, type: mem.type };
    }
    const file = path.join(PROXY_CACHE_DIR, `${key}.bin`);
    const meta = path.join(PROXY_CACHE_DIR, `${key}.json`);
    try {
      const st = await fs.stat(file);
      if (Date.now() - st.mtimeMs > PROXY_CACHE_TTL_MS) return null;
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

  sendCachedImage(res, buf, type) {
    res.setHeader('Content-Type', type || 'image/jpeg');
    this.setImageCacheHeaders(res);
    res.setHeader('X-Proxy-Cache', 'HIT');
    return res.status(200).send(buf);
  }

  async proxyImage(req, res) {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl || !this.isAllowedUrl(String(targetUrl))) {
        return res.sendStatus(403);
      }

      const key = this.cacheKey(String(targetUrl));
      const cached = await this.readProxyCache(key);
      if (cached) {
        return this.sendCachedImage(res, cached.buf, cached.type);
      }

      // localhost XAMPP 이미지는 로컬 파일에서 직접 읽어 반환
      if (this.isLocalXamppUrl(String(targetUrl))) {
        const filePath = this.resolveLocalFilePath(String(targetUrl));
        if (!filePath) {
          return res.sendStatus(400);
        }
        try {
          const bytes = await fs.readFile(filePath);
          const contentType = this.detectContentType(String(targetUrl), null);
          res.setHeader('Content-Type', contentType);
          this.setImageCacheHeaders(res);
          this.writeProxyCache(key, bytes, contentType);
          return res.status(200).send(bytes);
        } catch (error) {
          if (error && error.code === 'ENOENT') {
            return res.sendStatus(404);
          }
          return res.sendStatus(500);
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const localBytes = await this.tryReadLocalDataEventFile(String(targetUrl));
        if (localBytes) {
          res.setHeader('Content-Type', this.detectContentType(String(targetUrl), null));
          this.setImageCacheHeaders(res);
          return res.status(200).send(localBytes);
        }
        return res.sendStatus(response.status);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const urlStr = String(targetUrl);
      const urlLooksImage = this.urlLooksLikeImagePath(urlStr);

      const sniffed = this.sniffImageMimeFromBuffer(bytes);
      if (sniffed) {
        res.setHeader('Content-Type', sniffed);
        this.setImageCacheHeaders(res);
        this.writeProxyCache(key, bytes, sniffed);
        return res.status(200).send(bytes);
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
        const localBytes = await this.tryReadLocalDataEventFile(urlStr);
        if (localBytes) {
          const sniffedLocal = this.sniffImageMimeFromBuffer(localBytes);
          res.setHeader('Content-Type', sniffedLocal || this.detectContentType(urlStr, null));
          this.setImageCacheHeaders(res);
          return res.status(200).send(localBytes);
        }
        return res.sendStatus(415);
      }

      if (!isImage && !isBinaryImage) {
        if (isBadDoc || !urlLooksImage) {
          return res.sendStatus(415);
        }
      }

      const contentType = this.detectContentType(urlStr, response.headers.get('content-type'));
      res.setHeader('Content-Type', contentType);
      this.setImageCacheHeaders(res);
      this.writeProxyCache(key, bytes, contentType);
      return res.status(200).send(bytes);
    } catch (error) {
      return res.sendStatus(500);
    }
  }
}

module.exports = new ImageProxyController();
