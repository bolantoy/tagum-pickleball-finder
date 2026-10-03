import fs from "node:fs/promises";
import path from "node:path";

interface DiscoveredVenue {
  name: string;
  slug: string;
  parserName: string;
  clubId: string;
  status: "active" | "review";
  address: string | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  image: string | null;
  googleMapsAddress: string | null;
  totalCourts: number | null;
  courtType: string | null;
  physicalCourts: {
    number: number;
    type: string;
    id: string;
  }[];
  minPrice: number | null;
  maxPrice: number | null;
  operatingHoursStart: string | null;
  operatingHoursEnd: string | null;
  availableDays: string[] | null;
  visibilityStatus: string | null;
  sourceUrl: string;
  warnings: string[];
}

interface DiscoveryReport {
  generatedAt: string;
  source: string;
  cityFilter: string;
  totalClubsReturned: number;
  tagumCandidates: number;
  venues: DiscoveredVenue[];
}

interface ExistingParser {
  file: string;
  parserName: string;
  displayName: string;
  slug: string;
  namePattern: string;
}

const ROOT = path.resolve(__dirname, "..");
const DISCOVERY_PATH = path.join(
  ROOT,
  ".generated",
  "picklehub-discovery.json"
);
const PARSERS_DIR = path.join(ROOT, "src", "parsers");

const WRITE_MODE = process.argv.includes("--write");

const EXTERNAL_PARSER_NAMES = new Set([
  "smash_zone",
]);

function escapeSql(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function toClassName(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const result = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return result.endsWith("Parser")
    ? result
    : `${result}Parser`;
}

function buildNamePattern(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "%")
    .replace(/^%+|%+$/g, "");
}

async function readExistingParsers(): Promise<ExistingParser[]> {
  const entries = await fs.readdir(PARSERS_DIR, {
    withFileTypes: true,
  });

  const results: ExistingParser[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    if (
      entry.name === "PickleHubParser.ts" ||
      entry.name === "index.ts"
    ) {
      continue;
    }

    const filePath = path.join(PARSERS_DIR, entry.name);
    const content = await fs.readFile(filePath, "utf8");

    if (!content.includes("extends PickleHubParser")) {
      continue;
    }

    const parserName =
      content.match(/parserName:\s*"([^"]+)"/)?.[1];

    const displayName =
      content.match(/displayName:\s*"([^"]+)"/)?.[1];

    const slug =
      content.match(/slug:\s*"([^"]+)"/)?.[1];

    const namePattern =
      content.match(/namePattern:\s*"([^"]+)"/)?.[1];

    if (!parserName || !displayName || !slug || !namePattern) {
      console.warn(
        `⚠ Could not fully inspect PickleHub parser: ${entry.name}`
      );
      continue;
    }

    results.push({
      file: entry.name,
      parserName,
      displayName,
      slug,
      namePattern,
    });
  }

  return results;
}

function normalizeVenueName(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findExistingParser(
  venue: DiscoveredVenue,
  existing: ExistingParser[]
): ExistingParser | undefined {
  // 1. Slug is the authoritative identity.
  const bySlug = existing.find(
    (parser) => parser.slug === venue.slug
  );

  if (bySlug) {
    return bySlug;
  }

  // 2. Parser name is a secondary identity check.
  const byParserName = existing.find(
    (parser) => parser.parserName === venue.parserName
  );

  if (byParserName) {
    return byParserName;
  }

  // 3. PickleHub can normalize punctuation differently from our
  // existing parser slugs. Use the display name as a safe fallback.
  const normalizedVenueName = normalizeVenueName(venue.name);

  const nameMatches = existing.filter(
    (parser) =>
      normalizeVenueName(parser.displayName) === normalizedVenueName
  );

  // Only accept the fallback when it identifies exactly one parser.
  if (nameMatches.length === 1) {
    return nameMatches[0];
  }

  return undefined;
}

function buildParserFile(venue: DiscoveredVenue): string {
  const className = toClassName(venue.name);
  const namePattern = buildNamePattern(venue.name);

  return `import { PickleHubParser } from "./PickleHubParser";

export class ${className} extends PickleHubParser {
  constructor() {
    super({
      parserName: ${JSON.stringify(venue.parserName)},
      displayName: ${JSON.stringify(venue.name)},
      slug: ${JSON.stringify(venue.slug)},
      namePattern: ${JSON.stringify(namePattern)},
    });
  }
}
`;
}

function buildRegistryEntry(venue: DiscoveredVenue): string {
  const className = toClassName(venue.name);

  return [
    `import { ${className} } from "./${className}";`,
    "",
    `  ${venue.parserName}: new ${className}(),`,
  ].join("\n");
}

function buildSupabaseSql(venue: DiscoveredVenue): string {
  const website = venue.sourceUrl;
  const address = venue.address;
  const latitude = venue.latitude;
  const longitude = venue.longitude;
  const image = venue.image;

  return `-- PickleHub venue: ${venue.name}
-- Parser: ${venue.parserName}
-- Slug: ${venue.slug}

INSERT INTO courts (
  name,
  address,
  latitude,
  longitude,
  website,
  image,
  active,
  parser_name
)
SELECT
  ${escapeSql(venue.name)},
  ${escapeSql(address)},
  ${latitude ?? "NULL"},
  ${longitude ?? "NULL"},
  ${escapeSql(website)},
  ${escapeSql(image)},
  true,
  ${escapeSql(venue.parserName)}
WHERE NOT EXISTS (
  SELECT 1
  FROM courts
  WHERE parser_name = ${escapeSql(venue.parserName)}
);
`;
}

async function main() {
  console.log("========================================");
  console.log(" PickleHub Parser Generator — DRY RUN");
  console.log("========================================");
  console.log();

  const reportRaw = await fs.readFile(DISCOVERY_PATH, "utf8");
  const report = JSON.parse(reportRaw) as DiscoveryReport;

  const existingParsers = await readExistingParsers();

  const ready = report.venues.filter(
    (venue) =>
      venue.status === "active" &&
      venue.slug &&
      venue.physicalCourts.length > 0 &&
      venue.warnings.length === 0
  );

  const newVenues: DiscoveredVenue[] = [];
  const existingVenues: {
    venue: DiscoveredVenue;
    parser: ExistingParser;
  }[] = [];

  for (const venue of ready) {
    if (EXTERNAL_PARSER_NAMES.has(venue.parserName)) {
      continue;
    }

    const existing = findExistingParser(
      venue,
      existingParsers
    );

    if (existing) {
      existingVenues.push({
        venue,
        parser: existing,
      });
    } else {
      newVenues.push(venue);
    }
  }

  console.log(`Discovery report: ${DISCOVERY_PATH}`);
  console.log(`READY venues:      ${ready.length}`);
  console.log(
    `Existing parsers:  ${existingVenues.length}`
  );
  console.log(`New candidates:    ${newVenues.length}`);
  console.log(
    `Review venues:     ${
      report.venues.filter(
        (venue) => venue.status === "review"
      ).length
    }`
  );
  console.log();

  console.log("EXISTING — SKIP");
  console.log("----------------------------------------");

  for (const item of existingVenues) {
    console.log(
      `  ✓ ${item.venue.name} → ${item.parser.parserName}`
    );
    console.log(
      `    slug: ${item.venue.slug}`
    );
  }

  console.log();

  console.log("NEW CANDIDATES");
  console.log("----------------------------------------");

  if (newVenues.length === 0) {
    console.log("  None.");
  }

  for (const venue of newVenues) {
    console.log(`  ✓ ${venue.name}`);
    console.log(`    slug:        ${venue.slug}`);
    console.log(`    parser:      ${venue.parserName}`);
    console.log(
      `    courts:      ${venue.physicalCourts.length}`
    );
    console.log(
      `    court type:  ${venue.courtType ?? "unknown"}`
    );
    console.log(
      `    price:       ₱${venue.minPrice ?? "?"} - ₱${
        venue.maxPrice ?? "?"
      }`
    );
    console.log();
  }

  console.log("REVIEW — NOT GENERATED");
  console.log("----------------------------------------");

  for (const venue of report.venues.filter(
    (venue) => venue.status === "review"
  )) {
    console.log(
      `  • ${venue.name}: ${
        venue.warnings.join("; ") || "review required"
      }`
    );
  }

  console.log();

  if (newVenues.length === 0) {
    console.log("No new PickleHub parsers to generate.");
    return;
  }

  const generatedDir = path.join(
    ROOT,
    ".generated",
    "picklehub-generation"
  );

  for (const venue of newVenues) {
    const className = toClassName(venue.name);

    const parserFile = buildParserFile(venue);
    const registryEntry = buildRegistryEntry(venue);
    const sql = buildSupabaseSql(venue);

    console.log("========================================");
    console.log(`CANDIDATE: ${venue.name}`);
    console.log("========================================");
    console.log();
    console.log(
      `--- ${className}.ts ---`
    );
    console.log(parserFile);

    console.log("--- registry-entry.txt ---");
    console.log(registryEntry);
    console.log();

    console.log("--- supabase-migration.sql ---");
    console.log(sql);

    if (WRITE_MODE) {
      await fs.mkdir(generatedDir, {
        recursive: true,
      });

      await fs.writeFile(
        path.join(generatedDir, `${className}.ts`),
        parserFile,
        "utf8"
      );

      await fs.writeFile(
        path.join(generatedDir, "registry-entry.txt"),
        registryEntry + "\n",
        "utf8"
      );

      await fs.writeFile(
        path.join(generatedDir, "supabase-migration.sql"),
        sql,
        "utf8"
      );
    }
  }

  console.log("========================================");
  console.log(
    WRITE_MODE
      ? "Candidate files written to .generated/picklehub-generation/"
      : "DRY RUN COMPLETE — no files modified."
  );
  console.log("========================================");
}

main().catch((error) => {
  console.error();
  console.error("Generator failed:");
  console.error(error);
  process.exit(1);
});