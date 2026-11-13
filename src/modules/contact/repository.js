import { pool } from "../../db/pool.js";

export function createContactRepository(database = pool) {
  return {
    async createMessage(message) {
      const [result] = await database.execute("INSERT INTO contact_messages (name, email, subject, message, ip_hash) VALUES (?, ?, ?, ?, ?)", [message.name, message.email, message.subject || null, message.message, message.ipHash]);
      return result.insertId;
    },
    async createStory(story) {
      const [result] = await database.execute("INSERT INTO submissions (name, email, title, body_text, links_text, ip_hash, terms_accepted_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())", [story.name, story.email, story.title, story.body, story.links.join("\n") || null, story.ipHash]);
      return result.insertId;
    },
    async listStories() {
      const [rows] = await database.execute("SELECT id, name, email, title, body_text, links_text, status, created_at FROM submissions WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT 200", ["new"]);
      return rows;
    },
    async listMessages() {
      const [rows] = await database.execute("SELECT id, name, email, subject, message, status, created_at FROM contact_messages ORDER BY FIELD(status, 'new', 'read', 'replied', 'spam'), created_at DESC, id DESC LIMIT 200");
      return rows;
    },
    async readStoryForConversion(id) {
      const [rows] = await database.execute("SELECT id, name, title, body_text, links_text FROM submissions WHERE id = ? AND status = ? LIMIT 1", [id, "new"]);
      return rows[0] ?? null;
    },
    async setStoryStatus(id, status, actorId, ip) {
      const [result] = await database.execute("UPDATE submissions SET status = ?, handled_by = ? WHERE id = ? AND status = ?", [status, actorId, id, "new"]);
      if (result.affectedRows) { await database.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, ?, 'submission', ?, ?)", [actorId, `submission.${status === "accepted" ? "accept" : "reject"}`, String(id), ip ?? null]); }
      return result.affectedRows > 0;
    },
    async setMessageStatus(id, status, actorId, ip) {
      const [result] = await database.execute("UPDATE contact_messages SET status = ? WHERE id = ?", [status, id]);
      if (result.affectedRows) { await database.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, 'message.status', 'contact_message', ?, ?)", [actorId, String(id), ip ?? null]); }
      return result.affectedRows > 0;
    },
    async convertStory(id, actorId, content, ip) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id, name, title, body_text, links_text FROM submissions WHERE id = ? AND status = ? FOR UPDATE", [id, "new"]);
        if (!rows[0]) { await connection.rollback(); return null; }
        const story = rows[0];
        const [authorResult] = await connection.execute("INSERT INTO authors (display_name, slug, is_guest, show_on_about) VALUES (?, ?, 1, 0)", [story.name.slice(0, 120), `guest-story-${story.id}`]);
        const [postResult] = await connection.execute("INSERT INTO posts (title, slug, excerpt, content_html, content_text, reading_minutes, author_id, created_by, status, allow_comments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1)", [story.title, `story-${story.id}`, content.excerpt, content.html, content.text, content.readingMinutes, authorResult.insertId, actorId]);
        await connection.execute("UPDATE submissions SET status = ?, converted_post_id = ?, handled_by = ? WHERE id = ?", ["accepted", postResult.insertId, actorId, id]);
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, 'submission.accept', 'submission', ?, ?)", [actorId, String(id), ip ?? null]);
        await connection.commit();
        return { postId: postResult.insertId, title: story.title };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
