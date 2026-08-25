/** 이미지 multipart 업로드 공통 한도 (nginx client_max_body_size 도 20m 이상 권장) */
const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

module.exports = {
  IMAGE_UPLOAD_MAX_BYTES,
  multerImageLimits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
};
