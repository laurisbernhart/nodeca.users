// Select list of users, starting by pattern.
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    nick: { type: 'string', required: true, minLength: 1 }
  });


  // Check user permissions
  //
  N.wire.before(apiPath, function check_permissions(env) {
    if (env.user_info.is_guest) throw N.io.NOT_FOUND;
  });


  // Find users and fill response
  //
  N.wire.on(apiPath, function* find_users(env) {
    let users = yield N.models.users.User.find()
                          .where('nick').regex(new RegExp('^' + _.escapeRegExp(env.params.nick), 'i'))
                          .where('exists').equals(true)
                          .limit(10)
                          .select('_id name nick')
                          .lean(true);

    users = _.filter(users, u => String(u._id) !== env.user_info.user_id); // exclude current user

    env.res = users;
  });
};
