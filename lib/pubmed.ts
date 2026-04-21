import { FacultyRecord } from "@/lib/types/faculty";
import {
  FacultySearchError,
  InternationalFlag,
  PublicationConfidence,
  PublicationSearchResult,
} from "@/lib/types/publication-search";

type ParsedAuthor = {
  lastName: string;
  foreName: string;
  initials: string;
  identifierValues: string[];
};

type ParsedPublication = {
  pmid: string;
  title: string;
  journal: string;
  publicationDate: string;
  allAffiliations: string[];
  authors: ParsedAuthor[];
};

type PubMedIdSearchResult = {
  query: string;
  pmids: string[];
  totalCount: number;
  retmax: number;
  retmaxHit: boolean;
};

type PubMedSearchFailureStage =
  | "request_construction"
  | "fetch"
  | "response_parsing"
  | "candidate_extraction"
  | "details_request_construction"
  | "details_fetch"
  | "details_response_parsing"
  | "unknown";

export type SearchFacultyPublicationsOutcome = {
  results: PublicationSearchResult[];
  facultyErrors: FacultySearchError[];
};

const PUBMED_RETMAX = 60;
const PUBMED_QUERY_COMPARE_FACULTY = new Set([
  "josh ehrlich",
  "akbar waljee",
  "cheryl moyer",
]);
const PUBMED_DEBUG_DISABLE_DATE_FILTER = process.env.PUBMED_DEBUG_DISABLE_DATE_FILTER === "true";
const PUBMED_DEBUG_DISABLE_AUTHOR_FILTER =
  process.env.PUBMED_DEBUG_DISABLE_AUTHOR_FILTER === "true";
const PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER =
  process.env.PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER === "true";
const PUBMED_MIN_REQUEST_INTERVAL_MS = 250;
const PUBMED_429_MAX_RETRIES = 2;
const PUBMED_429_BASE_BACKOFF_MS = 2500;
const PUBMED_MAX_PMIDS_PER_FACULTY = 25;
const PUBMED_EFETCH_BATCH_SIZE = 5;
const PUBMED_EARLY_EXIT_MATCH_COUNT = 8;
const PUBMED_RUN_SOFT_CAP_MS = 45_000;

type PubMedRequestType = "esearch" | "efetch";

let pubMedRequestQueue: Promise<void> = Promise.resolve();
let lastPubMedRequestStartedAt = 0;

const US_STATE_TERMS = [
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "dc",
  "d.c.",
  "district of columbia",
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
];

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripXmlTags(value: string): string {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function getTagValue(block: string, tagName: string): string {
  const match = block.match(new RegExp(`<${tagName}(?: [^>]*)?>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? stripXmlTags(match[1]) : "";
}

function getAllTagValues(block: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}(?: [^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "g");
  const values: string[] = [];

  let match = regex.exec(block);
  while (match) {
    const value = stripXmlTags(match[1]);
    if (value) {
      values.push(value);
    }
    match = regex.exec(block);
  }

  return values;
}

function parsePublicationDate(articleBlock: string): string {
  const pubDateBlockMatch = articleBlock.match(/<PubDate>([\s\S]*?)<\/PubDate>/);
  if (!pubDateBlockMatch) {
    return "Unknown";
  }

  const pubDateBlock = pubDateBlockMatch[1];
  const year = getTagValue(pubDateBlock, "Year");
  const month = getTagValue(pubDateBlock, "Month");
  const day = getTagValue(pubDateBlock, "Day");

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }

  if (year && month) {
    return `${year}-${month}`;
  }

  if (year) {
    return year;
  }

  const medlineDate = getTagValue(pubDateBlock, "MedlineDate");
  return medlineDate || "Unknown";
}

function parseAuthors(articleBlock: string): ParsedAuthor[] {
  const authorRegex = /<Author(?: [^>]*)?>([\s\S]*?)<\/Author>/g;
  const authors: ParsedAuthor[] = [];

  let match = authorRegex.exec(articleBlock);
  while (match) {
    const authorBlock = match[1];
    const lastName = getTagValue(authorBlock, "LastName");
    const foreName = getTagValue(authorBlock, "ForeName");
    const initials = getTagValue(authorBlock, "Initials");
    const identifierValues = getAllTagValues(authorBlock, "Identifier").map((value) =>
      value.toLowerCase(),
    );

    if (lastName) {
      authors.push({
        lastName,
        foreName,
        initials,
        identifierValues,
      });
    }

    match = authorRegex.exec(articleBlock);
  }

  return authors;
}

function parsePubmedArticles(xml: string): ParsedPublication[] {
  const publications: ParsedPublication[] = [];
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;

  let match = articleRegex.exec(xml);
  while (match) {
    const articleBlock = match[1];

    const pmid = getTagValue(articleBlock, "PMID");
    const title = getTagValue(articleBlock, "ArticleTitle");
    const journal = getTagValue(articleBlock, "Title");
    const publicationDate = parsePublicationDate(articleBlock);
    const allAffiliations = getAllTagValues(articleBlock, "Affiliation");
    const authors = parseAuthors(articleBlock);

    if (pmid) {
      publications.push({
        pmid,
        title: title || "Untitled",
        journal: journal || "Unknown",
        publicationDate,
        allAffiliations,
        authors,
      });
    }

    match = articleRegex.exec(xml);
  }

  return publications;
}

function parseDateForRange(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }

  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const normalizedValue = trimmed.replace(/[./]/g, "-").replace(/\s+/g, "-");
  const parts = normalizedValue.split("-").filter(Boolean);
  const year = parts[0];
  if (!/^\d{4}$/.test(year)) {
    return null;
  }

  let month = "01";
  if (parts.length > 1) {
    const rawMonth = parts[1].toLowerCase();
    if (/^\d{1,2}$/.test(rawMonth)) {
      month = rawMonth.padStart(2, "0");
    } else {
      month = monthMap[rawMonth.slice(0, 3)] ?? "01";
    }
  }

  let day = "01";
  if (parts.length > 2 && /^\d{1,2}$/.test(parts[2])) {
    day = parts[2].padStart(2, "0");
  }

  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function evaluateDateRange(
  publicationDate: string,
  startDate?: string,
  endDate?: string,
): {
  isWithinRange: boolean;
  parsedDate: Date | null;
  parsedStartDate: Date | null;
  parsedEndDate: Date | null;
  comparisonResult: "within_range" | "before_start" | "after_end" | "publication_unparseable";
} {
  const parsedStartDate = startDate ? parseDateForRange(startDate) : null;
  const parsedEndDate = endDate ? parseDateForRange(endDate) : null;

  if (!startDate && !endDate) {
    return {
      // Date should not be a hard blocker if no date range is requested.
      isWithinRange: true,
      parsedDate: parseDateForRange(publicationDate),
      parsedStartDate,
      parsedEndDate,
      comparisonResult: "within_range",
    };
  }

  const publication = parseDateForRange(publicationDate);
  if (!publication) {
    return {
      isWithinRange: false,
      parsedDate: null,
      parsedStartDate,
      parsedEndDate,
      comparisonResult: "publication_unparseable",
    };
  }

  const start = parsedStartDate;
  const end = parsedEndDate;

  if (start && publication < start) {
    return {
      isWithinRange: false,
      parsedDate: publication,
      parsedStartDate,
      parsedEndDate,
      comparisonResult: "before_start",
    };
  }

  if (end && publication > end) {
    return {
      isWithinRange: false,
      parsedDate: publication,
      parsedStartDate,
      parsedEndDate,
      comparisonResult: "after_end",
    };
  }

  return {
    isWithinRange: true,
    parsedDate: publication,
    parsedStartDate,
    parsedEndDate,
    comparisonResult: "within_range",
  };
}

function isUMichAffiliation(affiliation: string): boolean {
  const normalized = affiliation.toLowerCase();
  return (
    normalized.includes("university of michigan") ||
    normalized.includes("univ of michigan") ||
    normalized.includes("u michigan") ||
    normalized.includes("u. michigan") ||
    normalized.includes("umich") ||
    normalized.includes("michigan medicine") ||
    normalized.includes("michigan health") ||
    normalized.includes("michigan med") ||
    normalized.includes("c.s. mott") ||
    normalized.includes("von voitlander") ||
    normalized.includes("rogel cancer center") ||
    normalized.includes("taubman") ||
    normalized.includes("ann arbor, mi") ||
    normalized.includes("ann arbor, michigan") ||
    normalized.includes("ann arbor")
  );
}

function hasUMichAffiliation(affiliations: string[]): boolean {
  return affiliations.some((affiliation) => isUMichAffiliation(affiliation));
}

function isDomesticAffiliation(affiliation: string): boolean {
  const normalized = affiliation.toLowerCase();

  if (
    normalized.includes("united states") ||
    normalized.includes("usa") ||
    normalized.includes("u.s.") ||
    normalized.includes("u.s.a") ||
    normalized.includes("america")
  ) {
    return true;
  }

  return US_STATE_TERMS.some((stateTerm) => {
    const escapedStateTerm = stateTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactRegex = new RegExp(`(^|[^a-z])${escapedStateTerm}([^a-z]|$)`, "i");
    return exactRegex.test(normalized);
  });
}

function getCountryFromAffiliation(affiliation: string): string | null {
  const compact = affiliation.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }

  return (
    compact
      .replace(/[.;]\s*$/, "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1) ?? null
  );
}

function classifyPublicationAffiliations(affiliations: string[]): {
  internationalFlag: InternationalFlag;
  internationalCountries: string;
} {
  if (affiliations.length === 0) {
    return {
      internationalFlag: "unknown",
      internationalCountries: "",
    };
  }

  const internationalCountries = new Set<string>();
  let hasInternational = false;
  let hasUnknownInternational = false;

  // Evaluate at publication level, not per-author, because PubMed affiliation-to-author
  // linkage can be incomplete/inconsistent for many records.
  for (const affiliation of affiliations) {
    if (isUMichAffiliation(affiliation)) {
      continue;
    }

    if (isDomesticAffiliation(affiliation)) {
      continue;
    }

    hasInternational = true;
    const country = getCountryFromAffiliation(affiliation);
    if (!country || isDomesticAffiliation(country)) {
      hasUnknownInternational = true;
      continue;
    }

    internationalCountries.add(country);
  }

  if (!hasInternational) {
    return {
      internationalFlag: "false",
      internationalCountries: "",
    };
  }

  if (internationalCountries.size === 0) {
    return {
      internationalFlag: "true",
      internationalCountries: "unknown",
    };
  }

  if (hasUnknownInternational) {
    internationalCountries.add("unknown");
  }

  return {
    internationalFlag: "true",
    internationalCountries: [...internationalCountries].join("; "),
  };
}

function normalizeAlphaText(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function escapePubMedQuotedValue(value: string): string {
  return value.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

function buildPubMedAuthorQuery(faculty: FacultyRecord, startDate?: string, endDate?: string): string {
  // Keep the PubMed query intentionally broad/minimal and apply filtering in code.
  // Avoid date and compound OR clauses to reduce malformed-query edge cases.
  const trimmedFirst = faculty.first_name.trim();
  const firstToken = trimmedFirst.split(/\s+/)[0] ?? "";
  const firstInitial = escapePubMedQuotedValue(faculty.first_initial || firstToken.charAt(0));
  const last = escapePubMedQuotedValue(faculty.last_name);

  void startDate;
  void endDate;

  if (!last || !firstInitial) {
    throw new Error(
      `PubMed author search requires non-empty last name and first initial (received last="${last}", firstInitial="${firstInitial}").`,
    );
  }

  return `"${last} ${firstInitial}"[Author]`;
}

function buildPubMedEsearchUrl(query: string): string {
  const encodedTerm = encodeURIComponent(query);
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedTerm}&retmode=json&retmax=${PUBMED_RETMAX}&sort=pub+date`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPubMedRequestWithThrottleAndRetry(
  requestType: PubMedRequestType,
  url: string,
  facultyName: string,
  pmid?: string,
): Promise<Response> {
  const runRequest = async (): Promise<Response> => {
    const now = Date.now();
    const waitForThrottleMs = Math.max(0, PUBMED_MIN_REQUEST_INTERVAL_MS - (now - lastPubMedRequestStartedAt));
    if (waitForThrottleMs > 0) {
      console.info(
        `[pubmed-debug] request_wait request_type="${requestType}" faculty="${facultyName}" pmid="${pmid ?? "n/a"}" retry_count=0 wait_ms=${waitForThrottleMs} reason="throttle"`,
      );
      await sleep(waitForThrottleMs);
    }

    let attempt = 0;
    while (attempt <= PUBMED_429_MAX_RETRIES) {
      const retryCount = attempt;
      lastPubMedRequestStartedAt = Date.now();

      const response = await fetch(url, { cache: "no-store" });
      if (response.status !== 429) {
        console.info(
          `[pubmed-debug] request_result request_type="${requestType}" faculty="${facultyName}" pmid="${pmid ?? "n/a"}" retry_count=${retryCount} wait_ms=${waitForThrottleMs} final_status="${response.ok ? "success" : "failure"}" http_status=${response.status}`,
        );
        return response;
      }

      if (attempt === PUBMED_429_MAX_RETRIES) {
        console.error(
          `[pubmed-error] request_result request_type="${requestType}" faculty="${facultyName}" pmid="${pmid ?? "n/a"}" retry_count=${retryCount} wait_ms=${waitForThrottleMs} final_status="failure" http_status=429`,
        );
        return response;
      }

      const retryWaitMs = PUBMED_429_BASE_BACKOFF_MS * 2 ** attempt;
      console.warn(
        `[pubmed-debug] request_retry request_type="${requestType}" faculty="${facultyName}" pmid="${pmid ?? "n/a"}" retry_count=${retryCount + 1} wait_ms=${retryWaitMs} reason="http_429"`,
      );
      await sleep(retryWaitMs);
      attempt += 1;
    }

    throw new Error("PubMed request retry loop exited unexpectedly.");
  };

  const scheduledRequest = pubMedRequestQueue.then(runRequest, runRequest);
  pubMedRequestQueue = scheduledRequest.then(
    () => undefined,
    () => undefined,
  );

  return scheduledRequest;
}

async function fetchPubMedIdsForFaculty(
  faculty: FacultyRecord,
  startDate?: string,
  endDate?: string,
): Promise<PubMedIdSearchResult> {
  const facultyName = `${faculty.first_name} ${faculty.last_name}`.trim();
  const isAkbarWaljee = facultyName.toLowerCase() === "akbar waljee";
  let stage: PubMedSearchFailureStage = "request_construction";

  try {
    const query = buildPubMedAuthorQuery(faculty, startDate, endDate);
    const url = buildPubMedEsearchUrl(query);

    console.info(
      `[pubmed-debug] request faculty="${facultyName}" raw_query='${query}' encoded_url='${url}'`,
    );

    if (isAkbarWaljee) {
      console.info(
        `[pubmed-debug] akbar_trace stage="request_construction" faculty="${facultyName}" raw_query='${query}' pubmed_url='${url}'`,
      );
    }

    stage = "fetch";
    const response = await runPubMedRequestWithThrottleAndRetry("esearch", url, facultyName);
    const responseBody = await response.text();

    if (isAkbarWaljee) {
      console.info(
        `[pubmed-debug] akbar_trace stage="fetch" faculty="${facultyName}" http_status=${response.status} response_preview='${responseBody.slice(0, 500)}'`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `PubMed author search failed for ${faculty.last_name} (status=${response.status}): ${responseBody.slice(0, 500)}`,
      );
    }

    stage = "response_parsing";
    const data = JSON.parse(responseBody) as {
      esearchresult?: {
        count?: string;
        idlist?: string[];
      };
    };

    stage = "candidate_extraction";
    const idlist = data.esearchresult?.idlist;
    const pmids = Array.isArray(idlist) ? idlist : [];
    const totalCount = Number(data.esearchresult?.count ?? "0");

    if (isAkbarWaljee) {
      console.info(
        `[pubmed-debug] akbar_trace stage="candidate_extraction" faculty="${facultyName}" pmid_count=${pmids.length} total_count_raw='${data.esearchresult?.count ?? ""}'`,
      );
    }

    return {
      query,
      pmids,
      totalCount: Number.isNaN(totalCount) ? pmids.length : totalCount,
      retmax: PUBMED_RETMAX,
      retmaxHit: pmids.length >= PUBMED_RETMAX,
    };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    throw Object.assign(
      new Error(
        `PubMed id retrieval failed at stage "${stage}" for faculty "${facultyName}": ${failure.message}`,
      ),
      { cause: error, stage },
    );
  }
}

async function fetchPubMedDetailsBatch(
  pmids: string[],
  facultyName: string,
): Promise<ParsedPublication[]> {
  if (pmids.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
  });
  const detailsUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`;
  const response = await runPubMedRequestWithThrottleAndRetry(
    "efetch",
    detailsUrl,
    facultyName,
    pmids.join(","),
  );
  const body = await response.text();
  const trimmedBody = body.trim();
  const isXml = trimmedBody.startsWith("<");
  const isJson = trimmedBody.startsWith("{") || trimmedBody.startsWith("[");
  const bodyType = !trimmedBody ? "empty" : isXml ? "xml" : isJson ? "json" : "error_payload";

  if (!response.ok) {
    throw Object.assign(new Error("PubMed details request failed."), {
      stage: "details_fetch" as PubMedSearchFailureStage,
      detailsStatus: response.status,
      detailsUrl,
      detailsBodyPreview: body.slice(0, 500),
      detailsBodyType: bodyType,
    });
  }

  if (!trimmedBody) {
    return [];
  }

  const publications = parsePubmedArticles(body);
  if (publications.length === 0 && body.includes("<ERROR>")) {
    throw Object.assign(new Error(`PubMed details parsing failed: ${body.slice(0, 500)}`), {
      stage: "details_response_parsing" as PubMedSearchFailureStage,
      detailsStatus: response.status,
      detailsUrl,
      detailsBodyPreview: body.slice(0, 500),
      detailsBodyType: bodyType,
    });
  }

  return publications;
}

async function fetchPubMedDetails(pmids: string[], facultyName: string): Promise<ParsedPublication[]> {
  const sanitizedPmids = [...new Set(pmids.map((pmid) => pmid.trim()).filter(Boolean))];
  if (sanitizedPmids.length === 0) {
    return [];
  }

  const allPublications: ParsedPublication[] = [];

  for (let index = 0; index < sanitizedPmids.length; index += PUBMED_EFETCH_BATCH_SIZE) {
    const pmidBatch = sanitizedPmids.slice(index, index + PUBMED_EFETCH_BATCH_SIZE);
    try {
      const publications = await fetchPubMedDetailsBatch(pmidBatch, facultyName);
      if (publications.length === 0) {
        console.info(
          `[pubmed-debug] details_empty_result faculty="${facultyName}" pmids="${pmidBatch.join(",")}"`,
        );
      } else {
        allPublications.push(...publications);
      }
    } catch (error) {
      const detailsStatus =
        typeof error === "object" &&
        error !== null &&
        "detailsStatus" in error &&
        typeof (error as { detailsStatus?: number }).detailsStatus === "number"
          ? (error as { detailsStatus: number }).detailsStatus
          : -1;
      const detailsUrl =
        typeof error === "object" &&
        error !== null &&
        "detailsUrl" in error &&
        typeof (error as { detailsUrl?: string }).detailsUrl === "string"
          ? (error as { detailsUrl: string }).detailsUrl
          : "unavailable";
      const detailsBodyPreview =
        typeof error === "object" &&
        error !== null &&
        "detailsBodyPreview" in error &&
        typeof (error as { detailsBodyPreview?: string }).detailsBodyPreview === "string"
          ? (error as { detailsBodyPreview: string }).detailsBodyPreview
          : "";
      const detailsBodyType =
        typeof error === "object" &&
        error !== null &&
        "detailsBodyType" in error &&
        typeof (error as { detailsBodyType?: string }).detailsBodyType === "string"
          ? (error as { detailsBodyType: string }).detailsBodyType
          : "unknown";

      console.error(
        `[pubmed-error] faculty="${facultyName}" stage="details_fetch_batch" pmids="${pmidBatch.join(",")}" http_status=${detailsStatus} response_body_type="${detailsBodyType}" details_url="${detailsUrl}" response_preview="${detailsBodyPreview}"`,
      );
      continue;
    }
  }

  return allPublications;
}

function formatErrorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  const message = String(error);
  return { message };
}

function matchAuthorName(faculty: FacultyRecord, publication: ParsedPublication): boolean {
  const facultyLast = normalizeAlphaText(faculty.last_name);
  const facultyInitial = normalizeAlphaText(faculty.first_initial || faculty.first_name.slice(0, 1));

  return publication.authors.some((author) => {
    const authorLast = normalizeAlphaText(author.lastName);
    if (!authorLast || authorLast !== facultyLast) {
      return false;
    }

    const authorInitials = normalizeAlphaText(author.initials);
    const authorFirst = normalizeAlphaText(author.foreName);

    if (facultyInitial && authorInitials && authorInitials.startsWith(facultyInitial)) {
      return true;
    }

    return facultyInitial ? authorFirst.startsWith(facultyInitial) : false;
  });
}

function hasOrcidAuthorSupport(faculty: FacultyRecord, publication: ParsedPublication): boolean {
  if (!faculty.orcid) {
    return false;
  }

  const normalizedOrcid = faculty.orcid.toLowerCase();
  return publication.authors.some((author) =>
    author.identifierValues.some((value) => value.includes(normalizedOrcid)),
  );
}

function getConfidence(
  faculty: FacultyRecord,
  publication: ParsedPublication,
  hasNameMatch: boolean,
): PublicationConfidence {
  const hasUmAtPaperLevel = hasUMichAffiliation(publication.allAffiliations);
  const hasOrcidSupport = hasOrcidAuthorSupport(faculty, publication);

  if (hasOrcidSupport) {
    return "high_orcid";
  }

  if (hasNameMatch && hasUmAtPaperLevel) {
    return "high";
  }

  return "medium";
}

export async function searchFacultyPublications(
  facultyRows: FacultyRecord[],
  startDate?: string,
  endDate?: string,
): Promise<SearchFacultyPublicationsOutcome> {
  const runStartAt = Date.now();
  const results: PublicationSearchResult[] = [];
  const facultyErrors: FacultySearchError[] = [];
  const delayBetweenRequestsMs = 200;
  const seenFacultyPmid = new Set<string>();

  for (const faculty of facultyRows) {
    const elapsedMs = Date.now() - runStartAt;
    if (elapsedMs >= PUBMED_RUN_SOFT_CAP_MS) {
      const message = `Soft run cap reached after ${elapsedMs}ms; returning partial results.`;
      facultyErrors.push({
        faculty_name: "RUN_SOFT_CAP",
        stage: "unknown",
        message,
      });
      console.warn(`[pubmed-warn] run_soft_cap elapsed_ms=${elapsedMs} limit_ms=${PUBMED_RUN_SOFT_CAP_MS}`);
      break;
    }

    const facultyStartAt = Date.now();
    try {
      const idSearchResult = await fetchPubMedIdsForFaculty(faculty, startDate, endDate);
      const facultyName = `${faculty.first_name} ${faculty.last_name}`.trim();
      const isAkbarWaljee = facultyName.toLowerCase() === "akbar waljee";
      const { pmids } = idSearchResult;
      const sanitizedPmids = [...new Set(pmids.map((pmid) => pmid.trim()).filter(Boolean))];
      const candidatePmids = sanitizedPmids.slice(0, PUBMED_MAX_PMIDS_PER_FACULTY);
      const detailsParams = new URLSearchParams({
        db: "pubmed",
        id: candidatePmids.slice(0, PUBMED_EFETCH_BATCH_SIZE).join(","),
        retmode: "xml",
      });
      const detailsUrlPreview = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${detailsParams.toString()}`;
      let publications: ParsedPublication[] = [];

      if (isAkbarWaljee) {
        console.info(
          `[pubmed-debug] akbar_trace stage="details_pre_request" endpoint="efetch.fcgi" pmid_count=${pmids.length} pmid_list="${pmids.join(",")}" details_url="${detailsUrlPreview}"`,
        );
      }

      if (candidatePmids.length === 0) {
        if (isAkbarWaljee) {
          console.info(
            `[pubmed-debug] akbar_trace stage="details_skip_empty_pmids" faculty="${facultyName}" pmid_count=${pmids.length} sanitized_pmid_count=0`,
          );
        }
      } else {
        publications = await fetchPubMedDetails(candidatePmids, facultyName);
      }

      const retrievedPmidsCount = pmids.length;

      if (PUBMED_QUERY_COMPARE_FACULTY.has(facultyName.toLowerCase())) {
        console.info(
          `[pubmed-debug] compare_case faculty="${facultyName}" query='${idSearchResult.query}'`,
        );
      }

      console.info(
        `[pubmed-debug] faculty="${facultyName}" query='${idSearchResult.query}' total_pmids=${idSearchResult.totalCount} returned_pmids=${pmids.length} retmax=${idSearchResult.retmax} retmax_hit=${idSearchResult.retmaxHit} candidate_pmids=${pmids.join(",")}`,
      );

      let pmidsProcessed = 0;
      let afterDateFilterCount = 0;
      let afterAuthorFilterCount = 0;
      let afterUmAffiliationCount = 0;
      let finalAcceptedCount = 0;

      for (const publication of publications) {
        pmidsProcessed += 1;

        if (!publication.pmid || !publication.publicationDate || publication.authors.length === 0) {
          console.info(
            `[pubmed-debug] skipped_missing_metadata faculty="${facultyName}" pmid="${publication.pmid || "unknown"}"`,
          );
          continue;
        }

        const dateEvaluation = evaluateDateRange(publication.publicationDate, startDate, endDate);
        const passesDate = PUBMED_DEBUG_DISABLE_DATE_FILTER ? true : dateEvaluation.isWithinRange;
        if (passesDate) {
          afterDateFilterCount += 1;
        } else {
          continue;
        }

        const hasNameMatchRaw = matchAuthorName(faculty, publication);
        const hasNameMatch = PUBMED_DEBUG_DISABLE_AUTHOR_FILTER ? true : hasNameMatchRaw;
        if (hasNameMatch) {
          afterAuthorFilterCount += 1;
        } else {
          continue;
        }

        const hasUmAffiliationRaw = hasUMichAffiliation(publication.allAffiliations);
        const hasUmAffiliation = PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER
          ? true
          : hasUmAffiliationRaw;
        if (hasUmAffiliation) {
          afterUmAffiliationCount += 1;
        } else {
          continue;
        }

        const dedupeKey = `${faculty.email}::${publication.pmid}`;
        if (seenFacultyPmid.has(dedupeKey)) {
          continue;
        }
        seenFacultyPmid.add(dedupeKey);

        const classification = classifyPublicationAffiliations(publication.allAffiliations);

        results.push({
          faculty_name: `${faculty.first_name} ${faculty.last_name}`,
          title: publication.title,
          publication_date: publication.publicationDate,
          PMID: publication.pmid,
          international_flag: classification.internationalFlag,
          international_countries: classification.internationalCountries,
          confidence: getConfidence(faculty, publication, hasNameMatchRaw),
        });
        finalAcceptedCount += 1;

        if (finalAcceptedCount >= PUBMED_EARLY_EXIT_MATCH_COUNT) {
          console.info(
            `[pubmed-debug] early_exit faculty="${facultyName}" reason="enough_in_range_matches" accepted=${finalAcceptedCount} threshold=${PUBMED_EARLY_EXIT_MATCH_COUNT}`,
          );
          break;
        }
      }

      console.info(
        `[pubmed-debug] stage_counts faculty="${facultyName}" pmids_retrieved=${retrievedPmidsCount} candidate_pmids=${candidatePmids.length} parsed_publications=${publications.length} pmids_processed=${pmidsProcessed} after_date_filter=${afterDateFilterCount} after_author_match=${afterAuthorFilterCount} after_umich_affiliation_filter=${afterUmAffiliationCount} disable_date_filter=${PUBMED_DEBUG_DISABLE_DATE_FILTER} disable_author_filter=${PUBMED_DEBUG_DISABLE_AUTHOR_FILTER} disable_umich_filter=${PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER}`,
      );

      console.info(
        `[pubmed-debug] faculty_timing faculty="${facultyName}" duration_ms=${Date.now() - facultyStartAt} final_accepted=${finalAcceptedCount}`,
      );
    } catch (error) {
      const facultyName = `${faculty.first_name} ${faculty.last_name}`.trim();
      const details = formatErrorDetails(error);
      const stage =
        typeof error === "object" &&
        error !== null &&
        "stage" in error &&
        typeof (error as { stage?: string }).stage === "string"
          ? ((error as { stage: PubMedSearchFailureStage }).stage ?? "unknown")
          : "unknown";

      facultyErrors.push({
        faculty_name: facultyName,
        stage,
        message: details.message,
        stack: details.stack,
      });

      console.error(
        `[pubmed-error] faculty="${facultyName}" stage="${stage}" message="${details.message}" stack="${details.stack ?? "unavailable"}"`,
      );
    } finally {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenRequestsMs));
    }
  }

  console.info(
    `[pubmed-debug] run_complete duration_ms=${Date.now() - runStartAt} faculty_total=${facultyRows.length} results_total=${results.length} faculty_errors=${facultyErrors.length}`,
  );

  return { results, facultyErrors };
}
