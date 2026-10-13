import { ref } from "vue";
import { AGENCIES } from "../data/regions.js";
import { cached } from "./apiCache.js";

const TTL = 25000;
const BASE_WAIT = 30000;
const MAX_WAIT = 300000;

const BOX = { minLat: 0.77, maxLat: 7.36, minLng: 99.6, maxLng: 119.4 };

function okPos(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return (
    lat >= BOX.minLat &&
    lat <= BOX.maxLat &&
    lng >= BOX.minLng &&
    lng <= BOX.maxLng
  );
}

let feedMod = null;
function decoder() {
  if (!feedMod) {
    feedMod = import("gtfs-realtime-bindings").then((m) => {
      const ns = m.transit_realtime || m.default?.transit_realtime;
      const FM = m.FeedMessage || ns?.FeedMessage || m.default?.FeedMessage;
      if (!FM || typeof FM.decode !== "function")
        throw new Error("decoder missing");
      return FM;
    });
    feedMod.catch(() => {
      feedMod = null;
    });
  }
  return feedMod;
}

function get(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
}

function cleanSpeed(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const out = Math.round(n);
  if (out < 0 || out > 200) return null;
  return out;
}

function cleanBearing(raw) {
  if (raw == null) return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 360) return null;
  return n;
}

function str(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function has(o, k) {
  return o != null && Object.prototype.hasOwnProperty.call(o, k);
}

export function useTransitFeed() {
  const vehicles = ref([]);
  const isLive = ref(false);
  const isRefreshing = ref(false);
  const lastUpdated = ref(null);
  const feedError = ref(false);

  let coolUntil = 0;
  let fails = 0;
  const agencyAt = {};

  function waitFor(failCount) {
    return Math.min(BASE_WAIT * 2 ** (failCount - 1), MAX_WAIT);
  }

  async function pullAgency(a) {
    const res = await get(a.url, 8000);
    if (!res.ok) throw new Error("bad " + a.id);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 10) throw new Error("empty " + a.id);
    const FM = await decoder();
    const feed = FM.decode(buf);
    const out = [];
    for (const e of feed.entity || []) {
      const vp = e.vehicle;
      const pos = vp?.position;
      if (!pos) continue;
      const lat = Number(pos.latitude);
      const lng = Number(pos.longitude);
      if (!okPos(lat, lng)) continue;
      const vd = vp.vehicle || {};
      const td = vp.trip || {};
      const id = str(vd.label || vd.id);
      if (!id) continue;
      const ts = num(vp.timestamp);
      const seq =
        has(vp, "currentStopSequence") || has(vp, "current_stop_sequence")
          ? num(vp.currentStopSequence ?? vp.current_stop_sequence)
          : null;
      const dirRaw =
        has(td, "directionId") || has(td, "direction_id")
          ? (td.directionId ?? td.direction_id)
          : null;
      out.push({
        id,
        agencyId: a.id,
        agencyName: a.name,
        isTrain: a.type === "train",
        lat,
        lng,
        bearing: has(pos, "bearing") ? cleanBearing(pos.bearing) : null,
        speed: has(pos, "speed") ? cleanSpeed(pos.speed) : null,
        odo:
          has(pos, "odometer") &&
          num(pos.odometer) != null &&
          num(pos.odometer) >= 0
            ? Math.round(num(pos.odometer))
            : null,
        tripId: str(td.tripId || td.trip_id),
        routeId: str(td.routeId || td.route_id),
        dir: dirRaw,
        start: str(td.startTime || td.start_time),
        plate: str(vd.licensePlate || vd.license_plate),
        stopId: str(vp.stopId || vp.stop_id),
        stopSeq: seq != null && seq > 0 ? seq : null,
        status:
          has(vp, "currentStatus") || has(vp, "current_status")
            ? str(vp.currentStatus ?? vp.current_status)
            : "",
        at: ts && ts > 0 ? Math.round(ts * 1000) : null,
      });
    }
    if (!out.length) throw new Error("none " + a.id);
    return out;
  }

  async function refresh(regionId = "klang-valley", force = false) {
    if (isRefreshing.value) return false;
    if (!force && Date.now() < coolUntil) return false;
    isRefreshing.value = true;
    try {
      const list = AGENCIES.filter((a) => a.region === regionId);
      const res = await Promise.allSettled(
        list.map((a) => cached("gtfs:" + a.id, TTL, () => pullAgency(a))),
      );
      const fresh = [];
      const missed = [];
      res.forEach((r, i) => {
        if (r.status === "fulfilled") {
          agencyAt[list[i].id] = Date.now();
          for (const v of r.value) fresh.push({ ...v, stale: false });
        } else {
          missed.push(list[i].id);
        }
      });
      if (!fresh.length) {
        fails += 1;
        coolUntil = Date.now() + waitFor(fails);
        feedError.value = true;
        isLive.value = false;
        return false;
      }
      const now = Date.now();
      const kept = [];
      for (const id of missed) {
        if (now - (agencyAt[id] || 0) > 15 * 60 * 1000) continue;
        for (const v of vehicles.value) {
          if (v.agencyId === id) kept.push({ ...v, stale: true });
        }
      }
      vehicles.value = fresh.concat(kept);
      isLive.value = true;
      feedError.value = false;
      lastUpdated.value = new Date();
      fails = 0;
      return true;
    } catch {
      fails += 1;
      coolUntil = Date.now() + waitFor(fails);
      feedError.value = true;
      isLive.value = false;
      return false;
    } finally {
      isRefreshing.value = false;
    }
  }

  return { vehicles, isLive, isRefreshing, lastUpdated, feedError, refresh };
}
