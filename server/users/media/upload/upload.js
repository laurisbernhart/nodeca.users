// Upload media handler for uploading files via POST request
//
'use strict';


const path        = require('path');
const formidable  = require('formidable');
const tmpDir      = require('os').tmpdir();
const _           = require('lodash');
const mime        = require('mime-types').lookup;
const resizeParse = require('../../../_lib/resize_parse');
const unlink      = require('mz/fs').unlink;


module.exports = function (N, apiPath) {

  const config = resizeParse(N.config.users.uploads);

  // CSRF comes in post data and checked separately
  N.validate(apiPath, {
    album_id: { format: 'mongo' }
  });


  // Fetch album info (by album_id). Fetch default album if album_id not specified
  //
  N.wire.before(apiPath, function* fetch_album(env) {
    let queryParams = env.params.album_id ?
                      { _id: env.params.album_id, user: env.user_info.user_id } :
                      { user: env.user_info.user_id, 'default': true };

    let album = yield N.models.users.Album
                          .findOne(queryParams)
                          .lean(true);

    if (!album) {
      throw {
        code:    N.io.CLIENT_ERROR,
        message: env.t('err_album_not_found')
      };
    }

    env.data.album = album;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    let users_can_upload_media = yield env.extras.settings.fetch('users_can_upload_media');

    if (!users_can_upload_media) {
      throw {
        code:    N.io.CLIENT_ERROR,
        message: env.t('err_permission')
      };
    }
  });


  // Check file size early by header and terminate immediately for big uploads
  //
  N.wire.before(apiPath, function* check_file_size(env) {
    // `Content-Length` = (files + wrappers) + (params + wrappers)
    //
    // When single big file sent, `Content-Length` ~ FileSize.
    // Difference is < 200 bytes.
    let size = env.origin.req.headers['content-length'];

    if (!size) {
      throw N.io.LENGTH_REQUIRED;
    }

    let users_media_single_quota_kb = yield env.extras.settings.fetch('users_media_single_quota_kb');

    if (size > users_media_single_quota_kb * 1024) {
      throw {
        code:    N.io.CLIENT_ERROR,
        message: env.t('err_file_size', { max_size_kb: users_media_single_quota_kb })
      };
    }
  });


  // Check quota
  //
  N.wire.before(apiPath, function* check_quota(env) {
    let extra = yield N.models.users.UserExtra
                          .findOne({ user: env.user_info.user_id })
                          .select('media_size')
                          .lean(true);
    let users_media_total_quota_mb = yield env.extras.settings.fetch('users_media_total_quota_mb');

    if (users_media_total_quota_mb * 1024 * 1024 < extra.media_size) {
      throw {
        code:    N.io.CLIENT_ERROR,
        message: env.t('err_quota_exceeded', { quota_mb: users_media_total_quota_mb })
      };
    }
  });


  // Fetch post body with files via formidable
  //
  N.wire.before(apiPath, function upload_media(env, callback) {
    let form = new formidable.IncomingForm();

    form.uploadDir = tmpDir;

    form.on('progress', (bytesReceived, contentLength) => {

      // Terminate connection if `Content-Length` header is fake
      if (bytesReceived > contentLength) {
        form._error(new Error('Data size too big (should be equal to Content-Length)'));
      }
    });

    form.parse(env.origin.req, (err, fields, files) => {
      files = _.toArray(files);

      function fail(err) {
        // Don't care unlink result, forward previous error
        files.forEach(f => unlink(f.path).catch(() => {}));
        callback(err);
      }

      // In this callback also will be 'aborted' error
      if (err) {
        fail(err);
        return;
      }

      // Check CSRF
      if (!env.session.token_csrf || !fields.csrf || (env.session.token_csrf !== fields.csrf)) {
        fail({
          code: N.io.INVALID_CSRF_TOKEN,
          data: { token: env.session.token_csrf }
        });
        return;
      }

      // Should never happens - uploader send only one file
      if (files.length !== 1) {
        fail(new Error('Only one file allowed on single upload request'));
        return;
      }

      let fileInfo = files[0];

      // Usually file size and type are checked on client side,
      // but we must check it on server side for security reasons
      let allowedTypes = _.map(config.extensions, ext => mime(ext));

      if (allowedTypes.indexOf(fileInfo.type) === -1) {
        // Fallback attempt: FF can send strange mime,
        // `application/x-zip-compressed` instead of `application/zip`
        // Try to fix it.
        let mimeByExt = mime(path.extname(fileInfo.name).slice(1));

        if (allowedTypes.indexOf(mimeByExt) === -1) {
          fail({
            code: N.io.CLIENT_ERROR,
            message: env.t('err_invalid_ext', { file_name: fileInfo.name })
          });
          return;
        }

        fileInfo.type = mimeByExt;
      }

      env.data.upload_file_info = fileInfo;
      callback();
    });
  });


  // Create image/binary (for images previews created automatically)
  //
  N.wire.on(apiPath, function* save_media(env) {
    let fileInfo = env.data.upload_file_info;

    try {
      let media = yield N.models.users.MediaInfo.createFile({
        album_id: env.data.album._id,
        user_id: env.user_info.user_id,
        path: fileInfo.path,
        name: fileInfo.name,
        // In case of blob fileInfo.name will be 'blob'.
        // Get extension from fileInfo.type.
        ext: fileInfo.type.split('/').pop()
      });

      env.res.media = media;
      env.data.media = media;
    } catch (err) {
      yield unlink(fileInfo.path);
      throw err;
    }

    // Remove file after upload to gridfs
    yield unlink(fileInfo.path);
  });


  // Update album info
  //
  N.wire.after(apiPath, function* update_album_info(env) {
    yield N.models.users.Album.updateInfo(env.data.album._id);
  });


  // Update cover for default album
  //
  N.wire.after(apiPath, function* update_default(env) {
    if (!env.data.album.default) {
      return;
    }

    let mTypes = N.models.users.MediaInfo.types;
    let media = env.data.media;

    if (media.type !== mTypes.IMAGE) {
      return;
    }

    yield N.models.users.Album.update({ _id: env.data.album._id }, { cover_id: media.media_id });
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
