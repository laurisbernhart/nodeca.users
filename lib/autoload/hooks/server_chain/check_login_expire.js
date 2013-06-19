// Control absolute lifetime of session by 'general_login_expire_days' setting.


'use strict';


var _ = require('lodash');


module.exports = function (N) {
  N.wire.before('server_chain:*', { priority: -70 }, function check_session_expire(env, callback) {
    if (!env.session) {
      // No session.
      callback();
      return;
    }

    if (!_.has(env.session, 'create_time')) {
      // No timestamp.
      callback();
      return;
    }

    N.settings.get('general_login_expire_days', {}, function (err, expireDays) {
      if (err) {
        callback(err);
        return;
      }

      if (0 === expireDays) {
        // No limitation for login lifetime.
        callback();
        return;
      }

      if (Date.now() < (env.session.create_time + expireDays * 24 * 60 * 60 * 1000)) {
        // Login is still valid.
        callback();
        return;
      }

      // Login expired - delete loaded session. (new session will be created)
      env.session = null;
      callback();
    });
  });


  N.wire.before('server_chain:*', { priority: -50 }, function set_session_create_time(env) {
    if (!env.session) {
      // No session.
      return;
    }
    
    if (_.has(env.session, 'create_time')) {
      // Session already has a timestamp.
      return;
    }

    env.session.create_time = Date.now();
  });
};