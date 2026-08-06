# Adding a New Court Parser

This guide walks through the complete process of adding availability scraping for a new pickleball court in Tagum City.

## Overview

Each court has a parser — a TypeScript class that knows how to:
1. Fetch the court's booking website
2. Extract available time slots from the HTML (or JavaScript-rendered content)
3. Return structured data in a common format

All parsers implement the `IParser` interface, making them interchangeable.

## When to Use Cheerio vs Playwright

| Situation | Use |
|-----------|-----|
| The booking page is static HTML | **Cheerio** (faster, lighter) |
| Slots are loaded via JavaScript / React / Vue | **Playwright** (renders full browser) |
| You're unsure | Try Cheerio first; if slots are missing, switch to Playwright |

## Quick Checklist

- [ ] Create `backend/src/parsers/myCourtParser.ts`
- [ ] Implement `IParser` interface
- [ ] Add to `PARSER_REGISTRY` in `backend/src/parsers/index.ts`
- [ ] Add court row to Supabase with matching `parser_name`
- [ ] Test with `curl "http://localhost:3000/api/v1/availability?date=YYYY-MM-DD"`
- [ ] Verify slots appear in the mobile app

## Inspecting a Booking Website

Before writing a parser, inspect the target website:

1. Open the booking URL in Chrome
2. Pick a date to see available slots
3. Right-click a slot → **Inspect**
4. Look for:
   - Time information (in text, `data-time`, or an attribute)
   - Availability state (class names like `available`, `booked`, `reserved`)
   - Price (in text or a `data-price` attribute)
5. Note the CSS selectors — you'll use these in your parser

## Full Example: Cheerio Parser

```typescript
// backend/src/parsers/exampleStaticParser.ts
import * as cheerio from "cheerio";
import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { fetchWithRetry } from "../utils/httpClient";
import { logger } from "../utils/logger";

export class ExampleStaticParser implements IParser {
  readonly parserName = "example_static";
  readonly displayName = "Example Static Court";

  private readonly baseUrl =
    process.env.EXAMPLE_STATIC_URL || "https://example.com/book";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl = `${this.baseUrl}?date=${date}`;

    try {
      logger.info(`[${this.displayName}] Checking availability for ${date}`);
      const html = await fetchWithRetry(sourceUrl);
      const slots = this.parseSlots(html);
      return { courtId, courtName, date, slots, sourceUrl, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[${this.displayName}] Failed: ${message}`);
      return { courtId, courtName, date, slots: [], sourceUrl, error: message };
    }
  }

  private parseSlots(html: string): ParsedSlot[] {
    const $ = cheerio.load(html);
    const slots: ParsedSlot[] = [];

    // Example HTML structure being parsed:
    // <div class="slot available" data-time="08:00" data-price="150">
    //   <span class="time">8:00 AM</span>
    //   <span class="status">Available</span>
    // </div>
    // <div class="slot booked" data-time="09:00">
    //   ...
    // </div>

    $(".slot").each((_i, el) => {
      const element = $(el);
      const rawTime = element.attr("data-time") || "";
      if (!rawTime) return;

      const [h] = rawTime.split(":").map(Number);
      const endTime = `${String(h + 1).padStart(2, "0")}:00`;

      const classes = element.attr("class") || "";
      const available =
        classes.includes("available") && !classes.includes("booked");

      const rawPrice = element.attr("data-price");
      const price = rawPrice ? `₱${rawPrice}` : null;

      slots.push({ startTime: rawTime, endTime, available, price });
    });

    return slots;
  }
}
```

## Full Example: Playwright Parser

```typescript
// backend/src/parsers/exampleJsParser.ts
import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { logger } from "../utils/logger";

export class ExampleJsParser implements IParser {
  readonly parserName = "example_js";
  readonly displayName = "Example JS-Rendered Court";

  private readonly baseUrl =
    process.env.EXAMPLE_JS_URL || "https://example-spa.com/book";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl = `${this.baseUrl}?date=${date}`;

    try {
      const slots = await this.scrapeWithPlaywright(date, sourceUrl);
      return { courtId, courtName, date, slots, sourceUrl, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[${this.displayName}] Playwright failed: ${message}`);
      return { courtId, courtName, date, slots: [], sourceUrl, error: message };
    }
  }

  private async scrapeWithPlaywright(
    date: string,
    url: string
  ): Promise<ParsedSlot[]> {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    });

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });

      // Wait for slots to render
      await page.waitForSelector(".booking-slot", { timeout: 10_000 });

      const slots = await page.evaluate((): ParsedSlot[] => {
        return Array.from(document.querySelectorAll(".booking-slot")).map((el) => ({
          startTime: el.getAttribute("data-start") || "00:00",
          endTime: el.getAttribute("data-end") || "01:00",
          available: !el.classList.contains("booked"),
          price: el.querySelector(".price")?.textContent?.trim() || null,
        }));
      });

      return slots;
    } finally {
      await browser.close();
    }
  }
}
```

## Registering the Parser

```typescript
// backend/src/parsers/index.ts
import { ExampleStaticParser } from "./exampleStaticParser";
import { ExampleJsParser } from "./exampleJsParser";

const PARSER_REGISTRY: Record<string, IParser> = {
  pickleballers: new PickleballersParser(),
  pickle_city: new PickleCityParser(),
  hideout: new HideoutParser(),
  example_static: new ExampleStaticParser(), // ← add these
  example_js: new ExampleJsParser(),
};
```

## Error Handling Rules

Every parser MUST follow these rules:
- **Never throw** from `checkAvailability()` — catch all errors internally
- Return `{ error: "message", slots: [] }` on failure, not an exception
- Log errors with `logger.error()` so they appear in logs
- If the site is unreachable, the backend continues checking other courts

This ensures one broken court never blocks results from the others.
