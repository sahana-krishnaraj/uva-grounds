/**
 * Home: render saved events in feed + map of all pins.
 */
(function () {
  var UVA = [38.0336, -78.508];

  function escapeHtml(s) {
    if (!s) return "";
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatWhen(iso) {
    try {
      var d = new Date(iso);
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

  function visibilityPill(vis) {
    if (vis === "friends") {
      return '<span class="post-visibility-pill pill-friends">👥 Friends only</span>';
    }
    if (vis === "invite") {
      return '<span class="post-visibility-pill pill-invite">✉️ Invite-only</span>';
    }
    return '<span class="post-visibility-pill pill-public">🌐 Anyone at UVA</span>';
  }

  function visibilityBadge(vis) {
    if (vis === "friends") return '<span class="badge badge-friends">Friends only</span>';
    if (vis === "invite") return '<span class="badge badge-student">Invite-only</span>';
    return '<span class="badge badge-student">Student event</span>';
  }

  function renderEventCard(ev) {
    var notesHtml = ev.notes
      ? '<div class="post-body"><p>' + escapeHtml(ev.notes) + "</p></div>"
      : "";
    var tags =
      ev.tags &&
      ev.tags
        .split(",")
        .map(function (t) {
          return t.trim();
        })
        .filter(Boolean)
        .map(function (t) {
          return '<span class="tag">' + escapeHtml(t) + "</span>";
        })
        .join(" ");

    return (
      '<article class="feed-post hoosout-user-event" data-event-id="' +
      escapeHtml(ev.id) +
      '">' +
      '<header class="post-header">' +
      '<div class="avatar avatar--md avatar--color-2" aria-hidden="true">' +
      escapeHtml((ev.hostName || "You").slice(0, 2).toUpperCase()) +
      "</div>" +
      '<div class="post-header-main">' +
      '<div class="post-names"><strong>' +
      escapeHtml(ev.hostName || "You") +
      "</strong> posted an event " +
      visibilityPill(ev.visibility) +
      "</div>" +
      '<div class="post-meta-line">' +
      formatWhen(ev.createdAt) +
      " · " +
      escapeHtml(ev.placeLabel) +
      "</div>" +
      "</div>" +
      "</header>" +
      notesHtml +
      '<div class="post-event-box">' +
      visibilityBadge(ev.visibility) +
      "<h3>" +
      escapeHtml(ev.title) +
      "</h3>" +
      '<p class="event-line">' +
      formatWhen(ev.startISO) +
      " · " +
      escapeHtml(ev.duration || "") +
      (ev.cap ? " · up to " + escapeHtml(ev.cap) + " people" : "") +
      "</p>" +
      '<p class="event-line">' +
      escapeHtml(ev.activityType) +
      (ev.vibe ? " · " + escapeHtml(ev.vibe) : "") +
      "</p>" +
      (tags ? '<div class="event-tags" style="margin-top:0.35rem">' + tags + "</div>" : "") +
      '<div class="mini-map-wrap" id="mini-map-' +
      escapeHtml(ev.id) +
      '" data-lat="' +
      ev.lat +
      '" data-lng="' +
      ev.lng +
      '" aria-label="Event location map"></div>' +
      '<div class="event-actions" style="margin-top:0.5rem">' +
      '<button type="button" class="btn btn-primary btn-sm js-rsvp-btn" data-event-id="' +
      escapeHtml(ev.id) +
      '" data-rsvp-label="RSVP">RSVP</button>' +
      '<button type="button" class="btn btn-ghost btn-sm js-save-btn" data-event-id="' +
      escapeHtml(ev.id) +
      '">Save</button>' +
      "</div>" +
      "</div>" +
      '<div class="post-stats js-event-status" data-event-id="' +
      escapeHtml(ev.id) +
      '" data-status-base="Your event · visible per your privacy setting">Your event · visible per your privacy setting</div>' +
      '<div class="post-actions-row">' +
      '<button type="button" class="post-action-btn">👍 Like</button>' +
      '<button type="button" class="post-action-btn">💬 Comment</button>' +
      '<button type="button" class="post-action-btn">↗ Share</button>' +
      "</div>" +
      "</article>"
    );
  }

  var mount = document.getElementById("user-events-mount");
  var events = window.HoosOutEvents ? window.HoosOutEvents.getAll() : [];
  var emptyFeed = document.getElementById("user-events-empty");
  var emptyMapMsg = document.getElementById("feed-map-empty");

  if (emptyMapMsg) {
    emptyMapMsg.style.display = events.length ? "none" : "block";
  }
  if (emptyFeed) {
    emptyFeed.style.display = events.length ? "none" : "block";
  }

  if (mount) {
    if (events.length) {
      mount.innerHTML = events.map(renderEventCard).join("");
    } else {
      mount.innerHTML = "";
    }
  }

  function rsvpActiveLabel(btn) {
    var def = btn.getAttribute("data-rsvp-label") || "RSVP";
    if (def === "Join") return "You're in ✓";
    if (def === "Add to plan") return "On your plan ✓";
    if (def === "Interested") return "Interested ✓";
    return "Going ✓";
  }

  function refreshActionButtons(root) {
    var scope = root || document;
    if (!window.HoosOutEvents) return;
    scope.querySelectorAll(".js-rsvp-btn").forEach(function (btn) {
      var id = btn.getAttribute("data-event-id");
      if (!id) return;
      var def = btn.getAttribute("data-rsvp-label") || "RSVP";
      var on = window.HoosOutEvents.isRsvpd(id);
      btn.textContent = on ? rsvpActiveLabel(btn) : def;
      btn.classList.toggle("btn-rsvp-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    scope.querySelectorAll(".js-save-btn").forEach(function (btn) {
      var id = btn.getAttribute("data-event-id");
      if (!id) return;
      var on = window.HoosOutEvents.isSaved(id);
      btn.textContent = on ? "Saved ✓" : "Save";
      btn.classList.toggle("btn-save-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    scope.querySelectorAll(".js-event-status").forEach(function (el) {
      var id = el.getAttribute("data-event-id");
      if (!id || !window.HoosOutEvents) return;
      var base = el.getAttribute("data-status-base");
      if (!base) {
        base = el.textContent.replace(/\s*·\s*You're registered.*$/i, "").replace(/\s*·\s*saved.*$/i, "");
        el.setAttribute("data-status-base", base);
      }
      var parts = [];
      if (window.HoosOutEvents.isRsvpd(id)) parts.push("You're registered");
      if (window.HoosOutEvents.isSaved(id)) parts.push("saved");
      el.textContent = base + (parts.length ? " · " + parts.join(" · ") : "");
    });
  }

  function eventClickElement(e) {
    var t = e.target;
    if (!t) return null;
    if (t.nodeType === 3 && t.parentElement) t = t.parentElement;
    if (!t || t.nodeType !== 1) return null;
    return t;
  }

  function wireRsvpSaveClicks() {
    document.body.addEventListener("click", function (e) {
      if (!window.HoosOutEvents) return;
      var el = eventClickElement(e);
      if (!el) return;
      var rsvp = el.closest(".js-rsvp-btn");
      var save = el.closest(".js-save-btn");
      var follow = el.closest(".js-follow-btn");
      if (rsvp) {
        e.preventDefault();
        e.stopPropagation();
        var id = rsvp.getAttribute("data-event-id");
        if (!id) return;
        window.HoosOutEvents.toggleRsvp(id);
        refreshActionButtons(document);
      } else if (save) {
        e.preventDefault();
        e.stopPropagation();
        var sid = save.getAttribute("data-event-id");
        if (!sid) return;
        window.HoosOutEvents.toggleSaved(sid);
        refreshActionButtons(document);
      } else if (follow) {
        e.preventDefault();
        e.stopPropagation();
        var pid = follow.getAttribute("data-person-id");
        var pname = follow.getAttribute("data-person-name") || "";
        var pini = follow.getAttribute("data-person-initials") || "?";
        if (!pid) return;
        window.HoosOutEvents.toggleFollowPerson({
          id: pid,
          name: pname,
          initials: pini,
        });
        refreshFollowButtons(document);
      }
    });
  }

  function refreshFollowButtons(root) {
    var scope = root || document;
    if (!window.HoosOutEvents) return;
    scope.querySelectorAll(".js-follow-btn").forEach(function (btn) {
      var pid = btn.getAttribute("data-person-id");
      if (!pid) return;
      var on = window.HoosOutEvents.isFollowingPerson(pid);
      btn.textContent = on ? "Following" : "Follow";
      btn.classList.toggle("btn-follow-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  wireRsvpSaveClicks();
  refreshActionButtons(document);
  refreshFollowButtons(document);

  var mainMapEl = document.getElementById("feed-map");
  if (typeof L !== "undefined" && mainMapEl) {
    var map = L.map(mainMapEl, { scrollWheelZoom: true }).setView(UVA, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    var bounds = [];
    events.forEach(function (ev) {
      if (ev.lat == null || ev.lng == null) return;
      var lat = Number(ev.lat);
      var lng = Number(ev.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      bounds.push([lat, lng]);
      var m = L.circleMarker([lat, lng], {
        radius: 10,
        fillColor: "#e57200",
        color: "#232d4b",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(map);
      m.bindPopup(
        "<strong>" +
          escapeHtml(ev.title) +
          "</strong><br>" +
          escapeHtml(formatWhen(ev.startISO)) +
          "<br>" +
          escapeHtml(ev.placeLabel || "")
      );
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }

    setTimeout(function () {
      map.invalidateSize();
    }, 300);
  }

  /* Small inline maps per user event card */
  function initMiniMaps() {
    events.forEach(function (ev, idx) {
      if (ev.lat == null || ev.lng == null) return;
      var el = document.getElementById("mini-map-" + ev.id);
      if (!el) return;
      var lat = Number(ev.lat);
      var lng = Number(ev.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      setTimeout(function () {
        var mini = L.map(el, {
          zoomControl: false,
          dragging: true,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          attributionControl: true,
        }).setView([lat, lng], 16);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OSM",
        }).addTo(mini);
        L.marker([lat, lng]).addTo(mini);
        mini.invalidateSize();
      }, 80 + idx * 120);
    });
  }
  if (typeof L !== "undefined" && events.length) {
    initMiniMaps();
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get("posted") === "1") {
    var toast = document.createElement("div");
    toast.className = "hoosout-toast";
    toast.textContent = "Event published — it’s on your feed and the map.";
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.classList.add("hoosout-toast--out");
      setTimeout(function () {
        toast.remove();
      }, 400);
    }, 3200);
    history.replaceState({}, "", "home.html");
  }

  document.querySelectorAll(".chip").forEach(function (c) {
    c.addEventListener("click", function () {
      document.querySelectorAll(".chip").forEach(function (x) {
        x.classList.remove("active");
      });
      c.classList.add("active");
    });
  });

  function wireStarPicker(container) {
    var buttons = container.querySelectorAll("button");
    var current = 0;
    buttons.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        current = i + 1;
        buttons.forEach(function (b, j) {
          b.classList.toggle("is-active", j < current);
        });
      });
    });
  }

  document.querySelectorAll(".js-star-picker").forEach(wireStarPicker);

  document.querySelectorAll(".js-feedback-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      alert("Demo only — connect a backend to save ratings.");
    });
  });
})();
