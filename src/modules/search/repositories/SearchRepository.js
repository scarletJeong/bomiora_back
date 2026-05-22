const productRepository = require('../../shopping/product/repositories/ProductRepository');
const contentRepository = require('../../content/repositories/ContentRepository');

class SearchRepository {
  async searchProducts({ query, itKind, limit }) {
    return productRepository.searchByKeyword(query, itKind, limit);
  }

  async searchContents({ query, limit }) {
    // ContentRepository는 page/size 기반
    const result = await contentRepository.findList({
      page: 1,
      size: limit,
      query,
      category: '전체',
    });
    return result;
  }
}

module.exports = new SearchRepository();

