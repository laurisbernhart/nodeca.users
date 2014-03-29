// Inject APC access permission into response
// Required in layout, for http requests only
//


'use strict';


var _ = require('lodash');


module.exports = function (N) {

  // Redirect to login page, if no permittions
  //
  N.wire.after('server_chain:http:*', function inject_acp_access_state(env, callback) {

    env.extras.puncher.start('fetch settings (can_access_acp)');

    env.extras.settings.fetch(['can_access_acp'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.res.settings = _.extend({}, env.res.settings, settings);

      callback();
    });
  });
};