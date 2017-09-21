import { withPluginApi } from 'discourse/lib/plugin-api';
import { observes } from 'ember-addons/ember-computed-decorators';
import Category from 'discourse/models/category';
import SiteHeader from 'discourse/components/site-header';

export default {
  name: 'category-moderator-edits',
  after: 'subscribe-user-notifications',

  initialize(container) {
    const user = container.lookup('current-user:main');
    const bus = container.lookup('message-bus:main');

    withPluginApi('0.8.10', api => {
      api.modifyClass('route:queued-posts', {
        redirect() {
          const moderatorCategoryId = this.get('currentUser.moderator_category_id');
          let filter = moderatorCategoryId ? 'category' : 'all';
          this.replaceWith('/queued-posts/' + filter);
        },

        setupController(controller) {
          const moderatorCategoryId = this.get('currentUser.moderator_category_id');
          if (moderatorCategoryId) {
            controller.set('moderatorCategory', Category.findById(moderatorCategoryId));
          }
        }
      });
    });

    if (user && user.get('moderator_category_id')) {

      bus.unsubscribe('/flagged_counts');
      bus.subscribe('/category_flagged_counts', data => {
        user.set('category_flagged_posts_count', data.total);
      });

      bus.unsubscribe('/queue_counts');
      bus.subscribe('/category_queue_counts', data => {
        user.set('post_queue_new_category_count', data.total);
      });

      SiteHeader.reopen({
        buildArgs() {
          const flaggedPostsCount = this.get('currentUser.category_flagged_posts_count');
          const queuedPostsCount = this.get('currentUser.post_queue_new_category_count');
          return {
            flagCount: flaggedPostsCount + queuedPostsCount,
            topic: this._topic,
            canSignUp: this.get('canSignUp')
          };
        },

        @observes('currentUser.category_flagged_posts_count', 'currentUser.post_queue_new_category_count')
        refreshCategoryFlagCount() {
          this.queueRerender();
        }
      });

      withPluginApi('0.8.8', api => {
        api.reopenWidget('hamburger-menu', {
          adminLinks: function() {
            const { currentUser } = this;

            const links = [{ route: 'admin', className: 'admin-link', icon: 'wrench', label: 'admin_title' },
                           { href: '/admin/flags/category',
                             className: 'flagged-posts-link',
                             icon: 'flag',
                             label: 'flags_title',
                             badgeClass: 'flagged-posts',
                             badgeTitle: 'notifications.total_flagged',
                             badgeCount: 'category_flagged_posts_count' }];

            if (currentUser.show_queued_posts) {
              links.push({ href: '/queued-posts/category',
                           className: 'queued-posts-link',
                           label: 'queue.title',
                           badgeCount: 'post_queue_new_category_count',
                           badgeClass: 'queued-posts' });
            }

            if (currentUser.admin) {
              links.push({ href: '/admin/site_settings/category/required',
                           icon: 'gear',
                           label: 'admin.site_settings.title',
                           className: 'settings-link' });
            }

            return links.map(l => this.attach('link', l));
          }
        });
      });

      const AdminFlagIndexRoute = requirejs('admin/routes/admin-flags-index').default;
      const AdminFlagListRoute = requirejs('admin/routes/admin-flags-list').default;
      const AdminFlagListController = requirejs('admin/controllers/admin-flags-list').default;

      AdminFlagIndexRoute.reopen({
        redirect() {
          const moderatorCategoryId = this.get('currentUser.moderator_category_id');
          let filter = moderatorCategoryId ? 'category' : 'active';
          this.replaceWith('adminFlags.list', filter);
        }
      });

      AdminFlagListRoute.reopen({
        setupController(controller, model) {
          const moderatorCategoryId = this.get('currentUser.moderator_category_id');
          let posts = model;

          if (this.filter === 'category' && moderatorCategoryId) {
            posts = model.filter((p) => {
              return p.topicLookup[p.topic_id].category_id === moderatorCategoryId;
            });
          }

          controller.set('model', posts);
          controller.set('query', this.filter);
        }
      });

      AdminFlagListController.reopen({
        adminCategoryFlagsView: Em.computed.equal("query", "category")
      });
    }
  }
};
