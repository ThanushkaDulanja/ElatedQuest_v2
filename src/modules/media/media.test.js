import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { MEDIA_UPLOAD_LIMITS } from "../../config/constants.js";
import { createMediaService, mediaSrcset } from "./service.js";
import { detectMagicFormat, validateMediaDetails } from "./validators.js";

test("media magic-byte detection accepts only supported raster signatures", () => {
  assert.equal(detectMagicFormat(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "jpeg");
  assert.equal(detectMagicFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
  assert.equal(detectMagicFormat(Buffer.from("RIFF0000WEBP")), "webp");
  assert.equal(detectMagicFormat(Buffer.from("GIF89a")), "gif");
  assert.equal(detectMagicFormat(Buffer.from("<svg")), null);
  assert.equal(detectMagicFormat(Buffer.from("MZ executable")), null);
});

test("mediaSrcset uses the shared 400, 800 and 1200 pixel variants", () => {
  assert.equal(mediaSrcset({ url_path: "/uploads/2026/11/05/example.webp" }, "https://cdn.example.test/uploads"), "https://cdn.example.test/uploads/2026/11/05/example-400.webp 400w, https://cdn.example.test/uploads/2026/11/05/example-800.webp 800w, https://cdn.example.test/uploads/2026/11/05/example-1200.webp 1200w");
  assert.equal(mediaSrcset({ url_path: "/uploads/original.jpg" }), "");
});

test("media details validate text limits and http(s) credit links", () => {
  assert.deepEqual(validateMediaDetails({ alt_text: " Alt ", credit_text: " Credit ", credit_url: "https://example.test/photo" }), {
    altText: "Alt", creditText: "Credit", creditUrl: "https://example.test/photo",
  });
  assert.throws(() => validateMediaDetails({ credit_url: "javascript:alert(1)" }), /http or https/u);
  assert.throws(() => validateMediaDetails({ alt_text: "a".repeat(256) }), /255 characters/u);
  assert.throws(() => validateMediaDetails({ credit_text: "a".repeat(256) }), /255 characters/u);
});

test("upload creates random WebP files and 400, 800, 1200 variants without metadata", async (context) => {
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), "elatedquest-media-"));
  context.after(() => {
    try { rmSync(uploadDir, { recursive: true, force: true }); } catch { /* Windows may briefly hold a Sharp output file. */ }
  });
  const records = new Map();
  let nextId = 1;
  const repository = {
    async insert(row) { const id = nextId++; records.set(id, { id, file_name: row.fileName, url_path: row.urlPath, mime: "image/webp", width: row.width, height: row.height, size_bytes: row.sizeBytes, alt_text: null, credit_text: null, credit_url: null, uses: [] }); return id; },
    async get(id) { return records.get(Number(id)) ?? null; },
  };
  const service = createMediaService({ repository, uploadDir, uploadsPublicUrl: "https://example.test/uploads", now: () => new Date("2026-11-03T00:00:00Z") });
  const sources = [
    ["jpeg", "jpeg"],
    ["png", "png"],
    ["webp", "webp"],
    ["gif", "gif"],
  ];
  for (const [format, extension] of sources) {
    const image = sharp({ create: { width: 2200, height: 40, channels: 3, background: "#4671af" } });
    if (format === "jpeg") {
      image.withExif({ IFD0: { Artist: "Metadata fixture" }, GPS: { GPSLatitude: "1/1,2/1,3/1", GPSLongitude: "4/1,5/1,6/1" } });
    }
    const buffer = await image.toFormat(format).toBuffer();
    if (format === "jpeg") { assert.ok((await sharp(buffer).metadata()).exif?.length, "JPEG fixture includes EXIF/GPS metadata"); }
    const result = await service.upload({ buffer, size: buffer.length, originalname: `user-controlled.${extension}`, mimetype: "application/octet-stream" }, { id: 12 }, { ip: "127.0.0.1" });
    assert.match(result.file_name, /^[0-9a-f-]+\.webp$/u);
    assert.doesNotMatch(result.file_name, /user-controlled/u);
    assert.equal(result.mime, "image/webp");
    assert.equal(result.width, MEDIA_UPLOAD_LIMITS.maxWidth);
    const mainPath = path.join(uploadDir, "2026", "11", "03", result.file_name);
    const metadata = await sharp(mainPath).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, MEDIA_UPLOAD_LIMITS.maxWidth);
    assert.equal(metadata.exif, undefined);
    const prefix = result.file_name.replace(/\.webp$/u, "");
    for (const width of MEDIA_UPLOAD_LIMITS.variants) {
      const variant = path.join(uploadDir, "2026", "11", "03", `${prefix}-${width}.webp`);
      const variantMetadata = await sharp(variant).metadata();
      assert.equal(variantMetadata.width, width);
      assert.equal(variantMetadata.format, "webp");
    }
    assert.equal(result.no_alt, true);
  }
});

test("uploads reject fake file bytes even when a filename claims JPG", async () => {
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), "elatedquest-media-reject-"));
  try {
    const service = createMediaService({ repository: {}, uploadDir, uploadsPublicUrl: "https://example.test/uploads" });
    await assert.rejects(service.upload({ buffer: Buffer.from("plain text"), size: 10, originalname: "renamed.jpg" }, { id: 1 }, { ip: "127.0.0.1" }), { status: 415 });
    await assert.rejects(service.upload({ buffer: Buffer.from("<svg></svg>"), size: 11, originalname: "image.svg" }, { id: 1 }, { ip: "127.0.0.1" }), { status: 415 });
    await assert.rejects(service.upload({ buffer: Buffer.alloc(MEDIA_UPLOAD_LIMITS.maxBytes + 1), size: MEDIA_UPLOAD_LIMITS.maxBytes + 1 }, { id: 1 }, { ip: "127.0.0.1" }), { status: 413 });
  } finally {
    try { rmSync(uploadDir, { recursive: true, force: true }); } catch { /* Windows may briefly hold a Sharp output file. */ }
  }
});
