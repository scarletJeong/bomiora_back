const productRepository = require('../../shopping/product/repositories/ProductRepository');
const contentRepository = require('../../content/repositories/ContentRepository');
const eventRepository = require('../../shopping/event/repositories/EventRepository');

class SearchRepository {
  async searchProducts({ query, itKind, limit }) {
    return productRepository.searchByKeyword(query, itKind, limit);
  }

  async searchEvents({ query, limit }) {
    return eventRepository.searchByTitle(query, limit);
  }

  async searchContents({ query, limit }) {
    // ContentRepository는 page/size 기반
    const result = await contentRepository.findList({
      page: 1,
      size: limit,
      query,
      category: '전체',
      titleOnly: true,
    });
    return result;
  }
}

module.exports = new SearchRepository();

