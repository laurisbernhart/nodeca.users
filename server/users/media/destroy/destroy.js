// Delete media


'use strict';


module.exports = function (N, apiPath) {


  N.validate(apiPath, {
    media_id: { format: 'mongo', required: true },
    revert:  { type: 'boolean' }
  });


  N.wire.before(apiPath, function* fetch_user_media(env) {
    let media = yield N.models.users.MediaInfo
      .findOne({ media_id: env.params.media_id })
      .lean(true);

    if (!media) {
      throw N.io.NOT_FOUND;
    }

    // Check media owner
    if (env.user_info.user_id !== String(media.user)) {
      throw N.io.FORBIDDEN;
    }

    env.data.media = media;
  });


  // Check quota
  //
  N.wire.before(apiPath, function* check_quota(env) {
    // Check quota only on restore media
    if (!env.params.revert) {
      return;
    }

    let extra = yield N.models.users.UserExtra
      .findOne({ user: env.user_info.user_id })
      .select('media_size')
      .lean(true);

    let users_media_total_quota_mb = yield env.extras.settings.fetch('users_media_total_quota_mb');

    if (users_media_total_quota_mb * 1024 * 1024 < extra.media_size) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_quota_exceeded', { quota_mb: users_media_total_quota_mb })
      };
    }
  });


  // Delete media by id
  //
  N.wire.on(apiPath, function* delete_media(env) {
    yield N.models.users.MediaInfo.markDeleted(env.data.media.media_id, env.params.revert);
  });


  // Update album info
  //
  N.wire.after(apiPath, function* update_album(env) {
    yield N.models.users.Album.updateInfo(env.data.media.album, true);
  });


  // Mark user as active
  //
  N.wire.after(apiPath, function* set_active_flag(env) {
    if (!env.user_info.active) {
      env.user_info.active = true;

      yield N.models.users.User.update(
        { _id: env.user_info.user_id },
        { $set: { active: true } }
      );
    }
  });
};
