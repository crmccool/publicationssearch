export type InternationalFlag = "true" | "false" | "unknown";

export type PublicationConfidence = "high" | "low";

export type PublicationSearchResult = {
  faculty_name: string;
  title: string;
  publication_date: string;
  PMID: string;
  international_flag: InternationalFlag;
  confidence: PublicationConfidence;
};

export type PublicationSearchRequest = {
  startDate?: string;
  endDate?: string;
};

export const RESULTS_STORAGE_KEY = "publicationSearchResults";
