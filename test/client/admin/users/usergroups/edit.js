'use strict';


describe('ACP edit user group', function () {
  it('should save changes', function (done) {
    let user;
    let adminGroup;

    TEST.browser
      .do.auth('admin_users_usergroups_edit', usr => {
        user = usr;
      })
      .fn(cb => {
        TEST.N.models.users.UserGroup.findOne({ short_name: 'administrators' }, (err, res) => {
          if (err) {
            cb(err);
            return;
          }
          adminGroup = res;
          user.usergroups.push(adminGroup._id);
          user.save(cb);
        });
      })
      .do.open(() => TEST.N.router.linkTo('admin.users.usergroups.edit', { _id: adminGroup._id }))
      .do.click('#setting_can_see_deleted_users')
      .do.click('button.btn-primary[type="submit"]')
      .do.reload()
      .test.value('#setting_can_see_deleted_users', '')
      .run(done);
  });
});
