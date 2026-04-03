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
      '<article class="feed-post hoosout-user-event" id="' +
      escapeHtml(ev.id) +
      '" data-event-id="' +
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
  var mapEvents =
    window.HoosOutEvents && typeof window.HoosOutEvents.getHomeMapEvents === "function"
      ? window.HoosOutEvents.getHomeMapEvents(events)
      : events;
  var emptyFeed = document.getElementById("user-events-empty");
  var emptyMapMsg = document.getElementById("feed-map-empty");

  if (emptyMapMsg) {
    emptyMapMsg.style.display = mapEvents.length ? "none" : "block";
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
    if (def === "Request spot") return "Requested ✓";
    return "Going ✓";
  }

  /** Bump demo “N going” / “N others are interested” when the user RSVPs (base text stays in data-status-base). */
  function applyRsvpCountToStatusText(base, isRsvpd) {
    if (!base) return base;
    var s = base;
    s = s.replace(/(\d+)\s+going\b/g, function (_, n) {
      return String(Number(n) + (isRsvpd ? 1 : 0)) + " going";
    });
    s = s.replace(/(\d+)\s+others are interested/g, function (_, n) {
      return String(Number(n) + (isRsvpd ? 1 : 0)) + " others are interested";
    });
    return s;
  }

  /** e.g. "4 / 6 spots" → "5 / 6 spots" when the user RSVPs */
  function applyRsvpSpotsLine(base, isRsvpd) {
    if (!base) return base;
    return base.replace(/(\d+)\s*\/\s*(\d+)\s+spots/i, function (_, a, cap) {
      var n = Number(a) + (isRsvpd ? 1 : 0);
      return n + " / " + cap + " spots";
    });
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
      var baseRaw = el.getAttribute("data-status-base");
      if (!baseRaw) {
        baseRaw = el.textContent.replace(/\s*·\s*You're registered.*$/i, "").replace(/\s*·\s*saved.*$/i, "");
        el.setAttribute("data-status-base", baseRaw);
      }
      var rsvpOn = window.HoosOutEvents.isRsvpd(id);
      var base = applyRsvpCountToStatusText(baseRaw, rsvpOn);
      var parts = [];
      if (rsvpOn) parts.push("You're registered");
      if (window.HoosOutEvents.isSaved(id)) parts.push("saved");
      el.textContent = base + (parts.length ? " · " + parts.join(" · ") : "");
    });
    scope.querySelectorAll(".js-rsvp-spots").forEach(function (el) {
      var id = el.getAttribute("data-event-id");
      if (!id || !window.HoosOutEvents) return;
      var baseLine = el.getAttribute("data-event-line-base");
      if (!baseLine) {
        baseLine = el.textContent;
        el.setAttribute("data-event-line-base", baseLine);
      }
      el.textContent = applyRsvpSpotsLine(baseLine, window.HoosOutEvents.isRsvpd(id));
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

  function scrollFeedPostIntoView(eventId) {
    if (!eventId) return;
    var esc = String(eventId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    var post = document.querySelector('.feed-post[data-event-id="' + esc + '"]');
    if (!post) return;
    post.scrollIntoView({ behavior: "smooth", block: "center" });
    post.classList.remove("feed-post--map-focus");
    void post.offsetWidth;
    post.classList.add("feed-post--map-focus");
    window.setTimeout(function () {
      post.classList.remove("feed-post--map-focus");
    }, 2400);
  }

  var mainMapEl = document.getElementById("feed-map");
  if (typeof L !== "undefined" && mainMapEl) {
    var map = L.map(mainMapEl, { scrollWheelZoom: true }).setView(UVA, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (!mainMapEl.getAttribute("data-feed-jump-wired")) {
      mainMapEl.setAttribute("data-feed-jump-wired", "1");
      mainMapEl.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("a.map-popup-to-feed");
        if (!a || !mainMapEl.contains(a)) return;
        e.preventDefault();
        var id = a.getAttribute("data-event-id");
        scrollFeedPostIntoView(id);
        map.closePopup();
      });
    }

    var bounds = [];
    mapEvents.forEach(function (ev) {
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
      var whenLine = ev.startISO ? escapeHtml(formatWhen(ev.startISO)) + "<br>" : "";
      var place = escapeHtml(ev.placeLabel || ev.line || "");
      var feedLink =
        '<p class="map-popup-feed" style="margin:0.45rem 0 0;font-size:0.86rem">' +
        '<a href="#" class="map-popup-to-feed" data-event-id="' +
        escapeHtml(ev.id) +
        '">View in feed →</a></p>';
      m.bindPopup("<strong>" + escapeHtml(ev.title) + "</strong><br>" + whenLine + place + feedLink);
      m.on("click", function () {
        scrollFeedPostIntoView(ev.id);
      });
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 16);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }

    setTimeout(function () {
      map.invalidateSize();
    }, 300);
  }

  /* Inline maps: any .mini-map-wrap with data-lat / data-lng (user cards + demo feed) */
  function initMiniMaps() {
    if (typeof L === "undefined") return;
    var wraps = document.querySelectorAll(".mini-map-wrap");
    wraps.forEach(function (el, idx) {
      var latStr = el.getAttribute("data-lat");
      var lngStr = el.getAttribute("data-lng");
      if (latStr == null || lngStr == null || latStr === "" || lngStr === "") return;
      var lat = Number(latStr);
      var lng = Number(lngStr);
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
  if (typeof L !== "undefined") {
    initMiniMaps();
  }

  function scrollToPublishedEvent() {
    var h = window.location.hash;
    if (!h || h.length < 2) return;
    var id = decodeURIComponent(h.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (el && el.classList && el.classList.contains("hoosout-user-event")) {
      setTimeout(function () {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("feed-post--map-focus");
        void el.offsetWidth;
        el.classList.add("feed-post--map-focus");
        setTimeout(function () {
          el.classList.remove("feed-post--map-focus");
        }, 2400);
      }, 350);
    }
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get("posted") === "1") {
    var toast = document.createElement("div");
    toast.className = "hoosout-toast";
    toast.textContent = "Published — on your feed, map, and Profile → My events.";
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.classList.add("hoosout-toast--out");
      setTimeout(function () {
        toast.remove();
      }, 400);
    }, 3200);
    history.replaceState({}, "", "home.html" + window.location.hash);
  }
  scrollToPublishedEvent();

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
