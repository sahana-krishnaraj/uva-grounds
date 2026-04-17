/**
 * Create / edit event — persisted to Supabase.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { redirectIfProfileIncomplete } from "./profile-gate.js";
import { syncHoosOutDisplayName } from "./hoosout-profile-sync.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";

const UVA = [38.0336, -78.508];
const DEFAULT_ZOOM = 15;

const user = await requireAuth();
if (!user) {
  throw new Error("Not signed in");
}
if (await redirectIfProfileIncomplete(user)) {
  throw new Error("redirect");
}

await syncHoosOutDisplayName();

const form = document.getElementById("event-form");
const mapEl = document.getElementById("event-map");
const latInput = document.getElementById("lat");
const lngInput = document.getElementById("lng");
const locLabel = document.getElementById("loc");
const searchInput = document.getElementById("map-search");
const searchBtn = document.getElementById("map-search-btn");
const mapHint = document.getElementById("map-hint");

if (!form || !mapEl || typeof L === "undefined") {
  throw new Error("Post page requires map");
}

const params = new URLSearchParams(window.location.search);
const editId = params.get("edit");

let existing = null;
if (editId) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", editId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) console.warn(error.message);
  existing = data;
}

const map = L.map(mapEl, { scrollWheelZoom: true }).setView(UVA, DEFAULT_ZOOM);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

const marker = L.marker(UVA, { draggable: true }).addTo(map);

function setCoords(lat, lng, pan) {
  lat = Number(lat);
  lng = Number(lng);
  if (!isFinite(lat) || !isFinite(lng)) return;
  latInput.value = lat.toFixed(6);
  lngInput.value = lng.toFixed(6);
  marker.setLatLng([lat, lng]);
  if (pan) map.panTo([lat, lng]);
  if (mapHint) mapHint.textContent = "Pin set — drag it or tap the map to move.";
}

map.on("click", (e) => {
  setCoords(e.latlng.lat, e.latlng.lng, false);
});

marker.on("dragend", () => {
  const p = marker.getLatLng();
  setCoords(p.lat, p.lng, false);
});

function formatDateForInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function formatTimeForInput(d) {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return h + ":" + min;
}

setCoords(UVA[0], UVA[1], false);

if (existing) {
  document.getElementById("title").value = existing.title || "";
  const typeEl = document.getElementById("type");
  if (typeEl) typeEl.value = existing.activity_type || "";
  document.getElementById("duration").value = existing.duration || "2 hours";
  document.getElementById("cap").value = existing.cap != null ? String(existing.cap) : "";
  document.getElementById("loc").value = existing.place_label || "";
  document.getElementById("vis").value = existing.visibility || "public";
  document.getElementById("tags").value = existing.tags || "";
  document.getElementById("vibe").value = existing.vibe || "";
  document.getElementById("notes").value = existing.notes || "";
  try {
    const sd = new Date(existing.start_iso);
    if (!isNaN(sd.getTime())) {
      document.getElementById("event-date").value = formatDateForInput(sd);
      document.getElementById("event-time").value = formatTimeForInput(sd);
    }
  } catch (err) {}
  if (existing.lat != null && existing.lng != null) {
    setCoords(existing.lat, existing.lng, true);
    map.setView([Number(existing.lat), Number(existing.lng)], 16);
  }
  const h1 = document.querySelector("main .section-title");
  if (h1) h1.textContent = "Edit event";
  const sub = document.querySelector("main .section-sub");
  if (sub)
    sub.innerHTML =
      "Update details and save — changes show on Home and in <strong>My events</strong>.";
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Save changes";
}

function nominatimSearch(query) {
  if (!query || !query.trim()) return;
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query.trim());
  fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
    },
  })
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data[0]) {
        alert("No results — try “AFC Charlottesville” or tap the map.");
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      setCoords(lat, lng, true);
      map.setView([lat, lng], 16);
      if (locLabel && !locLabel.value.trim()) {
        locLabel.value = data[0].display_name.split(",").slice(0, 2).join(",").trim();
      }
    })
    .catch(() => {
      alert("Search failed — place the pin on the map manually.");
    });
}

if (searchBtn && searchInput) {
  searchBtn.addEventListener("click", () => {
    nominatimSearch(searchInput.value);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nominatimSearch(searchInput.value);
    }
  });
}

setTimeout(() => map.invalidateSize(), 200);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);
  if (!isFinite(lat) || !isFinite(lng)) {
    alert("Choose a location on the map (tap or search).");
    return;
  }

  const dateVal = document.getElementById("event-date").value;
  const timeVal = document.getElementById("event-time").value;
  if (!dateVal || !timeVal) {
    alert("Pick a date and time.");
    return;
  }

  const startISO = new Date(dateVal + "T" + timeVal).toISOString();
  const capRaw = document.getElementById("cap").value.trim();
  const capNum = capRaw ? parseInt(capRaw, 10) : null;

  const row = {
    user_id: user.id,
    title: document.getElementById("title").value.trim(),
    activity_type: document.getElementById("type").value,
    start_iso: startISO,
    duration: document.getElementById("duration").value,
    cap: capNum != null && !isNaN(capNum) ? capNum : null,
    lat,
    lng,
    place_label: locLabel.value.trim() || "Pinned location",
    visibility: document.getElementById("vis").value,
    tags: document.getElementById("tags").value.trim(),
    vibe: document.getElementById("vibe").value.trim(),
    notes: document.getElementById("notes").value.trim(),
  };

  if (!row.title || !row.activity_type) {
    alert("Title and activity type are required.");
    return;
  }

  if (editId && existing) {
    const { error } = await supabase.from("events").update(row).eq("id", editId).eq("user_id", user.id);
    if (error) {
      alert(error.message);
      return;
    }
    window.location.href = "home.html#" + encodeURIComponent(editId);
  } else {
    const { data, error } = await supabase.from("events").insert(row).select("id").single();
    if (error) {
      alert(error.message);
      return;
    }
    const newId = data && data.id ? data.id : "";
    window.location.href = "home.html?posted=1#" + encodeURIComponent(newId);
  }
});

await initNavActivityBadge();
