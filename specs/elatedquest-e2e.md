# Test Plan: Elated Quest End to End

**Target:** Local smoke app at http://127.0.0.1:3001/  
**Seed:** None found under tests/e2e/ (only .gitkeep); tests/integration/admin-smoke.test.js is not an E2E browser fixture.  
**Date:** 2026-11-09

## Overview

This plan covers the public reading, discovery, interaction and submission flows plus the private editorial studio described in docs/SPEC.md. The root agent captured the live homepage and article UI in the Codex in-app browser: navigation and search, People Also Read tabs/More/cards, Popular Posts 7/30-day links, Latest Articles/load-more, editor picks, popular posts/categories, contact/social/footer, and article breadcrumb/byline/reading metadata/progress, rating, share/copy/more/save, tags, author, comments/sorting and related posts. The smoke database has rough test titles and broken image URLs; those are not expected values. Journeys not observed in the live UI are marked spec-derived below.

## Preconditions

- Use only an isolated local/staging deployment backed by a disposable, resettable test database. Never run mutations against production or user content.
- Seed known records with stable IDs/slugs: published posts across categories/tags, valid media and credits, a six-paragraph and a short post, related posts, two authors, >20 list records, known views, approved/pending/nested comments and ratings. Also create draft, in-review, future-scheduled, archived and soft-deleted post fixtures.
- Before asserting unpublished visibility, create a known draft fixture and assert it is absent from every public surface and returns 404 by its known slug. A title such as “Untitled draft” does not prove record status.
- Provide separate owner and editor test sessions/users, a local mail sink, and provider stubs. Do not include credentials in the plan or commit them. Disable real email and Blogger writes.
- Reset database and browser storage for each scenario. Seed or restore prerequisites independently; do not rely on another scenario having run.
- Use a controlled ad provider stub/owner placeholders; never click a real ad. No real submissions, invitations, emails, OAuth consent, publishing to Blogger, or external writes.
- Check public pages at 375, 768 and 1280 px. Test keyboard focus, reduced motion, and mobile target/text requirements in SPEC.

## Scenarios

### Scenario 1.1 — Home page and shared navigation
- **Priority:** P0
- **Tags:** @smoke, @regression
- **Preconditions:** At least one published post/category and active menu/social fixtures; public session.
- **Steps:**
  1. Open / — expected: public homepage and main landmark render successfully.
  2. Inspect header, category navigation, search, top/footer menus, social links and footer — expected: each active link uses its configured destination.
  3. Follow a category link and return via the site brand — expected: archive then home render.
- **Assertions:**
  - Site title/description/canonical are correct; only published posts appear.
  - Empty/inactive social profiles are hidden; landmarks and skip link exist.
  - Shared navigation is keyboard accessible with visible focus.
- **Edge cases considered:** Empty home; zero social links; >6 navigation categories; inactive menu item; unknown category.

### Scenario 1.2 — Homepage discovery sections
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Featured/editor-pick posts, daily view rows, categories and at least 18 unread posts are seeded.
- **Steps:**
  1. Open home — expected: People Also Read and Latest Articles appear.
  2. Inspect cards and metadata — expected: title, category, author/date, comment count and excerpt match their linked post.
  3. Inspect editor picks, popular posts and popular categories — expected: expected ordering/counts and working links.
- **Assertions:**
  - People Also Read has two lead and sixteen compact cards when enough unread posts exist.
  - Latest Articles shows three cards per row at desktop and omits view counts.
  - Draft, in-review, scheduled, archived and deleted fixtures are absent.
- **Edge cases considered:** Fewer than 18 unread posts (published filler only); no editor picks; no view history (newest fallback); no categories.

### Scenario 1.3 — People Also Read tabs and read history
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Published posts in multiple categories; fresh browser storage.
- **Steps:**
  1. Select a category tab and More option — expected: selected category cards and active-tab state update.
  2. Open one result, return to home — expected: that post is removed from unread suggestions.
  3. Repeat with JavaScript disabled — expected: tab link navigates to category archive.
- **Assertions:**
  - JavaScript filtering uses published candidates without a full reload; links work without JavaScript.
  - Read history is browser-local and capped at 200 IDs; nothing is sent to the server.
  - Empty unread results hide the section.
- **Edge cases considered:** Unknown category; storage unavailable; one unread result; history at cap; no-JavaScript behavior.

### Scenario 1.4 — Load more and list pagination
- **Priority:** P1
- **Tags:** @smoke, @regression
- **Preconditions:** At least 21 published posts and a category with more than 12 posts.
- **Steps:**
  1. Activate home Load more — expected: next ten cards append.
  2. Open page 2 by its normal URL — expected: server-rendered list works without JavaScript.
  3. Page through category archive — expected: next archive page appears.
- **Assertions:**
  - No duplicate cards; only published content; page/category parameters persist.
  - Page canonical is self-referential; ad frequency is at most one per eight cards.
- **Edge cases considered:** Last page; out-of-range/negative page; empty category; failed list API.

### Scenario 1.5 — Popular Posts periods
- **Priority:** P2
- **Tags:** @regression
- **Preconditions:** Seed known 7-day and 30-day view totals and no-view posts.
- **Steps:**
  1. Select 7-day, then 30-day period — expected: five or fewer posts reflect each period.
  2. Clear view fixtures and reload — expected: newest published posts are the fallback.
- **Assertions:**
  - Only published posts appear and the selected period is clearly indicated.
- **Edge cases considered:** Tied totals; fewer than five records; invalid period.

### Scenario 1.6 — Public responsive/accessibility behavior
- **Priority:** P1
- **Tags:** @smoke, @regression
- **Preconditions:** Home, archive, post, search and contact fixtures available.
- **Steps:**
  1. Open each route at 375, 768 and 1280 px — expected: content reflows without horizontal page scrolling.
  2. At mobile size open/close menu and use menu search — expected: all controls work.
  3. Navigate with keyboard and emulate reduced-motion — expected: visible focus and reduced nonessential motion.
- **Assertions:**
  - Mobile tap targets are at least 44 px and body text at least 17 px.
  - Post sidebar is absent below 1024 px; mobile popular content uses its scroll-snap layout.
  - Menu, consent UI and sticky header do not obscure keyboard focus.
- **Edge cases considered:** Long titles, zoom, reduced motion, short viewport, JavaScript disabled.

### Scenario 2.1 — Published article reading and view tracking
- **Priority:** P0
- **Tags:** @smoke, @regression
- **Preconditions:** Published post with category, author, tags, valid cover/alt/credit, body paragraphs and known counters.
- **Steps:**
  1. Open post by slug — expected: article view renders.
  2. Inspect heading, breadcrumb, byline/date/read time, views/comments, cover/credit/body and related cards.
  3. Scroll through article — expected: reading progress advances without layout shift.
- **Assertions:**
  - Exactly one h1; article body is readable; reading time is ceil(words/200), minimum one.
  - Author/category/tag links resolve; Article and BreadcrumbList JSON-LD exist; rating markup does not.
  - One view per browser session/post; ID is recorded in local read history.
- **Edge cases considered:** Short article; missing optional cover; repeat visit in same session; known bot; unknown slug.

### Scenario 2.2 — Drafts and other unpublished posts never go public
- **Priority:** P0
- **Tags:** @critical, @regression
- **Preconditions:** Known draft, in-review, future-scheduled, archived, deleted fixtures and a published-slug redirect.
- **Steps:**
  1. Open each unpublished fixture by its known slug — expected: 404 for each.
  2. Search, inspect home/category cards and fetch sitemap/feed — expected: none of those fixture IDs/titles appear.
  3. Open an unknown slug and the old redirected slug — expected: friendly 404 or one 301 to current published slug.
- **Assertions:**
  - No unpublished body/title leaks in HTML, metadata, search, sitemap or feed.
  - 404 is noindex and has search/newest-story helpers; 301 does not loop.
- **Edge cases considered:** Do not infer status from title; seed and assert the fixture’s database status. Reserved and fixed-route slug precedence.

### Scenario 2.3 — Ratings
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Published post with fewer than three ratings; fresh visitor identity; isolated DB.
- **Steps:**
  1. Inspect five-star control — expected: accessible choices and “Be the first to rate” state.
  2. Submit a rating, then change it from the same visitor.
- **Assertions:**
  - Below three votes no average is shown; at three votes average is one decimal with count.
  - A repeat updates one visitor rating; count/sum match source rows; no rating JSON-LD.
- **Edge cases considered:** First/third vote; invalid stars; rate limit; disabled JavaScript.

### Scenario 2.4 — Share, copy and save
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Published post with canonical URL/title/cover; fresh storage.
- **Steps:**
  1. Inspect configured share links and More on desktop/mobile — expected: destinations contain the correct post URL/title.
  2. Activate Copy link — expected: URL is copied with success feedback.
  3. Emulate native-share support and activate More — expected: current URL/title are passed to share sheet.
  4. Save post and open /saved — expected: saved card appears.
- **Assertions:**
  - Sharing uses links, not third-party scripts; Save writes only localStorage.
  - /saved is noindex; empty state has popular posts; saved history is newest-first, max 200.
- **Edge cases considered:** Clipboard denial; unsupported native sharing; missing cover; malformed/duplicate stored IDs; API cap.

### Scenario 2.5 — Comments, replies, sorting and votes
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Comments enabled; approved/pending/nested records; fresh visitor; no real email.
- **Steps:**
  1. Open article comments — expected: approved records only, Newest default, ten items initially.
  2. Change to Oldest and Most voted; load more — expected: sort and append work.
  3. Submit a comment/reply to isolated DB and approve fixture — expected: moderation/depth and thread display follow configured mode.
  4. Vote then change vote — expected: one visitor score changes.
- **Assertions:**
  - Name ≤80, text 2–2000, email is required but never displayed; HTML escaped; URLs not clickable.
  - Replies deeper than level three attach at level three; staff replies show STAFF.
  - Counts include approved comments only; no commenter notification emails.
- **Edge cases considered:** All/first_time/none moderation; normalized email; closed comments; honeypot; <5-second form; link/blocklist holds; duplicate text; rate limit.

### Scenario 2.6 — Contact message
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Local mail sink and isolated DB.
- **Steps:**
  1. Open /contact-us; choose Send a message — expected: contact fields/business details show.
  2. Submit valid fixture message — expected: message thank-you state.
  3. As owner, inspect Messages inbox and mark fixture status — expected: message appears.
- **Assertions:**
  - Message length 10–3000; subject optional; email normalized; message mail goes only to local sink and reader receives no receipt.
  - 8-second minimum, honeypot, 3/hour cap and no-JS form work.
- **Edge cases considered:** Required fields, length boundaries, rate limit, email transport failure, ?type query.

### Scenario 2.7 — Story submission and editor review
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Local mail sink, story terms page, editor account and isolated DB.
- **Steps:**
  1. Open /contact-us?type=story — expected: story option and terms selected/rendered without JavaScript.
  2. Submit valid story fixture and accept terms — expected: thank-you and two test-sink messages.
  3. Review it in Stories inbox — expected: sender, content, links and terms timestamp.
  4. Convert a disposable submission to draft — expected: sanitized draft with guest author and accepted status.
- **Assertions:**
  - Title ≤120; body 100–20,000; max ten link lines; no attachment upload; no real mail.
  - Conversion links exactly one draft and preserves story attribution.
- **Edge cases considered:** Missing terms; duplicate conversion; blank lines; honeypot; <8 seconds; rate limit; reject/spam.

### Scenario 3.1 — Category, tag, author, search and static pages
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Indexable category, tag with ≥3 posts, tag with <3, author with posts, seeded static/legal pages.
- **Steps:**
  1. Visit category, both tags, author, About, Join Us, DMCA and policy routes — expected: matching page renders.
  2. Search a relevant 2+ character term and paginate; then search no-match and one-character values.
- **Assertions:**
  - Archives show title/count and newest published cards; category/author and tags with ≥3 are indexable; smaller tag is noindex.
  - Search is noindex, trims and limits 2–80 characters, returns ≤20/page, highlights escaped matched text and has no ads.
  - Empty result gives hint, popular posts and category list.
- **Edge cases considered:** %, _, backslash, HTML; unknown archive; author with no posts; pagination bounds.

### Scenario 3.2 — Saved, random, 404 and thank-you utilities
- **Priority:** P2
- **Tags:** @regression
- **Preconditions:** Clean storage and at least one published post.
- **Steps:**
  1. Open /saved empty and then after saving two fixture posts — expected: fallback then saved cards.
  2. Open /random — expected: 302 to a published post and no caching.
  3. Open /thank-you?type=message and ?type=story — expected: correct confirmation and home link.
- **Assertions:**
  - Saved/random are noindex; unpublished/invalid saved IDs never resolve.
  - Thank-you GET does not send mail or create another record.
- **Edge cases considered:** Empty/malformed/duplicate IDs; no published posts; unknown thank-you type.

### Scenario 3.3 — Consent and ad placements
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Provider stub, configured slots and clean consent state; disposable settings.
- **Steps:**
  1. Load home/article before consent — expected: no ad-provider request; only allowed labeled placeholders.
  2. Grant consent and scroll slots into view — expected: lazy provider stub loads.
  3. Disable a slot and reload — expected: slot and gap disappear.
  4. Visit search, legal, 404, preview and admin — expected: no ads/scripts.
- **Assertions:**
  - Slots say Advertisement, never appear above title/first paragraph; placement/count/device rules match SPEC.
  - Home/category: ≤1 ad per 8 cards; article max 3 desktop/2 mobile; short article omits after-p3 slot.
  - Slot space is reserved before load; CLS target ≤0.1; empty slot hides after timeout.
- **Edge cases considered:** Reject consent, no provider, script failure, mobile, disabled slot, article <6 paragraphs.

### Scenario 3.4 — SEO, crawler routes and security response headers
- **Priority:** P1
- **Tags:** @critical, @regression
- **Preconditions:** Public/admin/preview fixtures; no external account.
- **Steps:**
  1. Inspect title, description, canonical, robots and OG/Twitter on home, post, archive, search, author, legal, saved and 404 pages.
  2. Fetch sitemap.xml, robots.txt, feed.xml and ads.txt — expected: valid output.
  3. Inspect headers/cache behavior on public, admin and preview responses.
- **Assertions:**
  - Sitemap/feed include published content only; robots disallows /aadmin and /api.
  - Admin/preview/search/404 noindex; private routes no-store; required CSP/security headers present.
  - Session cookie HttpOnly, Secure and SameSite=Lax; rating data absent from structured data.
- **Edge cases considered:** Empty sitemap, escaped metadata, invalid canonical, ads on/off CSP.

### Scenario 4.1 — Login and generic email-link response
- **Priority:** P1
- **Tags:** @critical, @regression
- **Preconditions:** Test mail sink; allowlisted, unknown and disabled test accounts; isolated contexts.
- **Steps:**
  1. Open /aadmin/login signed out — expected: Google and email-link options but no password/register/forgot-password fields.
  2. Request email link for allowlisted then unknown fixture — expected: identical response text.
  3. Redeem a test-only token once, then reuse/expire it — expected: first use succeeds, reuse/expiry fails.
- **Assertions:**
  - Email token is single-use, 15-minute validity; no account enumeration; audit/rate limit behavior matches spec.
  - Email stays within local sink; no actual Google OAuth or owner-link generation.
- **Edge cases considered:** Disabled account; unverified Google account/state/nonce mismatch; 10/15m IP and email limits.

### Scenario 4.2 — Admin roles and direct-route authorization
- **Priority:** P0
- **Tags:** @critical, @smoke, @regression
- **Preconditions:** Separate owner/editor sessions and owned/other-owned post fixtures.
- **Steps:**
  1. Open dashboard as editor and owner — expected: role-scoped navigation and totals.
  2. As editor directly request owner-only Team, Settings, Categories, Pages, Audit, Messages and their API endpoints — expected: denied.
  3. Disable a disposable editor and reuse old session — expected: next request is denied.
- **Assertions:**
  - UI labels are Admin / Content Moderator; role checks are server-enforced per request.
  - Admin is noindex/no-store and loads no ad scripts.
- **Edge cases considered:** Anonymous; expired session; role changed after login; editor accesses another post; disabled user.

### Scenario 4.3 — Dashboard filtering and suggestions
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** >20 posts across statuses; editor-owned and other-owned records; Blogger status variants.
- **Steps:**
  1. Inspect stat cards and table — expected: correct counts/statuses/badges.
  2. Filter by each status and search using two characters — expected: up to eight matching suggestions.
  3. Exercise arrows/Enter/Escape, plain form submit without JS, then pagination.
- **Assertions:**
  - Editors see own counts/rows only; suggestions never leak other editors’ titles.
  - 20 rows/page newest-updated first; status and Blogger badges are correct.
- **Edge cases considered:** One-character/no-result query, special characters, failed sync banner, empty dashboard.

### Scenario 4.4 — Post editor draft, autosave, preview and sanitization
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Owner/editor sessions, disposable empty draft and test media; no external services.
- **Steps:**
  1. Create draft and inspect toolbar/status/sidebar — expected: role-appropriate action, supported tools, panels and default expanded sections.
  2. Enter title/body, wait for autosave, navigate away/reload — expected: Saved indicator and draft values persist but remain private.
  3. Insert media with alt/credit, preview, then save XSS payloads through autosave/manual path — expected: preview uses public template and server removes unsafe markup.
- **Assertions:**
  - Title 1–120, slug ≤80 valid/unique/not reserved, excerpt ≤200, tags ≤5; no H1 toolbar.
  - Sanitizer removes script/style/iframe/object/embed/form/input, on* attributes, inline style and javascript:/data: URLs; image source must be media domain and alt required.
  - Preview is private/noindex/no-store; draft route is 404 publicly.
- **Edge cases considered:** Unsaved navigation warning, conflicting updated_at, reserved/static slug collision, no alt, short viewport/sidebar scroll.

### Scenario 4.5 — Publish validation, slug and cache behavior
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Owner session, disposable draft, media/category fixtures, local mail sink.
- **Steps:**
  1. Leave required checklist fields missing — expected: Publish disabled with missing fields identified.
  2. Fill title, slug, cover/alt, category, body and metadata — expected: checklist becomes ready.
  3. Publish isolated fixture, edit/republish after first publication — expected: public view/cache updates and original published_at remains.
- **Assertions:**
  - SEO title ≤60 and description ≤160 with live counters/default values; slug is locked after initial publish.
  - Renaming a published slug requires owner confirmation and old URL redirects 301; revisions are retained.
- **Edge cases considered:** Missing each requirement; title 121, excerpt 201, meta 161; duplicate/reserved slug; publish double-click.

### Scenario 4.6 — Review, schedule, archive and draft deletion
- **Priority:** P1
- **Tags:** @critical, @regression
- **Preconditions:** Editor draft, in-review post, owner session, test clock/worker, isolated DB and email sink.
- **Steps:**
  1. Editor submits owned draft — expected: in_review and locked for editor edits.
  2. Owner requests changes with note; editor reopens — expected: draft and note visible.
  3. Owner publishes an in-review fixture and schedules a separate post — expected: live now / published by test worker when due.
  4. Owner archives another post and soft-deletes a disposable draft — expected: archived route 404; draft soft deletion is retained.
- **Assertions:**
  - Editor cannot approve/reject/archive or publish unless setting allows; then may only publish own posts.
  - Request note ≤500; published content is archived, not hard-deleted; audit/events and cache update.
- **Edge cases considered:** Past schedule, editor other-owner attempt, republish, double submit, due boundary. Permanent delete only on disposable DB.

### Scenario 4.7 — Media library
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Editor session; disposable file/media directory and unused fixture.
- **Steps:**
  1. Upload supported JPG/PNG/WebP/GIF under 8 MB — expected: selected media appears at top of grid.
  2. Edit alt/credit/link and use in draft — expected: metadata appears in preview.
  3. Try SVG, oversized file, byte/MIME mismatch and corrupt image — expected: clear errors, no stored media.
  4. Attempt editor deletion then owner deletion of unused fixture — expected: only owner may delete unused media.
- **Assertions:**
  - Byte signature verified; output max 2000 px, converted WebP with 400/800/1200 variants, random filename, srcset/cache headers.
  - Missing-alt images cannot be inserted; used media cannot be deleted.
- **Edge cases considered:** 30/hour/user upload cap, duplicate, network interruption, referenced by multiple posts.

### Scenario 4.8 — Comments moderation inbox
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Editor session and disposable comments in all statuses; test post.
- **Steps:**
  1. Open Comments inbox and filter Pending/Approved/Spam/Trash — expected: matching rows and metadata.
  2. Approve one, bulk-spam another, trash another — expected: statuses/counts update.
  3. Add staff reply — expected: immediately approved under original with STAFF badge.
- **Assertions:**
  - Public count changes only for approved comments; each mutation has CSRF and server role check.
  - Permanent deletion is isolated test data only.
- **Edge cases considered:** Empty selection, stale item, unauthorized delete, reply depth, failed bulk update.

### Scenario 4.9 — Story inbox
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Editor session and isolated submissions created using local mail sink.
- **Steps:**
  1. Open Stories tab — expected: submission details and terms timestamp show.
  2. Mark one fixture rejected/spam — expected: status changes without post creation.
  3. Convert another to draft — expected: one linked draft with guest author.
- **Assertions:**
  - Editor may review/convert stories; conversion sanitizes and prevents duplicates.
- **Edge cases considered:** Already converted, empty links, duplicate title, owner/editor access.

### Scenario 4.10 — Owner settings, menus, social, ads and categories
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** Owner session, disposable settings/category fixtures and provider stubs.
- **Steps:**
  1. Inspect General and Rules tabs — expected: site profile, timezone, comments and publish permissions.
  2. Save a reversible setting and restore baseline — expected: public cache updates and audit entry.
  3. Add/reorder/disable test social/menu rows — expected: correct placements and hidden empty/inactive URLs.
  4. Inspect ad slots/placeholders and Blogger settings without connecting a real account.
  5. Add/rename/nav-toggle a disposable category and restore fixture — expected: archive/nav and audit update.
- **Assertions:**
  - Editor requests to settings/categories APIs are denied; client secrets are not in UI.
  - Save invalidates menus/social cache; category delete is refused while referenced by posts.
- **Edge cases considered:** Duplicate slug, bad URL, reordered links, disabled slot removes gap, no settings.

### Scenario 4.11 — Team and author profiles
- **Priority:** P2
- **Tags:** @regression
- **Preconditions:** Owner/editor sessions; disposable invited/active/disabled accounts and author fixtures; mail sink.
- **Steps:**
  1. Inspect Team — expected: locked owner row first and editor statuses/actions.
  2. Invite, disable/enable, resend and remove disposable user — expected: allowlist/access and reassignment update.
  3. Edit own profile as editor and an author as owner; toggle show_on_about — expected: About team row reflects setting.
- **Assertions:**
  - Owner cannot be edited/disabled/removed; removed editor posts reassign to owner.
  - First sign-in activates invite; team/profile actions are audited; email remains in sink.
- **Edge cases considered:** Duplicate invite, disabled session, guest author, editor attempts another profile.

### Scenario 4.12 — Static pages and audit
- **Priority:** P2
- **Tags:** @critical, @regression
- **Preconditions:** Owner/editor sessions, seeded static pages and test audit rows.
- **Steps:**
  1. Owner edits a disposable legal page using allowed rich text — expected: sanitized public content updates.
  2. Editor directly requests page UI/API — expected: denied.
  3. Owner filters Audit by actor/action/date — expected: matching read-only events.
- **Assertions:**
  - Seed pages include About, Contact, story terms, Privacy, Image Use, DMCA, Join Us and Terms; no create-page flow.
  - Audit is owner-only and shows failed/denied events distinctly.
- **Edge cases considered:** Invalid date range, no rows, XSS payload, slug conflict, retention boundary.

### Scenario 4.13 — Blogger and scheduled-worker boundary
- **Priority:** P2
- **Tags:** @regression
- **Preconditions:** Mock Blogger API or dedicated disposable Blogger blog; fake OAuth credentials and controllable worker clock.
- **Steps:**
  1. Publish test post with auto-sync — expected: own site publishes first and stub receives one create.
  2. Edit/republish and retry — expected: existing Blogger post updates, no duplicate.
  3. Simulate transient error and invalid_grant — expected: bounded retry or reconnect banner/stop.
  4. Schedule post two minutes ahead and run worker under test clock — expected: publish within five minutes.
- **Assertions:**
  - ID/URL/status/attempts persist; site remains live when Blogger fails; token encrypted.
  - Stable marker/lock prevents duplicate insert.
- **Edge cases considered:** Interrupted create, Blogger down, auto-sync off, existing published post. Never use production Blogger.

### Scenario 4.14 — CSRF, rate limits, health and safe errors
- **Priority:** P1
- **Tags:** @critical, @regression
- **Preconditions:** Resettable isolated rate-limit state; no external integrations.
- **Steps:**
  1. Exceed separate search, sign-in, comment, vote/rating, form, upload and admin-write limits — expected: 429 with short message.
  2. Submit state-changing request without/with invalid CSRF token — expected: rejected.
  3. Request /api/health with healthy DB, then simulate DB failure — expected: 200 only when app and DB respond.
- **Assertions:**
  - Security headers/CSP match spec; error page omits stack/secrets and uses request ID.
  - Public view counter requires same-origin Origin/Referer; rate limits cannot be bypassed by browser state.
- **Edge cases considered:** Expired session, malformed request, unknown route, DB outage, ads enabled CSP.

## Not covered (and why)

- Real Google OAuth/consent, production email delivery, owner-link generation on a server, real Blogger publishing and live ad-provider clicks require external accounts or side effects. Use controlled integration environments and human approval where required.
- Backups/restore, Sentry delivery, uptime alerts, Search Console and production ads are operational checks in docs/OPERATIONS.md and SPEC sections 11–13, not safe browser smoke actions.
- The root agent captured the public homepage and article UI. Other public routes and all admin pages remain spec-derived; owner/editor test sessions and stable fixtures are prerequisites for exploration and execution.
- No suitable E2E seed/fixture currently exists under tests/e2e/. A generator must establish deterministic setup/teardown for a disposable DB before implementing mutation scenarios. Do not reuse the shared smoke or production database.
- Rough smoke titles, broken images, exact sample counts/order and irregular dates are intentionally not asserted; stable fixtures must define expected values.
