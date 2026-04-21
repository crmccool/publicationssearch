export type FacultyRecord = {
  email: string;
  first_name: string;
  last_name: string;
  first_initial: string;
  primary_department: string;
  status: string;
  // Optional ORCID identifier, normalized to the canonical 16-digit format.
  orcid?: string;
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

const ORCID_URL_PREFIX_REGEX = /^https?:\/\/orcid\.org\//i;
const ORCID_FORMAT_REGEX = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;

export function normalizeOrcid(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const withoutPrefix = trimmed.replace(ORCID_URL_PREFIX_REGEX, "");
  const normalized = withoutPrefix.toUpperCase();

  if (!ORCID_FORMAT_REGEX.test(normalized)) {
    return undefined;
  }

  return normalized;
}
