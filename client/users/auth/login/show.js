// Login page logic
//
'use strict';


const ko = require('knockout');


// Knockout view model of the page.
let view = null;
let redirectId;
let previousPageParams = null;


// Global listener to save previous page params
//
N.wire.on('navigate.exit', function save_previous_page_params(data) {
  previousPageParams = data;
});


// Page enter
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  redirectId = data.params.redirect_id;

  view = {
    message: ko.observable(null),

    recaptcha_response_field: {
      visible:  Boolean(N.runtime.recaptcha),
      hasError: ko.observable(false),
      message:  ko.observable(null)
    }
  };

  ko.applyBindings(view, $('#content')[0]);

  return N.wire.emit('common.blocks.recaptcha.create');
});


// Setup listeners
//
N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Page exit
  //
  N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
    ko.cleanNode($('#content')[0]);
    view = null;
  });


  // Form submit
  //
  N.wire.on('users.auth.login.plain_exec', function login(form) {
    let loginParams = form.fields;

    if (redirectId) {
      loginParams.redirect_id = redirectId;
    }

    return N.io.rpc('users.auth.login.plain_exec', loginParams)
      .then(function (res) {

        // Notify other browser tabs about
        N.live.emit('local.users.auth');

        // If `redirectId` specified - use `redirect_url` form response
        if (redirectId) {
          window.location = res.redirect_url;
          return;
        }

        // If this page loaded directly - navigate to `redirect_url`
        if (!previousPageParams) {
          window.location = res.redirect_url;
          return;
        }

        // Check that previous page can be loaded, because it can return redirect or forbid access
        N.io.rpc(previousPageParams.apiPath, previousPageParams.params, { handleAllErrors: true })
          .then(() => {
            // Navigate to previous page
            window.location = N.router.linkTo(previousPageParams.apiPath, previousPageParams.params);
          })
          .catch(() => {
            window.location = res.redirect_url;
          });
      })
      .catch(err => {
        // Force captcha on every attempt.
        N.wire.emit('common.blocks.recaptcha.update');

        view.message(err.message);
      });
  });
});
