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

const PUBMED_RETMAX = 200;
const PUBMED_DEBUG_TARGET_FACULTY = (
  process.env.PUBMED_DEBUG_FACULTY ?? "Cheryl Moyer"
).toLowerCase();
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
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedTerm}&retmode=json&retmax=${PUBMED_RETMAX}`;
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
    const response = await fetch(url, {
      cache: "no-store",
    });
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

async function fetchPubMedDetailsByPmid(pmid: string): Promise<ParsedPublication | null> {
  const params = new URLSearchParams({
    db: "pubmed",
    id: pmid,
    retmode: "xml",
  });
  const detailsUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`;
  const response = await fetch(detailsUrl, {
    cache: "no-store",
  });
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
    return null;
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

  return publications[0] ?? null;
}

async function fetchPubMedDetails(pmids: string[], facultyName: string): Promise<ParsedPublication[]> {
  const sanitizedPmids = [...new Set(pmids.map((pmid) => pmid.trim()).filter(Boolean))];
  if (sanitizedPmids.length === 0) {
    return [];
  }

  const allPublications: ParsedPublication[] = [];

  for (const pmid of sanitizedPmids) {
    try {
      const publication = await fetchPubMedDetailsByPmid(pmid);
      if (!publication) {
        console.info(
          `[pubmed-debug] details_empty_result faculty="${facultyName}" pmid=${pmid}`,
        );
        continue;
      }

      allPublications.push(publication);
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
        `[pubmed-error] faculty="${facultyName}" stage="details_fetch_single_pmid" pmid=${pmid} http_status=${detailsStatus} response_body_type="${detailsBodyType}" details_url="${detailsUrl}" response_preview="${detailsBodyPreview}"`,
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
  const results: PublicationSearchResult[] = [];
  const facultyErrors: FacultySearchError[] = [];
  const delayBetweenRequestsMs = 200;
  const seenFacultyPmid = new Set<string>();

  for (const faculty of facultyRows) {
    try {
      const idSearchResult = await fetchPubMedIdsForFaculty(faculty, startDate, endDate);
      const facultyName = `${faculty.first_name} ${faculty.last_name}`.trim();
      const isAkbarWaljee = facultyName.toLowerCase() === "akbar waljee";
      const { pmids } = idSearchResult;
      const sanitizedPmids = [...new Set(pmids.map((pmid) => pmid.trim()).filter(Boolean))];
      const detailsParams = new URLSearchParams({
        db: "pubmed",
        id: sanitizedPmids.slice(0, 50).join(","),
        retmode: "xml",
      });
      const detailsUrlPreview = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${detailsParams.toString()}`;
      let publications: ParsedPublication[] = [];

      if (isAkbarWaljee) {
        console.info(
          `[pubmed-debug] akbar_trace stage="details_pre_request" endpoint="efetch.fcgi" pmid_count=${pmids.length} pmid_list="${pmids.join(",")}" details_url="${detailsUrlPreview}"`,
        );
      }

      if (sanitizedPmids.length === 0) {
        if (isAkbarWaljee) {
          console.info(
            `[pubmed-debug] akbar_trace stage="details_skip_empty_pmids" faculty="${facultyName}" pmid_count=${pmids.length} sanitized_pmid_count=0`,
          );
        }
      } else {
        publications = await fetchPubMedDetails(sanitizedPmids, facultyName);
      }

      const isTargetFaculty = facultyName.toLowerCase() === PUBMED_DEBUG_TARGET_FACULTY;
      const retrievedPmidsCount = pmids.length;

      if (PUBMED_QUERY_COMPARE_FACULTY.has(facultyName.toLowerCase())) {
        console.info(
          `[pubmed-debug] compare_case faculty="${facultyName}" query='${idSearchResult.query}'`,
        );
      }

      console.info(
        `[pubmed-debug] faculty="${facultyName}" query='${idSearchResult.query}' total_pmids=${idSearchResult.totalCount} returned_pmids=${pmids.length} retmax=${idSearchResult.retmax} retmax_hit=${idSearchResult.retmaxHit} candidate_pmids=${pmids.join(",")}`,
      );

      const dateEvaluated = publications.map((publication) => {
        const dateEvaluation = evaluateDateRange(publication.publicationDate, startDate, endDate);
        const passesDate = PUBMED_DEBUG_DISABLE_DATE_FILTER ? true : dateEvaluation.isWithinRange;
        const dateRejectionReason = passesDate
          ? "none"
          : dateEvaluation.comparisonResult === "publication_unparseable"
            ? "date_unparseable"
            : "date_out_of_range";

        if (!dateEvaluation.parsedDate) {
          console.info(
            `[pubmed-debug] date_parse_failed faculty="${facultyName}" pmid=${publication.pmid} raw_publication_date="${publication.publicationDate}"`,
          );
        }

        if (isTargetFaculty) {
          console.info(
            `[pubmed-debug] faculty="${facultyName}" pmid=${publication.pmid} raw_publication_date="${publication.publicationDate}" parsed_date="${dateEvaluation.parsedDate ? dateEvaluation.parsedDate.toISOString() : "null"}" received_startDate="${startDate ?? "undefined"}" received_endDate="${endDate ?? "undefined"}" parsed_startDate="${dateEvaluation.parsedStartDate ? dateEvaluation.parsedStartDate.toISOString() : "null"}" parsed_endDate="${dateEvaluation.parsedEndDate ? dateEvaluation.parsedEndDate.toISOString() : "null"}" date_comparison_result="${dateEvaluation.comparisonResult}" is_within_date_range=${dateEvaluation.isWithinRange} rejection_reason="${dateRejectionReason}"`,
          );
        }

        return {
          publication,
          dateEvaluation,
          passesDate,
        };
      });

      const afterDateFilter = dateEvaluated.filter((item) => item.passesDate);
      const afterAuthorFilter = afterDateFilter.filter((item) => {
        if (PUBMED_DEBUG_DISABLE_AUTHOR_FILTER) {
          return true;
        }
        return matchAuthorName(faculty, item.publication);
      });
      const afterUmAffiliationFilter = afterAuthorFilter.filter((item) => {
        if (PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER) {
          return true;
        }
        return hasUMichAffiliation(item.publication.allAffiliations);
      });

      console.info(
        `[pubmed-debug] stage_counts faculty="${facultyName}" pmids_retrieved=${retrievedPmidsCount} parsed_publications=${publications.length} after_date_filter=${afterDateFilter.length} after_author_match=${afterAuthorFilter.length} after_umich_affiliation_filter=${afterUmAffiliationFilter.length} final_accepted_pre_dedupe=${afterUmAffiliationFilter.length} disable_date_filter=${PUBMED_DEBUG_DISABLE_DATE_FILTER} disable_author_filter=${PUBMED_DEBUG_DISABLE_AUTHOR_FILTER} disable_umich_filter=${PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER}`,
      );

      let finalAcceptedCount = 0;
      for (const item of afterUmAffiliationFilter) {
        const publication = item.publication;
        const hasNameMatchRaw = matchAuthorName(faculty, publication);
        const hasUmAffiliationRaw = hasUMichAffiliation(publication.allAffiliations);
        const hasNameMatch = PUBMED_DEBUG_DISABLE_AUTHOR_FILTER ? true : hasNameMatchRaw;
        const hasUmAffiliation = PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER
          ? true
          : hasUmAffiliationRaw;
        const dateInRange = PUBMED_DEBUG_DISABLE_DATE_FILTER
          ? true
          : item.dateEvaluation.isWithinRange;
        const rejectionReasons: string[] = [];
        if (!dateInRange) {
          rejectionReasons.push("date_out_of_range_or_unparseable");
        }
        if (!hasNameMatch) {
          rejectionReasons.push("author_name_no_match");
        }
        if (!hasUmAffiliation) {
          rejectionReasons.push("missing_umich_affiliation");
        }

        if (rejectionReasons.length > 0) {
          console.info(
            `[pubmed-debug] rejected faculty="${facultyName}" pmid=${publication.pmid} authors="${publication.authors
              .map((author) => `${author.lastName}|${author.foreName}|${author.initials}`)
              .join("; ")}" author_match=${hasNameMatch} um_affiliation_match=${hasUmAffiliation} affiliations="${publication.allAffiliations.join(
              " || ",
            )}" rejection_reason="${rejectionReasons.join(",")}"`,
          );
          continue;
        }

        const dedupeKey = `${faculty.email}::${publication.pmid}`;
        if (seenFacultyPmid.has(dedupeKey)) {
          console.info(
            `[pubmed-debug] rejected faculty="${facultyName}" pmid=${publication.pmid} authors="${publication.authors
              .map((author) => `${author.lastName}|${author.foreName}|${author.initials}`)
              .join("; ")}" author_match=${hasNameMatch} um_affiliation_match=${hasUmAffiliation} affiliations="${publication.allAffiliations.join(
              " || ",
            )}" rejection_reason="duplicate_faculty_pmid"`,
          );
          continue;
        }
        seenFacultyPmid.add(dedupeKey);
        finalAcceptedCount += 1;

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
      }

      console.info(
        `[pubmed-debug] final_count faculty="${facultyName}" final_accepted=${finalAcceptedCount}`,
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

  return { results, facultyErrors };
}
