import { pool } from "../../db/pool.js";

export function createAuditRepository(database = pool) {
  return {
    async filters() { const [actors] = await database.execute("SELECT DISTINCT u.id, u.email FROM audit_log a JOIN users u ON u.id = a.actor_id ORDER BY u.email"); const [actions] = await database.execute("SELECT DISTINCT action FROM audit_log ORDER BY action"); return { actors, actions }; },
    async list({ actor, action, from, to }) {
      const [rows] = await database.execute("SELECT a.id, a.actor_id, u.email AS actor_email, a.action, a.entity_type, a.entity_id, a.meta, a.ip, a.created_at, CASE WHEN a.entity_type = 'user' THEN CASE WHEN eu.id IS NULL THEN CONCAT('Removed user #', a.entity_id) ELSE CONCAT('User: ', COALESCE(NULLIF(eu.display_name, ''), eu.email)) END WHEN a.entity_type = 'author' THEN CASE WHEN ea.id IS NULL THEN CONCAT('Removed author #', a.entity_id) ELSE CONCAT('Author: ', ea.display_name) END WHEN a.entity_type IS NULL THEN '—' ELSE CONCAT(a.entity_type, ' #', COALESCE(a.entity_id, '')) END AS entity_label FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN users eu ON a.entity_type = 'user' AND eu.id = CAST(a.entity_id AS UNSIGNED) LEFT JOIN authors ea ON a.entity_type = 'author' AND ea.id = CAST(a.entity_id AS UNSIGNED) WHERE (? = '' OR a.actor_id = CAST(? AS UNSIGNED)) AND (? = '' OR a.action = ?) AND (? = '' OR a.created_at >= ?) AND (? = '' OR a.created_at < ?) ORDER BY a.created_at DESC LIMIT 500", [actor, actor, action, action, from, from, to, to]); return rows;
    },
  };
}
