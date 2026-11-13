-- =====================================================================
-- ElatedQuest - MySQL 8.0 schema (InnoDB, utf8mb4)
-- Run in MySQL Workbench: File > Open SQL Script > Execute (lightning icon).
-- Then Database > Reverse Engineer to see the EER diagram.
-- Source of truth for the database. Any change = new file in
-- src/db/migrations/ AND an update of this file AND docs/SPEC.md.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS elatedquest
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE elatedquest;
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. People and access
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(190)    NOT NULL,
  display_name   VARCHAR(120)    NULL,
  role           ENUM('owner','editor')                 NOT NULL DEFAULT 'editor',
  status         ENUM('invited','active','disabled')    NOT NULL DEFAULT 'invited',
  invited_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_invited_by (invited_by),
  CONSTRAINT fk_users_invited_by FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  file_name    VARCHAR(190)    NOT NULL,
  url_path     VARCHAR(500)    NOT NULL,
  mime         VARCHAR(50)     NOT NULL,
  width        INT UNSIGNED    NULL,
  height       INT UNSIGNED    NULL,
  size_bytes   INT UNSIGNED    NOT NULL DEFAULT 0,
  alt_text     VARCHAR(255)    NULL,
  credit_text  VARCHAR(255)    NULL,
  credit_url   VARCHAR(500)    NULL,
  uploaded_by  BIGINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_media_uploaded_by (uploaded_by),
  CONSTRAINT fk_media_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS authors (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NULL,
  display_name    VARCHAR(120)    NOT NULL,
  slug            VARCHAR(100)    NOT NULL,
  bio             TEXT            NULL,
  avatar_media_id BIGINT UNSIGNED NULL,
  is_guest        TINYINT(1)      NOT NULL DEFAULT 0,
  show_on_about   TINYINT(1)      NOT NULL DEFAULT 0,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_authors_slug (slug),
  UNIQUE KEY uq_authors_user (user_id),
  KEY ix_authors_avatar (avatar_media_id),
  CONSTRAINT fk_authors_user   FOREIGN KEY (user_id)         REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_authors_avatar FOREIGN KEY (avatar_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind        ENUM('email_link','owner_link') NOT NULL,
  email       VARCHAR(190)    NOT NULL,
  token_hash  CHAR(64)        NOT NULL,
  expires_at  DATETIME        NOT NULL,
  used_at     DATETIME        NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_login_tokens_hash (token_hash),
  KEY ix_login_tokens_expires (expires_at)
) ENGINE=InnoDB;

-- Created and used by the express-mysql-session package. Declared here so it
-- appears in the ER diagram and is created in every environment.
CREATE TABLE IF NOT EXISTS sessions (
  session_id  VARCHAR(128) NOT NULL,
  expires     INT UNSIGNED NOT NULL,
  data        MEDIUMTEXT   NULL,
  PRIMARY KEY (session_id),
  KEY ix_sessions_expires (expires)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Content
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(80)     NOT NULL,
  slug         VARCHAR(100)    NOT NULL,
  description  VARCHAR(300)    NULL,
  sort_order   INT             NOT NULL DEFAULT 0,
  show_in_nav  TINYINT(1)      NOT NULL DEFAULT 1,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tags (
  id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name  VARCHAR(60)     NOT NULL,
  slug  VARCHAR(80)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS posts (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title                VARCHAR(160)    NOT NULL,
  slug                 VARCHAR(100)    NOT NULL,
  excerpt              VARCHAR(300)    NULL,
  content_html         MEDIUMTEXT      NULL,
  content_text         MEDIUMTEXT      NULL,
  cover_media_id       BIGINT UNSIGNED NULL,
  category_id          BIGINT UNSIGNED NULL,
  author_id            BIGINT UNSIGNED NOT NULL,
  created_by           BIGINT UNSIGNED NULL,
  status               ENUM('draft','in_review','scheduled','published','archived') NOT NULL DEFAULT 'draft',
  published_at         DATETIME        NULL,
  scheduled_at         DATETIME        NULL,
  reading_minutes      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  seo_title            VARCHAR(70)     NULL,
  seo_description      VARCHAR(170)    NULL,
  og_media_id          BIGINT UNSIGNED NULL,
  canonical_url        VARCHAR(500)    NULL,
  is_featured          TINYINT(1)      NOT NULL DEFAULT 0,
  is_editor_pick       TINYINT(1)      NOT NULL DEFAULT 0,
  allow_comments       TINYINT(1)      NOT NULL DEFAULT 1,
  review_note          TEXT            NULL,
  blogger_post_id      VARCHAR(64)     NULL,
  blogger_url          VARCHAR(500)    NULL,
  blogger_sync_status  ENUM('none','pending','synced','failed') NOT NULL DEFAULT 'none',
  blogger_attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  blogger_last_error   VARCHAR(500)    NULL,
  blogger_synced_at    DATETIME        NULL,
  view_count           INT UNSIGNED    NOT NULL DEFAULT 0,
  comment_count        INT UNSIGNED    NOT NULL DEFAULT 0,
  rating_count         INT UNSIGNED    NOT NULL DEFAULT 0,
  rating_sum           INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_posts_slug (slug),
  KEY ix_posts_status_published (status, published_at),
  KEY ix_posts_category (category_id, status, published_at),
  KEY ix_posts_author (author_id, status, published_at),
  KEY ix_posts_flags (is_featured, is_editor_pick),
  KEY ix_posts_scheduled (status, scheduled_at),
  KEY ix_posts_created_by (created_by),
  KEY ix_posts_cover (cover_media_id),
  KEY ix_posts_og (og_media_id),
  FULLTEXT KEY ft_posts_search (title, excerpt, content_text),
  CONSTRAINT fk_posts_cover    FOREIGN KEY (cover_media_id) REFERENCES media (id)      ON DELETE SET NULL,
  CONSTRAINT fk_posts_og       FOREIGN KEY (og_media_id)    REFERENCES media (id)      ON DELETE SET NULL,
  CONSTRAINT fk_posts_category FOREIGN KEY (category_id)    REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_posts_author   FOREIGN KEY (author_id)      REFERENCES authors (id)    ON DELETE RESTRICT,
  CONSTRAINT fk_posts_created  FOREIGN KEY (created_by)     REFERENCES users (id)      ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_tags (
  post_id  BIGINT UNSIGNED NOT NULL,
  tag_id   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  KEY ix_post_tags_tag (tag_id),
  CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_post_tags_tag  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_revisions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id       BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(160)    NOT NULL,
  content_html  MEDIUMTEXT      NULL,
  edited_by     BIGINT UNSIGNED NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_revisions_post (post_id, created_at),
  KEY ix_revisions_editor (edited_by),
  CONSTRAINT fk_revisions_post   FOREIGN KEY (post_id)   REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_revisions_editor FOREIGN KEY (edited_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS redirects (
  from_slug   VARCHAR(100) NOT NULL,
  to_slug     VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_daily_views (
  post_id  BIGINT UNSIGNED NOT NULL,
  day      DATE            NOT NULL,
  views    INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, day),
  KEY ix_daily_views_day (day),
  CONSTRAINT fk_daily_views_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Reader interaction (no reader accounts; visitors are identified only by
--    voter_hash = SHA-256(ip + user_agent + SERVER_SECRET), never stored raw)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id         BIGINT UNSIGNED NOT NULL,
  parent_id       BIGINT UNSIGNED NULL,
  author_name     VARCHAR(80)     NOT NULL,
  author_email    VARCHAR(190)    NOT NULL,
  body            TEXT            NOT NULL,
  status          ENUM('pending','approved','spam','trashed') NOT NULL DEFAULT 'pending',
  is_staff        TINYINT(1)      NOT NULL DEFAULT 0,
  vote_score      INT             NOT NULL DEFAULT 0,
  voter_hash      CHAR(64)        NOT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_comments_post (post_id, status, created_at),
  KEY ix_comments_parent (parent_id),
  KEY ix_comments_status (status, created_at),
  KEY ix_comments_email (author_email),
  CONSTRAINT fk_comments_post   FOREIGN KEY (post_id)   REFERENCES posts (id)    ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id  BIGINT UNSIGNED NOT NULL,
  voter_hash  CHAR(64)        NOT NULL,
  value       TINYINT         NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, voter_hash),
  CONSTRAINT fk_comment_votes_comment FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_ratings (
  post_id     BIGINT UNSIGNED NOT NULL,
  voter_hash  CHAR(64)        NOT NULL,
  stars       TINYINT UNSIGNED NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, voter_hash),
  CONSTRAINT fk_ratings_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Stories sent in by readers through the Contact Us page (Send a story).
CREATE TABLE IF NOT EXISTS submissions (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name               VARCHAR(120)    NOT NULL,
  email              VARCHAR(190)    NOT NULL,
  title              VARCHAR(200)    NOT NULL,
  body_text          MEDIUMTEXT      NOT NULL,
  links_text         TEXT            NULL,
  status             ENUM('new','accepted','rejected','spam') NOT NULL DEFAULT 'new',
  converted_post_id  BIGINT UNSIGNED NULL,
  handled_by         BIGINT UNSIGNED NULL,
  ip_hash            CHAR(64)        NULL,
  terms_accepted_at  DATETIME        NOT NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_submissions_status (status, created_at),
  KEY ix_submissions_post (converted_post_id),
  KEY ix_submissions_handler (handled_by),
  CONSTRAINT fk_submissions_post    FOREIGN KEY (converted_post_id) REFERENCES posts (id) ON DELETE SET NULL,
  CONSTRAINT fk_submissions_handler FOREIGN KEY (handled_by)        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contact_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120)    NOT NULL,
  email       VARCHAR(190)    NOT NULL,
  subject     VARCHAR(200)    NULL,
  message     TEXT            NOT NULL,
  status      ENUM('new','read','replied','spam') NOT NULL DEFAULT 'new',
  ip_hash     CHAR(64)        NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_contact_status (status, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Site structure and settings (editable by the owner, no code change)
-- Starter static page copy is loaded separately by database/seed.sql and can be edited at /aadmin/pages.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(100)    NOT NULL,
  title         VARCHAR(160)    NOT NULL,
  content_html  MEDIUMTEXT      NULL,
  updated_by    BIGINT UNSIGNED NULL,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pages_slug (slug),
  KEY ix_pages_updated_by (updated_by),
  CONSTRAINT fk_pages_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_items (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  location        ENUM('top','header','footer') NOT NULL,
  label           VARCHAR(80)     NOT NULL,
  url             VARCHAR(500)    NOT NULL,
  sort_order      INT             NOT NULL DEFAULT 0,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  open_in_new_tab TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_menu_location (location, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS social_links (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  platform               VARCHAR(30)     NOT NULL,
  label                  VARCHAR(60)     NOT NULL,
  url                    VARCHAR(500)    NOT NULL,
  followers_label        VARCHAR(20)     NULL,
  show_in_top_bar        TINYINT(1)      NOT NULL DEFAULT 1,
  show_in_footer         TINYINT(1)      NOT NULL DEFAULT 1,
  show_in_stay_connected TINYINT(1)      NOT NULL DEFAULT 0,
  sort_order             INT             NOT NULL DEFAULT 0,
  is_active              TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY ix_social_sort (is_active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key    VARCHAR(80)  NOT NULL,
  setting_value  JSON         NOT NULL,
  updated_by     BIGINT UNSIGNED NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  KEY ix_settings_updated_by (updated_by),
  CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS integrations (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider                 VARCHAR(30)     NOT NULL,
  external_id              VARCHAR(80)     NULL,
  refresh_token_encrypted  TEXT            NULL,
  needs_reconnect          TINYINT(1)      NOT NULL DEFAULT 0,
  connected_by             BIGINT UNSIGNED NULL,
  connected_at             DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_integrations_provider (provider),
  KEY ix_integrations_user (connected_by),
  CONSTRAINT fk_integrations_user FOREIGN KEY (connected_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. Operations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id     BIGINT UNSIGNED NULL,
  action       VARCHAR(60)     NOT NULL,
  entity_type  VARCHAR(40)     NULL,
  entity_id    VARCHAR(40)     NULL,
  meta         JSON            NULL,
  ip           VARCHAR(45)     NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_created (created_at),
  KEY ix_audit_actor (actor_id, created_at),
  KEY ix_audit_action (action, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rate_limits (
  rl_key        VARCHAR(190)  NOT NULL,
  hits          INT UNSIGNED  NOT NULL DEFAULT 0,
  window_start  DATETIME      NOT NULL,
  PRIMARY KEY (rl_key),
  KEY ix_rate_limits_window (window_start)
) ENGINE=InnoDB;
