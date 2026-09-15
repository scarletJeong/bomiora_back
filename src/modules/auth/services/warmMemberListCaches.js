function warmMemberListCaches(mbId) {
  const id = String(mbId || '').trim();
  if (!id) return;
  try {
    require('../../shopping/wish/controllers/WishController').warmList(id);
  } catch (_) {}
  try {
    require('../../user/address/controllers/AddressController').warmList(id);
  } catch (_) {}
  try {
    require('../../user/notification/repositories/NotificationRepository').warmSettings(id);
  } catch (_) {}
  try {
    require('../../shopping/recent_view/controllers/RecentViewController').warmList(id, 4);
  } catch (_) {}
}

module.exports = { warmMemberListCaches };
