// Create album


'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    title: {
      type: 'string',
      minLength: 1,
      required: true
    }
  });


  // Check auth
  // TODO: Add permissions check
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (env.user_info.is_guest) throw N.io.FORBIDDEN;
  });


  N.wire.on(apiPath, function* create_user_album(env) {
    var album = new N.models.users.Album();
    album.user = env.user_info.user_id;
    album.title = env.params.title;
    album.last_ts = new Date();

    yield album.save();

    env.res.album = album;
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
