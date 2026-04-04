/**
 * Personal profile: following, going, saved (localStorage).
 */
(function () {
  function escapeHtml(s) {
    if (s == null) return "";
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderLists() {
    var H = window.HoosOutEvents;
    if (!H) return;

    var followingEl = document.getElementById("me-following-list");
    var postedEl = document.getElementById("me-posted-list");
    var goingEl = document.getElementById("me-going-list");
    var savedEl = document.getElementById("me-saved-list");
    var statFollow = document.getElementById("me-stat-following");
    var statPosted = document.getElementById("me-stat-posted");
    var statGoing = document.getElementById("me-stat-going");
    var statSaved = document.getElementById("me-stat-saved");

    var following = H.getFollowing();
    var myEvents = H.getAll();
    var rsvpIds = H.getRsvpIds();
    var savedIds = H.getSavedIds();

    if (statFollow) statFollow.textContent = String(following.length);
    if (statPosted) statPosted.textContent = String(myEvents.length);
    if (statGoing) statGoing.textContent = String(rsvpIds.length);
    if (statSaved) statSaved.textContent = String(savedIds.length);

    if (followingEl) {
      if (!following.length) {
        followingEl.innerHTML =
          '<p class="me-empty">You’re not following anyone yet. Tap <strong>Follow</strong> on posts in the home feed.</p>';
      } else {
        followingEl.innerHTML = following
          .map(function (p) {
            return (
              '<div class="me-row" data-person-id="' +
              escapeHtml(p.id) +
              '">' +
              '<div class="me-row-avatar">' +
              escapeHtml(p.initials || "?") +
              "</div>" +
              "<div><strong>" +
              escapeHtml(p.name) +
              "</strong><br><span class=\"me-row-sub\">HoosOut student</span></div>" +
              '<button type="button" class="btn btn-ghost btn-sm js-me-unfollow" data-person-id="' +
              escapeHtml(p.id) +
              '">Unfollow</button>' +
              "</div>"
            );
          })
          .join("");
      }
    }

    if (postedEl) {
      if (!myEvents.length) {
        postedEl.innerHTML =
          '<p class="me-empty">You haven’t published an event yet. <a href="post.html">Create one</a> — it will show on Home and here.</p>';
      } else {
        postedEl.innerHTML = myEvents
          .map(function (ev) {
            var meta = H.getEventMeta(ev.id);
            var line = meta && meta.line ? meta.line : (ev.placeLabel || "");
            return (
              '<div class="me-row me-row--actions" data-event-id="' +
              escapeHtml(ev.id) +
              '">' +
              "<div><strong>" +
              escapeHtml(ev.title) +
              "</strong><br><span class=\"me-row-sub\">" +
              escapeHtml(line) +
              "</span></div>" +
              '<div class="me-row-action-btns">' +
              '<a class="btn btn-ghost btn-sm" href="home.html#' +
              encodeURIComponent(ev.id) +
              '">View</a>' +
              '<a class="btn btn-ghost btn-sm" href="post.html?edit=' +
              encodeURIComponent(ev.id) +
              '">Edit</a>' +
              '<button type="button" class="btn btn-ghost btn-sm js-me-delete-event" data-event-id="' +
              escapeHtml(ev.id) +
              '">Remove</button>' +
              "</div>" +
              "</div>"
            );
          })
          .join("");
      }
    }

    if (goingEl) {
      if (!rsvpIds.length) {
        goingEl.innerHTML =
          '<p class="me-empty">No upcoming RSVPs. <a href="home.html">Browse the feed</a> and tap RSVP or Join.</p>';
      } else {
        goingEl.innerHTML = rsvpIds
          .map(function (id) {
            var meta = H.getEventMeta(id);
            return (
              '<div class="me-row" data-event-id="' +
              escapeHtml(id) +
              '">' +
              "<div><strong>" +
              escapeHtml(meta.title) +
              "</strong><br><span class=\"me-row-sub\">" +
              escapeHtml(meta.line) +
              (meta.host ? " · " + escapeHtml(meta.host) : "") +
              "</span></div>" +
              '<button type="button" class="btn btn-ghost btn-sm js-me-leave" data-event-id="' +
              escapeHtml(id) +
              '">Leave</button>' +
              "</div>"
            );
          })
          .join("");
      }
    }

    if (savedEl) {
      if (!savedIds.length) {
        savedEl.innerHTML =
          '<p class="me-empty">Nothing saved. Tap <strong>Save</strong> on events you want to track.</p>';
      } else {
        savedEl.innerHTML = savedIds
          .map(function (id) {
            var meta = H.getEventMeta(id);
            return (
              '<div class="me-row" data-event-id="' +
              escapeHtml(id) +
              '">' +
              "<div><strong>" +
              escapeHtml(meta.title) +
              "</strong><br><span class=\"me-row-sub\">" +
              escapeHtml(meta.line) +
              "</span></div>" +
              '<button type="button" class="btn btn-ghost btn-sm js-me-unsave" data-event-id="' +
              escapeHtml(id) +
              '">Remove</button>' +
              "</div>"
            );
          })
          .join("");
      }
    }
  }

  function wireMeActions() {
    document.body.addEventListener("click", function (e) {
      var t = e.target;
      if (t.nodeType === 3 && t.parentElement) t = t.parentElement;
      if (!t || t.nodeType !== 1) return;
      var u = t.closest(".js-me-unfollow");
      var l = t.closest(".js-me-leave");
      var s = t.closest(".js-me-unsave");
      var del = t.closest(".js-me-delete-event");
      var H = window.HoosOutEvents;
      if (!H) return;
      if (del) {
        e.preventDefault();
        var eid = del.getAttribute("data-event-id");
        if (
          eid &&
          window.confirm("Remove this event from your profile and the feed? This cannot be undone (demo storage).")
        ) {
          H.removeEvent(eid);
          renderLists();
        }
      } else if (u) {
        e.preventDefault();
        H.unfollowPerson(u.getAttribute("data-person-id"));
        renderLists();
      } else if (l) {
        e.preventDefault();
        H.toggleRsvp(l.getAttribute("data-event-id"));
        renderLists();
      } else if (s) {
        e.preventDefault();
        H.toggleSaved(s.getAttribute("data-event-id"));
        renderLists();
      }
    });
  }

  function wireTabs() {
    var tabs = document.querySelectorAll(".me-tab");
    var panels = document.querySelectorAll(".me-panel");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = tab.getAttribute("data-panel");
        tabs.forEach(function (x) {
          var on = x === tab;
          x.classList.toggle("me-tab--active", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        panels.forEach(function (p) {
          var on = p.id === "me-panel-" + target;
          p.classList.toggle("me-panel--active", on);
          p.hidden = !on;
        });
      });
    });
  }

  wireTabs();
  wireMeActions();
  renderLists();
})();
