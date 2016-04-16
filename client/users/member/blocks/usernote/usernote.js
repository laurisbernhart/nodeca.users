'use strict';


const _     = require('lodash');
const bagjs = require('bagjs');

// if we're on profile page, it equals to the hid of the user
// profile page belongs to; otherwise it's 0
let profile_user_hid = 0;


N.wire.on('navigate.done:users.member', function usernotes_setup(data) {
  profile_user_hid = data.params.user_hid;
});

N.wire.on('navigate.exit:users.member', function usernotes_teardown() {
  profile_user_hid = 0;
});


// Init user notes
//
N.wire.once('navigate.done:users.member', function init_usernotes() {
  let bag = bagjs({ prefix: 'nodeca_usernotes', expire: 24 /* hours */ });

  let draft;
  let draftKey;
  let parseOptions;
  let origText;
  let origVersion;

  // Load mdedit
  //
  N.wire.before(module.apiPath + ':edit', function load_mdedit(__, callback) {
    N.loader.loadAssets('mdedit', callback);
  });


  // Fetch draft data
  //
  N.wire.before(module.apiPath + ':edit', function fetch_draft(data) {
    // current user
    let from_hid = N.runtime.user_hid;

    // user whose profile is being edited
    let to_hid = data.$this.data('user-hid');

    draftKey = [ 'usernote', from_hid, to_hid ].join('_');
    draft = {};

    return bag.get(draftKey)
      .then(data => { draft = data || {}; })
      .catch(() => {}); // Suppress storage errors
  });


  // Fetch old note
  //
  // TODO: we can embed all this data to DOM and get it from there instead,
  //       saving 1 rpc request
  //
  N.wire.before(module.apiPath + ':edit', function fetch_note(data) {
    let user_hid = data.$this.data('user-hid');

    return N.io.rpc('users.member.blocks.usernote.get', {
      user_hid
    }).then(response => {
      origText     = response.txt;
      origVersion  = response.version;
      parseOptions = response.parse_options;
    });
  });


  // Show editor and add handlers for editor events
  //
  N.wire.on(module.apiPath + ':edit', function show_editor(data) {
    let user_hid   = data.$this.data('user-hid');
    let user_nick  = data.$this.data('user-nick');

    let $editor = N.MDEdit.show({
      text: (draft.text && draft.version === origVersion) ? draft.text : origText,
      parseOptions
    });

    $editor
      .on('show.nd.mdedit', () => {
        let title = t('editor_title', {
          nick: _.escape(user_nick),
          url: N.router.linkTo('users.member', { user_hid })
        });

        $editor.find('.mdedit-header__caption').html(title);
      })
      .on('change.nd.mdedit', () => {
        bag.set(draftKey, {
          text:    N.MDEdit.text(),
          version: origVersion
        });
      })
      .on('submit.nd.mdedit', () => {
        let rpc_method, rpc_params, txt = N.MDEdit.text();

        if (txt.trim()) {
          rpc_method = 'users.member.blocks.usernote.update';
          rpc_params = { user_hid, txt };
        } else {
          // if the note is empty, delete it instead
          rpc_method = 'users.member.blocks.usernote.delete';
          rpc_params = { user_hid };
        }

        N.io.rpc(rpc_method, rpc_params)
          .then(response => {
            bag.remove(draftKey)
              .catch(() => {}) // Suppress storage errors
              .then(() => {
                N.MDEdit.hide();

                if (profile_user_hid === user_hid) {
                  // if we're still on the same page, update the note
                  $('.usernote').replaceWith(N.runtime.render(module.apiPath, response));
                  return;
                }

                // otherwise show a completion message to user
                return N.wire.emit('notify', { type: 'info', message: t('update_notice') });
              });
          })
          .catch(err => N.wire.emit('error', err));

        return false;
      });
  });


  // Confirmation dialog
  //
  N.wire.before(module.apiPath + ':remove', function remove_note() {
    return N.wire.emit('common.blocks.confirm', t('remove_confirm'));
  });


  // Remove a note
  //
  N.wire.on(module.apiPath + ':remove', function remove_note(data) {
    let user_hid = data.$this.data('user-hid');

    return N.io.rpc('users.member.blocks.usernote.delete', { user_hid })
      .then(response => {
        $('.usernote').replaceWith(N.runtime.render(module.apiPath, response));
      });
  });
});