// Delete album


'use strict';


const Promise = require('bluebird');
const numCPUs = require('os').cpus().length;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    album_id: {
      format: 'mongo',
      required: true
    }
  });


  // Fetch album info
  //
  N.wire.before(apiPath, function* fetch_album(env) {
    let album = yield N.models.users.Album
      .findOne({ _id: env.params.album_id })
      .lean(false); // Use as mongoose model

    if (!album) throw N.io.NOT_FOUND;

    // No one can edit default album
    if (album.default) throw N.io.NOT_FOUND;

    env.data.album = album;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env) {
    var album = env.data.album;

    if (env.user_info.user_id !== String(album.user)) {
      return N.io.FORBIDDEN;
    }
  });


  // Fetch album media
  //
  N.wire.before(apiPath, function* fetch_media(env) {
    env.data.album_media = yield N.models.users.MediaInfo
      .find({ album: env.data.album._id })
      .lean(false); // Use as mongoose model
  });


  // Delete album with all photos
  //
  N.wire.on(apiPath, function* delete_album(env) {
    yield Promise.map(
      env.data.album_media,
      media => N.models.users.MediaInfo.markDeleted(media.media_id, false),
      { concurrency: numCPUs }
    );

    yield env.data.album.remove();
  });
};
