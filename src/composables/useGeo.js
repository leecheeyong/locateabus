export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDist(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return Math.round(km * 1000) + " m";
  if (km < 10) return km.toFixed(1) + " km";
  return Math.round(km) + " km";
}

export function formatAgo(d) {
  if (!d) return "off";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 8) return "now";
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h";
}

export function getPosition(ms = 8000) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("no geo"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: ms, maximumAge: 60000 },
    );
  });
}

function timed(url, ms, opts) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() =>
    clearTimeout(t),
  );
}

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

const placeMem = new Map();
let placeWait = null;
let placePending = null;
let lastCall = 0;

export function searchPlaces(q, { limit = 6 } = {}) {
  return new Promise((resolve) => {
    clearTimeout(placeWait);
    if (placePending) placePending([]);
    placeWait = null;
    placePending = null;
    const word = q.trim().toLowerCase();
    if (word.length < 3) return resolve([]);
    const key = limit + ":" + word;
    const old = placeMem.get(key);
    if (old && old.until > Date.now()) return resolve(old.data);
    placeWait = setTimeout(async () => {
      placeWait = null;
      placePending = null;
      try {
        const gap = 1100 - (Date.now() - lastCall);
        if (gap > 0) await new Promise((r) => setTimeout(r, gap));
        lastCall = Date.now();
        const url =
          "https://nominatim.openstreetmap.org/search?format=json&limit=" +
          limit +
          "&countrycodes=my&addressdetails=1&q=" +
          encodeURIComponent(word);
        const res = await timed(url, 7000);
        if (!res.ok) return resolve(old ? old.data : []);
        const json = await res.json();
        const out = (Array.isArray(json) ? json : []).map((d) => ({
          name: String(d.display_name || "")
            .split(",")
            .slice(0, 2)
            .join(","),
          full: d.display_name,
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
        }));
        placeMem.set(key, { data: out, until: Date.now() + 10 * 60 * 1000 });
        if (placeMem.size > 50) placeMem.delete(placeMem.keys().next().value);
        resolve(out);
      } catch {
        resolve(old ? old.data : []);
      }
    }, 280);
    placePending = resolve;
  });
}

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const stopMem = new Map();
const stopBusy = new Map();

function cellOf(lat, lng) {
  return lat.toFixed(3) + "," + lng.toFixed(3);
}

function readStops(key) {
  try {
    const raw = localStorage.getItem("lab-stops-v1:" + key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !Array.isArray(v.stops)) return null;
    if (Date.now() - v.at > 7 * 24 * 3600 * 1000) return null;
    const rows = v.stops.filter(
      (s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lng),
    );
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

function writeStops(key, stops) {
  try {
    localStorage.setItem(
      "lab-stops-v1:" + key,
      JSON.stringify({ at: Date.now(), stops }),
    );
  } catch {
    return;
  }
}

async function pullStops(lat, lng, radius, key) {
  const ql =
    '[out:json][timeout:15];(node["highway"="bus_stop"](around:' +
    radius +
    "," +
    lat +
    "," +
    lng +
    ');node["public_transport"="platform"]["bus"="yes"](around:' +
    radius +
    "," +
    lat +
    "," +
    lng +
    "););out 40;";
  let err = null;
  for (const base of MIRRORS) {
    try {
      const res = await timed(base, 8000, {
        method: "POST",
        body: "data=" + encodeURIComponent(ql),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) throw new Error("overpass " + res.status);
      const json = await res.json();
      const rows = (json.elements || [])
        .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))
        .map((e) => {
          const tags = e.tags || {};
          const shelter = tags.shelter === "yes";
          const bench = tags.bench === "yes";
          const covered = tags.covered === "yes";
          return {
            id: "stop-" + e.id,
            name: tags.name || tags["name:ms"] || tags.ref || "Bus stop",
            lat: e.lat,
            lng: e.lon,
            ref: str(tags.ref),
            operator: str(tags.operator),
            shelter,
            bench,
            covered,
          };
        })
        .slice(0, 40);
      stopMem.set(key, rows);
      writeStops(key, rows);
      if (stopMem.size > 12) stopMem.delete(stopMem.keys().next().value);
      return rows;
    } catch (e) {
      err = e;
    }
  }
  if (stopMem.has(key)) return stopMem.get(key);
  throw err || new Error("stops down");
}

export async function fetchStops(lat, lng, radius = 1200) {
  const key = cellOf(lat, lng);
  if (stopMem.has(key)) return stopMem.get(key);
  if (stopBusy.has(key)) return stopBusy.get(key);
  const old = readStops(key);
  if (old) {
    stopMem.set(key, old);
    return old;
  }
  const p = pullStops(lat, lng, radius, key);
  stopBusy.set(key, p);
  try {
    return await p;
  } finally {
    stopBusy.delete(key);
  }
}
