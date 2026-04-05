/**
 * localStorage-backed notifications (bell + dropdown).
 */
(function () {
  var STORAGE_KEY = "hoosout_notifications_v1";
  var SEEN_KEY = "hoosout_notif_seen_v1";

  function safeParse(json, fallback) {
    try {
      return JSON.parse(json);
    } catch (e) {
      return fallback;
    }
  }

  function loadList() {
    var raw = localStorage.getItem(STORAGE_KEY);
    var list = safeParse(raw, []);
    return Array.isArray(list) ? list : [];
  }

  function saveList(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 200)));
    } catch (e) {}
  }

  function loadSeen() {
    var o = safeParse(localStorage.getItem(SEEN_KEY), {});
    return {
      followers: new Set(Array.isArray(o.followers) ? o.followers : []),
      rsvpKeys: new Set(Array.isArray(o.rsvpKeys) ? o.rsvpKeys : []),
      messageIds: new Set(Array.isArray(o.messageIds) ? o.messageIds : []),
      initialized: !!o.initialized,
      msgInit: !!o.msgInit,
      rsvpInit: !!o.rsvpInit,
    };
  }

  function saveSeen(seen) {
    try {
      localStorage.setItem(
        SEEN_KEY,
        JSON.stringify({
          followers: Array.from(seen.followers || []),
          rsvpKeys: Array.from(seen.rsvpKeys || []),
          messageIds: Array.from(seen.messageIds || []),
          initialized: !!seen.initialized,
          msgInit: !!seen.msgInit,
          rsvpInit: !!seen.rsvpInit,
        })
      );
    } catch (e) {}
  }

  var seenMemo = null;
  function getSeen() {
    if (!seenMemo) seenMemo = loadSeen();
    return seenMemo;
  }

  function flushSeen() {
    seenMemo = null;
  }

  window.HoosOutNotifications = {
    list: function () {
      return loadList().sort(function (a, b) {
        return (b.ts || 0) - (a.ts || 0);
      });
    },

    add: function (item) {
      if (!item || !item.id) return;
      var list = loadList();
      if (list.some(function (x) { return x.id === item.id; })) return;
      list.unshift({
        id: item.id,
        type: item.type || "info",
        title: item.title || "",
        body: item.body || "",
        href: item.href || "home.html",
        read: false,
        ts: item.ts || Date.now(),
      });
      saveList(list);
    },

    markRead: function (id) {
      var list = loadList();
      list.forEach(function (x) {
        if (x.id === id) x.read = true;
      });
      saveList(list);
    },

    markAllRead: function () {
      var list = loadList();
      list.forEach(function (x) {
        x.read = true;
      });
      saveList(list);
    },

    unreadCount: function () {
      return loadList().filter(function (x) {
        return !x.read;
      }).length;
    },

    getSeen: getSeen,
    saveSeen: saveSeen,
    flushSeen: flushSeen,
  };
})();
