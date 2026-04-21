export type InternationalFlag = "true" | "false" | "unknown";

export type PublicationConfidence = "high" | "medium" | "high_orcid";

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
  faculty_count_failed?: number;
  result_count: number;
  search_method: "hybrid_pubmed_orcid";
};

export type FacultySearchError = {
  faculty_name: string;
  stage: "request_construction" | "fetch" | "response_parsing" | "candidate_extraction" | "unknown";
  message: string;
  stack?: string;
};

export type PublicationSearchStoredPayload = {
  run_summary: PublicationSearchRunSummary;
  faculty_errors?: FacultySearchError[];
  results: PublicationSearchResult[];
};

export const RESULTS_STORAGE_KEY = "publicationSearchResults";
