# M4 wireframe implementation checklist

Status is scoped to the M4 phase that builds each item. Checked items are implemented; browser visual verification is still pending. M5–M8 work remains deferred.

## p1_home.png — Home

- [x] (1) Social icon row and top menu — Phase 1.
- [x] (2) Site-name header, category navigation, More menu, search link — Phase 1.
- [x] (3) Featured post and two companion cards — Phase 2.
- [ ] (4) People also read tabs and category card row — Deferred to M6.
- [x] (5) Latest article rows with thumbnail, category, title, metadata and excerpt — Phase 2.
- [ ] (6) Native ad row — Deferred to M8; omitted in M4.
- [ ] (7) Load-more control — Deferred to M6; M4 uses link pagination.
- [ ] (8) Stay connected — Deferred to M6.
- [x] (9) Editor picks — Phase 2.
- [x] (10) Popular posts — 7/30-day toggle deferred to M6.
- [x] (11) Popular categories — Phase 2.
- [x] (12) Footer site name, blurb, contact, social links and footer menu — Phase 1.
- [ ] (13) Cookie consent bar — Deferred to M7; omitted in M4.

## p2a_post_reading.png — Post

- [x] (1) Reading progress bar — Phase 2.
- [x] (2) Breadcrumb, title and author/date/read-time/view/comment metadata — Phase 2; comment count stays plain text until M5.
- [x] (3) Cover image with responsive sources and credit caption — Phase 2.
- [x] (4) Sanitized article body with inline image credits — Phase 2.
- [ ] (5) In-article ad — Deferred to M8; omitted in M4.
- [x] (6) Editor picks and popular-post sidebar — sidebar ads omitted in M4/M8.
- [x] (7) Related posts — end-of-article ad deferred to M8.
- [x] Tag chips and author box.

## p3_archive_search.png — Category and Search

- [x] Category heading, description, published count and card grid.
- [x] Archive pagination — load-more behavior deferred to M6.
- [x] Search form, results count and result rows.
- [x] Search empty state with popular stories.

## p4_static_utility.png — Static, 404 and Story Received

- [x] Static page title and sanitized body — Phase 1.
- [x] Friendly 404 heading, search form and six newest published stories.
- [ ] Story Received page — Deferred to M6; no `/thank-you` route in M4.

## p5_mobile.png — Mobile Home and Post

- [ ] Hamburger/details drawer, site name and search control — Phase 1.
- [x] Featured story card.
- [x] Popular posts horizontal scroll-snap row under the featured card.
- [x] Latest story cards.
- [ ] Mobile ad cards — Deferred to M8; omitted in M4.
- [x] Mobile post title, date/read-time, cover and body.
- [x] “Keep reading” related cards.
- [x] No sidebar below 1024 px; no post-page popular scroller.

## p7_author_join_dmca.png — Author, Join Us and DMCA

- [x] Author avatar/initials, name, published count and bio — social icons are not applicable because authors have no social fields.
- [x] Author story-card grid — load-more deferred to M6.
- [x] Join Us static content — Phase 1.
- [x] DMCA title and static content — Phase 1.
