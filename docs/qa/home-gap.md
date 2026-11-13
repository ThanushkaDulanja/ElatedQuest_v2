# Homepage wireframe gap analysis

Scope: the public homepage and shared public top bar, header, content cards, sidebar, pagination and footer. The Auxx homepage supplies layout measurements and placement only. Elated Quest content, images, logo text, site settings and navigation remain database-driven through the existing public services and `/aadmin` settings.

| Wireframe element | Spec ref | Final status | Implementation |
| --- | --- | --- | --- |
| Top bar: social icons and menu links | SPEC 6.1 #1; 6.8 | BUILD NOW | Existing social and menu data feed the top bar. Home page styling matches reference spacing and separators. |
| Header: site name, category links, More and search | SPEC 6.1 #2; 6.8 | BUILD NOW | Retains Elated Quest branding, configured category navigation, native More menu and search. No reference brand or content copied. |
| Featured: two equal lead cards | SPEC 6.1 #3 | BUILD NOW | Two 324×163 px covers at 1280 px; title, author/date/comment count and three-line excerpt below. Content comes from existing featured/editor pick selection. |
| Featured: compact third item | SPEC 6.1 #3 | BUILD NOW | 96×68 px thumbnail with title and date, under the two lead cards. |
| People also read and category tabs | SPEC 6.1 #4 | DEFERRED — M6 | No placeholder or reserved space. |
| Sidebar: editor picks, popular posts and categories | SPEC 6.1 #9–11 | BUILD NOW | 324 px sidebar at 1280 px. Existing data and behavior retained; post thumbnails are 96×68 px. |
| Latest articles | SPEC 6.1 #5 | BUILD NOW | Three columns across 1068 px at 1280 px; 329×165 px images, 40 px gaps. At 640–1023 px use two columns; below 640 px use one. Each card shows image, title, category, author, date, comments and a three-line excerpt. |
| Pagination | SPEC 6.1 #7; M4 brief §2 | BUILD NOW | Existing next-page link and previous-page behavior retained. |
| Native ad row | SPEC 6.1 #6 | DEFERRED — M8 | No placeholder or reserved space. |
| Footer editorial sections | SPEC 6.1 #12 | BUILD NOW | Dark footer with database-driven editor picks, popular posts and popular categories when available. |
| Footer site details | SPEC 6.1 #12; 6.8 | BUILD NOW | Site name, about text, contact, social links, footer menu and copyright use existing settings. Footer layout has three content columns and a separate bottom bar. |
| Consent banner | SPEC 6.1 #13 | DEFERRED — M7 | No placeholder or reserved space. |
| Mobile layout | SPEC 6.5 | BUILD NOW | Responsive stacked cards, hidden desktop sidebar and existing Popular posts scroll-snap row. Target widths: 375, 768 and 1280 px without horizontal overflow. |

## Visual verification

The Playwright script `scripts/ui-check.js` records desktop and mobile screenshots and checks homepage geometry, card metadata order, CSS response, pagination presence when page 2 exists, and overflow at 375, 768 and 1280 px. Target desktop measurements are shell 1164 px, inner width 1068 px, main/sidebar 696/324 px, 324×163 px lead images, 96×68 px compact/sidebar thumbnails, and 329.33×164.67 px latest cards. Verification: PASS. Playwright completed against the configured local hostname and database. It measured shell 1164 px, inner width 1068 px, sidebar and lead width 324 px, lead cover height 163 px, compact image 96×68 px, and latest card width/cover height 329.33×164.66 px. It confirmed three latest columns, category after title, section order and no horizontal overflow at 375, 768 and 1280 px. Public CSS returned HTTP 200. Page 2 is not present in current data, so the conditional next-page state was not exercised.

## Data and integration

No schema, migration, admin route, admin template, admin browser script or database row was changed. The homepage reads existing site, featured/latest post, sidebar and footer settings data. Changes to brand text, imagery, navigation and content remain controlled by Elated Quest records and `/aadmin` settings. The implementation uses existing fields; it does not add Auxx branding or content.

