import { FACULTY_TABLE, FacultyRecord } from "@/lib/types/faculty";

type SupabaseResult<T> = {
  data: T | null;
  error: string | null;
};

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

async function runSupabaseRequest<T>(
  path: string,
  init: RequestInit,
): Promise<SupabaseResult<T>> {
  const env = getSupabaseEnv();

  if (!env) {
    return {
      data: null,
      error:
        "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    return {
      data: null,
      error: message || "Supabase request failed.",
    };
  }

  const data = (await response.json()) as T;
  return { data, error: null };
}

export async function listFacultyRows(): Promise<SupabaseResult<FacultyRecord[]>> {
  return runSupabaseRequest<FacultyRecord[]>(
    `${FACULTY_TABLE}?select=email,first_name,last_name,first_initial,primary_department,status,orcid&order=last_name.asc,first_name.asc`,
    { method: "GET" },
  );
}

export async function saveFacultyRows(
  rows: FacultyRecord[],
): Promise<SupabaseResult<FacultyRecord[]>> {
  // Uploads perform a full roster replacement: clear existing rows, then insert CSV rows.
  const deleteResult = await runSupabaseRequest<FacultyRecord[]>(
    `${FACULTY_TABLE}?email=neq.`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=representation",
      },
    },
  );

  if (deleteResult.error) {
    return { data: null, error: deleteResult.error };
  }

  if (rows.length === 0) {
    return { data: [], error: null };
  }

  return runSupabaseRequest<FacultyRecord[]>(FACULTY_TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
}
