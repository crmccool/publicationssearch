import { FacultyRecord } from "@/lib/types/faculty";
import {
  InternationalFlag,
  PublicationConfidence,
  PublicationSearchResult,
} from "@/lib/types/publication-search";

type ParsedPublication = {
  pmid: string;
  title: string;
  publicationDate: string;
  allAffiliations: string[];
};

type OrcidWorkIdentifier = {
  doi?: string;
  pmid?: string;
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

    if (pmid && title) {
      publications.push({
        pmid,
        title,
        publicationDate,
        allAffiliations,
      });
    }

    match = articleRegex.exec(xml);
  }

  return publications;
}

function normalizeDoi(value: string): string {
  return value.replace(/^https?:\/\/doi\.org\//i, "").trim();
}

async function fetchOrcidWorks(orcid: string): Promise<OrcidWorkIdentifier[]> {
  const response = await fetch(`https://pub.orcid.org/v3.0/${orcid}/works`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ORCID works request failed for ${orcid}.`);
  }

  const data = (await response.json()) as {
    group?: Array<{
      "external-ids"?: {
        "external-id"?: Array<{
          "external-id-type"?: string;
          "external-id-value"?: string;
        }>;
      };
    }>;
  };

  const identifiers: OrcidWorkIdentifier[] = [];

  for (const group of data.group ?? []) {
    const externalIds = group["external-ids"]?.["external-id"] ?? [];
    let pmid: string | undefined;
    let doi: string | undefined;

    for (const externalId of externalIds) {
      const type = (externalId["external-id-type"] ?? "").toLowerCase();
      const value = (externalId["external-id-value"] ?? "").trim();

      if (!value) {
        continue;
      }

      if (type === "pmid") {
        pmid = value;
      }

      if (type === "doi") {
        doi = normalizeDoi(value);
      }
    }

    if (pmid || doi) {
      identifiers.push({ pmid, doi });
    }
  }

  return identifiers;
}

async function fetchPubMedIdsByDoi(doi: string): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: `${doi}[DOI]`,
    retmode: "json",
    retmax: "20",
  });

  const response = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`PubMed DOI lookup failed for DOI ${doi}.`);
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

function isDomesticAffiliation(affiliation: string): boolean {
  const normalized = affiliation.toLowerCase();

  if (normalized.includes("united states") || normalized.includes("usa") || normalized.includes("u.s.a")) {
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

async function resolvePmidsFromOrcid(orcid: string): Promise<string[]> {
  const identifiers = await fetchOrcidWorks(orcid);
  const pmids = new Set<string>();

  // ORCID works do not always include PMIDs; DOI-to-PMID resolution fills part of that gap,
  // but some DOI records are not indexed in PubMed and will remain unresolved.
  for (const identifier of identifiers) {
    if (identifier.pmid) {
      pmids.add(identifier.pmid);
      continue;
    }

    if (!identifier.doi) {
      continue;
    }

    const resolvedPmids = await fetchPubMedIdsByDoi(identifier.doi);
    for (const pmid of resolvedPmids) {
      pmids.add(pmid);
    }
  }

  return [...pmids];
}

export async function searchFacultyPublications(
  facultyRows: FacultyRecord[],
  startDate?: string,
  endDate?: string,
): Promise<PublicationSearchResult[]> {
  const results: PublicationSearchResult[] = [];
  const delayBetweenRequestsMs = 200;

  for (const faculty of facultyRows) {
    if (!faculty.orcid) {
      continue;
    }

    try {
      const pmids = await resolvePmidsFromOrcid(faculty.orcid);
      const publications = await fetchPubMedDetails(pmids);

      for (const publication of publications) {
        if (!isWithinDateRange(publication.publicationDate, startDate, endDate)) {
          continue;
        }

        const classification = classifyPublicationAffiliations(publication.allAffiliations);

        results.push({
          faculty_name: `${faculty.first_name} ${faculty.last_name}`,
          title: publication.title,
          publication_date: publication.publicationDate,
          PMID: publication.pmid,
          international_flag: classification.internationalFlag,
          international_countries: classification.internationalCountries,
          confidence: "high" as PublicationConfidence,
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
