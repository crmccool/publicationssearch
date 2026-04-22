import { CANONICAL_COUNTRY_NAMES } from "@/lib/countries";

export type WorldBankIncomeGroup =
  | "Low income"
  | "Lower middle income"
  | "Upper middle income"
  | "High income"
  | "Not classified";

export type WorldBankIncomeEntry = {
  canonical_country_name: string;
  world_bank_economy_name: string;
  income_group: WorldBankIncomeGroup;
  is_lmic: boolean;
};

const LOW_INCOME_ECONOMIES = new Set([
  "Afghanistan",
  "Burkina Faso",
  "Burundi",
  "Central African Republic",
  "Chad",
  "Congo, Dem. Rep.",
  "Eritrea",
  "Gambia, The",
  "Guinea-Bissau",
  "Korea, Dem. People's Rep.",
  "Liberia",
  "Madagascar",
  "Malawi",
  "Mali",
  "Mozambique",
  "Niger",
  "Rwanda",
  "Sierra Leone",
  "Somalia",
  "South Sudan",
  "Sudan",
  "Syrian Arab Republic",
  "Togo",
  "Uganda",
  "Yemen, Rep.",
]);

const LOWER_MIDDLE_INCOME_ECONOMIES = new Set([
  "Angola",
  "Bangladesh",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Cambodia",
  "Cameroon",
  "Comoros",
  "Congo, Rep.",
  "Côte d'Ivoire",
  "Djibouti",
  "Egypt, Arab Rep.",
  "Eswatini",
  "Ghana",
  "Guinea",
  "Haiti",
  "Honduras",
  "India",
  "Jordan",
  "Kenya",
  "Kiribati",
  "Kyrgyz Republic",
  "Lao PDR",
  "Lebanon",
  "Lesotho",
  "Mauritania",
  "Micronesia, Fed. Sts.",
  "Morocco",
  "Myanmar",
  "Namibia",
  "Nepal",
  "Nicaragua",
  "Nigeria",
  "Pakistan",
  "Papua New Guinea",
  "Philippines",
  "São Tomé and Principe",
  "Senegal",
  "Solomon Islands",
  "Sri Lanka",
  "Tajikistan",
  "Tanzania",
  "Timor-Leste",
  "Tunisia",
  "Uzbekistan",
  "Vanuatu",
  "Viet Nam",
  "West Bank and Gaza",
  "Zambia",
  "Zimbabwe",
]);

const UPPER_MIDDLE_INCOME_ECONOMIES = new Set([
  "Albania",
  "Algeria",
  "Argentina",
  "Armenia",
  "Azerbaijan",
  "Belarus",
  "Belize",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Cabo Verde",
  "China",
  "Colombia",
  "Cuba",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "El Salvador",
  "Equatorial Guinea",
  "Fiji",
  "Gabon",
  "Georgia",
  "Grenada",
  "Guatemala",
  "Indonesia",
  "Iran, Islamic Rep.",
  "Iraq",
  "Jamaica",
  "Kazakhstan",
  "Kosovo",
  "Libya",
  "Malaysia",
  "Maldives",
  "Marshall Islands",
  "Mauritius",
  "Mexico",
  "Moldova",
  "Mongolia",
  "Montenegro",
  "North Macedonia",
  "Paraguay",
  "Peru",
  "Samoa",
  "Serbia",
  "South Africa",
  "St. Lucia",
  "St. Vincent and the Grenadines",
  "Suriname",
  "Thailand",
  "Tonga",
  "Türkiye",
  "Turkmenistan",
  "Tuvalu",
  "Ukraine",
]);

const HIGH_INCOME_ECONOMIES = new Set([
  "American Samoa",
  "Andorra",
  "Antigua and Barbuda",
  "Aruba",
  "Australia",
  "Austria",
  "Bahamas, The",
  "Bahrain",
  "Barbados",
  "Belgium",
  "Bermuda",
  "British Virgin Islands",
  "Brunei Darussalam",
  "Bulgaria",
  "Canada",
  "Cayman Islands",
  "Channel Islands",
  "Chile",
  "Costa Rica",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Estonia",
  "Faroe Islands",
  "Finland",
  "France",
  "French Polynesia",
  "Germany",
  "Gibraltar",
  "Greece",
  "Greenland",
  "Guam",
  "Guyana",
  "Hong Kong SAR, China",
  "Hungary",
  "Iceland",
  "Ireland",
  "Isle of Man",
  "Israel",
  "Italy",
  "Japan",
  "Korea, Rep.",
  "Kuwait",
  "Latvia",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Macao SAR, China",
  "Malta",
  "Monaco",
  "Nauru",
  "Netherlands",
  "New Caledonia",
  "New Zealand",
  "Northern Mariana Islands",
  "Norway",
  "Oman",
  "Palau",
  "Panama",
  "Poland",
  "Portugal",
  "Puerto Rico",
  "Qatar",
  "Romania",
  "Russian Federation",
  "San Marino",
  "Saudi Arabia",
  "Seychelles",
  "Singapore",
  "Sint Maarten (Dutch part)",
  "Slovak Republic",
  "Slovenia",
  "Spain",
  "St. Kitts and Nevis",
  "St. Martin (French part)",
  "Sweden",
  "Switzerland",
  "Taiwan, China",
  "Trinidad and Tobago",
  "Turks and Caicos Islands",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Virgin Islands (U.S.)",
]);

const WB_NAME_OVERRIDES: Record<string, string> = {
  Bahamas: "Bahamas, The",
  Brunei: "Brunei Darussalam",
  Congo: "Congo, Rep.",
  "Democratic Republic of the Congo": "Congo, Dem. Rep.",
  "Cote d'Ivoire": "Côte d'Ivoire",
  Egypt: "Egypt, Arab Rep.",
  Gambia: "Gambia, The",
  Iran: "Iran, Islamic Rep.",
  Kyrgyzstan: "Kyrgyz Republic",
  Laos: "Lao PDR",
  Micronesia: "Micronesia, Fed. Sts.",
  Palestine: "West Bank and Gaza",
  "North Korea": "Korea, Dem. People's Rep.",
  "South Korea": "Korea, Rep.",
  Russia: "Russian Federation",
  "Saint Kitts and Nevis": "St. Kitts and Nevis",
  "Saint Lucia": "St. Lucia",
  "Saint Vincent and the Grenadines": "St. Vincent and the Grenadines",
  "Sao Tome and Principe": "São Tomé and Principe",
  Slovakia: "Slovak Republic",
  Syria: "Syrian Arab Republic",
  Taiwan: "Taiwan, China",
  Turkey: "Türkiye",
  Venezuela: "Venezuela, RB",
  Vietnam: "Viet Nam",
  Yemen: "Yemen, Rep.",
};

function getIncomeGroupByWorldBankName(worldBankEconomyName: string): WorldBankIncomeGroup {
  if (LOW_INCOME_ECONOMIES.has(worldBankEconomyName)) {
    return "Low income";
  }

  if (LOWER_MIDDLE_INCOME_ECONOMIES.has(worldBankEconomyName)) {
    return "Lower middle income";
  }

  if (UPPER_MIDDLE_INCOME_ECONOMIES.has(worldBankEconomyName)) {
    return "Upper middle income";
  }

  if (HIGH_INCOME_ECONOMIES.has(worldBankEconomyName)) {
    return "High income";
  }

  if (worldBankEconomyName === "Ethiopia" || worldBankEconomyName === "Venezuela, RB") {
    return "Not classified";
  }

  throw new Error(`No World Bank FY26 income-group mapping found for economy \"${worldBankEconomyName}\".`);
}

function isLmicIncomeGroup(incomeGroup: WorldBankIncomeGroup): boolean {
  return (
    incomeGroup === "Low income" ||
    incomeGroup === "Lower middle income" ||
    incomeGroup === "Upper middle income"
  );
}

const WORLD_BANK_INCOME_REFERENCE_LIST: WorldBankIncomeEntry[] = CANONICAL_COUNTRY_NAMES.map(
  (canonicalCountryName) => {
    const worldBankEconomyName = WB_NAME_OVERRIDES[canonicalCountryName] ?? canonicalCountryName;
    const incomeGroup = getIncomeGroupByWorldBankName(worldBankEconomyName);

    return {
      canonical_country_name: canonicalCountryName,
      world_bank_economy_name: worldBankEconomyName,
      income_group: incomeGroup,
      is_lmic: isLmicIncomeGroup(incomeGroup),
    };
  },
);

export const WORLD_BANK_INCOME_BY_COUNTRY = new Map(
  WORLD_BANK_INCOME_REFERENCE_LIST.map((entry) => [entry.canonical_country_name, entry]),
);

export function getWorldBankIncomeEntryByCanonicalCountry(
  canonicalCountryName: string,
): WorldBankIncomeEntry | null {
  return WORLD_BANK_INCOME_BY_COUNTRY.get(canonicalCountryName) ?? null;
}

export function classifyLmicCountries(countries: string[]): {
  has_lmic_country: boolean;
  lmic_countries: string[];
} {
  const lmicCountries = [...new Set(countries)]
    .filter((country) => country.toLowerCase() !== "unknown")
    .filter((country) => getWorldBankIncomeEntryByCanonicalCountry(country)?.is_lmic === true)
    .sort((a, b) => a.localeCompare(b));

  return {
    has_lmic_country: lmicCountries.length > 0,
    lmic_countries: lmicCountries,
  };
}
