export function roleLabel(role) {
  if (role === "owner") { return "Admin"; }
  if (role === "editor") { return "Content Moderator"; }
  return role;
}
