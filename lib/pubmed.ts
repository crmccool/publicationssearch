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
const PUBMED_EXPANDED_PMIDS_PER_FACULTY = 60;
const PUBMED_EFETCH_BATCH_SIZE = 5;
const PUBMED_EARLY_EXIT_MATCH_COUNT = 8;
const PUBMED_RUN_SOFT_CAP_MS = 45_000;
const PUBMED_FORENSIC_TARGET_PMID = "41924702";

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

type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
};

function normalizeXmlTagName(tagName: string): string {
  return tagName.includes(":") ? (tagName.split(":").at(-1) ?? tagName) : tagName;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseXmlAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let attributeMatch = attributePattern.exec(raw);
  while (attributeMatch) {
    const rawName = attributeMatch[1] ?? "";
    const normalizedName = normalizeXmlTagName(rawName);
    const rawValue = attributeMatch[3] ?? attributeMatch[4] ?? "";
    attributes[normalizedName] = decodeXmlEntities(rawValue);
    attributeMatch = attributePattern.exec(raw);
  }
  return attributes;
}

function parseXmlToNodeTree(xml: string): XmlNode {
  const root: XmlNode = { name: "__root__", attributes: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const tokenPattern = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
  let match = tokenPattern.exec(xml);

  while (match) {
    const token = match[0];
    const currentNode = stack.at(-1);

    if (!currentNode) {
      throw new Error("Malformed XML: missing parent node.");
    }

    if (token.startsWith("<?") || token.startsWith("<!DOCTYPE")) {
      match = tokenPattern.exec(xml);
      continue;
    }

    if (token.startsWith("<!--")) {
      match = tokenPattern.exec(xml);
      continue;
    }

    if (token.startsWith("<![CDATA[")) {
      const cdata = token.slice(9, -3);
      currentNode.text += cdata;
      match = tokenPattern.exec(xml);
      continue;
    }

    if (token.startsWith("</")) {
      const closeTag = normalizeXmlTagName(token.slice(2, -1).trim());
      const openNode = stack.pop();
      if (!openNode || openNode.name !== closeTag) {
        throw new Error(`Malformed XML: mismatched closing tag ${closeTag}.`);
      }
      match = tokenPattern.exec(xml);
      continue;
    }

    if (token.startsWith("<")) {
      const selfClosing = token.endsWith("/>");
      const inner = token.slice(1, selfClosing ? -2 : -1).trim();
      const firstSpace = inner.search(/\s/);
      const rawTagName = firstSpace === -1 ? inner : inner.slice(0, firstSpace);
      const rawAttributes = firstSpace === -1 ? "" : inner.slice(firstSpace + 1);
      const node: XmlNode = {
        name: normalizeXmlTagName(rawTagName),
        attributes: parseXmlAttributes(rawAttributes),
        children: [],
        text: "",
      };
      currentNode.children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
      match = tokenPattern.exec(xml);
      continue;
    }

    currentNode.text += decodeXmlEntities(token);
    match = tokenPattern.exec(xml);
  }

  if (stack.length !== 1) {
    throw new Error("Malformed XML: unclosed tags detected.");
  }

  return root;
}

function toJsObject(node: XmlNode): Record<string, unknown> {
  const groupedChildren = new Map<string, unknown[]>();
  for (const child of node.children) {
    const childObject = toJsObject(child);
    const values = groupedChildren.get(child.name) ?? [];
    values.push(childObject);
    groupedChildren.set(child.name, values);
  }

  const result: Record<string, unknown> = {};
  for (const [attributeName, attributeValue] of Object.entries(node.attributes)) {
    result[`@_${attributeName}`] = attributeValue;
  }

  for (const [childName, childValues] of groupedChildren.entries()) {
    result[childName] = childValues.length === 1 ? childValues[0] : childValues;
  }

  const trimmedText = node.text.trim();
  if (trimmedText) {
    if (Object.keys(result).length === 0) {
      return { "#text": trimmedText };
    }
    result["#text"] = trimmedText;
  }

  return result;
}

function parseXmlToJsObject(xml: string): Record<string, unknown> {
  const nodeTree = parseXmlToNodeTree(xml);
  return toJsObject(nodeTree);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function getTextValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (value && typeof value === "object" && "#text" in value) {
    const textValue = (value as { "#text"?: unknown })["#text"];
    if (typeof textValue === "string" || typeof textValue === "number") {
      return String(textValue).trim();
    }
  }
  return "";
}

function getFirstTextValue(...values: unknown[]): string {
  for (const value of values) {
    const text = getTextValue(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function parsePublicationDate(articleNode: Record<string, unknown>): string {
  const articleDate = asArray<Record<string, unknown>>(
    articleNode.ArticleDate as Record<string, unknown> | Record<string, unknown>[] | undefined,
  )[0];
  if (articleDate) {
    const articleYear = getTextValue(articleDate.Year);
    const articleMonth = getTextValue(articleDate.Month);
    const articleDay = getTextValue(articleDate.Day);

    if (articleYear && articleMonth && articleDay) {
      return `${articleYear}-${articleMonth}-${articleDay}`;
    }
    if (articleYear && articleMonth) {
      return `${articleYear}-${articleMonth}`;
    }
    if (articleYear) {
      return articleYear;
    }
  }

  const pubDate = (articleNode.Journal as Record<string, unknown> | undefined)?.JournalIssue as
    | Record<string, unknown>
    | undefined;
  const pubDateNode = pubDate?.PubDate as Record<string, unknown> | undefined;
  if (!pubDateNode) {
    return "Unknown";
  }

  const year = getTextValue(pubDateNode.Year);
  const month = getTextValue(pubDateNode.Month);
  const day = getTextValue(pubDateNode.Day);

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  if (year && month) {
    return `${year}-${month}`;
  }
  if (year) {
    return year;
  }

  return getTextValue(pubDateNode.MedlineDate) || "Unknown";
}

function parseAuthors(pubmedArticleNode: Record<string, unknown>): ParsedAuthor[] {
  const authorListNode = (
    ((pubmedArticleNode.MedlineCitation as Record<string, unknown> | undefined)?.Article as
      | Record<string, unknown>
      | undefined)?.AuthorList as Record<string, unknown> | undefined
  )?.Author;

  return asArray(authorListNode)
    .map((authorNode) => {
      const author = (authorNode ?? {}) as Record<string, unknown>;
      const lastName = getTextValue(author.LastName);
      const foreName = getTextValue(author.ForeName);
      const initials = getTextValue(author.Initials);
      const identifierValues = asArray(author.Identifier)
        .map((identifier) => getTextValue(identifier).toLowerCase())
        .filter(Boolean);

      if (!lastName) {
        return null;
      }

      return {
        lastName,
        foreName,
        initials,
        identifierValues,
      };
    })
    .filter((author): author is ParsedAuthor => Boolean(author));
}

function parsePubmedArticles(xml: string): ParsedPublication[] {
  const parsedRoot = parseXmlToJsObject(xml);
  const articleSet = parsedRoot.PubmedArticleSet as Record<string, unknown> | undefined;
  const articleNodes = asArray<Record<string, unknown>>(
    articleSet?.PubmedArticle as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );

  return articleNodes
    .map((pubmedArticleNode) => {
      const medlineCitation = pubmedArticleNode.MedlineCitation as Record<string, unknown> | undefined;
      const article = medlineCitation?.Article as Record<string, unknown> | undefined;
      const pmid = getFirstTextValue(medlineCitation?.PMID, pubmedArticleNode.PMID);
      if (!pmid) {
        return null;
      }

      const title = getFirstTextValue(article?.ArticleTitle);
      const journal = getFirstTextValue(article?.Journal && (article.Journal as Record<string, unknown>).Title);
      const publicationDate = parsePublicationDate(article ?? {});

      const authorNodes = asArray(
        (article?.AuthorList as Record<string, unknown> | undefined)?.Author as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | undefined,
      );
      const allAffiliations = authorNodes.flatMap((authorNode) =>
        asArray((authorNode.AffiliationInfo as Record<string, unknown> | undefined)?.Affiliation)
          .map((affiliationNode) => getTextValue(affiliationNode))
          .filter(Boolean),
      );

      const authors = parseAuthors(pubmedArticleNode);

      return {
        pmid,
        title: title || "Untitled",
        journal: journal || "Unknown",
        publicationDate,
        allAffiliations,
        authors,
      };
    })
    .filter((publication): publication is ParsedPublication => Boolean(publication));
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
  const compact = normalized.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return (
    normalized.includes("university of michigan") ||
    normalized.includes("univ of michigan") ||
    normalized.includes("u of michigan") ||
    normalized.includes("u-m") ||
    normalized.includes("u m ") ||
    normalized.includes("u michigan") ||
    normalized.includes("u. michigan") ||
    normalized.includes("university of michigan health") ||
    normalized.includes("university of michigan health system") ||
    normalized.includes("umich") ||
    compact.includes("um hs") ||
    compact.includes("umhs") ||
    normalized.includes("michigan medicine") ||
    normalized.includes("michigan health") ||
    normalized.includes("michigan med") ||
    (normalized.includes("department of") && normalized.includes("university of michigan")) ||
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
    console.info(
      `[pubmed-debug] efetch_parse_summary faculty="${facultyName}" requested_pmids="${pmids.join(",")}" raw_pubmed_article_count=0 parsed_publication_count=0 parsed_pmids="" forensic_target_present=false`,
    );
    return [];
  }

  const publications = parsePubmedArticles(body);
  const parsedPmids = publications.map((publication) => publication.pmid);
  console.log("[pubmed-debug] parsed_article_count=", publications.length);
  console.log("[pubmed-debug] parsed_pmids=", parsedPmids.slice(0, 10));
  if (pmids.includes(PUBMED_FORENSIC_TARGET_PMID)) {
    console.log("[pubmed-debug] forensic_target_present_in_parsed=true");
  }
  const forensicTargetPresent = parsedPmids.includes(PUBMED_FORENSIC_TARGET_PMID);
  console.info(
    `[pubmed-debug] efetch_parse_summary faculty="${facultyName}" requested_pmids="${pmids.join(",")}" parsed_publication_count=${publications.length} parsed_pmids="${parsedPmids.join(",")}" forensic_target_present=${forensicTargetPresent}`,
  );

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

  const allParsedPmids = allPublications.map((publication) => publication.pmid);
  console.info(
    `[pubmed-debug] efetch_post_parse faculty="${facultyName}" requested_pmids="${sanitizedPmids.join(",")}" all_parsed_pmids="${allParsedPmids.join(",")}" forensic_target_present=${allParsedPmids.includes(PUBMED_FORENSIC_TARGET_PMID)}`,
  );

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

function buildForensicFaculty(firstName: string, lastName: string): FacultyRecord {
  return {
    first_name: firstName,
    last_name: lastName,
    first_initial: firstName.charAt(0),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@forensic.local`,
    status: "ACTIVE",
    primary_department: "",
    orcid: "",
  };
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
      let candidatePmids = sanitizedPmids.slice(0, PUBMED_MAX_PMIDS_PER_FACULTY);
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

      const evaluatePublicationSet = (currentPublications: ParsedPublication[], phase: "initial" | "expanded") => {
        let pmidsProcessed = 0;
        let afterDateFilterCount = 0;
        let afterAuthorFilterCount = 0;
        let afterUmAffiliationCount = 0;
        const accepted: Array<{ publication: ParsedPublication; hasNameMatchRaw: boolean }> = [];

        for (const publication of currentPublications) {
          pmidsProcessed += 1;
          if (publication.pmid === PUBMED_FORENSIC_TARGET_PMID) {
            console.info(
              `[pubmed-debug] forensic_target_reached_evaluation faculty="${facultyName}" phase="${phase}" pmid="${publication.pmid}"`,
            );
          }

          if (!publication.pmid || !publication.publicationDate || publication.authors.length === 0) {
            console.info(
              `[pubmed-debug] skipped_missing_metadata faculty="${facultyName}" pmid="${publication.pmid || "unknown"}"`,
            );
            continue;
          }

          const dateEvaluation = evaluateDateRange(publication.publicationDate, startDate, endDate);
          const isForensicTarget = publication.pmid === PUBMED_FORENSIC_TARGET_PMID;
          const cherylMoyerMatch = matchAuthorName(
            buildForensicFaculty("Cheryl", "Moyer"),
            publication,
          );
          const akbarWaljeeMatch = matchAuthorName(
            buildForensicFaculty("Akbar", "Waljee"),
            publication,
          );
          if (facultyName.toLowerCase() === "cheryl moyer" && phase === "initial") {
            console.info(
              `[pubmed-debug] cheryl_date_probe faculty="${facultyName}" pmid="${publication.pmid}" raw_publication_date="${publication.publicationDate}" parsed_publication_date="${dateEvaluation.parsedDate?.toISOString().slice(0, 10) ?? "null"}" comparison_result="${dateEvaluation.comparisonResult}"`,
            );
          }

          const passesDate = PUBMED_DEBUG_DISABLE_DATE_FILTER ? true : dateEvaluation.isWithinRange;
          if (isForensicTarget) {
            const hasUmAffiliationRaw = hasUMichAffiliation(publication.allAffiliations);
            let forensicReason = "included";
            if (!passesDate) {
              forensicReason = "excluded_date_filter";
            } else if (!(PUBMED_DEBUG_DISABLE_AUTHOR_FILTER ? true : matchAuthorName(faculty, publication))) {
              forensicReason = "excluded_faculty_author_mismatch";
            } else if (!(PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER ? true : hasUmAffiliationRaw)) {
              forensicReason = "excluded_um_affiliation_filter";
            }

            console.info(
              `[pubmed-forensic] faculty="${facultyName}" phase="${phase}" pmid="${publication.pmid}" title="${publication.title}" parsed_publication_date="${dateEvaluation.parsedDate?.toISOString().slice(0, 10) ?? "null"}" date_filter_passed=${passesDate} cheryl_moyer_author_match=${cherylMoyerMatch} akbar_waljee_author_match=${akbarWaljeeMatch} um_affiliation_filter_passed=${hasUmAffiliationRaw} final_reason="${forensicReason}"`,
            );
          }
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
            if (
              facultyName.toLowerCase() === "joshua ehrlich" ||
              facultyName.toLowerCase() === "emma lawrence"
            ) {
              console.info(
                `[pubmed-debug] umich_affiliation_probe faculty="${facultyName}" pmid="${publication.pmid}" affiliation_blob='${publication.allAffiliations.join(" || ").slice(0, 2000)}'`,
              );
            }
            continue;
          }

          accepted.push({ publication, hasNameMatchRaw });

          if (accepted.length >= PUBMED_EARLY_EXIT_MATCH_COUNT) {
            console.info(
              `[pubmed-debug] early_exit faculty="${facultyName}" reason="enough_in_range_matches" accepted=${accepted.length} threshold=${PUBMED_EARLY_EXIT_MATCH_COUNT}`,
            );
            break;
          }
        }

        return {
          accepted,
          pmidsProcessed,
          afterDateFilterCount,
          afterAuthorFilterCount,
          afterUmAffiliationCount,
        };
      };

      let evaluation = evaluatePublicationSet(publications, "initial");

      if (
        evaluation.afterDateFilterCount === 0 &&
        candidatePmids.length < sanitizedPmids.length
      ) {
        const expandedLimit = Math.min(PUBMED_EXPANDED_PMIDS_PER_FACULTY, sanitizedPmids.length);
        candidatePmids = sanitizedPmids.slice(0, expandedLimit);
        console.info(
          `[pubmed-debug] candidate_expansion faculty="${facultyName}" reason="zero_after_date_filter" initial_candidate_count=${PUBMED_MAX_PMIDS_PER_FACULTY} expanded_candidate_count=${candidatePmids.length}`,
        );
        publications = await fetchPubMedDetails(candidatePmids, facultyName);
        evaluation = evaluatePublicationSet(publications, "expanded");
      }

      let finalAcceptedCount = 0;
      for (const { publication, hasNameMatchRaw } of evaluation.accepted) {
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
      }

      console.info(
        `[pubmed-debug] stage_counts faculty="${facultyName}" pmids_retrieved=${retrievedPmidsCount} candidate_pmids=${candidatePmids.length} parsed_publications=${publications.length} pmids_processed=${evaluation.pmidsProcessed} after_date_filter=${evaluation.afterDateFilterCount} after_author_match=${evaluation.afterAuthorFilterCount} after_umich_affiliation_filter=${evaluation.afterUmAffiliationCount} disable_date_filter=${PUBMED_DEBUG_DISABLE_DATE_FILTER} disable_author_filter=${PUBMED_DEBUG_DISABLE_AUTHOR_FILTER} disable_umich_filter=${PUBMED_DEBUG_DISABLE_UM_AFFILIATION_FILTER}`,
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
