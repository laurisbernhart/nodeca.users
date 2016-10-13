// Create video to album
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    album_id: { format: 'mongo', required: true },
    media_url: { type: 'string', required: true }
  });


  // Fetch album info (by album_id)
  //
  N.wire.before(apiPath, function* fetch_album(env) {
    let album = yield N.models.users.Album
                          .findOne({ _id: env.params.album_id })
                          .lean(true);

    if (!album) {
      throw N.io.NOT_FOUND;
    }

    env.data.album = album;
  });


  // Check is current user owner of album
  //
  N.wire.before(apiPath, function check_permissions(env) {
    if (env.user_info.user_id !== String(env.data.album.user)) {
      return N.io.FORBIDDEN;
    }
  });


  // Create media by media_url
  //
  N.wire.on(apiPath, function* create_media(env) {
    let data = {};

    yield N.wire.emit('internal:users.album.create_embedza', data);


    // Get thumb url
    //
    let thumb;

    try {
      thumb = yield data.embedza.render(env.params.media_url, 'thumb_url');
    } catch (__) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('err_cannot_parse') };
    }

    if (!thumb) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('err_invalid_url') };
    }


    // Get video
    //
    let block;

    try {
      block = yield data.embedza.render(env.params.media_url, 'block');
    } catch (__) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('err_cannot_parse') };
    }

    if (!block) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('err_invalid_url') };
    }


    // Create MediaInfo
    //
    let media = new N.models.users.MediaInfo();

    media.medialink_html = block.html;
    media.medialink_meta = { thumb: thumb.html };
    media.user = env.data.album.user;
    media.album = env.data.album._id;
    media.type = N.models.users.MediaInfo.types.MEDIALINK;

    // In case of medialink, we have no file, but we should specify file_id for media page
    media.media_id = media._id;

    env.res.media = media;

    yield media.save();
  });


  // Update album info
  //
  N.wire.after(apiPath, function* update_album_info(env) {
    yield N.models.users.Album.updateInfo(env.data.album._id);
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
