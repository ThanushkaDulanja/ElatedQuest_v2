import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MEDIA_UPLOAD_LIMITS } from "../../config/constants.js";
import { detectMagicFormat } from "./validators.js";

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

export function mediaSrcset(media, uploadsPublicUrl = process.env.UPLOADS_PUBLIC_URL || "/uploads") {
  if (!media?.url_path) { return ""; }
  const root = uploadsPublicUrl.replace(/\/+$/u, "");
  const relative = String(media.url_path).replace(/^\/uploads\/?/u, "");
  const extension = /\.webp$/iu.test(relative) ? ".webp" : "";
  if (!extension) { return ""; }
  const stem = relative.slice(0, -extension.length);
  return [400, 800, 1200].map((width) => `${root}/${stem}-${width}.webp ${width}w`).join(", ");
}

export function createMediaService({ repository, uploadDir, uploadsPublicUrl, now = () => new Date() }) {
  const root = path.resolve(uploadDir);

  function publicUrl(urlPath) {
    const relative = urlPath.replace(/^\/uploads\/?/u, "");
    return `${uploadsPublicUrl.replace(/\/$/u, "")}/${relative}`;
  }

  function localPath(urlPath) {
    const relative = urlPath.replace(/^\/uploads\/?/u, "");
    const resolved = path.resolve(root, relative);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {throw new Error("Invalid media path.");}
    return resolved;
  }

  function view(row) {
    const suffix = row.file_name.replace(/\.webp$/u, "");
    const parentUrl = row.url_path.slice(0, row.url_path.lastIndexOf("/") + 1);
    return {
      ...row,
      url: publicUrl(row.url_path),
      thumbnail_url: publicUrl(`${parentUrl}${suffix}-400.webp`),
      no_alt: !String(row.alt_text ?? "").trim(),
      has_alt: Boolean(String(row.alt_text ?? "").trim()),
      used_count: row.uses?.length ?? 0,
      usage_labels: (row.uses ?? []).map((use) => `${use.use_type}: ${use.label}`).join("; "),
      uses: row.uses ?? [],
    };
  }

  async function writeWebpVariants(buffer) {
    const detected = detectMagicFormat(buffer);
    if (!detected) {throw Object.assign(new Error("The uploaded file is not a supported image."), { status: 415 });}
    let metadata;
    try { metadata = await sharp(buffer, { animated: false, failOn: "error", limitInputPixels: 64_000_000 }).metadata(); }
    catch { throw Object.assign(new Error("The uploaded image is invalid."), { status: 415 }); }
    if (!ACCEPTED_FORMATS.has(metadata.format) || metadata.format !== detected) {throw Object.assign(new Error("The image content does not match a supported image type."), { status: 415 });}
    if (!metadata.width || !metadata.height) {throw Object.assign(new Error("The uploaded image is invalid."), { status: 415 });}

    const date = now();
    const datedFolder = path.join(String(date.getUTCFullYear()), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0"));
    const destination = path.join(root, datedFolder);
    await mkdir(destination, { recursive: true });
    const key = randomUUID();
    const extension = ".webp";
    const generated = [];
    const baseWidth = Math.min(metadata.width, MEDIA_UPLOAD_LIMITS.maxWidth);
    const baseName = `${key}${extension}`;
    const basePath = path.join(destination, baseName);
    generated.push(basePath);
    try {
      const baseInfo = await sharp(buffer, { animated: false, failOn: "error", limitInputPixels: 64_000_000 })
        .rotate()
        .resize({ width: baseWidth, withoutEnlargement: true, fit: "inside" })
        .webp()
        .toFile(basePath);
      for (const targetWidth of MEDIA_UPLOAD_LIMITS.variants) {
        const variantWidth = Math.min(targetWidth, baseWidth);
        const variantPath = path.join(destination, `${key}-${targetWidth}${extension}`);
        await sharp(buffer, { animated: false, failOn: "error", limitInputPixels: 64_000_000 })
          .rotate()
          .resize({ width: variantWidth, withoutEnlargement: true, fit: "inside" })
          .webp()
          .toFile(variantPath);
        generated.push(variantPath);
      }
      return {
        fileName: baseName,
        urlPath: `/uploads/${datedFolder.replaceAll(path.sep, "/")}/${baseName}`,
        width: baseInfo.width,
        height: baseInfo.height,
        sizeBytes: (await stat(basePath)).size,
        generated,
      };
    } catch (error) {
      await Promise.all(generated.map((file) => rm(file, { force: true })));
      throw error;
    }
  }

  return {
    async upload(file, user, request) {
      if (!file?.buffer) {throw Object.assign(new Error("Choose an image to upload."), { status: 400 });}
      if (file.size > MEDIA_UPLOAD_LIMITS.maxBytes) {throw Object.assign(new Error("Image files must be 8 MB or smaller."), { status: 413 });}
      const output = await writeWebpVariants(file.buffer);
      try {
        const id = await repository.insert({ ...output, uploadedBy: user.id, ip: request.ip });
        return await repository.get(id).then((row) => row ? view(row) : null);
      } catch (error) {
        await Promise.all(output.generated.map((filePath) => rm(filePath, { force: true })));
        throw error;
      }
    },
    async list({ query = "", page = 1, limit = MEDIA_UPLOAD_LIMITS.listPageSize } = {}) {
      const offset = (page - 1) * limit;
      const rows = await repository.list({ query, offset, limit });
      return rows.map(view);
    },
    async picker({ query = "", page = 1 } = {}) {
      const rows = await repository.list({ query, offset: (page - 1) * MEDIA_UPLOAD_LIMITS.pickerPageSize, limit: MEDIA_UPLOAD_LIMITS.pickerPageSize });
      return rows.map(({ id, url_path: urlPath, file_name: fileName, alt_text: altText, width, height }) => ({ id, url: publicUrl(urlPath), thumbnail_url: publicUrl(`${urlPath.slice(0, urlPath.lastIndexOf("/") + 1)}${fileName.replace(/\.webp$/u, "")}-400.webp`), alt_text: altText, width, height, has_alt: Boolean(String(altText ?? "").trim()), no_alt: !String(altText ?? "").trim() }));
    },
    async get(id) { const media = await repository.get(id); return media ? view(media) : null; },
    async update(id, details, user, request) {
      const updated = await repository.update(id, details, user.id, request.ip);
      if (!updated) {throw Object.assign(new Error("Image not found."), { status: 404 });}
      return this.get(id);
    },
    async delete(id, user, request) {
      if (user.role !== "owner") {throw Object.assign(new Error("Only an Admin can delete images."), { status: 403 });}
      const result = await repository.deleteIfUnused(id, user.id, request.ip);
      if (!result.deleted) {
        if (result.missing) {throw Object.assign(new Error("Image not found."), { status: 404 });}
        throw Object.assign(new Error(`This image is still used: ${result.uses.map((use) => `${use.use_type}: ${use.label}`).join("; ")}.`), { status: 409, uses: result.uses });
      }
      const mainPath = localPath(result.media.url_path);
      const basename = result.media.file_name;
      const prefix = basename.replace(/\.webp$/u, "");
      await Promise.all([mainPath, ...MEDIA_UPLOAD_LIMITS.variants.map((width) => path.join(path.dirname(mainPath), `${prefix}-${width}.webp`))].map((filePath) => rm(filePath, { force: true })));
      return true;
    },
    async allowUpload(userId) { return repository.incrementUploadLimit(userId, MEDIA_UPLOAD_LIMITS.rate.hits, MEDIA_UPLOAD_LIMITS.rate.windowMs); },
  };
}
