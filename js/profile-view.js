/**
 * View another student's profile (?id=uuid). Own profile redirects to me.html.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { initNotificationsUi } from "./notifications-ui.js";

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function displayName(row) {
  if (!row) return "Student";
  const pref = (row.preferred_name || "").trim();
  if (pref) return pref;
  const fn = (row.first_name || "").trim();
  const ln = (row.last_name || "").trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return (row.computing_id || "").trim() || "Student";
}

function initials(row) {
  if (!row) return "?";
  const fn = (row.first_name || "").trim();
  const ln = (row.last_name || "").trim();
  if (fn && ln) return (fn[0] + ln[0]).toUpperCase();
  if (fn) return fn.slice(0, 2).toUpperCase();
  const c = (row.computing_id || "").trim();
  return c ? c.slice(0, 2).toUpperCase() : "?";
}

function handleFromRow(row) {
  const base =
    (row.preferred_name || row.first_name || row.computing_id || "student").trim();
  return "@" + String(base).toLowerCase().replace(/\s+/g, "");
}

(async function main() {
  const me = await requireAuth();
  if (!me) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    window.location.href = "home.html";
    return;
  }
  if (id === me.id) {
    window.location.replace("me.html");
    return;
  }

  const { data: row, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error || !row) {
    document.getElementById("pv-name").textContent = "Profile not found";
    document.getElementById("pv-handle").textContent = error ? error.message : "";
    return;
  }

  const nameEl = document.getElementById("pv-name");
  const handleEl = document.getElementById("pv-handle");
  const imgEl = document.querySelector(".js-pv-avatar-img");
  const fbEl = document.querySelector(".js-pv-avatar-fallback");

  if (nameEl) nameEl.textContent = displayName(row);
  if (handleEl) {
    const parts = [handleFromRow(row)];
    if (row.year) parts.push(row.year);
    if (row.pronouns) parts.push(row.pronouns);
    handleEl.textContent = parts.join(" · ");
  }

  if (row.avatar_url && imgEl && fbEl) {
    imgEl.src = row.avatar_url;
    imgEl.removeAttribute("hidden");
    fbEl.setAttribute("hidden", "");
  } else if (imgEl && fbEl) {
    imgEl.setAttribute("hidden", "");
    fbEl.removeAttribute("hidden");
    fbEl.textContent = initials(row);
  }

  const fields = [
    { key: "bio", sel: ".js-pv-bio" },
    { key: "interests", sel: ".js-pv-interests" },
    { key: "location", sel: ".js-pv-location" },
  ];
  fields.forEach((f) => {
    const v = row[f.key];
    if (!v) return;
    const item = document.querySelector(f.sel);
    if (!item) return;
    const val = item.querySelector(".me-bio-value");
    if (val) val.textContent = v;
    item.removeAttribute("hidden");
  });

  const { data: folRow } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", me.id)
    .eq("following_id", id)
    .maybeSingle();

  let isFollowing = !!folRow;

  const followBtn = document.getElementById("pv-follow");
  const msgA = document.getElementById("pv-message");
  if (followBtn) {
    followBtn.removeAttribute("hidden");
    followBtn.textContent = isFollowing ? "Following" : "Follow";
    followBtn.classList.toggle("btn-follow-active", isFollowing);
    followBtn.addEventListener("click", async () => {
      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", me.id).eq("following_id", id);
        isFollowing = false;
        followBtn.textContent = "Follow";
        followBtn.classList.remove("btn-follow-active");
      } else {
        const { error: e2 } = await supabase.from("follows").insert({ follower_id: me.id, following_id: id });
        if (e2) {
          alert(e2.message);
          return;
        }
        isFollowing = true;
        followBtn.textContent = "Following";
        followBtn.classList.add("btn-follow-active");
      }
    });
  }

  if (msgA) {
    msgA.removeAttribute("hidden");
    msgA.href = "messages.html?with=" + encodeURIComponent(id);
  }

  const out = document.getElementById("nav-logout");
  if (out) {
    out.addEventListener("click", async () => {
      await supabase.auth.signOut();
      if (window.HoosOutSession) window.HoosOutSession.signOut();
    });
  }

  await initNotificationsUi();
})();
