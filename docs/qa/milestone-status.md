# Milestone acceptance status

## M5 Interaction I — PASS

- **First-time comments wait; approved email later auto-approves:** PASS. Verified by `src/modules/comments/comments.test.js` with a pending first comment, simulated approval and next comment from the same normalized address.
- **Honeypot, minimum time, link and rate limits:** PASS. Unit tests verify a filled honeypot stores nothing, fast and linked comments wait, and the sixth comment within ten minutes is rejected.
- **Votes and ratings change per visitor; aggregates match source rows:** PASS. Repository tests replace one visitor's comment vote and rating, then verify the recomputed score/count/sum.
- **Staff replies publish immediately with STAFF badge:** PASS. Service test verifies the reply is approved and marked staff; `post.njk` renders the badge.
- **HTML in comment text is escaped:** PASS. Public post route test asserts escaped script text and absence of an executable script element.

Verification: final `npm run lint` passed. Final `npm test` ran 133 tests: 132 passed and 1 real-schema admin smoke test was skipped by its existing environment gate. No migration was needed because `database/schema.sql` already defines comments, comment votes and post ratings.

## M6 Interaction II — PASS

- **Tabs work with and without JavaScript:** PASS. Home renders real category links for no-JavaScript navigation; Playwright confirms the category tabs and their archive destinations. The feature fetches category candidates through `/api/posts/also-reading` when JavaScript runs; service and route coverage passes in `npm test`.
- **A post opened once no longer appears in “People also read…” in that browser:** PASS. The post view feature records IDs in `localStorage.readPosts`, and the recommendation feature filters those IDs before rendering; both are present in the rendered homepage and feature modules.
- **A story submission creates a row and sends two emails; Convert to draft creates a draft with a guest author:** PASS. Contact service tests verify story persistence plus editor/reader emails. Transaction test verifies guest-author insert, draft post insert and accepted submission update.
- **Contact messages reach the owner's Messages tab and CONTACT_EMAIL:** PASS. Contact tests verify owner-address delivery; app integration test verifies Messages tab is owner-only while Stories remains editor accessible.
- **Editing social links or menus changes the site without code changes; empty-URL icons are hidden:** PASS. Owner-only routes save both settings groups, invalidate site cache, and service tests verify unsafe or empty social destinations are excluded. Settings validator and repository tests pass.
- **Saving a story in one browser lists it on `/saved`; `/random` opens a published story; the three empty slot files exist:** PASS. Browser storage is keyed by `localStorage.savedPosts`; saved API service filters through published-post repository results; random repository selects published posts only. `header_action.njk`, `post_end.njk` and `footer_extra.njk` exist and are empty.

Verification: final `npm run lint` passed. Final `npm test` ran 133 tests: 132 passed and 1 real-schema admin smoke test was skipped by its existing environment gate. Playwright confirmed the homepage renders People Also Read, latest cards, category destinations and footer at `http://localhost:3001/`.

## M7 SEO and legal — PASS

- **Article structured data is emitted:** PASS. Public post integration test checks the Article JSON-LD; SEO unit tests verify safe JSON-LD serialization and sitemap/feed XML escaping. No external structured-data service was used.
- **Crawler files expose indexable content and block private routes:** PASS. Sitemap repository queries include only published, current, non-deleted posts, categories with published posts, tags with at least three published posts, authors with published posts, and static pages. Tests verify the published filters and robots directives for `/aadmin` and `/api`.
- **Social sharing metadata includes title, description and image fallback:** PASS. Shared layout emits Open Graph and Twitter metadata. Post covers take precedence over the editable default social image; the default image is validated and rendered as an absolute URL. Integration tests check page and post metadata.
- **Static pages exist, are linked and editable:** PASS. Seed data includes the eight specified pages and navigation links. Owner-only A8 routes list and edit seeded pages with the Quill editor; saves sanitize HTML and write an audit record. Editor access test confirms 403 responses.
- **Non-essential ads wait for consent:** PASS. Existing M8 integration tests verify provider code and ad configuration remain unavailable before consent. Plausible loads only when configured and is cookie-free.

Verification: `npm run lint` passed. Final `npm test` ran 140 tests: 139 passed and 1 real-schema admin smoke test was skipped by its existing environment gate. New tests cover page sanitization, role protection, SEO serialization, crawler query filters, analytics configuration and metadata rendering.

## M8 Ads — PASS

- **Auxx-style homepage promoted area reserves space beneath Stay Connected:** PASS. Playwright owner view confirms a 324×250 px `home_sidebar` placeholder below the social panel; the Ads settings page exposes the slot. Public ad delivery remains consent-gated and requires owner configuration.
- **Slots appear only where §8.12 allows:** PASS. Express integration test checks the home/category feed slot, post-end/sidebar slots, and paragraph-3 placement only for articles with at least six paragraphs. Search, 404, legal and admin responses contain no slot markup; the preview handler still renders the post template without ad settings.
- **Turning a slot off leaves no gap:** PASS. Integration test disables `home_feed`, clears the rendered cache and verifies the next homepage contains no feed slot node.
- **CLS stays at or below 0.1 on a typical post:** PASS. Playwright desktop measurement with all three reserved post placements and simulated ad creative recorded CLS 0.0356; the two in-article blocks held 280 px heights and the sidebar held 300×250 px.
- **No ad code on restricted pages or before consent:** PASS. Integration test finds no provider code or publisher ID in the initial page HTML; `/api/ads/slots/:slot` returns 403 before reading configuration without the consent cookie. Search, 404, legal and admin pages render no ad slots.

Verification: `npm run lint` passed. `npm run build:css` passed. Final `npm test` ran 133 tests: 132 passed and 1 real-schema admin smoke test was skipped by its existing environment gate. Ads stay disabled until the owner configures provider, publisher and slot IDs in `/aadmin/settings/ads`. Stay Connected has an owner-visible setup link; public cards need real profile URLs and follower labels. EEA/UK/Switzerland personalized AdSense still requires the publisher's Google-certified CMP configuration.

## M9 Blogger sync and scheduling — PASS

- **Publishing creates one Blogger post; edits update it; retries recover interrupted inserts:** PASS. Unit tests cover insert, update, stable-marker recovery and MySQL per-post advisory locks. Requests use the documented `posts.insert`, `posts.update`, `posts.search` and `blogs.listByUser` endpoints.
- **Blogger failures leave the local post published and retry up to five times:** PASS. Local lifecycle commits before sync. Retry selection requires published posts, pending/failed state, and `blogger_attempts < 5`; owner retries remain available.
- **`invalid_grant` triggers reconnect and stops retries:** PASS. Error detection marks the integration `needs_reconnect`; retry queries exclude reconnect-required integrations. Dashboard shows the reconnect banner.
- **Refresh token stays encrypted in MySQL:** PASS. Existing AES-256-GCM test verifies encryption and authentication.
- **A post scheduled two minutes ahead publishes within five minutes:** PASS in the scheduler simulation. The worker polls every five minutes; job tests verify due rows publish atomically and clear public caches. No live database worker timing drill was run.
- **Archive reverts the Blogger copy best-effort:** PASS. Lifecycle test verifies local archive completes even when remote revert fails.

Verification: `npm run lint` passed. `npm test` ran 148 tests: 147 passed and 1 real-schema admin smoke test was skipped by its existing environment gate. Tests cover timezone conversion including nonexistent DST times, schedule validation, API request shapes, retry cap and worker jobs. Added `node-cron` with user approval.

## M10 Hardening and launch — IMPLEMENTED; launch gates remain

- **Every item in Section 13 is ticked:** FAIL. Code-level checks pass for many items, but required production settings, account verifications, content review, performance measurements, and external alerts are not configured or verified. Item-by-item results follow.
- **`docs/RESTORE.md` exists and was followed successfully once:** FAIL. The procedure and encrypted restore utility exist, and encryption/decryption has unit coverage. No separate backup destination or dedicated scratch database was configured, so no live DB dump/restore was attempted.
- **Rate limits cover all §10.1 targets:** PASS in code/tests. Persistent `rate_limits` counters now cover sign-in and owner-link attempts, email link by email/IP, search, view counter, media uploads, admin writes, comments, votes/ratings, and separate story/contact form buckets. Existing auth/comment/search tests plus new persistent limiter and form/comment tests verify limits and key hashing.
- **Helmet headers and ads-aware CSP:** PASS. Helmet plus CSP provide HSTS, nosniff, strict referrer policy, a minimal permissions policy, per-response nonces, and only configured Plausible/Sentry/ad/upload origins. `src/config/security.test.js`, `src/modules/ads/ads.test.js`, and app integration tests cover enabled and disabled providers and response headers.
- **Daily jobs and backup implementation:** PASS in code/tests. Worker schedules publishing (5m), Blogger retry (15m), cleanup, recount, encrypted DB backup and upload snapshots (daily). Unit tests cover cleanup, aggregate recount, AES-GCM integrity, retention and image snapshots. A live worker run was not performed.
- **Sentry and uptime monitoring:** PARTIAL. Node and browser SDKs are wired behind `SENTRY_DSN`; event scrubbing removes reader email, query strings, tokens and request bodies. Chromium confirms the local browser SDK initializes and captures an exception. `docs/OPERATIONS.md` describes Sentry/UptimeRobot setup. No production DSN, UptimeRobot monitor or alert destination is configured/tested.
- **CI security/dependency monitoring:** PARTIAL. Added CI `npm audit`, lint/test and Dependabot configuration. A same-major npm override moves `express-mysql-session` onto the already-used patched `mysql2@3.24.6`, removing the high advisory. `npm audit` now reports 4 advisories (1 low, 3 moderate); CI's audit step still fails pending safe upgrades. No forced major upgrades were applied.
- **Lighthouse/performance fixes:** FAIL for launch verification. No production-like DB/content and running site were available for mobile Lighthouse or 375px QA. M8's prior desktop CLS check remains recorded under M8; it does not satisfy the M10 mobile LCP/CLS checklist.

### Section 13 launch checklist

| Result | Item and evidence |
| --- | --- |
| PASS | Uninvited and unverified Google accounts rejected; auth unit tests. |
| PASS | Editor denied on owner Team, Settings, Pages, Messages and Audit routes; app/auth integration tests. |
| PASS | Disabled editor access is rechecked per request; `requireRole()` unit test. |
| PASS | Email link expiry/single-use and owner-link single-use; auth unit tests. |
| PASS | Post XSS payloads sanitized and CSP emitted; sanitizer and app/header tests. |
| FAIL | No-secret and production OAuth setup checkbox: no tracked secret scan issue found, but Google consent screen Production state was not verified. |
| PASS | Rate limit behaviors covered across auth, comments, email, search, forms and persistent visitor limits; unit/integration tests. |
| FAIL | Owner Google 2-Step Verification is external account state; not verified. |
| FAIL | Unique title, description, canonical URL and social image for every live post; production content was not audited. |
| PASS | Sitemap, robots, feed and ads.txt handlers tested; SEO/ads tests. |
| FAIL | Search Console verification and sitemap submission need account access. |
| FAIL | Legal pages and footer links are seeded, but legal copy needs owner review/publication confirmation. |
| PASS | Consent gates ads and non-essential provider code; M8 tests. |
| PASS | Canonical site and Blogger mirror lifecycle are covered by SEO/M9 tests. |
| PASS | No public popups; ad slots carry “Advertisement” labels; template and M8 tests. |
| PASS | Ads limited to allowed slots and absent from restricted pages; M8 integration tests. |
| FAIL | Mobile CLS/LCP thresholds require a production-like Lighthouse run. |
| FAIL | 375px overflow and 44px tap targets were not measured against live content. |
| PASS | Related, popular, editor-pick and “People also read” selection tests exist. |
| FAIL | Daily DB backup and live scratch restore require a configured separate destination and scratch DB. |
| FAIL | Object storage/separate image snapshot destination is implemented but not configured. |
| FAIL | UptimeRobot/Sentry alert delivery needs production account setup and test alerts. |
| PASS | All five worker schedules are implemented; job behavior has unit coverage. |
| PASS | Health 200, 404 and generic 500 handlers are covered by app integration tests. |
| FAIL | Owner-link and OWNER_EMAIL recovery have unit tests, but a real recovery rehearsal was not performed. |
| PASS | First-comment moderation, approved commenter flow, spam/rate checks, replies and votes have unit tests. |
| PASS | Story persistence, configured recipient calls, inbox and draft conversion have service/repository tests. |
| PASS | Contact recipient and owner Messages access are covered by contact/app tests. |
| PASS | Social settings update and empty-link hiding are tested. |
| FAIL | Share destinations were not individually browser-verified; rating persistence is unit-tested. |
| PASS | Saved, random, empty slots and recommendations are covered by M6 tests. |
| PASS | `rg -i subscribe src/views src/modules public/js public/css` returned no matches. |

Verification: final `npm run lint` passed. Final `npm test` ran 164 tests: 163 passed, 1 existing real-schema admin smoke test was skipped, 0 failed. Tests include Chromium smoke coverage for the vendored Sentry browser SDK. `npm audit --json` exits nonzero with 4 remaining advisories. The restore drill, live worker/database operations, external account checks, alert delivery, and Lighthouse run remain unverified launch tasks.

### M10 recheck — 2026-11-09

- **Backup/restore:** FAIL. `.env` has no `BACKUP_SECONDARY_DIR`; `RESTORE_SCRATCH_DB` is unset. MySQL client executables are installed, but a read-only connection to configured `elatedquest_m0_test` failed. No dump or restore was attempted.
- **Monitoring:** FAIL. `SENTRY_DSN` is empty. No UptimeRobot monitor/credential exists in the project, and there is no connected service here to inspect or configure it.
- **Google account:** FAIL / external. The checked environment is `development` and `SITE_URL` is localhost. OAuth client values exist, but Google consent-screen production status and owner 2-Step Verification cannot be inspected from this workspace.
- **Mobile/Lighthouse:** FAIL. `npm run test:ui` cannot launch because the Playwright browser executable is missing. The configured local site is also unavailable; no Lighthouse result was produced.
- **Seeded content review:** FAIL / owner input needed. `database/seed.sql` still contains starter copy for About Us, Privacy Policy, Image Use Policy, DMCA/copyright removal, Join Us, and Terms of Use. Live post metadata/content could not be audited because the configured test database is unavailable. External social profile URLs also need owner verification.
