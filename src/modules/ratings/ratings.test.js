import test from "node:test";
import assert from "node:assert/strict";
import { createRatingsRepository } from "./repository.js";

test("rating replacement keeps one row per visitor and rebuilds aggregate counts", async () => {
  const ratings = new Map();
  let postAggregate;
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql, values) {
      if (sql.startsWith("SELECT id, slug FROM posts")) { return [[{ id: 7, slug: "story" }]]; }
      if (sql.startsWith("INSERT INTO post_ratings")) { ratings.set(`${values[0]}:${values[1]}`, values[2]); return [{ affectedRows: 1 }]; }
      if (sql.startsWith("SELECT COUNT(*) AS rating_count")) { const valuesForPost = [...ratings.entries()].filter(([key]) => key.startsWith(`${values[0]}:`)).map(([, stars]) => stars); return [[{ rating_count: valuesForPost.length, rating_sum: valuesForPost.reduce((sum, stars) => sum + stars, 0) }]]; }
      if (sql.startsWith("UPDATE posts SET rating_count")) { postAggregate = values; return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const repository = createRatingsRepository({ getConnection: async () => connection });
  await repository.setRating(7, "visitor", 2);
  const replaced = await repository.setRating(7, "visitor", 5);
  assert.deepEqual(replaced, { count: 1, sum: 5, slug: "story" });
  assert.deepEqual(postAggregate, [1, 5, 7]);
});
