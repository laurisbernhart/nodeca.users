// Store the preference locale in cookies and (if available) session to use
// on next requests.


'use strict';


var _ = require('lodash');


var LOCALE_COOKIE_MAX_AGE = 0xFFFFFFFF; // Maximum 32-bit unsigned integer.


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    locale: { type: 'string' }
  });

  N.wire.on(apiPath, function set_language(env, callback) {
    var locale = env.params.locale;

    if (!_.contains(N.config.locales.enabled, env.params.locale)) {
      // User sent a non-existent or disabled locale - reply with the default.
      locale = N.config.locales['default'];
    }

    env.extras.setCookie('locale', locale, {
      path: '/'
    , maxAge: LOCALE_COOKIE_MAX_AGE
    });

    if (env.session) {
      env.session.locale = locale;
    }

    if (env.session && env.session.user_id) {
      N.models.users.User.update({ _id: env.session.user_id }, { locale: locale }, callback);
    } else {
      callback();
    }
  });
};