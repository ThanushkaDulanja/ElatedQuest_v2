// Keep browser saves and integration submissions on the same wire format.
export function buildPostPayload(fields, { contentHtml = fields.content_html, expectedUpdatedAt = fields.expected_updated_at, autosave = false } = {}) {
  const payload = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) { payload.set(name, String(value)); }
  }
  payload.set("content_html", contentHtml ?? "");
  payload.set("expected_updated_at", expectedUpdatedAt ?? "");
  if (autosave) { payload.set("autosave", "1"); } else { payload.delete("autosave"); }
  return payload;
}
