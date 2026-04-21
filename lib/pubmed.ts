import { FacultyRecord } from "@/lib/types/faculty";
import {
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
  publicationDate: string;
  allAffiliations: string[];
  authors: ParsedAuthor[];
};

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
    const publicationDate = parsePublicationDate(articleBlock);
    const allAffiliations = getAllTagValues(articleBlock, "Affiliation");
    const authors = parseAuthors(articleBlock);

    if (pmid && title) {
      publications.push({
        pmid,
        title,
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

  const parts = trimmed.split("-");
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

function isWithinDateRange(publicationDate: string, startDate?: string, endDate?: string): boolean {
  const publication = parseDateForRange(publicationDate);
  if (!publication) {
    return false;
  }

  const start = startDate ? new Date(`${startDate}T00:00:00Z`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59Z`) : null;

  if (start && publication < start) {
    return false;
  }

  if (end && publication > end) {
    return false;
  }

  return true;
}

function isUMichAffiliation(affiliation: string): boolean {
  const normalized = affiliation.toLowerCase();
  return (
    normalized.includes("university of michigan") ||
    normalized.includes("michigan medicine") ||
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

function buildPubMedAuthorQuery(faculty: FacultyRecord, startDate?: string, endDate?: string): string {
  const trimmedFirst = faculty.first_name.trim();
  const firstToken = trimmedFirst.split(/\s+/)[0] ?? "";
  const firstInitial = (faculty.first_initial || firstToken.charAt(0)).trim();
  const last = faculty.last_name.trim();

  const authorClause = `("${last} ${firstToken}"[Author] OR "${last} ${firstInitial}"[Author] OR "${last} ${firstInitial}*"[Author])`;

  if (!startDate && !endDate) {
    return authorClause;
  }

  const start = startDate ?? "1900/01/01";
  const end = endDate ?? "3000/12/31";
  const dateClause = `("${start}"[Date - Publication] : "${end}"[Date - Publication])`;

  return `${authorClause} AND ${dateClause}`;
}

async function fetchPubMedIdsForFaculty(
  faculty: FacultyRecord,
  startDate?: string,
  endDate?: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: buildPubMedAuthorQuery(faculty, startDate, endDate),
    retmode: "json",
    retmax: "200",
  });

  const response = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`PubMed author search failed for ${faculty.last_name}.`);
  }

  const data = (await response.json()) as {
    esearchresult?: {
      idlist?: string[];
    };
  };

  return data.esearchresult?.idlist ?? [];
}

async function fetchPubMedDetails(pmids: string[]): Promise<ParsedPublication[]> {
  if (pmids.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
  });

  const response = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("PubMed details request failed.");
  }

  const xml = await response.text();
  return parsePubmedArticles(xml);
}

function matchAuthorName(faculty: FacultyRecord, publication: ParsedPublication): boolean {
  const facultyLast = normalizeAlphaText(faculty.last_name);
  const facultyInitial = normalizeAlphaText(faculty.first_initial || faculty.first_name.slice(0, 1));
  const facultyFirstToken = normalizeAlphaText(faculty.first_name.split(/\s+/)[0] ?? "");

  return publication.authors.some((author) => {
    const authorLast = normalizeAlphaText(author.lastName);
    if (!authorLast || authorLast !== facultyLast) {
      return false;
    }

    const authorFirst = normalizeAlphaText(author.foreName);
    const authorInitials = normalizeAlphaText(author.initials);

    if (facultyFirstToken && authorFirst && authorFirst.startsWith(facultyFirstToken)) {
      return true;
    }

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
): Promise<PublicationSearchResult[]> {
  const results: PublicationSearchResult[] = [];
  const delayBetweenRequestsMs = 200;
  const seenFacultyPmid = new Set<string>();

  for (const faculty of facultyRows) {
    try {
      const pmids = await fetchPubMedIdsForFaculty(faculty, startDate, endDate);
      const publications = await fetchPubMedDetails(pmids);

      for (const publication of publications) {
        if (!isWithinDateRange(publication.publicationDate, startDate, endDate)) {
          continue;
        }

        const hasNameMatch = matchAuthorName(faculty, publication);
        if (!hasNameMatch) {
          continue;
        }

        if (!hasUMichAffiliation(publication.allAffiliations)) {
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
          confidence: getConfidence(faculty, publication, hasNameMatch),
        });
      }
    } catch (error) {
      const facultyName = `${faculty.first_name} ${faculty.last_name}`.trim();
      console.error(`Publication search failed for faculty "${facultyName}".`, error);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenRequestsMs));
    }
  }

  return results;
}
