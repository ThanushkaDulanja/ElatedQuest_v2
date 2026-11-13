import { normalizeEmail } from "../../lib/email.js";
import { visitorHash as hashVisitor } from "../../lib/visitor-hash.js";

const textValue = (value) => String(value ?? "").trim();
const plainText = (value) => textValue(value).replace(/\r\n?/gu, "\n");

export function createCommentsService(repository, settingsService, engagementLimiter, commentLimiter = null) {
  return {
    visitorHash(ip, userAgent) {
      return hashVisitor(ip, userAgent);
    },
    async submit(input) {
      const postId = Number(input.postId);
      if (!Number.isSafeInteger(postId) || postId < 1) { throw Object.assign(new Error("Invalid post."), { status: 404 }); }
      if (textValue(input.honeypot)) { return { accepted: true, visible: false }; }
      const name = textValue(input.name);
      const email = normalizeEmail(input.email ?? "");
      const body = plainText(input.body);
      if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 190 || body.length < 2 || body.length > 2000) { throw Object.assign(new Error("Check your name, email, and comment."), { status: 400 }); }
      const post = await repository.postForComments(postId);
      if (!post || post.status !== "published" || post.deleted_at || !post.published_at) { throw Object.assign(new Error("Post not found."), { status: 404 }); }
      const closeAfterDays = Number(post.close_after_days ?? 0);
      if (!post.allow_comments || (closeAfterDays > 0 && Date.now() - new Date(post.published_at).getTime() > closeAfterDays * 86400000)) { throw Object.assign(new Error("Comments are closed."), { status: 403 }); }
      const voterHash = input.voterHash;
      if (commentLimiter ? !await commentLimiter.allow(voterHash) : await repository.recentCommentCount(voterHash) >= 5) { throw Object.assign(new Error("Please wait before posting again."), { status: 429 }); }
      if (await repository.repeatedComment(postId, voterHash, body)) { throw Object.assign(new Error("This comment was already submitted."), { status: 409 }); }
      const settings = await settingsService.get();
      const rules = settings.comments ?? {};
      const links = (body.match(/https?:\/\/|www\./giu) ?? []).length;
      const blocklist = Array.isArray(rules.blocklist) ? rules.blocklist : [];
      const blockedWord = blocklist.some((word) => word && body.toLowerCase().includes(String(word).toLowerCase()));
      const tooFast = Number(input.elapsedMs) < 5000;
      const mustWait = links > 0 || blockedWord || tooFast;
      let status = rules.moderation === "none" && !mustWait ? "approved" : "pending";
      if (rules.moderation === "first_time" && !mustWait && await repository.approvedCommentExists(email)) { status = "approved"; }
      let parentId = input.parentId ? Number(input.parentId) : null;
      if (parentId) {
        const depth = await repository.parentDepth(postId, parentId);
        if (!depth) { throw Object.assign(new Error("That comment cannot be replied to."), { status: 400 }); }
        if (depth >= 3) {
          parentId = await repository.levelThreeParent?.(postId, parentId) ?? (depth === 3 ? parentId : null);
          if (!parentId) { throw Object.assign(new Error("That comment cannot be replied to."), { status: 400 }); }
        }
      }
      const id = await repository.insertComment({ postId, parentId, name, email, body, status, isStaff: false, voterHash });
      return { accepted: true, visible: status === "approved", id };
    },
    async list(postId, sort = "newest", offset = 0, limit = 10) {
      const safeSort = ["newest", "oldest", "voted"].includes(sort) ? sort : "newest";
      const safeOffset = Number.isSafeInteger(Number(offset)) && Number(offset) >= 0 ? Number(offset) : 0;
      const rows = await repository.listApproved(Number(postId), safeSort, safeOffset, Math.min(10, Math.max(1, Number(limit) || 10)));
      return rows.map((row) => ({ ...row, author_initials: row.author_name.trim().split(/\s+/u).map((part) => part[0]).join("").slice(0, 2).toUpperCase() }));
    },
    async canComment(postId) {
      const post = await repository.postForComments(Number(postId));
      if (!post || post.status !== "published" || post.deleted_at || !post.published_at || !post.allow_comments) { return false; }
      const closeAfterDays = Number(post.close_after_days ?? 0);
      return !(closeAfterDays > 0 && Date.now() - new Date(post.published_at).getTime() > closeAfterDays * 86400000);
    },
    async vote(commentId, voterHash, value) {
      if (!Number.isSafeInteger(Number(commentId)) || ![1, -1].includes(Number(value))) { throw Object.assign(new Error("Invalid vote."), { status: 400 }); }
      return repository.voteComment(Number(commentId), voterHash, Number(value));
    },
    async moderate(commentId, status) {
      if (!Number.isSafeInteger(Number(commentId)) || !["approved", "spam", "trashed"].includes(status)) { return false; }
      return repository.moderate(Number(commentId), status);
    },
    async staffReply(input) {
      const postId = Number(input.postId);
      const parentId = Number(input.parentId);
      const body = plainText(input.body);
      if (!Number.isSafeInteger(postId) || !Number.isSafeInteger(parentId) || body.length < 2 || body.length > 2000) { throw Object.assign(new Error("Enter a reply between 2 and 2,000 characters."), { status: 400 }); }
      const parent = await repository.approvedParent(postId, parentId);
      if (!parent) { throw Object.assign(new Error("That comment is no longer available."), { status: 404 }); }
      const depth = await repository.parentDepth(postId, parentId);
      const safeParentId = depth >= 3 ? await repository.levelThreeParent?.(postId, parentId) ?? parentId : parentId;
      const email = normalizeEmail(input.staffEmail || "staff@localhost.invalid");
      await repository.insertComment({ postId, parentId: safeParentId, name: String(input.staffName || "Elated Quest Team").slice(0, 80), email, body, status: "approved", isStaff: true, voterHash: hashVisitor("staff", email) });
      return true;
    },
    rateLimit(voterHash) { return engagementLimiter.allow(voterHash); },
  };
}
