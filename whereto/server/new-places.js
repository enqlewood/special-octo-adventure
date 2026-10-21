import express from "express";
import db from "./db.js";
import { findNearbyNewPlaceCandidates, milesBetween } from "./places.js";

// How far around each device to look, and how often.
const RADIUS_MILES = Number(process.env.NEW_PLACES_RADIUS_MILES) || 2;
const CHECK_HOURS = Number(process.env.NEW_PLACES_CHECK_HOURS) || 12;
// Google has no "new restaurant" flag, so a place we haven't seen before only
// counts as new if it opened recently or has barely any reviews yet. This
// keeps places that just moved up in the search results from triggering alerts.
const RECENT_OPENING_DAYS = 90;
const MAX_REVIEWS_FOR_NEW = 50;
// If a device moves this far, start over: everything around the new location
// would otherwise look "new".
const REBASELINE_MILES = 1;
const MAX_ALERTS_PER_CHECK = 3;
const ANDROID_CHANNEL_ID = "new-restaurants";

db.exec(`
  -- One row per device that turned on new restaurant alerts. Location is
  -- rounded to ~100m. needs_baseline means the next check should just record
  -- what's already there without sending alerts.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    token TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    needs_baseline INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked_at TEXT
  );

  -- Places already known around each device, with the business status seen
  -- last time, so a "coming soon" place that opens can be announced.
  CREATE TABLE IF NOT EXISTS seen_places (
    token TEXT NOT NULL REFERENCES push_subscriptions(token) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    business_status TEXT,
    PRIMARY KEY (token, place_id)
  );
`);

const roundCoord = (value) => Math.round(value * 1000) / 1000;
const isExpoPushToken = (token) =>
  typeof token === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(token);

// ---------- Routes ----------

export const pushRouter = express.Router();

/** Turns alerts on for a device, or updates its location. */
pushRouter.post("/subscribe", (req, res) => {
  const { token, latitude, longitude } = req.body || {};
  if (!isExpoPushToken(token) || typeof latitude !== "number" || typeof longitude !== "number") {
    return res.status(400).json({ error: "token, latitude and longitude are required" });
  }
  const lat = roundCoord(latitude);
  const lng = roundCoord(longitude);

  const existing = db
    .prepare("SELECT latitude, longitude FROM push_subscriptions WHERE token = ?")
    .get(token);
  if (!existing) {
    db.prepare("INSERT INTO push_subscriptions (token, latitude, longitude) VALUES (?, ?, ?)").run(
      token,
      lat,
      lng
    );
  } else if (milesBetween(existing.latitude, existing.longitude, lat, lng) > REBASELINE_MILES) {
    db.prepare("DELETE FROM seen_places WHERE token = ?").run(token);
    db.prepare(
      "UPDATE push_subscriptions SET latitude = ?, longitude = ?, needs_baseline = 1 WHERE token = ?"
    ).run(lat, lng, token);
  }
  res.json({ ok: true });
});

pushRouter.post("/unsubscribe", (req, res) => {
  const { token } = req.body || {};
  if (!isExpoPushToken(token)) return res.status(400).json({ error: "token is required" });
  db.prepare("DELETE FROM push_subscriptions WHERE token = ?").run(token);
  res.json({ ok: true });
});

/** Sends this device a test alert. Only works for devices with alerts on. */
pushRouter.post("/test", async (req, res) => {
  const { token } = req.body || {};
  if (!isExpoPushToken(token)) return res.status(400).json({ error: "token is required" });
  const subscribed = db.prepare("SELECT 1 FROM push_subscriptions WHERE token = ?").get(token);
  if (!subscribed) return res.status(404).json({ error: "Turn on new restaurant alerts first." });
  try {
    const ticket = await sendTestPush(token);
    if (ticket?.status !== "ok") {
      return res.status(502).json({ error: ticket?.message || "Expo couldn't send the notification." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[new-places]", err);
    res.status(502).json({ error: "Couldn't reach Expo's push service." });
  }
});

// ---------- Checking for new places ----------

function daysSince({ year, month, day }) {
  return (Date.now() - Date.UTC(year, month - 1, day)) / (24 * 60 * 60 * 1000);
}

function formatOpeningDate(date) {
  if (!date?.year || !date?.month || !date?.day) return null;
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Returns the alert to send for a place, or null if it isn't news. */
function alertFor(place, previousStatus) {
  const isNewToUs = previousStatus === undefined;
  if (place.business_status === "FUTURE_OPENING") {
    if (!isNewToUs) return null;
    const opens = formatOpeningDate(place.opening_date);
    return {
      title: "Coming soon near you",
      body: `${place.name} is opening${opens ? ` ${opens}` : " soon"} (${place.cuisine}, ${place.distance_miles} mi away).`,
    };
  }
  if (place.business_status !== "OPERATIONAL") return null;
  if (previousStatus === "FUTURE_OPENING") {
    return {
      title: "Now open near you",
      body: `${place.name} just opened (${place.cuisine}, ${place.distance_miles} mi away).`,
    };
  }
  if (!isNewToUs) return null;
  const openedRecently =
    place.opening_date?.year && daysSince(place.opening_date) <= RECENT_OPENING_DAYS;
  const barelyReviewed = (place.review_count ?? 0) < MAX_REVIEWS_FOR_NEW;
  if (!openedRecently && !barelyReviewed) return null;
  return newRestaurantAlert(place);
}

function newRestaurantAlert(place) {
  return {
    title: "New restaurant near you",
    body: `${place.name} (${place.cuisine}, ${place.distance_miles} mi away)${
      place.review_count ? ` has ${place.review_count} reviews so far.` : " just showed up on the map."
    }`,
  };
}

async function sendPushes(messages) {
  if (!messages.length) return [];
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Expo push error: ${JSON.stringify(data.errors || data)}`);
  return data.data || [];
}

async function checkSubscription(sub) {
  const places = await findNearbyNewPlaceCandidates({
    latitude: sub.latitude,
    longitude: sub.longitude,
    radiusMiles: RADIUS_MILES,
  });

  const seen = new Map(
    db
      .prepare("SELECT place_id, business_status FROM seen_places WHERE token = ?")
      .all(sub.token)
      .map((row) => [row.place_id, row.business_status])
  );

  const alerts = sub.needs_baseline
    ? []
    : places
        .map((place) => ({ place, alert: alertFor(place, seen.get(place.id)) }))
        .filter((a) => a.alert)
        .slice(0, MAX_ALERTS_PER_CHECK);

  const remember = db.prepare(
    `INSERT INTO seen_places (token, place_id, business_status) VALUES (?, ?, ?)
     ON CONFLICT (token, place_id) DO UPDATE SET business_status = excluded.business_status`
  );
  for (const place of places) remember.run(sub.token, place.id, place.business_status);
  db.prepare(
    "UPDATE push_subscriptions SET needs_baseline = 0, last_checked_at = datetime('now') WHERE token = ?"
  ).run(sub.token);

  const tickets = await sendPushes(
    alerts.map(({ place, alert }) => ({
      to: sub.token,
      title: alert.title,
      body: alert.body,
      data: { url: place.maps_url },
      channelId: ANDROID_CHANNEL_ID,
    }))
  );
  if (tickets.some((t) => t.details?.error === "DeviceNotRegistered")) {
    // The app was uninstalled or notifications were revoked.
    db.prepare("DELETE FROM push_subscriptions WHERE token = ?").run(sub.token);
  }
  return alerts.length;
}

/** Checks every subscribed device once. Returns how many alerts were sent. */
export async function checkForNewPlaces() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("[new-places] No GOOGLE_PLACES_API_KEY set - skipping new restaurant check");
    return 0;
  }
  const subs = db.prepare("SELECT * FROM push_subscriptions").all();
  let sent = 0;
  for (const sub of subs) {
    try {
      sent += await checkSubscription(sub);
    } catch (err) {
      console.error("[new-places] Check failed for one device:", err.message);
    }
  }
  console.log(`[new-places] Checked ${subs.length} device(s), sent ${sent} alert(s)`);
  return sent;
}

// Used when Google Places isn't configured or finds nothing nearby.
const SAMPLE_PLACE = {
  name: "Yuzu Ramen",
  cuisine: "Japanese",
  distance_miles: 0.4,
  review_count: 12,
  maps_url: "https://www.google.com/maps/search/Yuzu+Ramen",
};

/**
 * Sends one device a sample "new restaurant" alert, built from a real nearby
 * restaurant (the least-reviewed one) when possible. Returns Expo's ticket.
 */
export async function sendTestPush(token) {
  const sub = db.prepare("SELECT * FROM push_subscriptions WHERE token = ?").get(token);
  let place = SAMPLE_PLACE;
  if (sub && process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const nearby = await findNearbyNewPlaceCandidates({
        latitude: sub.latitude,
        longitude: sub.longitude,
        radiusMiles: RADIUS_MILES,
      });
      const open = nearby.filter((p) => p.business_status === "OPERATIONAL");
      open.sort((a, b) => (a.review_count ?? 0) - (b.review_count ?? 0));
      place = open[0] ?? SAMPLE_PLACE;
    } catch (err) {
      console.error("[new-places] Test alert lookup failed:", err.message);
    }
  }
  const alert = newRestaurantAlert(place);
  const [ticket] = await sendPushes([
    {
      to: token,
      title: `${alert.title} (test)`,
      body: alert.body,
      data: { url: place.maps_url },
      channelId: ANDROID_CHANNEL_ID,
    },
  ]);
  return ticket;
}

export function startNewPlacesSchedule() {
  const run = () => checkForNewPlaces().catch((err) => console.error("[new-places]", err));
  // First check shortly after startup, then every CHECK_HOURS.
  setTimeout(run, 60 * 1000);
  setInterval(run, CHECK_HOURS * 60 * 60 * 1000);
}
