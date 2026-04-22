export type CountryReferenceEntry = {
  name: string;
  aliases?: string[];
};

const COUNTRY_REFERENCE_LIST: CountryReferenceEntry[] = [
  { name: "Afghanistan" },
  { name: "Albania" },
  { name: "Algeria" },
  { name: "Andorra" },
  { name: "Angola" },
  { name: "Antigua and Barbuda" },
  { name: "Argentina" },
  { name: "Armenia" },
  { name: "Australia" },
  { name: "Austria" },
  { name: "Azerbaijan" },
  { name: "Bahamas" },
  { name: "Bahrain" },
  { name: "Bangladesh" },
  { name: "Barbados" },
  { name: "Belarus" },
  { name: "Belgium" },
  { name: "Belize" },
  { name: "Benin" },
  { name: "Bhutan" },
  { name: "Bolivia", aliases: ["Bolivia (Plurinational State of)"] },
  { name: "Bosnia and Herzegovina" },
  { name: "Botswana" },
  { name: "Brazil" },
  { name: "Brunei", aliases: ["Brunei Darussalam"] },
  { name: "Bulgaria" },
  { name: "Burkina Faso" },
  { name: "Burundi" },
  { name: "Cabo Verde", aliases: ["Cape Verde"] },
  { name: "Cambodia" },
  { name: "Cameroon" },
  { name: "Canada" },
  { name: "Central African Republic" },
  { name: "Chad" },
  { name: "Chile" },
  { name: "China", aliases: ["People's Republic of China", "PRC"] },
  { name: "Colombia" },
  { name: "Comoros" },
  { name: "Congo", aliases: ["Republic of the Congo", "Congo-Brazzaville"] },
  {
    name: "Democratic Republic of the Congo",
    aliases: ["DR Congo", "DRC", "Congo-Kinshasa", "Democratic Republic Congo"],
  },
  { name: "Costa Rica" },
  { name: "Cote d'Ivoire", aliases: ["Côte d'Ivoire", "Ivory Coast"] },
  { name: "Croatia" },
  { name: "Cuba" },
  { name: "Cyprus" },
  { name: "Czechia", aliases: ["Czech Republic"] },
  { name: "Denmark" },
  { name: "Djibouti" },
  { name: "Dominica" },
  { name: "Dominican Republic" },
  { name: "Ecuador" },
  { name: "Egypt" },
  { name: "El Salvador" },
  { name: "Equatorial Guinea" },
  { name: "Eritrea" },
  { name: "Estonia" },
  { name: "Eswatini", aliases: ["Swaziland"] },
  { name: "Ethiopia" },
  { name: "Fiji" },
  { name: "Finland" },
  { name: "France" },
  { name: "Gabon" },
  { name: "Gambia" },
  { name: "Georgia" },
  { name: "Germany" },
  { name: "Ghana" },
  { name: "Greece" },
  { name: "Grenada" },
  { name: "Guatemala" },
  { name: "Guinea" },
  { name: "Guinea-Bissau" },
  { name: "Guyana" },
  { name: "Haiti" },
  { name: "Honduras" },
  { name: "Hungary" },
  { name: "Iceland" },
  { name: "India" },
  { name: "Indonesia" },
  { name: "Iran", aliases: ["Iran (Islamic Republic of)"] },
  { name: "Iraq" },
  { name: "Ireland" },
  { name: "Israel" },
  { name: "Italy" },
  { name: "Jamaica" },
  { name: "Japan" },
  { name: "Jordan" },
  { name: "Kazakhstan" },
  { name: "Kenya" },
  { name: "Kiribati" },
  { name: "Kuwait" },
  { name: "Kyrgyzstan" },
  { name: "Laos", aliases: ["Lao People's Democratic Republic"] },
  { name: "Latvia" },
  { name: "Lebanon" },
  { name: "Lesotho" },
  { name: "Liberia" },
  { name: "Libya" },
  { name: "Liechtenstein" },
  { name: "Lithuania" },
  { name: "Luxembourg" },
  { name: "Madagascar" },
  { name: "Malawi" },
  { name: "Malaysia" },
  { name: "Maldives" },
  { name: "Mali" },
  { name: "Malta" },
  { name: "Marshall Islands" },
  { name: "Mauritania" },
  { name: "Mauritius" },
  { name: "Mexico" },
  { name: "Micronesia", aliases: ["Federated States of Micronesia"] },
  { name: "Moldova", aliases: ["Republic of Moldova"] },
  { name: "Monaco" },
  { name: "Mongolia" },
  { name: "Montenegro" },
  { name: "Morocco" },
  { name: "Mozambique" },
  { name: "Myanmar", aliases: ["Burma"] },
  { name: "Namibia" },
  { name: "Nauru" },
  { name: "Nepal" },
  { name: "Netherlands", aliases: ["The Netherlands"] },
  { name: "New Zealand" },
  { name: "Nicaragua" },
  { name: "Niger" },
  { name: "Nigeria" },
  { name: "North Korea", aliases: ["Democratic People's Republic of Korea", "DPRK"] },
  { name: "North Macedonia", aliases: ["Macedonia", "Republic of North Macedonia"] },
  { name: "Norway" },
  { name: "Oman" },
  { name: "Pakistan" },
  { name: "Palau" },
  { name: "Palestine", aliases: ["State of Palestine"] },
  { name: "Panama" },
  { name: "Papua New Guinea" },
  { name: "Paraguay" },
  { name: "Peru" },
  { name: "Philippines" },
  { name: "Poland" },
  { name: "Portugal" },
  { name: "Qatar" },
  { name: "Romania" },
  { name: "Russia", aliases: ["Russian Federation"] },
  { name: "Rwanda" },
  { name: "Saint Kitts and Nevis" },
  { name: "Saint Lucia" },
  { name: "Saint Vincent and the Grenadines" },
  { name: "Samoa" },
  { name: "San Marino" },
  { name: "Sao Tome and Principe", aliases: ["São Tomé and Príncipe"] },
  { name: "Saudi Arabia" },
  { name: "Senegal" },
  { name: "Serbia" },
  { name: "Seychelles" },
  { name: "Sierra Leone" },
  { name: "Singapore" },
  { name: "Slovakia" },
  { name: "Slovenia" },
  { name: "Solomon Islands" },
  { name: "Somalia" },
  { name: "South Africa" },
  { name: "South Korea", aliases: ["Republic of Korea", "Korea, Republic of"] },
  { name: "South Sudan" },
  { name: "Spain" },
  { name: "Sri Lanka" },
  { name: "Sudan" },
  { name: "Suriname" },
  { name: "Sweden" },
  { name: "Switzerland" },
  { name: "Syria", aliases: ["Syrian Arab Republic"] },
  { name: "Tajikistan" },
  { name: "Tanzania", aliases: ["United Republic of Tanzania"] },
  { name: "Thailand" },
  { name: "Timor-Leste", aliases: ["East Timor"] },
  { name: "Togo" },
  { name: "Tonga" },
  { name: "Trinidad and Tobago" },
  { name: "Tunisia" },
  { name: "Turkey", aliases: ["Türkiye"] },
  { name: "Turkmenistan" },
  { name: "Tuvalu" },
  { name: "Uganda" },
  { name: "Ukraine" },
  { name: "United Arab Emirates", aliases: ["UAE"] },
  {
    name: "United Kingdom",
    aliases: ["UK", "U.K.", "Great Britain", "Britain", "England", "Scotland", "Wales", "Northern Ireland"],
  },
  {
    name: "United States",
    aliases: ["USA", "U.S.A.", "US", "U.S.", "United States of America", "America"],
  },
  { name: "Uruguay" },
  { name: "Uzbekistan" },
  { name: "Vanuatu" },
  { name: "Vatican City", aliases: ["Holy See"] },
  { name: "Venezuela", aliases: ["Venezuela (Bolivarian Republic of)"] },
  { name: "Vietnam", aliases: ["Viet Nam"] },
  { name: "Yemen" },
  { name: "Zambia" },
  { name: "Zimbabwe" },
];

function normalizeLocationText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()\[\]{}]/g, " ")
    .replace(/["'`’]/g, "")
    .replace(/[|/\\;:]+/g, ",")
    .replace(/[.-]+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toAliasKeys(entry: CountryReferenceEntry): string[] {
  return [entry.name, ...(entry.aliases ?? [])];
}

const COUNTRY_ALIAS_MAP = new Map<string, string>();
for (const country of COUNTRY_REFERENCE_LIST) {
  for (const alias of toAliasKeys(country)) {
    COUNTRY_ALIAS_MAP.set(normalizeLocationText(alias), country.name);
  }
}

const COUNTRY_ALIAS_PATTERNS = [...COUNTRY_ALIAS_MAP.entries()]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([normalizedAlias, canonicalCountry]) => ({
    canonicalCountry,
    pattern: new RegExp(`(^|\\b)${escapeRegex(normalizedAlias).replace(/\\ /g, "\\\\s+")}(\\b|$)`, "i"),
  }));

export type CountryExtractionDebug = {
  rawCandidateTokens: string[];
  validatedCountries: string[];
  rejectedTokens: string[];
};

export function extractCountriesFromAffiliation(affiliation: string): {
  countries: string[];
  debug: CountryExtractionDebug;
} {
  const normalizedAffiliation = normalizeLocationText(affiliation);
  if (!normalizedAffiliation) {
    return {
      countries: [],
      debug: {
        rawCandidateTokens: [],
        validatedCountries: [],
        rejectedTokens: [],
      },
    };
  }

  const countries = new Set<string>();
  for (const { canonicalCountry, pattern } of COUNTRY_ALIAS_PATTERNS) {
    if (pattern.test(normalizedAffiliation)) {
      countries.add(canonicalCountry);
    }
  }

  const rawCandidateTokens = normalizedAffiliation
    .split(/,|\band\b/)
    .map((token) => token.trim())
    .filter(Boolean);

  const validatedCountries = [...countries];
  const rejectedTokens = rawCandidateTokens.filter((token) => !COUNTRY_ALIAS_MAP.has(token));

  return {
    countries: validatedCountries,
    debug: {
      rawCandidateTokens,
      validatedCountries,
      rejectedTokens,
    },
  };
}

export function isUnitedStatesCountry(country: string): boolean {
  return country === "United States";
}
