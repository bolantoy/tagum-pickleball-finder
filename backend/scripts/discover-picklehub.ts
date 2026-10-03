import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

interface PickleHubClub {
  id: string;
  club_name: string;
  club_address: string | null;
  club_image_url: string | null;
  avatar_url: string | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  visibility_status: string | null;
  custom_url_slug: string | null;
  total_courts: number | null;
  court_type: string | null;
  min_price: number | null;
  max_price: number | null;
  operating_hours_start: string | null;
  operating_hours_end: string | null;
  available_days: string[] | null;
  google_maps_address: string | null;
}

interface BootstrapCourt {
  id: string;
  court_type: string;
  category_id: string | null;
  court_number: number;
  lighting_available: boolean;
}

interface BootstrapCategory {
  id: string;
  name: string;
  display_order: number;
  hide_count: boolean;
  exclude_from_availability_search: boolean;
}

interface BootstrapResponse {
  courts: BootstrapCourt[];
  availability: unknown[];
  categories: BootstrapCategory[];
  profile: {
    id: string;
  };
}

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

const PICKLEHUB_BOOK_URL = "https://picklehub.ph/book";

const PICKLEHUB_API =
  "https://odimuhhyzyzdymujymzy.supabase.co/rest/v1";

const OUTPUT_DIR = path.resolve(".generated");

function toParserName(slug: string): string {
  return slug
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildNamePattern(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "%")
    .replace(/^%+|%+$/g, "");
}

async function getBootstrapFromVenuePage(
  page: import("playwright").Page,
  slug: string
): Promise<BootstrapResponse> {
  const venueUrl = `https://picklehub.ph/${slug}`;

  const bootstrapResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(
        "/rest/v1/rpc/get_club_booking_bootstrap"
      ),
    { timeout: 30_000 }
  );

  await page.goto(venueUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const response = await bootstrapResponsePromise;

  if (!response.ok()) {
    throw new Error(
      `Bootstrap HTTP ${response.status()} ${response.statusText()}`
    );
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as BootstrapResponse).courts) ||
    !Array.isArray((data as BootstrapResponse).categories)
  ) {
    throw new Error("Bootstrap response has an unexpected shape.");
  }

  return data as BootstrapResponse;
}

async function main() {
  console.log("========================================");
  console.log("     PickleHub API Discovery");
  console.log("========================================");
  console.log();

  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  try {
    console.log("Opening PickleHub booking page...");

    let resolveClubs!: (clubs: PickleHubClub[]) => void;
    let rejectClubs!: (error: Error) => void;

    const clubsPromise = new Promise<PickleHubClub[]>(
      (resolve, reject) => {
        resolveClubs = resolve;
        rejectClubs = reject;
      }
    );

    page.on("response", async (response) => {
      if (
        !response.url().includes(
          "/rest/v1/rpc/get_clubs_listing_data"
        )
      ) {
        return;
      }

      console.log(
        "Captured authenticated get_clubs_listing_data response."
      );

      try {
        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          rejectClubs(
            new Error(
              "get_clubs_listing_data returned a non-array response."
            )
          );
          return;
        }

        resolveClubs(data as PickleHubClub[]);
      } catch (error) {
        rejectClubs(
          error instanceof Error
            ? error
            : new Error("Could not parse club listing response.")
        );
      }
    });

    await page.goto(PICKLEHUB_BOOK_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    console.log("Page loaded.");
    console.log("Waiting for PickleHub data...");

    await page.waitForTimeout(3000);

    await page.waitForFunction(() => {
      const cards = (globalThis as any).document.querySelectorAll(
        "div.group.bg-card.transition-all.duration-300.cursor-pointer"
      );

      return cards.length > 0;
    }, { timeout: 15000 });

    console.log("PickleHub venue cards rendered.");

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "Timed out waiting for get_clubs_listing_data response."
          )
        );
      }, 30_000);
    });

    const clubs = await Promise.race([
      clubsPromise,
      timeoutPromise,
    ]);

    console.log(`Clubs returned: ${clubs.length}`);
    console.log();

    const tagumClubs = clubs.filter(
      (club) =>
        club.city?.toLowerCase().includes("tagum") ||
        club.club_address?.toLowerCase().includes("tagum")
    );

    console.log(`Tagum candidates: ${tagumClubs.length}`);
    console.log();

    const venues: DiscoveredVenue[] = [];

        for (let i = 0; i < tagumClubs.length; i++) {
          const club = tagumClubs[i];

          console.log(
            `[${i + 1}/${tagumClubs.length}] ${club.club_name}`
          );

          const slug = club.custom_url_slug ?? "";
          const parserName = slug ? toParserName(slug) : "";

          let status: "active" | "review" = "review";

          let bootstrap: BootstrapResponse | null = null;

          if (slug) {
            try {
              bootstrap = await getBootstrapFromVenuePage(page, slug);

              if (!bootstrap.courts.length) {
                status = "review";
                console.log("  Bootstrap: OK, but no physical courts returned");
              } else {
                status = "active";

                console.log(
                  `  Bootstrap: OK (${bootstrap.courts.length} physical courts)`
                );
              }
            } catch (error) {
              status = "review";

              const message =
                error instanceof Error
                  ? error.message
                  : "Unknown venue discovery error";

              console.log("  Bootstrap: FAILED");
              console.log(`  ${message}`);
            }
          }

          const physicalCourts =
            bootstrap?.courts
              .slice()
              .sort(
                (a, b) => a.court_number - b.court_number
              )
              .map((court) => ({
                number: court.court_number,
                type: court.court_type,
                id: court.id,
              })) ?? [];

          const warnings: string[] = [];

          if (!club.club_name) {
            warnings.push("Missing venue name");
          }

          if (!slug) {
            warnings.push("Missing PickleHub slug");
          }

          if (!club.club_address) {
            warnings.push("Missing address");
          }

          if (
            club.latitude === null ||
            club.longitude === null
          ) {
            warnings.push("Missing coordinates");
          }

          if (
            club.total_courts === null ||
            club.total_courts <= 0
          ) {
            warnings.push("Missing or invalid total_courts");
          }

          if (!bootstrap) {
            warnings.push("Bootstrap data unavailable");
          } else if (!bootstrap.courts.length) {
            warnings.push(
              "Bootstrap returned no physical courts"
            );
          }

          if (
            club.total_courts !== null &&
            physicalCourts.length > 0 &&
            club.total_courts !== physicalCourts.length
          ) {
            warnings.push(
              `Court count mismatch: listing says ${club.total_courts}, bootstrap returned ${physicalCourts.length}`
            );
          }

          const venue: DiscoveredVenue = {
            name: club.club_name,
            slug,
            parserName,
            clubId: club.id,

            status,

            address: club.club_address,
            city: club.city,
            province: club.province,

            latitude: club.latitude,
            longitude: club.longitude,

            image: club.club_image_url,
            googleMapsAddress: club.google_maps_address,

            totalCourts: club.total_courts,
            courtType: club.court_type,

            physicalCourts,

            minPrice: club.min_price,
            maxPrice: club.max_price,

            operatingHoursStart:
              club.operating_hours_start,

            operatingHoursEnd:
              club.operating_hours_end,

            availableDays: club.available_days,

            visibilityStatus:
              club.visibility_status,

            sourceUrl:
              slug
                ? `https://picklehub.ph/${slug}`
                : PICKLEHUB_BOOK_URL,

            warnings,
          };

          venues.push(venue);

          console.log(
            `  Slug:        ${slug || "(missing)"}`
          );

          console.log(
            `  Parser:      ${parserName || "(missing)"}`
          );

          console.log(
            `  Location:    ${club.city ?? "?"}, ${
              club.province ?? "?"
            }`
          );

          console.log(
            `  Coordinates: ${
              club.latitude !== null &&
              club.longitude !== null
                ? `${club.latitude}, ${club.longitude}`
                : "?"
            }`
          );

          console.log(
            `  Courts:      listing=${
              club.total_courts ?? "?"
            }, bootstrap=${physicalCourts.length}`
          );

          if (physicalCourts.length > 0) {
            console.log(
              `  Physical:    ${physicalCourts
                .map(
                  (court) =>
                    `${court.number} (${court.type})`
                )
                .join(", ")}`
            );
          }

          console.log(
            `  Price:       ${
              club.min_price !== null &&
              club.max_price !== null
                ? `₱${club.min_price} - ₱${club.max_price}`
                : "?"
            }`
          );

          if (status === "review") {
            console.log("  Status:      REVIEW");
            console.log("  Warnings:");

            for (const warning of warnings) {
              console.log(`    ⚠ ${warning}`);
            }
          } else {
            console.log("  Status:      READY");
          }

          console.log();
        }

    await fs.mkdir(OUTPUT_DIR, {
      recursive: true,
    });

    const output = {
      generatedAt: new Date().toISOString(),
      source:
        "PickleHub authenticated browser API",
      cityFilter: "Tagum",
      totalClubsReturned: clubs.length,
      tagumCandidates: tagumClubs.length,
      venues,
    };

    const outputPath = path.join(
      OUTPUT_DIR,
      "picklehub-discovery.json"
    );

    await fs.writeFile(
      outputPath,
      JSON.stringify(output, null, 2),
      "utf8"
    );

    console.log("========================================");
    console.log("Discovery complete");
    console.log("========================================");
    console.log();
    console.log(
      `All PickleHub clubs: ${clubs.length}`
    );
    console.log(
      `Tagum candidates:    ${tagumClubs.length}`
    );
    console.log(
      `Ready:               ${
        venues.filter(
          (venue) =>
            venue.status === "active" &&
            venue.warnings.length === 0
        ).length
      }`
    );

    console.log(
      `Needs review:        ${
        venues.filter(
          (venue) => venue.status === "review"
        ).length
      }`
    );

    console.log(
      `Active:              ${
        venues.filter(
          (venue) => venue.status === "active"
        ).length
      }`
    );

    console.log();
    console.log(`Report: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error();
  console.error("Discovery failed:");
  console.error(error);
  process.exit(1);
});