export type FacultyRecord = {
  email: string;
  first_name: string;
  last_name: string;
  first_initial: string;
  primary_department: string;
  status: string;
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
