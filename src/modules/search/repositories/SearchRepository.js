const productRepository = require('../../shopping/product/repositories/ProductRepository');
const contentRepository = require('../../content/repositories/ContentRepository');
const eventRepository = require('../../shopping/event/repositories/EventRepository');
const announcementRepository = require('../../community/announcement/repositories/AnnouncementRepository');

class SearchRepository {
  _pack(result, limit, offset) {
    const rows = result?.rows || [];
    const total = Number(result?.total || 0);
    return {
      rows,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  async searchProducts({ query, itKind, limit, offset = 0 }) {
    const result = await productRepository.searchByKeyword(query, itKind, limit, offset);
    return this._pack(result, limit, offset);
  }

  async searchEvents({ query, limit, offset = 0 }) {
    const result = await eventRepository.searchByTitle(query, limit, offset);
    return this._pack(result, limit, offset);
  }

  async searchAnnouncements({ query, limit, offset = 0 }) {
    const result = await announcementRepository.searchByTitle(query, limit, offset);
    return this._pack(result, limit, offset);
  }

  async searchContents({ query, limit, offset = 0 }) {
    const size = limit;
    const safeOffset = Math.max(0, offset);
    const page = Math.floor(safeOffset / size) + 1;
    const result = await contentRepository.findList({
      page,
      size,
      query,
      category: '전체',
      titleOnly: true,
    });
    return {
      ...result,
      hasMore: safeOffset + result.rows.length < result.total,
    };
  }
}

module.exports = new SearchRepository();

