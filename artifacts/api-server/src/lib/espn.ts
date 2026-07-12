import { logger } from "./logger";
import { parseEvent } from "./espn-parse";
export type { ESPNRoundScore, ESPNGolferData, ESPNEventStatus } from "./espn-parse";
import type { ESPNGolferData, ESPNEventStatus } from "./espn-parse";

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

export interface ESPNGolfer {
  espnId: string;
  name: string;
}

export async function fetchESPNScoreboard(espnEventId?: string): Promise<{
  golfers: ESPNGolferData[];
  eventStatus: ESPNEventStatus;
} | { notFound: true } | null> {
  try {
    const url = espnEventId
      ? `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${espnEventId}`
      : ESPN_SCOREBOARD_URL;

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      logger.warn({ status: response.status, url }, "ESPN API returned non-200");
      return null;
    }

    const data = await response.json() as any;

    if (!data.events || data.events.length === 0) {
      logger.warn("ESPN API returned no events");
      return null;
    }

    // Find the matching event if espnEventId is provided. If a specific event was
    // requested but ESPN's response doesn't include it (e.g. a future event not
    // yet in the current window, or a wrong id), do NOT fall back to the current
    // event — that would stamp another tournament's data onto this one.
    let event;
    if (espnEventId) {
      event = data.events.find((e: { id: string }) => e.id === espnEventId);
      if (!event) {
        logger.warn({ espnEventId }, "ESPN response did not include the requested event; treating as not found");
        return { notFound: true };
      }
    } else {
      event = data.events[0];
    }

    return parseEvent(event);
  } catch (err) {
    logger.error({ err }, "Failed to fetch ESPN scoreboard");
    return null;
  }
}

// Historical fetch: ESPN's ?event=<id> falls back to the current event for past
// ids, but ?dates=<year> returns the full season WITH final scores. Find the
// event by name within that year and parse it.
export async function fetchESPNHistoricalEvent(year: number, nameQuery: string, espnEventId?: string): Promise<{
  espnEventId: string;
  name: string;
  golfers: ESPNGolferData[];
  eventStatus: ESPNEventStatus;
} | null> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${year}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      logger.warn({ status: response.status, year }, "ESPN historical fetch non-200");
      return null;
    }
    const data = await response.json() as any;
    const events = (data.events || []) as any[];
    // Prefer matching by ESPN event id (reliable); fall back to a name match.
    const q = nameQuery.toLowerCase();
    const event = espnEventId
      ? events.find((e) => String(e.id) === espnEventId)
      : events.find((e) => String(e.name || "").toLowerCase().includes(q));
    if (!event) {
      logger.warn({ year, nameQuery, espnEventId }, "No matching historical event found");
      return null;
    }
    const parsed = parseEvent(event);
    if (!parsed) return null;
    return { espnEventId: String(event.id), name: String(event.name), ...parsed };
  } catch (err) {
    logger.error({ err, year, nameQuery }, "Failed to fetch historical ESPN event");
    return null;
  }
}

export async function fetchESPNField(espnEventId: string, year?: number): Promise<ESPNGolfer[]> {
  // STRICT: only ever use the requested event. ESPN returns the *current*
  // week's events when the id isn't in its window — using events[0] here once
  // built tiers for The Open against the Scottish Open's field.
  let event: any = null;

  // 1) Current-window lookup (fast, small payload).
  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${espnEventId}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (response.ok) {
      const data = await response.json() as any;
      event = data.events?.find((e: { id: string }) => e.id === espnEventId) ?? null;
    }
  } catch (err) {
    logger.warn({ err, espnEventId }, "Field: current-window fetch failed; trying season feed");
  }

  // 2) Season-feed fallback by id. ESPN's CDN serves inconsistent variants
  // while a field is being published (0 vs full entry list per request), and
  // the season payload is big enough that origin fetches can time out — so:
  // first attempt rides the CDN cache (fast), later attempts cache-bust, and
  // every attempt survives its own failure (a timeout must NOT abort the loop;
  // that bug turned one slow origin response into a false "no field yet").
  if (!event) {
    const y = year ?? new Date().getFullYear();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const cb = attempt === 0 ? "" : `&cb=${Date.now()}-${attempt}`;
        const seasonRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${y}${cb}`,
          { signal: AbortSignal.timeout(25000) },
        );
        if (seasonRes.ok) {
          const season = await seasonRes.json() as any;
          const found = season.events?.find((e: { id: string }) => e.id === espnEventId);
          if (found) {
            event = found;
            const n = found.competitions?.[0]?.competitors?.length ?? 0;
            if (n > 0) break; // got a populated variant
          }
        }
      } catch (err) {
        logger.warn({ err, espnEventId, attempt }, "Field: season-feed attempt failed");
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!event) {
    logger.warn({ espnEventId, year }, "Field: event not found in window or season feed");
    return [];
  }
  const competition = event.competitions?.[0];
  if (!competition) return [];

  const golfers: ESPNGolfer[] = [];
  for (const competitor of (competition.competitors || [])) {
    golfers.push({
      espnId: competitor.id,
      name: competitor.athlete?.displayName || competitor.athlete?.fullName || "Unknown",
    });
  }

  return golfers;
}

export interface ESPNEventListItem {
  espnEventId: string;
  name: string;
  date: string; // ISO date
  state: string | null; // "pre" | "in" | "post"
}

// Lists the PGA Tour events for a season (id, name, date, state) so the admin
// can pick an event instead of hunting for its ESPN id.
export async function fetchESPNEvents(year: number): Promise<ESPNEventListItem[]> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${year}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const data = (await response.json()) as any;
    const events = (data.events ?? []) as any[];
    return events
      .map((e) => ({
        espnEventId: String(e.id),
        name: String(e.name ?? ""),
        date: String(e.date ?? ""),
        state: e?.status?.type?.state ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    logger.error({ err }, "Failed to fetch ESPN events");
    return [];
  }
}
