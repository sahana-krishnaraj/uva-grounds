/**
 * DB-backed activity feed (RSVPs + messages) with Realtime.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";
import { withResolvedAvatarUrl } from "./avatar-url.js";

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function displayName(p) {
  if (!p) return "Someone";
  const pref = (p.preferred_name || "").trim();
  if (pref) return pref;
  const fn = (p.first_name || "").trim();
  const ln = (p.last_name || "").trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return (p.computing_id || "").trim() || "Someone";
}

function initials(p) {
  if (!p) return "?";
  const pref = (p.preferred_name || "").trim();
  if (pref.length >= 2) return pref.slice(0, 2).toUpperCase();
  if (pref.length === 1) return (pref[0] + pref[0]).toUpperCase();
  const fn = (p.first_name || "").trim();
  const ln = (p.last_name || "").trim();
  if (fn && ln) return (fn[0] + ln[0]).toUpperCase();
  if (fn.length >= 2) return fn.slice(0, 2).toUpperCase();
  if (fn.length === 1) return (fn[0] + (ln[0] || fn[0])).toUpperCase();
  const c = (p.computing_id || "").trim();
  if (c.length >= 2) return c.slice(0, 2).toUpperCase();
  if (c.length === 1) return (c + c).toUpperCase();
  const id = String(p.id || "").replace(/-/g, "");
  if (id.length >= 2) return id.slice(0, 2).toUpperCase();
  return "?";
}

function actorAvatarHtml(p) {
  const ini = escapeHtml(initials(p));
  if (p && p.avatar_url) {
    return (
      '<span class="act-av act-av--img" data-initials="' +
      ini +
      '"><img src="' +
      escapeHtml(p.avatar_url) +
      '" alt="" /></span>'
    );
  }
  return '<span class="act-av">' + ini + "</span>";
}

const user = await requireAuth();
if (!user) throw new Error("auth");

const listEl = document.getElementById("activity-list");
const emptyEl = document.getElementById("activity-empty");
const errEl = document.getElementById("activity-error");

async function loadList() {
  if (!listEl) return;
  const { data: rows, error } = await supabase
    .from("app_notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (errEl) {
      errEl.style.display = "";
      errEl.textContent =
        error.message.indexOf("app_notifications") >= 0 || error.code === "42P01"
          ? "Activity needs the app_notifications table. Run supabase/migrations/003_profiles_extras_and_notifications.sql in your project."
          : error.message;
    }
    return;
  }
  if (errEl) errEl.style.display = "none";

  const r = rows || [];
  const ids = [...new Set(r.map((x) => x.actor_id).filter(Boolean))];
  const pmap = new Map();
  if (ids.length) {
    const pr = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
      .in("id", ids);
    (pr.data || []).forEach((p) => pmap.set(p.id, withResolvedAvatarUrl(p, supabase)));
  }

  if (!r.length) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = r
    .map((n) => {
      const p = pmap.get(n.actor_id);
      const href =
        n.type === "rsvp" && n.event_id
          ? "home.html#" + encodeURIComponent(n.event_id)
          : n.type === "message" && n.actor_id
            ? "messages.html?with=" + encodeURIComponent(n.actor_id)
            : "home.html";
      const t = n.created_at ? new Date(n.created_at).toLocaleString() : "";
      const unread = !n.read ? " activity-item--unread" : "";
      return (
        '<a class="activity-item' +
        unread +
        '" href="' +
        escapeHtml(href) +
        '" data-notif-id="' +
        escapeHtml(n.id) +
        '">' +
        actorAvatarHtml(p) +
        '<span class="activity-item-body"><strong>' +
        escapeHtml(n.title || "Update") +
        "</strong>" +
        '<span class="activity-item-text">' +
        escapeHtml(n.body || "") +
        '</span><time class="activity-item-time">' +
        escapeHtml(t) +
        "</time></span></a>"
      );
    })
    .join("");

  listEl.querySelectorAll(".act-av--img img").forEach((img) => {
    img.addEventListener("error", function () {
      const w = img.closest(".act-av");
      if (!w) return;
      w.classList.remove("act-av--img");
      w.textContent = w.getAttribute("data-initials") || "?";
    });
  });

  listEl.querySelectorAll(".activity-item").forEach((a) => {
    a.addEventListener("click", async () => {
      const id = a.getAttribute("data-notif-id");
      if (!id) return;
      await supabase
        .from("app_notifications")
        .update({ read: true })
        .eq("id", id)
        .eq("recipient_id", user.id);
    });
  });
}

document.getElementById("act-mark-all")?.addEventListener("click", async () => {
  await supabase.from("app_notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);
  await loadList();
});

document.getElementById("nav-logout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  if (window.HoosOutSession) window.HoosOutSession.signOut();
});

await loadList();
await initNavActivityBadge();

supabase
  .channel("activity-page-" + user.id)
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "app_notifications",
      filter: "recipient_id=eq." + user.id,
    },
    () => {
      loadList();
    }
  )
  .subscribe();
