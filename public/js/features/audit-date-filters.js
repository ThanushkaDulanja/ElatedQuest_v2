export function toDmy(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function toIso(dmyDate) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(dmyDate);
  if (!match) {
    return "";
  }
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? `${year}-${month}-${day}`
    : "";
}

export function init(element) {
  for (const picker of element.querySelectorAll("[data-date-picker]")) {
    const textField = element.querySelector(`[data-date-text="${picker.dataset.datePicker}"]`);
    if (!textField) {
      continue;
    }
    picker.value = toIso(textField.value);
    picker.addEventListener("change", () => {
      textField.value = toDmy(picker.value);
    });
    textField.addEventListener("input", () => {
      picker.value = toIso(textField.value);
    });
  }
}
