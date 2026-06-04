export type InternationalFlag = "true" | "false" | "unknown";

export type PublicationConfidence = "high" | "medium" | "high_orcid";

export type PublicationSearchMethod =
  | "hybrid_pubmed_orcid"
  | "pubmed_author_only_resilient_details_fetch";

export type PublicationSearchResult = {
  faculty_name: string;
  title: string;
  publication_date: string;
  PMID: string;
  international_flag: InternationalFlag;
  international_countries: string;
  has_lmic_country: boolean;
  lmic_countries: string;
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
  faculty_count_loaded?: number;
  faculty_count_searched: number;
  faculty_count_completed?: number;
  faculty_count_failed?: number;
  result_count: number;
  search_method: PublicationSearchMethod;
};

export type PublicationSearchAudit = {
  faculty_loaded: number;
  faculty_attempted: number;
  faculty_completed: number;
  faculty_failed: number;
  total_publications_found: number;
  total_publications_saved: number;
  first_faculty_attempted: string | null;
  last_faculty_attempted: string | null;
  faculty_processing_order: string[];
  early_exit_reason: string | null;
};

export type FacultySearchError = {
  faculty_name: string;
  stage:
    | "request_construction"
    | "fetch"
    | "response_parsing"
    | "candidate_extraction"
    | "details_request_construction"
    | "details_fetch"
    | "details_response_parsing"
    | "unknown";
  message: string;
  stack?: string;
};

export type PublicationSearchStoredPayload = {
  run_summary: PublicationSearchRunSummary;
  audit?: PublicationSearchAudit;
  faculty_errors?: FacultySearchError[];
  results: PublicationSearchResult[];
};

export const RESULTS_STORAGE_KEY = "publicationSearchResults";
