export type InternationalFlag = "true" | "false" | "unknown";

export type PublicationConfidence = "high" | "low";

export type PublicationSearchResult = {
  faculty_name: string;
  title: string;
  publication_date: string;
  PMID: string;
  international_flag: InternationalFlag;
  international_countries: string;
  confidence: PublicationConfidence;
};

export type PublicationSearchRequest = {
  startDate?: string;
  endDate?: string;
};

export type PublicationSearchRunSummary = {
  start_date: string | null;
  end_date: string | null;
  run_timestamp: string;
  faculty_count_searched: number;
  result_count: number;
};

export type PublicationSearchStoredPayload = {
  run_summary: PublicationSearchRunSummary;
  results: PublicationSearchResult[];
};

export const RESULTS_STORAGE_KEY = "publicationSearchResults";
