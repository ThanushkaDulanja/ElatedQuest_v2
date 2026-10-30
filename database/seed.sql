-- Blog Platform - starter data. Run ONCE on a new database, right after schema.sql.
-- (Categories and pages are re-runnable; menu_items and social_links are not,
-- so running it twice would duplicate them.)
-- The owner user is NOT seeded here: it is created at runtime from OWNER_EMAIL.
USE blog_platform;
SET NAMES utf8mb4;

-- Keep the category list short (10-15). Use tags for finer topics.
INSERT INTO categories (name, slug, description, sort_order, show_in_nav) VALUES
  ('Animals',     'animals',     'Pets, wildlife and funny animal moments.', 1, 1),
  ('Art',         'art',         'Painting, sculpture, design and illustration.', 2, 1),
  ('Funny',       'funny',       'Stories and pictures that make you smile.', 3, 1),
  ('Photography', 'photography', 'Photo stories from around the world.', 4, 1),
  ('Inspiration', 'inspiration', 'People and stories that lift you up.', 5, 1),
  ('Creativity',  'creativity',  'Ideas, crafts and creative projects.', 6, 1),
  ('Life',        'life',        'Family, health and everyday life.', 7, 1),
  ('Other',       'other',       'Everything else.', 99, 0)
ON DUPLICATE KEY UPDATE description = VALUES(description), sort_order = VALUES(sort_order);

-- Static pages. Edit the text in /aadmin/pages. These are starter outlines only.
INSERT INTO pages (slug, title, content_html) VALUES
  ('about-us', 'About Us',
   '<p>Tell readers who you are, what the site covers and why you started it.</p><h2>Our mission</h2><p>One or two sentences.</p><h2>Meet the team</h2><p>Link to your author pages.</p>'),
  ('contact-us', 'Contact Us',
   '<p>We read every message. Use the form below to send a message, or choose Send a story to share your own story. You can also write to us at the email address shown.</p>'),
  ('story-terms', 'Story Submission Terms',
   '<ol><li>Your story must be your own work. If it is not, it must be properly credited.</li><li>Every picture, quote or extract from another source must be referenced.</li><li>Use a clear heading. Keep the story under 2000 words.</li><li>We may edit your story for quality, length and clarity.</li><li>Publishing is at the sole discretion of our editorial team.</li><li>Sending a story is voluntary. You are responsible for the accuracy of what you send.</li></ol>'),
  ('privacy-policy', 'Privacy Policy',
   '<p>Replace with your privacy policy: analytics, ads and cookies, email collection, comments, services used and a contact address.</p>'),
  ('image-use-policy', 'Image Use Policy',
   '<p>Explain how images are used and credited, and how a rights holder can ask for a credit change or removal.</p>'),
  ('dmca-removal', 'DMCA and Copyright Removal',
   '<p>Explain how a copyright holder can report content, what information the notice must contain, and how you respond.</p>'),
  ('join-us', 'Join Us',
   '<p>Describe open roles and how to apply by email.</p>'),
  ('terms', 'Terms of Use',
   '<p>Replace with your terms of use.</p>')
ON DUPLICATE KEY UPDATE title = VALUES(title);

-- Menus. Footer and top menus can be edited in /aadmin/settings (Social and menus).
INSERT INTO menu_items (location, label, url, sort_order) VALUES
  ('top',    'Image Use Policy', '/image-use-policy', 1),
  ('top',    'Privacy Policy',   '/privacy-policy',   2),
  ('top',    'About Us',         '/about-us',         3),
  ('top',    'Contact Us',       '/contact-us',       4),
  ('footer', 'Home',             '/',                 1),
  ('footer', 'Saved stories',    '/saved',            2),
  ('footer', 'Surprise me',      '/random',           3),
  ('footer', 'Join Us',          '/join-us',          4),
  ('footer', 'DMCA and Copyright Removal', '/dmca-removal', 5),
  ('footer', 'Terms of Use',     '/terms',            6);

-- Social links: replace the URLs with your real profiles in the admin.
INSERT INTO social_links (platform, label, url, followers_label, show_in_top_bar, show_in_footer, show_in_stay_connected, sort_order) VALUES
  ('facebook',  'Facebook',  'https://www.facebook.com/yourpage',  NULL, 1, 1, 1, 1),
  ('instagram', 'Instagram', 'https://www.instagram.com/yourpage', NULL, 1, 1, 1, 2),
  ('pinterest', 'Pinterest', 'https://www.pinterest.com/yourpage', NULL, 1, 1, 0, 3),
  ('x',         'X',         'https://x.com/yourpage',             NULL, 1, 1, 0, 4),
  ('youtube',   'YouTube',   'https://www.youtube.com/@yourpage',  NULL, 1, 1, 0, 5);

INSERT INTO site_settings (setting_key, setting_value) VALUES
  ('general', JSON_OBJECT(
      'siteName', 'Your Blog', 'tagline', 'Stories worth sharing',
      'contactEmail', 'hello@yourblog.com', 'submissionsEmail', 'submit@yourblog.com',
      'businessName', 'Your Business Name', 'address', 'Street, City, Country',
      'timezone', 'UTC', 'footerBlurb', 'Write two short sentences about your site.')),
  ('editors_can_publish', JSON_OBJECT('value', FALSE)),
  ('blogger_auto_sync',   JSON_OBJECT('value', TRUE)),
  ('comments', JSON_OBJECT('moderation', 'first_time', 'maxDepth', 3, 'closeAfterDays', 0, 'blocklist', JSON_ARRAY())),
  ('share_networks', JSON_ARRAY('facebook','x','pinterest','whatsapp','linkedin','reddit','telegram','email','copy')),
  ('ads', JSON_OBJECT('provider', 'adsense', 'publisherId', '', 'slots', JSON_OBJECT(
      'home_feed', JSON_OBJECT('enabled', FALSE, 'slotId', ''),
      'post_after_p3', JSON_OBJECT('enabled', FALSE, 'slotId', ''),
      'post_end', JSON_OBJECT('enabled', FALSE, 'slotId', ''),
      'post_sidebar', JSON_OBJECT('enabled', FALSE, 'slotId', ''))))
ON DUPLICATE KEY UPDATE setting_key = setting_key;
