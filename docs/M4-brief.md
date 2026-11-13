# M4 BRIEF: PUBLIC SITE (Elated Quest)

Save this file as `docs/M4-brief.md`. It is an instruction file for Milestone M4 only. It never overrides the spec: if it conflicts with `AGENTS.md`, `docs/SPEC.md` section 1.5, or a numbered spec section, the spec wins, and you write the conflict into "M4 implementation notes" (section 0.6).

---

## 0. HOW TO WORK (read first)

**0.1 Baseline.** M0 to M3 are done and committed. Before any change run `npm run lint` and `npm test`. If anything is red, STOP and report; do not start M4 on a red baseline.

**0.2 Database.** Tests use the database named in `DB_TEST_NAME`, which is `elatedquest_m0_test`. Dev uses `elatedquest`. Tests never touch the dev database, never drop or truncate a database, create uniquely named rows (prefix `t4_`) and remove them afterwards. FULLTEXT only sees committed rows, so test data must be inserted with autocommit, not inside an uncommitted transaction.

**0.3 Reuse before writing.** WHAT: inspect the existing code first. WHY: M4 must plug into M0 to M3 without breaking them. HOW: read these and write a 10-line "reuse plan" in your reply, then CONTINUE without waiting:
- `src/app.js` and `src/modules/index.js` (how modules register routes and in what order)
- `src/views/layouts/*`, `src/views/partials/*`, `public/js/main.js` (data-feature loader), `public/css/base.css` (tokens), the CSS build script (`npm run build:css`)
- `src/lib/cache.js` and every place M3 calls its invalidate function (search the code for it)
- the settings and site data helpers from M2, `src/config/constants.js`, `src/lib/slug.js`, `src/lib/sanitize.js`, `src/middleware/rateLimit.js`, the session and CSRF middleware mounting
- the media service (how the 400/800/1200 px versions are named, alt and credit fields)
- the image credit-caption function that the admin preview uses
- the existing `/aadmin/preview/:id` implementation and the friendly 403/404/500 pages

**0.4 Hard sync rules (no breakage).**
1. Do not change admin pages, admin CSS, admin routes, permissions, the schema, or the behavior and tests of M1 to M3.
2. New code goes in NEW files and registers through the existing module convention. Existing modules (posts, categories, authors, media, settings) may only get small additive exports. All new public SQL goes in new `repository.public.js` files with `?` placeholders only.
3. Public styles are new files (`public/css/pages/public-*.css`, `public/css/components/public-*.css`). Never change an existing token value; add new tokens if needed. Build them into a separate public bundle (`public/css/site.css`) by extending the build script additively. Admin pages must not load public CSS and public pages must not load admin CSS.
4. Nunjucks autoescape stays on. `content_html` is output with `| safe` only after `sanitize.js` (defence in depth, even though it was sanitized on save). `pages.content_html` is also run through `sanitize.js` at render time.
5. No inline scripts or styles (CSP). No new package without asking me first. Keep command output short; run the full test suite once per phase.
6. No git commands.

**0.5 Priority when sources disagree:** (1) `AGENTS.md`, (2) section 1.5 decisions, (3) numbered spec sections, (4) wireframes in `docs/wireframes`, (5) this brief. Ask me only when a point blocks you and nothing above decides it. Otherwise decide, and record it.

**0.6 M4 implementation notes.** Add a section "M4 implementation notes" at the end of `docs/SPEC.md` listing every decision you made that the spec did not state, and add a change log row (next free version). This brief already contains decisions marked **[DECISION]**; copy them there.

**0.7 Report after each phase:** files created or changed, real `npm run lint` and `npm test` output (last lines only), what you verified in a browser or could not verify, anything unsure. Then STOP and wait for "continue".

---

## 1. SCOPE

**IN (build now):** public layout (top bar, header, footer, menus, social links), Home (P1), Post (P2: reading area, tag chips, author box, related posts), Category, Tag, Author, Search, static pages, 404, mobile layout (P5), sidebar blocks (Editor picks, Popular posts, Popular categories), view counter, cache with invalidation, slug redirects, real preview, demo data scripts.

**OUT (later milestones, do NOT build):**
- M5: comments, ratings, votes, share buttons, Save button, comment counts beyond showing the stored number
- M6: category tabs, "People also read…", Load-more JavaScript, Stay connected, popular 7/30 toggle, Contact Us form, About team row, `/thank-you`, `/saved`, `/random`, the extension slot files
- M7: consent banner and "Cookie settings" link, sitemap, robots, RSS, JSON-LD, Open Graph, ads.txt
- M8: ads (no ad slots, no placeholders)
- Never: any subscribe/newsletter feature, any call-to-action button in the header

**Extension slots:** layouts must contain `{% include "slots/header_action.njk" ignore missing %}` (right side of the header), `slots/post_end.njk` (after the article) and `slots/footer_extra.njk` (footer). Do NOT create the slot files.

---

## 2. ROUTE AND DATA CONTRACT

| Route | Method | Shows | Cached | Indexed |
|---|---|---|---|---|
| `/` and `/?page=N` | GET | Home (P1) | 60 s | yes |
| `/{slug}` | GET | post, else static page, else 301 redirect, else 404 | post: 60 s | yes |
| `/category/{slug}?page=N` | GET | category list (P3) | 60 s | yes |
| `/tag/{slug}?page=N` | GET | tag list (P3) | no | only if the tag has 3 or more published posts |
| `/author/{slug}?page=N` | GET | author page (P7) | 60 s | yes |
| `/search?q=&page=` | GET | search page (P3) | no | noindex |
| `/api/search?q=&page=` | GET | JSON results | no | n/a |
| `/api/posts/:id/view` | POST | counts a view | no | n/a |
| `/aadmin/preview/:id` | GET | real post template (existing route, changed) | never | noindex, no-store |

**Published rule (one shared function `isPublishedClause`):** `status = 'published' AND published_at <= UTC_TIMESTAMP() AND deleted_at IS NULL`. Use the same time convention as existing code (the connection time zone is `+00:00`, spec 4.4). Everything else gives the 404 page. Future-dated, draft, in_review, archived and scheduled posts are never public.

**Lookup order for `/{slug}` (decision 3):**
1. Fixed routes and static folders first: `/aadmin`, `/api`, `/auth`, `/uploads`, `/css`, `/js`, `/img`, `/vendor`, `/category`, `/tag`, `/author`, `/search`, `/favicon.ico`.
2. Slugs in `src/config/reserved-slugs.js` that have no page yet (`saved`, `random`, `thank-you`, `feed.xml`, `sitemap.xml`, `robots.txt`, `ads.txt` and so on) return the 404 page. They must never fall through to the post lookup.
3. A slug that does not match `^[a-z0-9-]{1,100}$` returns 404 at once.
4. Post (published rule), then `pages` row, then `redirects` row, then 404.
5. **[DECISION]** A trailing slash gets a 301 to the same address without it. An uppercase letter gets a 301 to the lowercase address.
6. Redirects: 301 to the target only if the target is a currently published post or an existing page. Collapse chains to one hop (A to B to C becomes A to C). A loop or an unpublished target returns 404.
7. The catch-all route `/{slug}` is registered LAST in `app.js`.

**Pagination (home, category, tag, author):** `?page=N`. Non-numeric or less than 1 means page 1. A page above the last one returns 404 (except page 1 of an empty list). Render Previous / Next links with the page number (real links; Load-more JavaScript comes in M6). Add `<link rel="prev">` and `rel="next"` in the head.

---

## 3. LAYOUT (WHAT, WHERE, WHY, HOW)

Wireframes to open and match, in this order: `p1_home.png`, `p2a_post_reading.png`, `p3_archive_search.png`, `p4_static_utility.png`, `p5_mobile.png`, `p7_author_join_dmca.png`. Before coding, write a checklist of every element in each wireframe (top to bottom, left to right) and mark each one built, deferred (with the milestone) or not applicable. Callout numbers in the wireframes match the spec rows in sections 6.1 to 6.8.

**3.1 Files.** New layout `views/layouts/public.njk`. Partials: `topbar`, `header`, `footer`, `card`, `card-row`, `pagination`, `sidebar`, `breadcrumb`, `author-box`. Pages in `views/public/`. The layout links `/css/site.css` and `/js/main.js` (type module). Page title row pattern, containers and spacing come from tokens; add public tokens (`--site-*`) for container width, sidebar width, reading width, public font sizes.

**3.2 Grid.** Container max width 1120 px, side padding 16 px (24 px from 640 px). From 1024 px: two columns `minmax(0, 1fr) 300px` with a 32 px gap (matches the wireframe 640 : 280 ratio). Below 1024 px: one column. Breakpoints are 640 and 1024 px only. Mobile first. No horizontal scroll at 360 px and up.

**3.3 Typography.** System font stack. Body copy 16 px / 1.5. Article body 18 px / 1.7, column max 680 px, centred inside the content column. Card title 17 px bold, 2 lines max (line clamp). Excerpt 15 px, 2 lines max. Meta text 13 px muted. h1 28 px (24 px on mobile). Contrast AA (4.5:1) using the existing colour tokens.

**3.4 Top bar (callout 1).** Light grey strip. LEFT: social icons from `social_links` where `is_active = 1`, `url` is not empty, a valid http or https address, and `show_in_top_bar = 1`, in `sort_order`. RIGHT: top menu from `menu_items` where `location = 'top'` and `is_active = 1` in `sort_order`. Menu links: internal paths or http/https only (skip anything else); `open_in_new_tab` adds `target="_blank" rel="noopener"`. Hidden when both are empty. Icons come from one SVG sprite `public/img/social-icons.svg` used with `<use href="/img/social-icons.svg#facebook">`: create simple ORIGINAL symbols for facebook, instagram, pinterest, x, youtube, tiktok, linkedin, telegram, whatsapp, threads, reddit and a generic link icon (I will replace them with official artwork later). Each icon link has an `aria-label` (the platform label), `target="_blank"`, `rel="me noopener"`.

**3.5 Header (callout 2).** Site name from `general.siteName` as the logo (text, links to `/`). Category navigation: categories with `show_in_nav = 1` ordered by `sort_order`, then `name`, max 6, then a "More" dropdown for the rest (use `<details>`, works without JavaScript). The current category is marked active. Search icon links to `/search`. Sticky on desktop (56 px), not sticky on mobile. **No call-to-action button.** Include `slots/header_action.njk` with `ignore missing` at the right edge.

**3.6 Footer (callout 12).** Site name, `footerBlurb`, contact email (`contactEmail`, shown as a mailto link), "Follow us" icons (`show_in_footer = 1`), footer menu (`location = 'footer'`), copyright `© {current year} {siteName}`. Include `slots/footer_extra.njk`. No "Cookie settings" link yet (M7).

**3.7 Mobile (wireframe p5, spec 6.5).** Hamburger drawer built with `<details>`: categories, search field, top-menu links. Single column. Tap targets at least 44 px, body text at least 16 px. **No sidebar on mobile.** The sidebar is shown only from 1024 px. **[DECISION]** On the HOME page below 1024 px, "Popular posts" appears as a horizontal scroll-snap row (CSS only, same data as the sidebar block) directly under the featured card, as in the wireframe. The post page shows no sidebar and no scroller on mobile.

**3.8 Site data service** (`src/modules/site`). One function returns: general settings (siteName, tagline, contactEmail, footerBlurb, timezone), top menu, footer menu, social links, navigation categories. Cache it in memory (same `cache.js`, key prefix `site:`), expose `clearSiteCache()` (M6 will call it from the settings editor), and also clear it when M2/M3 code changes categories (find and call it there, additively). `formatDate(date, timezone)` is one helper used everywhere; render `<time datetime="ISO">`.

**3.9 Head (minimum; the full SEO is M7).** `<title>`: home `siteName – tagline`; others `Page title – siteName`. Meta description: post `seo_description` else `excerpt`; home tagline; category its description. Canonical `SITE_URL` + path (for lists keep `?page=N` only when N > 1). `robots` noindex for search, 404, tag pages with fewer than 3 posts, preview. Include `lang="en"`, viewport meta, skip-to-content link, landmarks (`header`, `nav`, `main`, `aside`, `footer`), visible focus.

---

## 4. PAGES

**4.1 Home P1 (`/`).**
WHAT: three blocks plus sidebar. WHY: send readers into stories.
- **Featured area (callout 3).** Big card: the newest published post with `is_featured = 1`, else the newest published post. Two small cards: the next two posts ordered by `is_featured DESC, is_editor_pick DESC, published_at DESC, id DESC`, excluding the big one. Big card has an overlay strip with category pill, title, and a meta line (author, date, views, comments). On mobile only the big card shows plus the Popular scroller (section 3.7).
- **Latest articles (callout 5).** All published posts EXCLUDING the three featured-area ids, ordered `published_at DESC, id DESC`, 10 per page, as rows: thumbnail left (about 28% width), then category (accent colour), title, meta (author, date, views, comments), excerpt (2 lines). Compute the three featured ids on every page request so page 2 and later still exclude them. The featured area shows on page 1 only. Empty site: "No stories yet." and no other blocks.
- **Pagination (callout 7):** section 2 rules.
- **Sidebar (callouts 9, 10, 11), from 1024 px:** *Editor picks*: up to 3 newest published posts with `is_editor_pick = 1`. *Popular posts*: top 5 by views over the last 7 days (sum of `post_daily_views.views` joined to published posts), order by sum DESC, `published_at` DESC; if fewer than 5, fill with the newest published posts not already listed. **[DECISION]** the 7/30 day toggle is M6. *Popular categories*: top 8 categories with at least one published post by post count DESC then name, each with its count and a link to `/category/{slug}`. A block with no data is not rendered.
- Stay connected, People also read, tabs, native ad row, consent banner are NOT built (M6, M7, M8).

**4.2 Post page P2 (`/{slug}`), wireframe p2a.**
- **Progress bar (callout 1).** 3 px bar fixed at the top, grows with the scroll position inside the article. File `public/js/features/progress-bar.js`, started by `data-feature="progress-bar"`. It is decoration only: page works without it.
- **Breadcrumb and title (callout 2).** `Home › Category` (category links to its page), exactly one `h1`. Meta line: author name (link to `/author/{slug}`), published date, `reading_minutes` as "N min read", view count, comment count. **[DECISION]** until M5 the comment count is plain text (no `#comments` link).
- **Cover (callout 3).** 16:9 (`aspect-ratio`), width and height attributes, `srcset` from the 400/800/1200 versions through one shared helper `mediaSrcset(media)` (create it in the media module if it does not exist), loaded eagerly, alt from `media.alt_text`. Caption under it from `credit_text` and `credit_url` (link with `rel="nofollow noopener"`, only http/https), through the same credit-caption function the admin preview already uses.
- **Body (callout 4).** Sanitized HTML, 680 px column, images centred, `max-width: 100%`, `height: auto`, each inline image with its alt text and its credit caption (reuse the existing function).
- **Tag chips.** Below the article, links to `/tag/{slug}`.
- **Author box.** Avatar (from `avatar_media_id`, else a coloured initials circle), name, short bio, link "View all stories by this author" to `/author/{slug}`.
- **Related, "You may also like" (callout 7 of the interaction wireframe).** 4 cards. Score every other published post: +3 same category, +2 per shared tag (counting at most 3), +1 if published within 30 days, plus a random 0 to 0.5. **[DECISION]** to keep it one query, fetch up to 60 candidates (same category OR sharing a tag, newest first; fill with newest posts if fewer than 4) with the tag-overlap counts in SQL, then score and pick in code. Never include the post itself. Cache 1 hour under `related:{postId}`.
- **Sidebar (callout 6)** from 1024 px: Editor picks and Popular posts, sticky. NO ad.
- Not built: ads, share, Save, rating, comments (M5, M8).
- Include `slots/post_end.njk` (ignore missing) after the article.

**4.3 Category, tag, author, search (wireframe p3, p7).**
- **Category** `/category/{slug}`: `h1` name, description, "N stories", grid of cards (2 columns from 640 px, 3 from 1024 px, no sidebar), 12 per page. Unknown slug: 404.
- **Tag** `/tag/{slug}`: same layout. Count published posts only; fewer than 3 means noindex.
- **Author** `/author/{slug}` (wireframe p7, left): avatar, name, "N stories", bio, grid 12 per page. **[DECISION]** an author with zero published posts returns 404 (keeps empty guest-author pages out of search engines). Authors have no social fields in the schema, so do not draw social icons.
- **Search** `/search?q=` (wireframe p3, right), spec 8.14:
  - Query trimmed, 2 to 80 characters; otherwise show a hint and no results.
  - `MATCH(title, excerpt, content_text) AGAINST(? IN NATURAL LANGUAGE MODE)` on published posts. Order by relevance DESC, `published_at` DESC. 20 per page.
  - **[DECISION]** InnoDB FULLTEXT ignores words shorter than 3 characters. If the query is shorter than 3 characters, or FULLTEXT returns nothing and the query is 2 characters, fall back to `title LIKE ?` with `%`, `_` and backslash escaped, parameterized. Record this.
  - Result rows: thumbnail, title (matched words highlighted), snippet (about 160 characters of `content_text` around the first match), category, date. Line "N results for “query”". Escape the text FIRST, then wrap matches in `<mark>`; never put raw text in HTML.
  - Empty state: message, 4 popular posts, the category list. The page is noindex. `GET /api/search` returns the same results as JSON. Both limited to 30 requests per minute per IP (spec 10.1) using the existing rate limiter.

**4.4 Static pages (wireframes p4, p7).** `/about-us`, `/contact-us`, `/privacy-policy`, `/image-use-policy`, `/dmca-removal`, `/join-us`, `/terms`, `/story-terms` all come from the `pages` table: `h1` title, sanitized HTML, article typography. No sidebar. **[DECISION]** `/contact-us` and `/about-us` show only their text now (the form and team row arrive in M6).

**4.5 404 page (wireframe p4, middle).** HTTP 404, noindex. Message "We couldn't find that page", a search form, and the 6 newest published posts. 403 and 500 use the friendly pages that already exist (they must also use the public layout on public URLs and never leak SQL, stack traces or file paths).

---

## 5. BEHAVIOUR

**5.1 View counter (spec 8.15).**
- WHAT: `POST /api/posts/:id/view`. WHEN: the browser module sends it once per session per post. WHY: feeds Popular posts and view counts.
- Server: only for published posts (else 404 JSON). Ignore known bots by user-agent (a small regex list such as bot, crawl, spider, slurp, preview, headless). Rate limit 60 per minute per IP. In ONE transaction: `INSERT ... ON DUPLICATE KEY UPDATE views = views + 1` into `post_daily_views` (day = UTC date) and `UPDATE posts SET view_count = view_count + 1`. Response 204.
- Browser: `public/js/features/view-counter.js` (`data-feature="view-counter"`, `data-post-id`). It uses `sessionStorage` to send once per post per session, then adds the id to `localStorage.readPosts` (newest first, maximum 200 ids, JSON array). Use `navigator.sendBeacon` with a `fetch(..., {keepalive: true})` fallback. Fail silently.
- **[DECISION]** This is the ONLY public write endpoint exempt from CSRF, so public pages can be cached without cookies. Protect it with a same-origin `Origin` or `Referer` check plus the rate limit. Record this in `docs/SPEC.md` section 10.2. M5 will decide how public forms get CSRF tokens; do not solve that now.
- Never count on the admin preview.

**5.2 Cache (spec 3.3).**
- `src/lib/cache.js` API: `get(key)`, `set(key, value, ttlSeconds)`, `del(key)`, `delPrefix(prefix)`, `clear()`. Add a maximum of 500 entries (drop the oldest).
- Cache the rendered HTML of home, post, category and author GET requests for 60 seconds, key = path plus sorted query string. Do NOT cache tag, search, preview, 404, redirects or any request that carries an admin session cookie. Do not store cache entries for responses that are not 200.
- Cache data blocks: `site:*` (until cleared), `related:{id}` 1 hour, `sidebar:*` (editor picks, popular posts, popular categories) 1 hour.
- **Invalidation.** M3 already calls an invalidate function when a post is published, edited while published, or archived. Find those call sites and make that function clear: home pages, that post's page, its category pages, its author pages, `sidebar:*`, `related:*` (all), and `site:*` when a category changes. Do not add new calls inside admin code except through the existing function. Also clear on delete of a published post and on slug change (old and new URL).
- **No cookies on public responses.** Public routes must not create a session, a CSRF cookie or any `Set-Cookie`. If the session or CSRF middleware is mounted globally, restrict it to `/aadmin`, `/auth` and `/api/admin` WITHOUT changing admin behavior, and prove it with a test.
- Response headers on cached public pages: `Cache-Control: public, max-age=0, must-revalidate` (the 60 s cache is server side). Keep the existing security headers and CSP.

**5.3 Slug change and redirects.** The M3 `redirects` rows must work end to end: old URL gives one 301 to the new URL, chains collapse, an unpublished target gives 404.

**5.4 Real preview.** `/aadmin/preview/:id` now renders the REAL public post template (same partials, CSS bundle, sidebar) with a clear "Preview" banner, `noindex`, `Cache-Control: no-store`, no view counting, no cache, and the same permissions as before. A preview of an unpublished post must not need the published rule. Remove the old temporary preview layout. Ads: none yet.

**5.5 Demo data (development only).** `npm run dev:demo-posts` inserts about 14 published demo posts into the DEV database: slugs prefixed `demo-`, several categories, 2 authors (one guest), 3 to 5 tags, dates spread over 60 days, some `is_featured`, some `is_editor_pick`, some `post_daily_views` rows, no cover required. It refuses to run when `NODE_ENV=production` or when the database name equals `DB_TEST_NAME`. `npm run dev:demo-clean` deletes only `demo-` rows. Cards without a cover show a neutral placeholder block with the same aspect ratio.

---

## 6. PHASES

**PHASE 1: foundation.** Section 0.3 reuse plan; sections 3.1 to 3.9; static pages (4.4); 404 (4.5); the catch-all routing order (section 2, items 1 to 7 and the redirect rule); social sprite; site data service; demo data scripts; CSS bundle. Tests for routing order, published rule, redirects, 404, menus and social filtering, no `Set-Cookie`. Report. STOP.

**PHASE 2: content pages.** Sections 4.1 to 4.3: cards partial (one query with joins for author, category, cover; no per-row queries), Home, Post, Category, Tag, Author, Search, pagination, sidebar blocks, related posts, progress-bar module. Tests per section 7. Report. STOP.

**PHASE 3: behaviour and sync.** Sections 5.1 to 5.4: view counter, cache and invalidation, redirect end to end, real preview, no-cookie proof, performance checks, smoke test extension, spec notes. Report with manual browser checks for me. STOP.

---

## 7. TESTS (database `elatedquest_m0_test`)

Write tests for every line. Use unique `t4_` data and clean up.
1. Published rule: draft, in_review, archived, scheduled and future-dated posts return 404 on every public route (post, category, tag, author, search, sidebar blocks, related, sitemap-like lists).
2. Publishing makes the post appear on `/` and its category on the very next request (cache cleared). Archiving removes it everywhere on the next request. Editing a published post shows the new title on the next request.
3. Slug change: old URL gives one 301 to the new URL; a chain collapses; an unpublished target gives 404; reserved-but-unbuilt slugs (`saved`, `random`, `thank-you`) return 404; uppercase and trailing slash give 301.
4. Search: finds a known word, ignores unpublished posts, escapes `<script>` in titles and snippets, honours the 2 to 80 limit, the 2-character fallback and the 30 per minute limit, and wildcard characters in the query do not widen the match.
5. Pagination: page 0, `abc`, negative values act as page 1; a page beyond the last returns 404; the home list excludes the featured-area posts on every page.
6. Tag noindex rule (fewer than 3 posts); an author with no published posts returns 404; category and author counts count published posts only.
7. Related posts exclude the post itself, never include unpublished posts, return at most 4 and are cached under `related:{id}`.
8. View counter: counts once per request, ignores bots, only for published posts, respects 60 per minute, exempt from CSRF but rejects a foreign `Origin`, increments `post_daily_views` and `view_count` together; the admin preview never counts.
9. Public responses have no `Set-Cookie`; admin responses still do; admin tests are unchanged and green.
10. XSS: a title and an excerpt containing `<script>` are escaped on every page; `content_html` containing `<script>` is stripped at render; a `javascript:` menu or social URL is not rendered.
11. Menus and social links: inactive, empty and invalid rows are skipped; order follows `sort_order`; footer text and menu come from the database.
12. Query count (log it): home and a post page each run a small fixed number of queries (no N+1).
13. Smoke test: request every public URL and `/aadmin/preview/:id`, no 500, stylesheet linked, exactly one `h1`.

---

## 8. DONE WHEN (report each PASS or FAIL with how you tested it)

- a. Only published posts with a due `published_at` are reachable; all other statuses and future dates return 404.
- b. Publishing updates the home page and its category on the next request; archive removes the post everywhere.
- c. A changed slug keeps the old URL working with a single 301.
- d. Search returns relevant results, escapes output, and respects the limits.
- e. Home, post, category, tag, author, search, static pages and 404 exist and match their wireframes (checklist from section 3, with deferred items named).
- f. No horizontal scroll at 375, 768 and 1280 px; sidebar only from 1024 px; Popular scroller on mobile home.
- g. Menus, social links, footer text and navigation come from the database.
- h. The view counter works as specified and public pages set no cookies.
- i. The admin preview uses the real public template and is never counted or cached.
- j. No existing test, admin page or M1 to M3 behavior broke.

---

## 9. FINAL MANUAL CHECKS (list these for me at the end of Phase 3)

Run `npm run dev:demo-posts`; open `/`, a demo post, a category, a tag, an author, `/search?q=` with 2 and 4 letters, a made-up URL, `/privacy-policy`; publish and archive a post in the admin and refresh the public pages; change a slug and open the old URL; preview a draft; resize to phone width; confirm in the browser tools that public pages set no cookies; run `npm run dev:demo-clean`.
