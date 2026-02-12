class ImageProxyController {
  isAllowedUrl(url) {
    return (
      url.startsWith('https://bomiora0.mycafe24.com') ||
      url.startsWith('https://bomiora.kr') ||
      url.startsWith('https://www.bomiora.kr') ||
      url.startsWith('http://bomiora.kr') ||
      url.startsWith('http://www.bomiora.kr')
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

  async proxyImage(req, res) {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl || !this.isAllowedUrl(String(targetUrl))) {
        return res.sendStatus(403);
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
