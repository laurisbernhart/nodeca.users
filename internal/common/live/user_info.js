// Add user info loader helper
//
//   data.getUserInfo(function (err, user_info) {
//     // ...
//   });
//
'use strict';


const Promise  = require('bluebird');
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.before('internal.live.*', { priority: -100 }, function add_user_loader(data) {
    data.getUserInfo = Promise.coroutine(function* () {
      // If `user_info` already loaded - skip
      if (data.__user_info__ || data.__user_info__ === null) {
        return data.__user_info__;
      }

      // Fetch session ID from token record
      let session_id = yield N.redis.getAsync('token_live:' + data.message.token);

      // Fetch session
      let token_login = yield N.models.users.TokenLogin.findOne()
                                  .where('session_id').equals(session_id)
                                  .select('_id user')
                                  .lean(true);

      // If token not found
      if (!token_login) {
        data.__user_info__ = null;
        return data.__user_info__;
      }

      data.__user_info__ = yield userInfo(N, token_login.user);

      return data.__user_info__;
    });
  });
};
