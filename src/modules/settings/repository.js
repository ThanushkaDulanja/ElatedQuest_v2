import { pool } from "../../db/pool.js";

export function createSettingsRepository(database = pool) {
  return {
    async readAll() { const [rows] = await database.execute("SELECT setting_key, setting_value FROM site_settings"); return Object.fromEntries(rows.map((row) => [row.setting_key, typeof row.setting_value === "string" ? JSON.parse(row.setting_value) : row.setting_value])); },
    async readSocial() { const [rows] = await database.execute("SELECT id, platform, label, url, followers_label, show_in_top_bar, show_in_footer, show_in_stay_connected, sort_order, is_active FROM social_links ORDER BY sort_order, id LIMIT 20"); return rows; },
    async readMenus() { const [rows] = await database.execute("SELECT id, location, label, url, sort_order, is_active, open_in_new_tab FROM menu_items ORDER BY location, sort_order, id LIMIT 60"); return rows; },
    async saveSocial(items, actorId, ip) {
      const connection = await database.getConnection();
      try { await connection.beginTransaction(); await connection.execute("DELETE FROM social_links"); for (const [index, item] of items.entries()) { await connection.execute("INSERT INTO social_links (platform, label, url, followers_label, show_in_top_bar, show_in_footer, show_in_stay_connected, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [item.platform, item.label, item.url, item.followersLabel, item.showTop ? 1 : 0, item.showFooter ? 1 : 0, item.showConnected ? 1 : 0, index, item.active ? 1 : 0]); } await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, meta, ip) VALUES (?, 'social.update', 'social_links', ?, ?)", [actorId, JSON.stringify({ count: items.length }), ip ?? null]); await connection.commit(); }
      catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async saveMenus(items, actorId, ip) {
      const connection = await database.getConnection();
      try { await connection.beginTransaction(); await connection.execute("DELETE FROM menu_items"); for (const [index, item] of items.entries()) { await connection.execute("INSERT INTO menu_items (location, label, url, sort_order, is_active, open_in_new_tab) VALUES (?, ?, ?, ?, ?, ?)", [item.location, item.label, item.url, index, item.active ? 1 : 0, item.newTab ? 1 : 0]); } await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, meta, ip) VALUES (?, 'menu.update', 'menu_items', ?, ?)", [actorId, JSON.stringify({ count: items.length }), ip ?? null]); await connection.commit(); }
      catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async save(values, actorId, ip) {
      const connection = await database.getConnection();
      try { await connection.beginTransaction(); for (const [key, value] of Object.entries(values)) { await connection.execute("INSERT INTO site_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)", [key, JSON.stringify(value), actorId]); } await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, meta, ip) VALUES (?, 'settings.update', 'settings', ?, ?)", [actorId, JSON.stringify({ keys: Object.keys(values) }), ip]); await connection.commit(); }
      catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
  };
}
