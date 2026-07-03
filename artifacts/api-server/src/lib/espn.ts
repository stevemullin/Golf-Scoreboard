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

export async function fetchESPNField(espnEventId: string): Promise<ESPNGolfer[]> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${espnEventId}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];

    const data = await response.json() as any;

    // Find the matching event
    let event = data.events?.[0];
    if (espnEventId) {
      const found = data.events?.find((e: { id: string }) => e.id === espnEventId);
      if (found) event = found;
    }

    if (!event) return [];
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
  } catch (err) {
    logger.error({ err }, "Failed to fetch ESPN field");
    return [];
  }
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
