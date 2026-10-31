import { HTTP_STATUS } from "../../config/constants.js";

export function createHealthController(service) {
  return {
    async show(_request, response) {
      try {
        await service.check();
        response.status(HTTP_STATUS.ok).json({ status: "ok" });
      } catch {
        response
          .status(HTTP_STATUS.serviceUnavailable)
          .json({ status: "unavailable" });
      }
    },
  };
}
