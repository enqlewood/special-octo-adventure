const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const MOCK_RESULTS = [
  {
    id: "mock-yuzu-ramen",
    name: "Yuzu Ramen",
    rating: 4.6,
    review_count: 1240,
    price_level: "$$",
    cuisine: "Japanese",
    distance_miles: 0.4,
    open_now: true,
    hours_note: "Open till 10pm",
    photo_url: null,
    menu_url: "https://example.com/yuzu-ramen/menu",
    maps_url: "https://www.google.com/maps/search/Yuzu+Ramen",
  },
  {
    id: "mock-ittemasu",
    name: "Ittemasu",
    rating: 4.3,
    review_count: 386,
    price_level: "$$",
    cuisine: "Japanese",
    distance_miles: 0.2,
    open_now: true,
    hours_note: "Open till 11pm",
    photo_url: null,
    menu_url: "https://example.com/ittemasu/menu",
    maps_url: "https://www.google.com/maps/search/Ittemasu",
  },
  {
    id: "mock-noko-noodle-bar",
    name: "Noko Noodle Bar",
    rating: 4.1,
    review_count: 92,
    price_level: "$",
    cuisine: "Ramen",
    distance_miles: 0.6,
    open_now: false,
    hours_note: "Closed - opens 11am",
    photo_url: null,
    menu_url: null,
    maps_url: "https://www.google.com/maps/search/Noko+Noodle+Bar",
  },
];

const PRICE_LEVEL_TO_API = {
  $: "PRICE_LEVEL_INEXPENSIVE",
  $$: "PRICE_LEVEL_MODERATE",
  $$$: "PRICE_LEVEL_EXPENSIVE",
  $$$$: "PRICE_LEVEL_VERY_EXPENSIVE",
};
const PRICE_LEVEL_FROM_API = {
  PRICE_LEVEL_FREE: "$",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

/**
 * Searches nearby restaurants with Places API (New) Text Search. Falls back to mock data when no Google
 * Places API key is configured, so the app runs out of the box.
 */
export async function searchRestaurants({
  cuisine,
  price_level,
  max_distance_miles = 5,
  open_now = true,
  sort_by = "popularity",
  latitude,
  longitude,
}) {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn("[places] No GOOGLE_PLACES_API_KEY set - returning mock data");
    return sortResults(filterMock({ cuisine, price_level, open_now }), sort_by);
  }

  if (latitude == null || longitude == null) {
    console.warn("[places] No user location (permission denied?) - returning mock data");
    return sortResults(filterMock({ cuisine, price_level, open_now }), sort_by);
  }

  const radiusMeters = Math.round(max_distance_miles * 1609);
  const body = {
    textQuery: cuisine ? `${cuisine} restaurant` : "restaurant",
    includedType: "restaurant",
    // The most Text Search returns in one request. A bigger pool means the
    // sort below picks from more places.
    maxResultCount: 20,
    // Text Search only supports a circular *bias*, so we also filter by
    // distance below to honor the requested radius.
    locationBias: {
      circle: {
        center: { latitude, longitude },
        radius: Math.min(radiusMeters, 50000),
      },
    },
  };
  if (open_now) body.openNow = true;
  if (price_level) body.priceLevels = [PRICE_LEVEL_TO_API[price_level]];

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.primaryTypeDisplayName",
        "places.location",
        "places.currentOpeningHours.openNow",
        "places.photos.name",
        "places.websiteUri",
        "places.googleMapsUri",
      ].join(","),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Google Places error: ${data.error?.status} ${data.error?.message || ""}`);
  }

  const results = (data.places || [])
    .map((p) => {
      const distance = p.location
        ? milesBetween(latitude, longitude, p.location.latitude, p.location.longitude)
        : null;
      const openNow = p.currentOpeningHours?.openNow ?? null;
      return {
        id: p.id,
        name: p.displayName?.text ?? "Unnamed",
        rating: p.rating ?? null,
        review_count: p.userRatingCount ?? null,
        price_level: PRICE_LEVEL_FROM_API[p.priceLevel] ?? null,
        cuisine: p.primaryTypeDisplayName?.text || cuisine || "",
        distance_miles: distance != null ? Math.round(distance * 10) / 10 : null,
        open_now: openNow,
        hours_note: openNow === false ? "Closed now" : "",
        // Served through our own /api/photo proxy so the API key never
        // reaches the client.
        photo_url: p.photos?.[0]
          ? `/api/photo?name=${encodeURIComponent(p.photos[0].name)}`
          : null,
        menu_url: p.websiteUri ?? null,
        maps_url: p.googleMapsUri ?? null,
      };
    })
    .filter((r) => r.distance_miles == null || r.distance_miles <= max_distance_miles);

  return sortResults(results, sort_by).slice(0, 6);
}

/**
 * popularity: most reviews first (ties go to the higher rating).
 * rating: highest rated first (ties go to more reviews).
 * distance: closest first.
 * Places missing the value being sorted on go last.
 */
function sortResults(results, sort_by) {
  const byDesc = (key) => (a, b) => (b[key] ?? -1) - (a[key] ?? -1);
  const comparators = {
    popularity: [byDesc("review_count"), byDesc("rating")],
    rating: [byDesc("rating"), byDesc("review_count")],
    distance: [(a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity)],
  };
  const order = comparators[sort_by] ?? comparators.popularity;
  return [...results].sort((a, b) => {
    for (const compare of order) {
      const diff = compare(a, b);
      if (diff) return diff;
    }
    return 0;
  });
}

/** Streams a Places photo, keeping the API key server-side. */
export async function fetchPlacePhoto(name) {
  if (!GOOGLE_PLACES_API_KEY || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return null;
  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${GOOGLE_PLACES_API_KEY}`
  );
  return res.ok ? res : null;
}

const NEW_PLACE_FIELDS = [
  "places.id",
  "places.displayName",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.location",
  "places.businessStatus",
  "places.openingDate",
  "places.googleMapsUri",
];

async function placesRequest(endpoint, body) {
  const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": NEW_PLACE_FIELDS.join(","),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google Places error: ${data.error?.status} ${data.error?.message || ""}`);
  }
  return data.places || [];
}

/**
 * Finds restaurants near a point that might be new, for new restaurant
 * alerts. Combines the closest restaurants (including ones that haven't
 * opened yet) with Google's results for "new restaurant", since each search
 * returns at most 20 places.
 */
export async function findNearbyNewPlaceCandidates({ latitude, longitude, radiusMiles }) {
  const radius = Math.min(Math.round(radiusMiles * 1609), 50000);
  const circle = { center: { latitude, longitude }, radius };
  const batches = await Promise.all([
    placesRequest("searchNearby", {
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      includeFutureOpeningBusinesses: true,
      locationRestriction: { circle },
    }),
    placesRequest("searchText", {
      textQuery: "new restaurant",
      includedType: "restaurant",
      maxResultCount: 20,
      locationBias: { circle },
    }),
  ]);

  const byId = new Map();
  for (const p of batches.flat()) {
    if (byId.has(p.id) || !p.location) continue;
    const distance = milesBetween(latitude, longitude, p.location.latitude, p.location.longitude);
    if (distance > radiusMiles) continue;
    byId.set(p.id, {
      id: p.id,
      name: p.displayName?.text ?? "Unnamed",
      cuisine: p.primaryTypeDisplayName?.text || "Restaurant",
      review_count: p.userRatingCount ?? null,
      business_status: p.businessStatus ?? null,
      opening_date: p.openingDate ?? null,
      distance_miles: Math.round(distance * 10) / 10,
      maps_url: p.googleMapsUri ?? null,
    });
  }
  return [...byId.values()];
}

export function milesBetween(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

function filterMock({ cuisine, price_level, open_now }) {
  let results = MOCK_RESULTS;
  if (cuisine) {
    results = results.filter((r) =>
      r.cuisine.toLowerCase().includes(cuisine.toLowerCase())
    );
  }
  if (price_level) {
    results = results.filter((r) => r.price_level === price_level);
  }
  if (open_now) {
    results = results.filter((r) => r.open_now);
  }
  return results.length ? results : MOCK_RESULTS;
}
