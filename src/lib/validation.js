export function isWithinLength(value, maximum) {
  return typeof value === "string" && Array.from(value).length <= maximum;
}
