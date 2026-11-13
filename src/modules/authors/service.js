import { authorSlug } from "./validators.js";

export function createAuthorsService(repository, { uploadsPublicUrl = process.env.UPLOADS_PUBLIC_URL ?? "/uploads" } = {}) {
  async function uniqueSlug(name, currentId = null) {
    const base = authorSlug(name);
    let candidate = base;
    let suffix = 2;
    while (true) {
      const match = await repository.findSlug(candidate);
      if (!match || Number(match.id) === Number(currentId)) {return candidate;}
      candidate = `${base.slice(0, 94)}-${suffix++}`;
    }
  }
  return {
    list: () => repository.list(),
    async publicTeam() {
      const root = uploadsPublicUrl.replace(/\/+$/u, "");
      return (await repository.listAbout()).map((author) => ({
        ...author,
        initials: String(author.display_name ?? "?").trim().split(/\s+/u).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        avatar_url: author.avatar_url ? `${root}/${author.avatar_url.replace(/^\/uploads\/?/u, "")}` : null,
      }));
    },
    forUser: (id) => repository.findForUser(id),
    async saveProfile(user, values, request, authorId = null) {
      let author = authorId ? await repository.findById(authorId) : await repository.findForUser(user.id);
      if (authorId && user.role !== "owner") {throw new Error("Forbidden");}
      if (!author && !authorId) {author = null;}
      const slug = await uniqueSlug(values.displayName, author?.id);
      const id = await repository.save(author, { ...values, slug, userId: user.id });
      if (!authorId) { await repository.updateUserDisplayName(user.id, values.displayName); }
      await repository.writeAudit({ actorId: user.id, action: "author.update", entityId: String(id), ip: request.ip, meta: { show_on_about: Boolean(values.showOnAbout) } });
    },
    async saveGuest(values, request, id = null, actor) {
      if (id && !(await repository.findById(id))?.is_guest) {throw new Error("Guest author not found.");}
      const slug = await uniqueSlug(values.displayName, id);
      const authorId = await repository.saveGuest({ ...values, slug }, id);
      await repository.writeAudit({ actorId: actor.id, action: id ? "author.update" : "author.create", entityId: String(authorId), ip: request.ip, meta: { is_guest: true, show_on_about: Boolean(values.showOnAbout) } });
    },
  };
}
