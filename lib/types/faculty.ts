export type FacultyRecord = {
  email: string;
  first_name: string;
  last_name: string;
  first_initial: string;
  primary_department: string;
  status: string;
  // Optional ORCID identifier, normalized to the canonical 16-character ID.
  orcid: string | null;
};

export const FACULTY_TABLE = "faculty";

export const REQUIRED_COLUMNS = [
  "email",
  "first_name",
  "last_name",
  "first_initial",
  "primary_department",
  "status",
] as const;

export const FACULTY_UPSERT_COLUMNS = [...REQUIRED_COLUMNS, "orcid"] as const;

const ORCID_URL_PREFIX_REGEX = /^https?:\/\/orcid\.org\//i;
const ORCID_FORMAT_REGEX = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;

export function normalizeOrcid(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed.replace(ORCID_URL_PREFIX_REGEX, "");
  const normalized = withoutPrefix.toUpperCase();

  if (!ORCID_FORMAT_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

export function isValidOrcid(value: string | undefined | null): boolean {
  if (!value?.trim()) {
    return true;
  }

  return normalizeOrcid(value) !== null;
}

export function normalizeFacultyRecord(row: Partial<FacultyRecord>): FacultyRecord {
  return {
    email: row.email ?? "",
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    first_initial: row.first_initial ?? "",
    primary_department: row.primary_department ?? "",
    status: row.status ?? "",
    orcid: normalizeOrcid(row.orcid),
  };
}
