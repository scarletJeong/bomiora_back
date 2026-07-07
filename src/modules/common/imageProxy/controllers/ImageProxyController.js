const fs = require('fs/promises');
const path = require('path');

class ImageProxyController {
  isAllowedUrl(url) {
    return (
      url.startsWith('https://bomiora0.mycafe24.com') ||
      url.startsWith('https://bomiora.kr') ||
      url.startsWith('https://www.bomiora.kr') ||
      url.startsWith('http://bomiora.kr') ||
      url.startsWith('http://www.bomiora.kr') ||
      url.startsWith('https://localhost/bomiora/www') ||
      url.startsWith('http://localhost/bomiora/www') ||
      url.startsWith('https://127.0.0.1/bomiora/www') ||
      url.startsWith('http://127.0.0.1/bomiora/www')
    );
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

  async proxyImage(req, res) {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl || !this.isAllowedUrl(String(targetUrl))) {
        return res.sendStatus(403);
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
          return res.status(200).send(bytes);
        } catch (error) {
          if (error && error.code === 'ENOENT') {
            return res.sendStatus(404);
          }
          return res.sendStatus(500);
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const localBytes = await this.tryReadLocalDataEventFile(String(targetUrl));
        if (localBytes) {
          res.setHeader('Content-Type', this.detectContentType(String(targetUrl), null));
          res.setHeader('Cache-Control', 'no-store');
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
        res.setHeader('Cache-Control', 'no-store');
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
          res.setHeader('Cache-Control', 'no-store');
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
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(bytes);
    } catch (error) {
      return res.sendStatus(500);
    }
  }
}

module.exports = new ImageProxyController();
