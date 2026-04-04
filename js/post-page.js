/**
 * Create event: Leaflet map pin + calendar date/time, save to localStorage.
 */
(function () {
  var UVA = [38.0336, -78.508];
  var DEFAULT_ZOOM = 15;

  var form = document.getElementById("event-form");
  var mapEl = document.getElementById("event-map");
  var latInput = document.getElementById("lat");
  var lngInput = document.getElementById("lng");
  var locLabel = document.getElementById("loc");
  var searchInput = document.getElementById("map-search");
  var searchBtn = document.getElementById("map-search-btn");
  var mapHint = document.getElementById("map-hint");

  if (!form || !mapEl || typeof L === "undefined") return;

  var params = new URLSearchParams(window.location.search);
  var editId = params.get("edit");
  var existing = editId && window.HoosOutEvents ? window.HoosOutEvents.getById(editId) : null;

  var map = L.map(mapEl, { scrollWheelZoom: true }).setView(UVA, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  var marker = L.marker(UVA, { draggable: true }).addTo(map);

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

  map.on("click", function (e) {
    setCoords(e.latlng.lat, e.latlng.lng, false);
  });

  marker.on("dragend", function () {
    var p = marker.getLatLng();
    setCoords(p.lat, p.lng, false);
  });

  setCoords(UVA[0], UVA[1], false);

  function formatDateForInput(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function formatTimeForInput(d) {
    var h = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return h + ":" + min;
  }

  if (existing) {
    document.getElementById("title").value = existing.title || "";
    var typeEl = document.getElementById("type");
    if (typeEl) typeEl.value = existing.activityType || "";
    document.getElementById("duration").value = existing.duration || "2 hours";
    document.getElementById("cap").value = existing.cap || "";
    document.getElementById("loc").value = existing.placeLabel || "";
    document.getElementById("vis").value = existing.visibility || "public";
    document.getElementById("tags").value = existing.tags || "";
    document.getElementById("vibe").value = existing.vibe || "";
    document.getElementById("notes").value = existing.notes || "";
    try {
      var sd = new Date(existing.startISO);
      if (!isNaN(sd.getTime())) {
        document.getElementById("event-date").value = formatDateForInput(sd);
        document.getElementById("event-time").value = formatTimeForInput(sd);
      }
    } catch (err) {}
    if (existing.lat != null && existing.lng != null) {
      setCoords(existing.lat, existing.lng, true);
      map.setView([Number(existing.lat), Number(existing.lng)], 16);
    }
    var h1 = document.querySelector("main .section-title");
    if (h1) h1.textContent = "Edit event";
    var sub = document.querySelector("main .section-sub");
    if (sub) sub.innerHTML = "Update details and save — changes show on Home and in <strong>My events</strong>.";
    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "Save changes";
  }

  function nominatimSearch(query) {
    if (!query || !query.trim()) return;
    var url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(query.trim());
    fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
      },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data[0]) {
          alert("No results — try “AFC Charlottesville” or tap the map.");
          return;
        }
        var lat = parseFloat(data[0].lat);
        var lng = parseFloat(data[0].lon);
        setCoords(lat, lng, true);
        map.setView([lat, lng], 16);
        if (locLabel && !locLabel.value.trim()) {
          locLabel.value = data[0].display_name.split(",").slice(0, 2).join(",").trim();
        }
      })
      .catch(function () {
        alert("Search failed — place the pin on the map manually.");
      });
  }

  if (searchBtn && searchInput) {
    searchBtn.addEventListener("click", function () {
      nominatimSearch(searchInput.value);
    });
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        nominatimSearch(searchInput.value);
      }
    });
  }

  setTimeout(function () {
    map.invalidateSize();
  }, 200);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var lat = parseFloat(latInput.value);
    var lng = parseFloat(lngInput.value);
    if (!isFinite(lat) || !isFinite(lng)) {
      alert("Choose a location on the map (tap or search).");
      return;
    }

    var dateVal = document.getElementById("event-date").value;
    var timeVal = document.getElementById("event-time").value;
    if (!dateVal || !timeVal) {
      alert("Pick a date and time.");
      return;
    }

    var startISO = new Date(dateVal + "T" + timeVal).toISOString();

    var event = {
      id: editId && existing ? editId : window.HoosOutEvents.generateId(),
      title: document.getElementById("title").value.trim(),
      activityType: document.getElementById("type").value,
      startISO: startISO,
      duration: document.getElementById("duration").value,
      cap: document.getElementById("cap").value.trim() || "",
      lat: lat,
      lng: lng,
      placeLabel: locLabel.value.trim() || "Pinned location",
      visibility: document.getElementById("vis").value,
      tags: document.getElementById("tags").value.trim(),
      vibe: document.getElementById("vibe").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      hostName: "You",
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
    };

    if (!event.title || !event.activityType) {
      alert("Title and activity type are required.");
      return;
    }

    if (editId && existing) {
      window.HoosOutEvents.updateEvent(editId, event);
      window.location.href = "home.html#" + encodeURIComponent(editId);
    } else {
      window.HoosOutEvents.add(event);
      window.location.href =
        "home.html?posted=1#" + encodeURIComponent(event.id);
    }
  });
})();
