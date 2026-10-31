# Project rules
- Source of truth: docs/SPEC.md and database/schema.sql. Build only what the spec says.
  Read section 1.5 (Decisions) first: it settles open points.
- Stack: Node.js + Express, Nunjucks templates, plain CSS, vanilla JavaScript (ES modules),
  MySQL 8 via mysql2. No front-end framework, no ORM, no bundler.
- Layers: routes -> controller -> service -> repository. SQL lives ONLY in repository.js
  files and is always parameterized (?). Never build SQL from strings.
- One feature = one folder in src/modules/<feature>/. Other modules call its service,
  never its repository. Shared code in src/lib/ must know nothing about a feature.
- Browser code: one small ES module per feature in public/js/features/, started by a
  data-feature attribute. No inline scripts. Pages must still work without JavaScript.
- Database change = new numbered file in src/db/migrations/ + update database/schema.sql.
- Security is mandatory: every /aadmin page and admin API route calls requireRole()
  itself. Secrets live only in .env. Sanitize post HTML on the server before saving.
- Public pages never show drafts, in-review, scheduled or archived posts.
- If code and spec disagree or the spec is unclear, stop and ask. One milestone at a time.
- Before saying done: run npm run lint and npm test, then list every "Done when" item as
  PASS or FAIL with how you tested it.
- Ask before adding a dependency. Small commits with clear messages.
