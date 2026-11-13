-- Elated Quest - starter data. Run ONCE on a new database, right after schema.sql.
-- (Categories and pages are re-runnable; menu_items and social_links are not,
-- so running it twice would duplicate them.)
-- The owner user is NOT seeded here: it is created at runtime from OWNER_EMAIL.
USE elatedquest;
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
   '<p>Elated Quest shares stories, ideas, and perspectives across culture, nature, travel, creativity, and everyday life.</p><h2>Our mission</h2><p>We make room for thoughtful, useful, and entertaining stories from writers and contributors. Each submission is reviewed before it appears on the site.</p><h2>Share your story</h2><p>Have a story to tell? <a href="/contact-us?type=story">Send it to our editors</a>.</p>'),
  ('contact-us', 'Contact Us',
   '<p>We read every message. Use the form below to send a message, or choose Send a story to share your own story. You can also write to us at the email address shown.</p>'),
  ('story-terms', 'Story Submission Terms',
   '<ol><li>Your story must be your own work. If it is not, it must be properly credited.</li><li>Every picture, quote or extract from another source must be referenced.</li><li>Use a clear heading. Keep the story under 2000 words.</li><li>We may edit your story for quality, length and clarity.</li><li>Publishing is at the sole discretion of our editorial team.</li><li>Sending a story is voluntary. You are responsible for the accuracy of what you send.</li></ol>'),
  ('privacy-policy', 'Privacy Policy',
   '<p>This policy explains how Elated Quest handles information when you read stories or contact our team. Our privacy practices reflect the features enabled on this site.</p><h2>Information you provide</h2><p>When you leave a comment, send a message, or submit a story, we receive the name, email address, and content you provide. We use a pseudonymous identifier to help prevent abuse and apply submission limits. Your email address is not shown publicly.</p><h2>Cookies and service providers</h2><p>Essential cookies support sign-in security and form protection. Optional analytics and advertising are controlled by the site settings and consent choices where required. Depending on which features are enabled, service providers may include Google sign-in or Blogger, the configured email provider, Plausible analytics, and the configured advertising provider. They receive only information needed to provide those services and apply their own privacy terms.</p><h2>How we use and keep information</h2><p>We use submitted information to publish and moderate comments, review stories, respond to messages, protect the site, and operate enabled services. We keep it while needed for those purposes and may retain records where required for security or legal reasons.</p><h2>Your choices</h2><p>You can ask us to access, correct, or delete information you sent us. For a request, use the Contact Us page. You can also change optional cookie choices from the Cookie settings link when it is available.</p><h2>Contact</h2><p>Questions about this policy? <a href="/contact-us">Contact the Elated Quest team</a>.</p>'),
  ('image-use-policy', 'Image Use Policy',
   '<p>Images help readers understand and enjoy our stories. Images on Elated Quest may be created by our team, supplied by a contributor, or used with permission or under a license. Where credit details are available, we display the credit with the image.</p><h2>Using images in a submission</h2><p>Only submit images you created or have permission to publish. Include the creator name and source link when a credit is required. Do not remove watermarks or rights notices.</p><h2>Credit, correction, or removal requests</h2><p>If you own an image or represent its rights holder and believe an image needs a credit change or removal, contact us with the story URL, image location, your relationship to the work, and the requested action. We will review the request and follow up.</p><p><a href="/contact-us">Contact us about an image</a>.</p>'),
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
  ('facebook',  'Facebook',  'https://www.facebook.com/elatedquest',  NULL, 1, 1, 1, 1),
  ('instagram', 'Instagram', 'https://www.instagram.com/elatedquest', NULL, 1, 1, 1, 2),
  ('pinterest', 'Pinterest', 'https://www.pinterest.com/elatedquest', NULL, 1, 1, 0, 3),
  ('x',         'X',         'https://x.com/elatedquest',             NULL, 1, 1, 0, 4),
  ('youtube',   'YouTube',   'https://www.youtube.com/@elatedquest',  NULL, 1, 1, 0, 5);

INSERT INTO site_settings (setting_key, setting_value) VALUES
  ('general', JSON_OBJECT(
      'siteName', 'Elated Quest', 'tagline', 'Stories worth sharing',
      'contactEmail', 'hello@elatedquest.com', 'submissionsEmail', 'submit@elatedquest.com',
      'businessName', 'Elated Quest', 'address', 'Street, City, Country',
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
