/**
 * Standalone page: Leaflet map of public posted events with coordinates.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";

const UVA = [38.0336, -78.508];

function escapeHtml(s) {
  if (!s) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (e) {
    return iso;
  }
}

function hasCoords(ev) {
  const lat = Number(ev.lat);
  const lng = Number(ev.lng);
  return isFinite(lat) && isFinite(lng);
}

async function fetchPublicEventsForMap() {
  const evCols =
    "id, user_id, title, activity_type, duration, start_iso, lat, lng, place_label, visibility, tags, vibe, notes, cap, created_at";
  const { data: evs, error } = await supabase
    .from("events")
    .select(evCols)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("HoosOut: events map", error.message);
    return [];
  }
  return evs || [];
}

let mainMap = null;

function rebuildMap(rows) {
  const mainMapEl = document.getElementById("events-map-canvas");
  const emptyMapMsg = document.getElementById("events-map-empty");
  if (!mainMapEl || typeof L === "undefined") return;

  const mappable = (rows || []).filter(hasCoords);

  if (emptyMapMsg) {
    emptyMapMsg.style.display = mappable.length ? "none" : "block";
    if (!mappable.length && rows && rows.length) {
      emptyMapMsg.innerHTML =
        'No events include a map pin yet. <a href="post.html">Create an event</a> with a location.';
    } else if (!mappable.length) {
      emptyMapMsg.innerHTML =
        'No events to show on the map yet. <a href="post.html">Create an event</a>';
    }
  }

  if (mainMap) {
    mainMap.remove();
    mainMap = null;
  }

  mainMap = L.map(mainMapEl, { scrollWheelZoom: true }).setView(UVA, 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mainMap);

  const bounds = [];
  mappable.forEach((ev) => {
    const lat = Number(ev.lat);
    const lng = Number(ev.lng);
    bounds.push([lat, lng]);
    const m = L.circleMarker([lat, lng], {
      radius: 10,
      fillColor: "#e57200",
      color: "#232d4b",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    }).addTo(mainMap);
    const whenLine = ev.start_iso ? escapeHtml(formatWhen(ev.start_iso)) + "<br>" : "";
    const place = escapeHtml(ev.place_label || "");
    const whereBlock =
      '<p style="margin:0.4rem 0 0;font-size:0.88rem;color:#333"><strong>Where:</strong> ' +
      (place || "See map pin") +
      "</p>";
    const detailLink =
      '<p class="map-popup-feed" style="margin:0.5rem 0 0;font-size:0.86rem">' +
      '<a href="event-detail.html?id=' +
      encodeURIComponent(ev.id) +
      '" class="map-popup-view-more">View details</a></p>';
    m.bindPopup("<strong>" + escapeHtml(ev.title) + "</strong><br>" + whenLine + whereBlock + detailLink);
  });

  if (bounds.length === 1) mainMap.setView(bounds[0], 16);
  else if (bounds.length > 1) mainMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });

  setTimeout(() => mainMap.invalidateSize(), 300);
}

(async function init() {
  const user = await requireAuth();
  if (!user) return;

  const rows = await fetchPublicEventsForMap();
  rebuildMap(rows);

  const signedIn = window.HoosOutSession && window.HoosOutSession.isSignedIn();
  const uva = document.getElementById("nav-uva-cville");
  if (uva && window.HoosOutSession) {
    if (signedIn) uva.removeAttribute("hidden");
    else uva.setAttribute("hidden", "");
  }
  const out = document.getElementById("nav-logout");
  if (out) {
    out.addEventListener("click", async () => {
      await supabase.auth.signOut();
      if (window.HoosOutSession) window.HoosOutSession.signOut();
    });
  }

  await initNavActivityBadge();
})();
