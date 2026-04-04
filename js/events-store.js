/**
 * HoosOut — client-side event persistence (localStorage).
 * Replace with your API when you ship a backend.
 */
(function () {
  var STORAGE_KEY = "hoosout_events_v1";

  function safeParse(json, fallback) {
    try {
      return JSON.parse(json);
    } catch (e) {
      return fallback;
    }
  }

  function getAll() {
    var raw = localStorage.getItem(STORAGE_KEY);
    var list = safeParse(raw, []);
    return Array.isArray(list) ? list : [];
  }

  function saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function add(event) {
    var list = getAll();
    list.unshift(event);
    saveAll(list);
    return event;
  }

  function getById(id) {
    if (!id) return null;
    var list = getAll();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function updateEvent(id, next) {
    if (!id || !next) return false;
    var list = getAll();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) break;
    }
    if (i >= list.length) return false;
    next.id = id;
    list[i] = next;
    saveAll(list);
    return true;
  }

  function removeEvent(id) {
    if (!id) return false;
    var prev = getAll();
    var list = prev.filter(function (e) {
      return e.id !== id;
    });
    if (list.length === prev.length) return false;
    saveAll(list);
    var rsvp = getIdSet(RSVP_KEY).filter(function (x) {
      return x !== id;
    });
    setIdSet(RSVP_KEY, rsvp);
    var saved = getIdSet(SAVED_KEY).filter(function (x) {
      return x !== id;
    });
    setIdSet(SAVED_KEY, saved);
    var cm = getCommentsMap();
    if (cm[id]) {
      delete cm[id];
      saveCommentsMap(cm);
    }
    var lm = getLikesMap();
    if (lm[id]) {
      delete lm[id];
      saveLikesMap(lm);
    }
    var lcm = getLikeCountsMap();
    if (lcm[id] !== undefined) {
      delete lcm[id];
      saveLikeCountsMap(lcm);
    }
    return true;
  }

  var COMMENTS_KEY = "hoosout_post_comments_v1";

  function getCommentsMap() {
    var raw = localStorage.getItem(COMMENTS_KEY);
    var o = safeParse(raw, {});
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  }

  function saveCommentsMap(map) {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(map));
  }

  function getComments(postKey) {
    var m = getCommentsMap();
    var arr = m[postKey];
    return Array.isArray(arr) ? arr : [];
  }

  function addComment(postKey, text) {
    text = String(text || "").trim();
    if (!postKey || !text) return null;
    var m = getCommentsMap();
    var arr = Array.isArray(m[postKey]) ? m[postKey].slice() : [];
    arr.push({ text: text, at: new Date().toISOString() });
    m[postKey] = arr;
    saveCommentsMap(m);
    return arr;
  }

  var LIKES_KEY = "hoosout_post_likes_v1";
  var LIKE_COUNT_KEY = "hoosout_post_like_counts_v1";

  function getLikesMap() {
    var raw = localStorage.getItem(LIKES_KEY);
    var o = safeParse(raw, {});
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  }

  function saveLikesMap(map) {
    localStorage.setItem(LIKES_KEY, JSON.stringify(map));
  }

  function getLikeCountsMap() {
    var raw = localStorage.getItem(LIKE_COUNT_KEY);
    var o = safeParse(raw, {});
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  }

  function saveLikeCountsMap(map) {
    localStorage.setItem(LIKE_COUNT_KEY, JSON.stringify(map));
  }

  function isLiked(postKey) {
    return !!getLikesMap()[postKey];
  }

  function getLikeDisplayCount(postKey, domBase) {
    domBase = Number(domBase) || 0;
    var c = getLikeCountsMap();
    if (c[postKey] !== undefined && c[postKey] !== null) {
      return Math.max(0, Number(c[postKey]));
    }
    return domBase + (isLiked(postKey) ? 1 : 0);
  }

  function toggleLike(postKey, domBase) {
    domBase = Number(domBase) || 0;
    if (!postKey) return { liked: false, count: domBase };
    var counts = getLikeCountsMap();
    var current;
    if (counts[postKey] !== undefined && counts[postKey] !== null) {
      current = Math.max(0, Number(counts[postKey]));
    } else {
      current = domBase + (isLiked(postKey) ? 1 : 0);
    }
    var m = getLikesMap();
    var was = !!m[postKey];
    if (was) {
      delete m[postKey];
      counts[postKey] = Math.max(0, current - 1);
    } else {
      m[postKey] = true;
      counts[postKey] = current + 1;
    }
    saveLikesMap(m);
    saveLikeCountsMap(counts);
    return { liked: !was, count: counts[postKey] };
  }

  function generateId() {
    return "ev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  var RSVP_KEY = "hoosout_rsvps_v1";
  var SAVED_KEY = "hoosout_saved_events_v1";

  function getIdSet(key) {
    var raw = localStorage.getItem(key);
    var arr = safeParse(raw, []);
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (id) {
      return typeof id === "string" && id.length;
    });
  }

  function setIdSet(key, ids) {
    localStorage.setItem(key, JSON.stringify(ids));
  }

  function toggleInSet(key, id) {
    var ids = getIdSet(key);
    var i = ids.indexOf(id);
    if (i >= 0) {
      ids.splice(i, 1);
      setIdSet(key, ids);
      return false;
    }
    ids.push(id);
    setIdSet(key, ids);
    return true;
  }

  function isInSet(key, id) {
    return getIdSet(key).indexOf(id) >= 0;
  }

  function toggleRsvp(eventId) {
    return toggleInSet(RSVP_KEY, eventId);
  }

  function toggleSaved(eventId) {
    return toggleInSet(SAVED_KEY, eventId);
  }

  function isRsvpd(eventId) {
    return isInSet(RSVP_KEY, eventId);
  }

  function isSaved(eventId) {
    return isInSet(SAVED_KEY, eventId);
  }

  /** Demo / feed events so Saved & Going can show titles without a server */
  var DEMO_EVENTS = {
    "demo-jordan-gym": {
      title: "Gym session → late dinner",
      line: "Today · 5:30pm · AFC + Corner · wellness",
      host: "Jordan R.",
      placeLabel: "Aquatic & Fitness Center (AFC), 450 Whitehead Rd",
      lat: 38.04912,
      lng: -78.51142,
      startISO: "2026-04-03T17:30:00",
    },
    "demo-ty-soccer": {
      title: "Sunset kickaround",
      line: "Today · 6:15pm · Carr’s Hill",
      host: "Ty C.",
      placeLabel: "Carr’s Hill field (intramural turf)",
      lat: 38.03192,
      lng: -78.51388,
      startISO: "2026-04-03T18:15:00",
    },
    "demo-uva-orgfair": {
      title: "Org fair",
      line: "Thu · 11am–2pm · South Lawn",
      host: "UVA Calendar",
      placeLabel: "South Lawn, Central Grounds",
      lat: 38.03526,
      lng: -78.50374,
      startISO: "2026-04-09T11:00:00",
    },
    "demo-clemons-econ": {
      title: "Econ 2010 problem-set sprint",
      line: "Sat · 2pm · Clemons 4th floor",
      host: "Sam K.",
      placeLabel: "Clemons Library, 4th floor",
      lat: 38.03622,
      lng: -78.50488,
      startISO: "2026-04-04T14:00:00",
    },
    "demo-lawn-volleyball": {
      title: "Grass volleyball — all levels",
      line: "Sat · 4pm · South Lawn",
      host: "Morgan P.",
      placeLabel: "South Lawn (grass, north side)",
      lat: 38.03508,
      lng: -78.50325,
      startISO: "2026-04-04T16:00:00",
    },
    "demo-memgym-hoops": {
      title: "Pickup runs @ Mem Gym",
      line: "Sun · 7pm · full court if we get 10",
      host: "Chris N.",
      placeLabel: "Memorial Gymnasium, Carr’s Hill",
      lat: 38.03435,
      lng: -78.50815,
      startISO: "2026-04-05T19:00:00",
    },
    "demo-mall-coffee": {
      title: "Sunday coffee + read on the Mall",
      line: "Sun · 10:30am · Downtown Mall",
      host: "Riley D.",
      placeLabel: "Grit Coffee, Downtown Mall",
      lat: 38.03052,
      lng: -78.47942,
      startISO: "2026-04-05T10:30:00",
    },
    "demo-alderman-thesis": {
      title: "Thesis writing blocks (quiet)",
      line: "Mon · 9am–12pm · Alderman stacks",
      host: "Nora V.",
      placeLabel: "Alderman Library, quiet floors",
      lat: 38.03465,
      lng: -78.50545,
      startISO: "2026-04-06T09:00:00",
    },
  };

  /** User-posted events plus demo feed pins (real lat/lng) for the Home map */
  function getHomeMapEvents(userEvents) {
    userEvents = userEvents || [];
    var seen = {};
    var out = [];
    var i;
    for (i = 0; i < userEvents.length; i++) {
      var u = userEvents[i];
      seen[u.id] = true;
      out.push(u);
    }
    Object.keys(DEMO_EVENTS).forEach(function (id) {
      if (seen[id]) return;
      var d = DEMO_EVENTS[id];
      if (d.lat == null || d.lng == null) return;
      out.push({
        id: id,
        title: d.title,
        startISO: d.startISO || null,
        placeLabel: d.placeLabel || "",
        lat: d.lat,
        lng: d.lng,
      });
    });
    return out;
  }

  function formatUserEventLine(ev) {
    try {
      var d = new Date(ev.startISO);
      var when = d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      var parts = [when, ev.placeLabel, ev.activityType].filter(Boolean);
      return parts.join(" · ");
    } catch (err) {
      return ev.placeLabel || ev.title || "";
    }
  }

  function getEventMeta(eventId) {
    if (!eventId) return null;
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === eventId) {
        var ev = all[i];
        return {
          id: ev.id,
          title: ev.title,
          line: formatUserEventLine(ev),
          host: ev.hostName || "You",
          isYours: true,
          lat: ev.lat,
          lng: ev.lng,
        };
      }
    }
    var demo = DEMO_EVENTS[eventId];
    if (demo) {
      return {
        id: eventId,
        title: demo.title,
        line: demo.line,
        host: demo.host,
        isYours: false,
        lat: demo.lat != null ? demo.lat : null,
        lng: demo.lng != null ? demo.lng : null,
      };
    }
    return {
      id: eventId,
      title: "Event",
      line: "Details unavailable",
      host: "",
      isYours: false,
      lat: null,
      lng: null,
    };
  }

  var FOLLOWING_KEY = "hoosout_following_v1";

  function getFollowing() {
    var raw = localStorage.getItem(FOLLOWING_KEY);
    var arr = safeParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveFollowing(list) {
    localStorage.setItem(FOLLOWING_KEY, JSON.stringify(list));
  }

  function followPerson(person) {
    if (!person || !person.id) return false;
    var list = getFollowing();
    if (list.some(function (p) { return p.id === person.id; })) return false;
    list.push({
      id: person.id,
      name: person.name || "Student",
      initials: person.initials || "?",
    });
    saveFollowing(list);
    return true;
  }

  function unfollowPerson(personId) {
    var list = getFollowing().filter(function (p) {
      return p.id !== personId;
    });
    saveFollowing(list);
  }

  function isFollowingPerson(personId) {
    return getFollowing().some(function (p) {
      return p.id === personId;
    });
  }

  function toggleFollowPerson(person) {
    if (isFollowingPerson(person.id)) {
      unfollowPerson(person.id);
      return false;
    }
    followPerson(person);
    return true;
  }

  window.HoosOutEvents = {
    STORAGE_KEY: STORAGE_KEY,
    getAll: getAll,
    getById: getById,
    getHomeMapEvents: getHomeMapEvents,
    add: add,
    updateEvent: updateEvent,
    removeEvent: removeEvent,
    generateId: generateId,
    getComments: getComments,
    addComment: addComment,
    isLiked: isLiked,
    getLikeDisplayCount: getLikeDisplayCount,
    toggleLike: toggleLike,
    toggleRsvp: toggleRsvp,
    toggleSaved: toggleSaved,
    isRsvpd: isRsvpd,
    isSaved: isSaved,
    getRsvpIds: function () {
      return getIdSet(RSVP_KEY);
    },
    getSavedIds: function () {
      return getIdSet(SAVED_KEY);
    },
    getEventMeta: getEventMeta,
    DEMO_EVENTS: DEMO_EVENTS,
    getFollowing: getFollowing,
    followPerson: followPerson,
    unfollowPerson: unfollowPerson,
    isFollowingPerson: isFollowingPerson,
    toggleFollowPerson: toggleFollowPerson,
  };
})();
