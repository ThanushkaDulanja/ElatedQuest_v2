export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function localMidnightToUtc(dateOnly, timeZone) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const adjustment = target - represented;
    instant += adjustment;
    if (adjustment === 0) { break; }
  }

  return new Date(instant);
}

export function localDateTimeToUtc(localDateTime, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(String(localDateTime ?? "")) || !isValidTimeZone(timeZone)) { throw new Error("Enter a valid scheduled date and time."); }
  const [datePart, timePart] = localDateTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(target);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day || hour > 23 || minute > 59) { throw new Error("Enter a valid scheduled date and time."); }
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const adjustment = target - represented;
    instant += adjustment;
    if (adjustment === 0) { break; }
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  if (Number(parts.year) !== year || Number(parts.month) !== month || Number(parts.day) !== day || Number(parts.hour) !== hour || Number(parts.minute) !== minute) { throw new Error("That local time does not exist in the configured time zone."); }
  return new Date(instant);
}

export function formatDateTimeInZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatDate(value, timeZone = "UTC") {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone }).format(date);
}

export function toIsoDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function formatDateOnlyDmy(dateOnly) {
  if (!dateOnly) { return ""; }
  const [year, month, day] = dateOnly.split("-");
  return `${day}/${month}/${year}`;
}

export function toSqlDateTime(value) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

export function toDateTimeLocalInput(value, timeZone = "UTC") {
  if (!value) { return ""; }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) { return ""; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
