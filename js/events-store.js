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
    },
    "demo-ty-soccer": {
      title: "Sunset kickaround",
      line: "Today · 6:15pm · Carr’s Hill",
      host: "Ty C.",
    },
    "demo-uva-orgfair": {
      title: "Org fair",
      line: "Thu · 11am–2pm · South Lawn",
      host: "UVA Calendar",
    },
  };

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
        lat: null,
        lng: null,
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
    add: add,
    generateId: generateId,
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
