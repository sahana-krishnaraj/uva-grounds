/**
 * Create / edit event — persisted to Supabase.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { syncHoosOutDisplayName } from "./hoosout-profile-sync.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";
import { notifyClubPost } from "./app-notifications.js";
import { ensureClubOwnerMembership, fetchMyClubPostMemberships } from "./club-membership.js";

const UVA = [38.0336, -78.508];
const DEFAULT_ZOOM = 15;

const user = await requireAuth();
if (!user) {
  throw new Error("Not signed in");
}

await syncHoosOutDisplayName();

const form = document.getElementById("event-form");
const mapEl = document.getElementById("event-map");
const latInput = document.getElementById("lat");
const lngInput = document.getElementById("lng");
const locLabel = document.getElementById("loc");
const searchInput = document.getElementById("map-search");
const searchBtn = document.getElementById("map-search-btn");
const searchResultsEl = document.getElementById("map-search-results");
const mapHint = document.getElementById("map-hint");

if (!form || !mapEl || typeof L === "undefined") {
  throw new Error("Post page requires map");
}

const params = new URLSearchParams(window.location.search);
const editId = params.get("edit");
const preselectedClubId = params.get("club");

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

async function loadMyClubs() {
  const sel = document.getElementById("club-id");
  if (!sel) return;
  await ensureClubOwnerMembership(supabase, user.id);
  const { rows, error } = await fetchMyClubPostMemberships(supabase, user.id);
  if (error) {
    console.warn("HoosOut: loadMyClubs", error.message);
    return;
  }
  rows.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.club_id;
    opt.textContent = r.name || "Club";
    sel.appendChild(opt);
  });
  if (preselectedClubId) {
    sel.value = preselectedClubId;
    if (sel.value !== preselectedClubId) {
      console.warn("HoosOut: club not in list — check club_members for", preselectedClubId);
    }
  }
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

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
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
  document.getElementById("notes").value = existing.notes || "";
  const clubSel = document.getElementById("club-id");
  if (clubSel && existing.club_id) clubSel.value = existing.club_id;
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

function syncClubVisibilityUi() {
  const visEl = document.getElementById("vis");
  const clubSel = document.getElementById("club-id");
  if (!visEl || !clubSel) return;
  if (clubSel.value) {
    visEl.value = "public";
    visEl.disabled = true;
    visEl.title = "Club posts are shown to anyone at UVA on HoosOut.";
  } else {
    visEl.disabled = false;
    visEl.title = "";
  }
}

document.getElementById("club-id")?.addEventListener("change", syncClubVisibilityUi);

await loadMyClubs();
syncClubVisibilityUi();

const UVA_VIEWBOX = "-78.5700,38.0850,-78.4300,37.9600";
let searchItems = [];
let activeSearchIndex = -1;
let searchDebounceTimer = null;
let searchAbortController = null;

function showSearchResults(items) {
  if (!searchResultsEl) return;
  searchItems = items || [];
  activeSearchIndex = -1;
  if (!searchItems.length) {
    searchResultsEl.hidden = true;
    searchResultsEl.innerHTML = "";
    return;
  }
  searchResultsEl.hidden = false;
  searchResultsEl.innerHTML = searchItems
    .map((item, idx) => {
      const primary = (item.display_name || "").split(",").slice(0, 2).join(", ").trim() || "Pinned location";
      const secondary = item.display_name || "";
      return (
        '<button type="button" class="map-search-result" data-map-result-index="' +
        idx +
        '">' +
        escHtml(primary) +
        '<small>' +
        escHtml(secondary) +
        "</small></button>"
      );
    })
    .join("");
}

function highlightSearchResult(index) {
  if (!searchResultsEl) return;
  const nodes = searchResultsEl.querySelectorAll(".map-search-result");
  nodes.forEach((node, idx) => {
    const on = idx === index;
    node.classList.toggle("is-active", on);
    if (on) node.scrollIntoView({ block: "nearest" });
  });
}

function closeSearchResults() {
  showSearchResults([]);
}

function applySearchChoice(item) {
  if (!item) return;
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);
  if (!isFinite(lat) || !isFinite(lng)) return;
  setCoords(lat, lng, true);
  map.setView([lat, lng], 16);
  const placeName = (item.display_name || "").split(",").slice(0, 2).join(", ").trim();
  if (locLabel) {
    locLabel.value = placeName || locLabel.value || "Pinned location";
  }
  if (mapHint) mapHint.textContent = "Location selected from search results.";
  closeSearchResults();
}

async function fetchPlaces(query) {
  const q = (query || "").trim();
  if (!q || q.length < 2) {
    closeSearchResults();
    return [];
  }
  if (searchAbortController) searchAbortController.abort();
  searchAbortController = new AbortController();

  const base =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=6&accept-language=en";
  const localUrl = base + "&viewbox=" + encodeURIComponent(UVA_VIEWBOX) + "&bounded=0&q=" + encodeURIComponent(q);
  const broadUrl = base + "&q=" + encodeURIComponent(q);

  try {
    const localRes = await fetch(localUrl, {
      headers: { Accept: "application/json", "Accept-Language": "en" },
      signal: searchAbortController.signal,
    });
    let data = await localRes.json();
    if (!Array.isArray(data) || !data.length) {
      const broadRes = await fetch(broadUrl, {
        headers: { Accept: "application/json", "Accept-Language": "en" },
        signal: searchAbortController.signal,
      });
      data = await broadRes.json();
    }
    const items = Array.isArray(data) ? data : [];
    showSearchResults(items);
    return items;
  } catch (err) {
    if (err && err.name === "AbortError") return [];
    if (mapHint) mapHint.textContent = "Search failed — you can still tap or drag pin on the map.";
    closeSearchResults();
    return [];
  }
}

async function runSearchAndUseFirst(query) {
  const items = await fetchPlaces(query);
  if (!items.length) {
    alert("No matching places found. Try building + UVA, or place pin manually.");
    return;
  }
  applySearchChoice(items[0]);
}

if (searchBtn && searchInput && searchResultsEl) {
  searchBtn.addEventListener("click", async () => {
    await runSearchAndUseFirst(searchInput.value);
  });
  searchInput.addEventListener("input", () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    const val = searchInput.value;
    searchDebounceTimer = setTimeout(() => {
      fetchPlaces(val);
    }, 240);
  });

  searchInput.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowDown") {
      if (!searchItems.length) return;
      e.preventDefault();
      activeSearchIndex = Math.min(searchItems.length - 1, activeSearchIndex + 1);
      highlightSearchResult(activeSearchIndex);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!searchItems.length) return;
      e.preventDefault();
      activeSearchIndex = Math.max(0, activeSearchIndex - 1);
      highlightSearchResult(activeSearchIndex);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchItems.length) {
        const idx = activeSearchIndex >= 0 ? activeSearchIndex : 0;
        applySearchChoice(searchItems[idx]);
      } else {
        await runSearchAndUseFirst(searchInput.value);
      }
      return;
    }
    if (e.key === "Escape") {
      closeSearchResults();
    }
  });

  searchResultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".map-search-result");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-map-result-index"));
    if (!isFinite(idx) || idx < 0 || idx >= searchItems.length) return;
    applySearchChoice(searchItems[idx]);
  });

  document.addEventListener("click", (e) => {
    const insideSearch = e.target.closest("#map-search") || e.target.closest("#map-search-btn") || e.target.closest("#map-search-results");
    if (!insideSearch) closeSearchResults();
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

  const startAt = new Date(dateVal + "T" + timeVal);
  if (isNaN(startAt.getTime())) {
    alert("Enter a valid date and time.");
    return;
  }
  if (startAt.getTime() < Date.now()) {
    alert("Event time must be now or in the future.");
    return;
  }
  const startISO = startAt.toISOString();
  const capRaw = document.getElementById("cap").value.trim();
  const capNum = capRaw ? parseInt(capRaw, 10) : null;

  const row = {
    user_id: user.id,
    club_id: document.getElementById("club-id")?.value || null,
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
    notes: document.getElementById("notes").value.trim(),
  };

  if (!row.title || !row.activity_type || !row.duration || !row.visibility || !row.place_label) {
    alert("Title, activity type, duration, location, and visibility are required.");
    return;
  }

  if (row.club_id) {
    row.visibility = "public";
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
    if (row.club_id && newId) {
      const [{ data: club }, { data: fl }] = await Promise.all([
        supabase.from("clubs").select("id,name").eq("id", row.club_id).maybeSingle(),
        supabase.from("club_follows").select("user_id").eq("club_id", row.club_id),
      ]);
      const recipients = [...new Set((fl || []).map((x) => x.user_id).filter((id) => id && id !== user.id))];
      await Promise.all(
        recipients.map((recipientId) =>
          notifyClubPost({
            recipientId,
            actorId: user.id,
            eventId: newId,
            clubName: club && club.name ? club.name : "A club",
            eventTitle: row.title,
          })
        )
      );
    }
    window.location.href = "home.html?posted=1#" + encodeURIComponent(newId);
  }
});

await initNavActivityBadge();
