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
        return res.sendStatus(response.status);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = this.detectContentType(String(targetUrl), response.headers.get('content-type'));
      res.setHeader('Content-Type', contentType);
      return res.status(200).send(bytes);
    } catch (error) {
      return res.sendStatus(500);
    }
  }
}

module.exports = new ImageProxyController();
