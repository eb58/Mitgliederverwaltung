export const normalizeGroupText = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

export const getBusinessYearRange = (referenceDate = new Date()) => {
  const year = referenceDate.getMonth() >= 10
    ? referenceDate.getFullYear()
    : referenceDate.getFullYear() - 1;
  return { from: `${year}-11-01`, to: `${year + 1}-10-31` };
};

export const isDateInRange = (value, from, to) => {
  const date = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= from && date <= to;
};

export const sumPaymentsInBusinessYear = (members, amountField, dateField, range) => members
  .filter(member => isDateInRange(member[dateField], range.from, range.to))
  .reduce((sum, member) => sum + (Number(member[amountField]) || 0), 0);

export const formatDateDE = isoDate => {
  if (!isoDate || typeof isoDate !== "string") return "";
  const parts = isoDate.split("-");
  return parts.length !== 3 ? isoDate : `${parts[2]}.${parts[1]}.${parts[0]}`;
};

export const formatCurrency = value => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return Number(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
};

export const parseLegacyDate = value => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/[./]/).map(part => part.trim()).filter(Boolean);
  if (parts.length !== 3) return "";
  const [day, month, shortYear] = parts.map(Number);
  const year = shortYear < 100 ? shortYear + 1900 : shortYear;
  if (![day, month, year].every(Number.isFinite)) return "";
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const roundCurrency = value => Math.round(Number(value) * 100) / 100;

export const parseLegacyCurrency = value => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return roundCurrency(value);
  const normalized = String(value).replace(/\s/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
};

export const parseLegacyCashAmount = (cashValue, paidValue) => {
  const parsedCashValue = parseLegacyCurrency(cashValue);
  return parsedCashValue === -1 ? parseLegacyCurrency(paidValue) : parsedCashValue;
};

export const asBoolean = value => {
  if (value === true || value === 1 || value === -1) return true;
  if (typeof value !== "string") return false;
  return ["true", "1", "-1", "yes"].includes(value.trim().toLowerCase());
};

export const parseIsoDate = isoDate => {
  if (!isoDate || typeof isoDate !== "string") return null;
  const parts = isoDate.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  const date = new Date(year, month - 1, day);
  const matchesInput = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return matchesInput ? date : null;
};

export const formatIsoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const calculateAge = (isoDate, today = new Date()) => {
  const birthDate = parseIsoDate(isoDate);
  if (!birthDate) return null;
  const birthdayPending = today.getMonth() < birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  const age = today.getFullYear() - birthDate.getFullYear() - Number(birthdayPending);
  return age >= 0 ? age : null;
};

export const getBirthDateRangeForAgeBucket = (bucket, today = new Date()) => {
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const to = new Date(currentDay.getFullYear() - bucket.min, currentDay.getMonth(), currentDay.getDate());
  if (!Number.isFinite(bucket.max)) return { from: "1900-01-01", to: formatIsoDate(to) };

  const from = new Date(currentDay.getFullYear() - bucket.max - 1, currentDay.getMonth(), currentDay.getDate() + 1);
  return { from: formatIsoDate(from), to: formatIsoDate(to) };
};

export const ensureMinimumAge = (isoDate, minAge = 55, today = new Date()) => {
  const normalized = parseLegacyDate(isoDate);
  if (!normalized) return isoDate;
  const birthDate = parseIsoDate(normalized);
  if (!birthDate) return normalized;
  const minBirthday = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
  return birthDate <= minBirthday ? normalized : formatIsoDate(minBirthday);
};

export const percent = (value, total) => total ? Math.round((value / total) * 100) : 0;

export const normalizePhotoFileName = value => {
  const fileName = String(value || "").trim().split(/[\\/]/).filter(Boolean).pop() || "";
  return /\.(jpe?g|png)$/i.test(fileName) ? fileName : "";
};

export const createMemberApiUrlForBase = (baseUrl, path, params = {}) => {
  const url = new URL(baseUrl);
  const normalizedPath = path.replace(/^\/+/, "");
  if (url.pathname.endsWith(".php")) {
    url.pathname = `${url.pathname}/${normalizedPath}`;
  } else {
    const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}/${normalizedPath}`;
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
};

export const retryAsync = async (operation, { attempts = 3, delayMs = 250 } = {}) => {
  const run = async attempt => {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return run(attempt + 1);
    }
  };
  return run(1);
};

export const getNextId = members => members.reduce((max, member) => Math.max(max, member.id), 0) + 1;
