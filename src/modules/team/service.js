import { normalizeEmail } from "../../lib/email.js";
import { formatDateTimeInZone } from "../../lib/time.js";

export function createTeamService({ repository, ownerEmail, emailer, settingsService = { async get() { return { general: { timezone: "UTC" } }; } } }) {
  const ownerAddress = normalizeEmail(ownerEmail);
  async function audit(action, actor, id, request) {
    await repository.writeAudit({ actorId: actor.id, action, entityId: String(id ?? ""), ip: request.ip, meta: null });
  }
  return {
    async list() {
      const [rows, settings] = await Promise.all([repository.list(), settingsService.get()]);
      const timeZone = settings.general?.timezone || "UTC";
      return rows.map((row) => ({
        ...row,
        last_login_display: row.last_login_at ? formatDateTimeInZone(row.last_login_at, timeZone) : null,
      }));
    },
    async invite(email, actor, request) {
      if (email === ownerAddress || await repository.findByEmail(email)) {throw new Error("That email already has access.");}
      const id = await repository.invite(email, actor.id);
      await audit("team.invite", actor, id, request);
      await emailer.sendInviteNotice(email);
    },
    async changeStatus(id, status, actor, request) {
      const updated = await repository.setStatus(id, status);
      if (!updated) {throw new Error("Team member not found or locked.");}
      await audit(status === "disabled" ? "team.disable" : "team.enable", actor, id, request);
    },
    async resend(id, _actor) {
      const members = await repository.list();
      const member = members.find((row) => Number(row.id) === Number(id));
      if (!member || member.status !== "invited") {throw new Error("Only invited Content Moderators can receive a reminder.");}
      await emailer.sendInviteNotice(normalizeEmail(member.email));
    },
    async remove(id, actor, ownerId, request) {
      if (Number(id) === Number(ownerId)) {throw new Error("The Admin account is locked.");}
      await repository.remove(id, ownerId);
      await audit("team.remove", actor, id, request);
    },
  };
}
