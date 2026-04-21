import { FacultyRecord } from "@/lib/types/faculty";
import {
  InternationalFlag,
  PublicationConfidence,
  PublicationSearchResult,
} from "@/lib/types/publication-search";

type ParsedAuthor = {
  lastName: string;
  firstInitial: string;
  affiliations: string[];
};

type ParsedPublication = {
  pmid: string;
  title: string;
  publicationDate: string;
  authors: ParsedAuthor[];
  allAffiliations: string[];
};

function escapeTerm(value: string): string {
  return value.replace(/\"/g, " ").trim();
}

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

function parseArticleAuthors(articleBlock: string): ParsedAuthor[] {
  const authors: ParsedAuthor[] = [];
  const authorRegex = /<Author(?: [^>]*)?>([\s\S]*?)<\/Author>/g;

  let match = authorRegex.exec(articleBlock);
  while (match) {
    const authorBlock = match[1];
    const lastName = getTagValue(authorBlock, "LastName");
    const initials = getTagValue(authorBlock, "Initials");
    const firstName = getTagValue(authorBlock, "ForeName");

    const firstInitial = initials
      ? initials[0]
      : firstName
        ? firstName[0]
        : "";

    const affiliations = getAllTagValues(authorBlock, "Affiliation");

    if (lastName && firstInitial) {
      authors.push({
        lastName: lastName.toLowerCase(),
        firstInitial: firstInitial.toLowerCase(),
        affiliations,
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
    const authors = parseArticleAuthors(articleBlock);
    const allAffiliations = getAllTagValues(articleBlock, "Affiliation");

    if (pmid && title) {
      publications.push({
        pmid,
        title,
        publicationDate,
        authors,
        allAffiliations,
      });
    }

    match = articleRegex.exec(xml);
  }

  return publications;
}

function hasUMAffiliation(affiliations: string[]): boolean {
  return affiliations.some((affiliation) => {
    const normalized = affiliation.toLowerCase();
    return (
      normalized.includes("university of michigan") || normalized.includes("michigan medicine")
    );
  });
}

function getCountryFromAffiliation(affiliation: string): string | null {
  const compact = affiliation.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }

  const segment = compact
    .replace(/[.;]\s*$/, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);

  return segment || null;
}

function isUSCountry(country: string): boolean {
  const normalized = country.trim().toLowerCase();
  return (
    normalized === "usa" ||
    normalized === "u.s.a." ||
    normalized === "us" ||
    normalized === "u.s." ||
    normalized === "united states" ||
    normalized === "united states of america"
  );
}

function classifyInternational(affiliations: string[]): InternationalFlag {
  if (affiliations.length === 0) {
    return "unknown";
  }

  let hasUnknownCountry = false;

  for (const affiliation of affiliations) {
    const country = getCountryFromAffiliation(affiliation);

    if (!country) {
      hasUnknownCountry = true;
      continue;
    }

    if (!isUSCountry(country)) {
      return "true";
    }
  }

  if (hasUnknownCountry) {
    return "unknown";
  }

  return "false";
}

function extractInternationalCountries(
  affiliations: string[],
  internationalFlag: InternationalFlag,
): string {
  if (internationalFlag !== "true") {
    return "";
  }

  const countries = new Set<string>();

  for (const affiliation of affiliations) {
    const country = getCountryFromAffiliation(affiliation);
    if (!country || isUSCountry(country)) {
      continue;
    }

    countries.add(country);
  }

  if (countries.size === 0) {
    // FUTURE: Use richer affiliation parsing to identify country names that are not the trailing segment.
    return "unknown";
  }

  return [...countries].join("; ");
}

function buildQueryTerm(faculty: FacultyRecord, startDate?: string, endDate?: string): string {
  const authorTerm = `${escapeTerm(faculty.last_name)} ${escapeTerm(faculty.first_initial)}[Author]`;
  const umTerm = `"University of Michigan"[Affiliation]`;

  const dateRangeStart = startDate || "1900/01/01";
  const dateRangeEnd = endDate || "3000/12/31";
  const dateTerm = `("${dateRangeStart}"[Date - Publication] : "${dateRangeEnd}"[Date - Publication])`;

  return `${authorTerm} AND ${umTerm} AND ${dateTerm}`;
}

async function fetchPubMedIds(term: string): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term,
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
    throw new Error("PubMed search request failed.");
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

function matchPublicationToFaculty(
  publication: ParsedPublication,
  faculty: FacultyRecord,
): { include: boolean; confidence: PublicationConfidence } {
  const targetLastName = faculty.last_name.trim().toLowerCase();
  const targetFirstInitial = faculty.first_initial.trim().toLowerCase()[0] ?? "";

  const candidateIndices: number[] = [];
  publication.authors.forEach((author, index) => {
    if (author.lastName === targetLastName && author.firstInitial === targetFirstInitial) {
      candidateIndices.push(index);
    }
  });

  if (candidateIndices.length === 0) {
    return { include: false, confidence: "low" };
  }

  // PubMed does not reliably link affiliations to specific authors,
  // so University of Michigan validation is performed at the paper level.
  if (!hasUMAffiliation(publication.allAffiliations)) {
    return { include: false, confidence: "low" };
  }

  const confidence: PublicationConfidence = candidateIndices.length === 1 ? "high" : "low";

  return { include: true, confidence };
}

export async function searchFacultyPublications(
  facultyRows: FacultyRecord[],
  startDate?: string,
  endDate?: string,
): Promise<PublicationSearchResult[]> {
  const results: PublicationSearchResult[] = [];
  const delayBetweenRequestsMs = 200;

  for (const faculty of facultyRows) {
    try {
      const term = buildQueryTerm(faculty, startDate, endDate);
      const ids = await fetchPubMedIds(term);
      const publications = await fetchPubMedDetails(ids);

      for (const publication of publications) {
        const matching = matchPublicationToFaculty(publication, faculty);
        if (!matching.include) {
          continue;
        }

        const internationalFlag = classifyInternational(publication.allAffiliations);

        results.push({
          faculty_name: `${faculty.first_name} ${faculty.last_name}`,
          title: publication.title,
          publication_date: publication.publicationDate,
          PMID: publication.pmid,
          international_flag: internationalFlag,
          international_countries: extractInternationalCountries(
            publication.allAffiliations,
            internationalFlag,
          ),
          confidence: matching.confidence,
        });
      }
    } catch (error) {
      const facultyName = `${faculty.first_name} ${faculty.last_name}`.trim();
      console.error(`Publication search failed for faculty "${facultyName}".`, error);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenRequestsMs));
    }
  }

  // FUTURE: Add ORCID-based disambiguation to improve author identity matching.
  // FUTURE: Replace this country parsing heuristic with a dedicated geocoding/normalization service.
  return results;
}
