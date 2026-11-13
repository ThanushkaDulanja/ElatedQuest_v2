import {
  formatDateOnlyDmy,
  formatDateTimeInZone,
  isValidTimeZone,
  localMidnightToUtc,
  toSqlDateTime,
} from "../../lib/time.js";

export function createAuditService(repository, settingsService = { async get() { return { general: { timezone: "UTC" } }; } }) {
  return {
    async get(filters) {
      const options = {
        actor: String(filters.actor ?? ""),
        action: String(filters.action ?? ""),
        from: parseDate(String(filters.from ?? "")),
        to: parseDate(String(filters.to ?? "")),
      };
      if (options.from && options.to && options.from > options.to) {
        throw new Error("The start date must be on or before the end date.");
      }

      const settings = await settingsService.get();
      const timeZone = settings.general?.timezone || "UTC";
      if (!isValidTimeZone(timeZone)) {
        throw new Error("The configured time zone is invalid.");
      }
      const repositoryFilters = {
        actor: options.actor,
        action: options.action,
        from: options.from ? toSqlDateTime(localMidnightToUtc(options.from, timeZone)) : "",
        to: options.to ? toSqlDateTime(localMidnightToUtc(nextDate(options.to), timeZone)) : "",
      };
      const [choices, rows] = await Promise.all([
        repository.filters(),
        repository.list(repositoryFilters),
      ]);
      return {
        ...choices,
        rows: rows.map((row) => ({ ...row, created_at: formatDateTimeInZone(row.created_at, timeZone) })),
        timeZone,
        filters: {
          ...options,
          from: formatDateOnlyDmy(options.from),
          to: formatDateOnlyDmy(options.to),
          fromIso: options.from,
          toIso: options.to,
        },
      };
    },
  };
}

function parseDate(value) {
  if (!value) { return ""; }
  let isoDate = value;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (dmy) {
    isoDate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  } else if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error("Enter audit dates as dd/mm/yyyy.");
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new Error("Use valid dates for the audit range.");
  }
  return isoDate;
}

function nextDate(dateOnly) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
