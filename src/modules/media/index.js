import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { MEDIA_UPLOAD_LIMITS } from "../../config/constants.js";
import { createMediaRepository } from "./repository.js";
import { createMediaService } from "./service.js";
import { createMediaController } from "./controller.js";
import { registerRoutes as routes } from "./routes.js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function registerRoutes(app, { auth, database, writeLimit }) {
  const repository = createMediaRepository(database);
  const service = createMediaService({ repository, uploadDir: path.resolve(projectDirectory, env.uploadDir), uploadsPublicUrl: env.uploadsPublicUrl });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MEDIA_UPLOAD_LIMITS.maxBytes, files: 1 } });
  const uploadOne = upload.single("image");
  async function uploadLimit(request, response, next) {
    try {
      if (await service.allowUpload(request.user.id)) {return next();}
      response.status(429).type("text/plain").send("Upload limit reached. Try again in an hour.");
    } catch (error) { next(error); }
  }
  function uploadError(error, _request, response, next) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {return response.status(413).type("text/plain").send("Image files must be 8 MB or smaller.");}
    if (error instanceof multer.MulterError) {return response.status(400).type("text/plain").send("Choose one image file to upload.");}
    next(error);
  }
  routes(app, createMediaController({ service, csrf: auth.csrf }), auth.requireRole, auth.csrf, writeLimit, uploadLimit, uploadOne, uploadError);
  return service;
}
