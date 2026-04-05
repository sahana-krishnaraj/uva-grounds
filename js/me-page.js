/**
 * Profile tabs: following, my events, RSVPs (Supabase); saved uses localStorage.
 */
import { supabase } from "./supabase.js";

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function formatUserEventLine(ev) {
  try {
    const d = new Date(ev.start_iso);
    const when = d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const parts = [when, ev.place_label, ev.activity_type].filter(Boolean);
    return parts.join(" · ");
  } catch (err) {
    return ev.place_label || ev.title || "";
  }
}

export async function initMePage() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  async function renderLists() {
    const H = window.HoosOutEvents;
    if (!H) return;

    const followingEl = document.getElementById("me-following-list");
    const postedEl = document.getElementById("me-posted-list");
    const goingEl = document.getElementById("me-going-list");
    const savedEl = document.getElementById("me-saved-list");
    const statFollow = document.getElementById("me-stat-following");
    const statPosted = document.getElementById("me-stat-posted");
    const statGoing = document.getElementById("me-stat-going");
    const statSaved = document.getElementById("me-stat-saved");

    const { data: followsRows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);

    const fids = (followsRows || []).map((r) => r.following_id).filter(Boolean);
    let following = [];
    if (fids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
        .in("id", fids);
      following = (profs || []).map((p) => {
        const name =
          (p.preferred_name || "").trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          p.computing_id ||
          "Student";
        const initials =
          p.first_name && p.last_name
            ? (p.first_name[0] + p.last_name[0]).toUpperCase()
            : (name || "?").slice(0, 2).toUpperCase();
        return { id: p.id, name, initials, avatar_url: p.avatar_url || "" };
      });
    }

    const { data: myEv } = await supabase.from("events").select("id").eq("user_id", user.id);
    const myCount = (myEv || []).length;

    const { data: rsvpRows } = await supabase.from("rsvps").select("event_id").eq("user_id", user.id);
    const rsvpIds = (rsvpRows || []).map((r) => r.event_id);

    const savedIds = H.getSavedIds();

    if (statFollow) statFollow.textContent = String(following.length);
    if (statPosted) statPosted.textContent = String(myCount);
    if (statGoing) statGoing.textContent = String(rsvpIds.length);
    if (statSaved) statSaved.textContent = String(savedIds.length);

    if (followingEl) {
      if (!following.length) {
        followingEl.innerHTML =
          '<p class="me-empty">You’re not following anyone yet. Tap <strong>Follow</strong> on posts in the home feed.</p>';
      } else {
        followingEl.innerHTML = following
          .map(
            (p) =>
              '<div class="me-row me-row--following">' +
              '<a class="me-row-profile-hit" href="profile-view.html?id=' +
              encodeURIComponent(p.id) +
              '">' +
              (p.avatar_url
                ? '<img class="me-row-avatar me-row-avatar--img" src="' +
                  escapeHtml(p.avatar_url) +
                  '" alt="" />'
                : '<div class="me-row-avatar">' +
                  escapeHtml(p.initials || "?") +
                  "</div>") +
              "<div><strong>" +
              escapeHtml(p.name) +
              '</strong><br><span class="me-row-sub">HoosOut student</span></div>' +
              "</a>" +
              '<button type="button" class="btn btn-ghost btn-sm js-me-unfollow" data-person-id="' +
              escapeHtml(p.id) +
              '">Unfollow</button>' +
              "</div>"
          )
          .join("");
      }
    }

    const { data: postedEvents } = await supabase
      .from("events")
      .select("id, title, start_iso, place_label, activity_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (postedEl) {
      if (!postedEvents || !postedEvents.length) {
        postedEl.innerHTML =
          '<p class="me-empty">You haven’t published an event yet. <a href="post.html">Create one</a> — it will show on Home and here.</p>';
      } else {
        postedEl.innerHTML = postedEvents
          .map((ev) => {
            const line = formatUserEventLine(ev);
            return (
              '<div class="me-row me-row--actions" data-event-id="' +
              escapeHtml(ev.id) +
              '">' +
              "<div><strong>" +
              escapeHtml(ev.title) +
              '</strong><br><span class="me-row-sub">' +
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

    let goingMeta = [];
    if (rsvpIds.length) {
      const { data: evs } = await supabase
        .from("events")
        .select("id, title, start_iso, place_label, activity_type")
        .in("id", rsvpIds);
      goingMeta = evs || [];
    }

    if (goingEl) {
      if (!goingMeta.length) {
        goingEl.innerHTML =
          '<p class="me-empty">No upcoming RSVPs. <a href="home.html">Browse the feed</a> and tap RSVP or Join.</p>';
      } else {
        goingEl.innerHTML = goingMeta
          .map((ev) => {
            const line = formatUserEventLine(ev);
            return (
              '<div class="me-row" data-event-id="' +
              escapeHtml(ev.id) +
              '">' +
              "<div><strong>" +
              escapeHtml(ev.title) +
              '</strong><br><span class="me-row-sub">' +
              escapeHtml(line) +
              "</span></div>" +
              '<button type="button" class="btn btn-ghost btn-sm js-me-leave" data-event-id="' +
              escapeHtml(ev.id) +
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
        const { data: savedEvs } = await supabase
          .from("events")
          .select("id, title, start_iso, place_label, activity_type")
          .in("id", savedIds);
        const byId = new Map((savedEvs || []).map((e) => [e.id, e]));
        savedEl.innerHTML = savedIds
          .map((id) => {
            const ev = byId.get(id);
            const line = ev ? formatUserEventLine(ev) : "";
            const title = ev ? ev.title : id;
            return (
              '<div class="me-row" data-event-id="' +
              escapeHtml(id) +
              '">' +
              "<div><strong>" +
              escapeHtml(title) +
              '</strong><br><span class="me-row-sub">' +
              escapeHtml(line) +
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

  document.body.addEventListener("click", async (e) => {
    const t = e.target;
    const el = t.nodeType === 3 && t.parentElement ? t.parentElement : t;
    if (!el || el.nodeType !== 1) return;
    const u = el.closest(".js-me-unfollow");
    const l = el.closest(".js-me-leave");
    const s = el.closest(".js-me-unsave");
    const del = el.closest(".js-me-delete-event");
    const H = window.HoosOutEvents;
    if (!H) return;
    if (del) {
      e.preventDefault();
      const eid = del.getAttribute("data-event-id");
      if (eid && window.confirm("Remove this event? This cannot be undone.")) {
        await supabase.from("events").delete().eq("id", eid).eq("user_id", user.id);
        await renderLists();
      }
    } else if (u) {
      e.preventDefault();
      const pid = u.getAttribute("data-person-id");
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", pid);
      await renderLists();
    } else if (l) {
      e.preventDefault();
      const eid = l.getAttribute("data-event-id");
      await supabase.from("rsvps").delete().eq("user_id", user.id).eq("event_id", eid);
      await renderLists();
    } else if (s) {
      e.preventDefault();
      H.toggleSaved(s.getAttribute("data-event-id"));
      await renderLists();
    }
  });

  function wireTabs() {
    const tabs = document.querySelectorAll(".me-tab");
    const panels = document.querySelectorAll(".me-panel");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-panel");
        tabs.forEach((x) => {
          const on = x === tab;
          x.classList.toggle("me-tab--active", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        panels.forEach((p) => {
          const on = p.id === "me-panel-" + target;
          p.classList.toggle("me-panel--active", on);
          p.hidden = !on;
        });
      });
    });
  }

  wireTabs();
  await renderLists();
}
