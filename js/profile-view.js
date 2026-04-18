/**
 * View another student's profile: bio, events, followers / following lists.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";
import { resolveProfileAvatarUrl, withResolvedAvatarUrl } from "./avatar-url.js";

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
  const pref = (row.preferred_name || "").trim();
  if (pref.length >= 2) return pref.slice(0, 2).toUpperCase();
  if (pref.length === 1) return (pref[0] + pref[0]).toUpperCase();
  const fn = (row.first_name || "").trim();
  const ln = (row.last_name || "").trim();
  if (fn && ln) return (fn[0] + ln[0]).toUpperCase();
  if (fn.length >= 2) return fn.slice(0, 2).toUpperCase();
  if (fn.length === 1) return (fn[0] + (ln[0] || fn[0])).toUpperCase();
  const c = (row.computing_id || "").trim();
  if (c.length >= 2) return c.slice(0, 2).toUpperCase();
  if (c.length === 1) return (c + c).toUpperCase();
  const id = String(row.id || "").replace(/-/g, "");
  if (id.length >= 2) return id.slice(0, 2).toUpperCase();
  return "?";
}

function handleFromRow(row) {
  const base =
    (row.preferred_name || row.first_name || row.computing_id || "student").trim();
  return "@" + String(base).toLowerCase().replace(/\s+/g, "");
}

function formatEventLine(ev) {
  try {
    const d = new Date(ev.start_iso);
    const when = d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return [when, ev.place_label, ev.activity_type].filter(Boolean).join(" · ");
  } catch (e) {
    return ev.place_label || ev.title || "";
  }
}

let myFollowing = new Set();
let profileUserId = null;
let me = null;

async function refreshMyFollowing() {
  if (!me) return;
  const { data } = await supabase.from("follows").select("following_id").eq("follower_id", me.id);
  myFollowing = new Set((data || []).map((r) => r.following_id).filter(Boolean));
}

function renderUserRows(profiles, mount, opts) {
  const { showFollowBtn } = opts || {};
  if (!profiles.length) {
    mount.innerHTML = '<p class="me-empty" style="border:none;box-shadow:none">No one here yet.</p>';
    return;
  }
  mount.innerHTML = profiles
    .map((raw) => {
      const p = withResolvedAvatarUrl(raw, supabase);
      const name = escapeHtml(displayName(p));
      const href = "profile-view.html?id=" + encodeURIComponent(p.id);
      const ini = escapeHtml(initials(p));
      const av = p.avatar_url
        ? '<span class="pv-row-avatar-wrap" data-ini="' +
          ini +
          '"><img class="pv-row-avatar-img" src="' +
          escapeHtml(p.avatar_url) +
          '" alt="" /></span>'
        : '<span class="pv-row-avatar-fallback">' + ini + "</span>";
      const showBtn = showFollowBtn && p.id !== me.id;
      const following = myFollowing.has(p.id);
      const btn = showBtn
        ? '<button type="button" class="btn btn-ghost btn-sm js-pv-inline-follow" data-person-id="' +
          escapeHtml(p.id) +
          '">' +
          (following ? "Following" : "Follow") +
          "</button>"
        : "";
      return (
        '<div class="pv-user-row">' +
        '<a class="pv-row-avatar" href="' +
        href +
        '">' +
        av +
        '</a><div class="pv-row-text"><a href="' +
        href +
        '"><strong>' +
        name +
        "</strong></a></div>" +
        btn +
        "</div>"
      );
    })
    .join("");

  mount.querySelectorAll(".js-pv-inline-follow").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const pid = btn.getAttribute("data-person-id");
      if (!pid || pid === me.id) return;
      if (myFollowing.has(pid)) {
        await supabase.from("follows").delete().eq("follower_id", me.id).eq("following_id", pid);
        myFollowing.delete(pid);
        btn.textContent = "Follow";
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: me.id, following_id: pid });
        if (error) {
          alert(error.message);
          return;
        }
        myFollowing.add(pid);
        btn.textContent = "Following";
      }
    });
  });

  mount.querySelectorAll(".pv-row-avatar-img").forEach((img) => {
    img.addEventListener("error", function () {
      const wrap = img.parentElement;
      if (!wrap || !wrap.classList.contains("pv-row-avatar-wrap")) return;
      const ini = wrap.getAttribute("data-ini") || "?";
      wrap.outerHTML = '<span class="pv-row-avatar-fallback">' + ini + "</span>";
    });
  });
}

(async function main() {
  me = await requireAuth();
  if (!me) return;

  await refreshMyFollowing();

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
  profileUserId = id;

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

  const heroAv = resolveProfileAvatarUrl(row.avatar_url, supabase);
  if (heroAv && imgEl && fbEl) {
    imgEl.onerror = function () {
      imgEl.setAttribute("hidden", "");
      fbEl.removeAttribute("hidden");
      fbEl.textContent = initials(row);
    };
    imgEl.src = heroAv;
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

  const { count: nFollowers } = await supabase
    .from("follows")
    .select("id", { count: "exact", head: true })
    .eq("following_id", id);
  const { count: nFollowing } = await supabase
    .from("follows")
    .select("id", { count: "exact", head: true })
    .eq("follower_id", id);

  const cf = document.getElementById("pv-count-followers");
  const cg = document.getElementById("pv-count-following");
  if (cf) cf.textContent = String(nFollowers ?? 0);
  if (cg) cg.textContent = String(nFollowing ?? 0);

  const { data: evs } = await supabase
    .from("events")
    .select("id, title, start_iso, place_label, activity_type, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(40);
  const evMount = document.getElementById("pv-events-mount");
  const evEmpty = document.getElementById("pv-events-empty");
  if (evMount) {
    if (!evs || !evs.length) {
      evMount.innerHTML = "";
      if (evEmpty) evEmpty.hidden = false;
    } else {
      if (evEmpty) evEmpty.hidden = true;
      evMount.innerHTML = evs
        .map((ev) => {
          const line = escapeHtml(formatEventLine(ev));
          return (
            '<a class="pv-event-card" href="home.html#' +
            encodeURIComponent(ev.id) +
            '"><div class="pv-event-card-inner"><h3 class="pv-event-title">' +
            escapeHtml(ev.title) +
            '</h3><p class="pv-event-meta">' +
            line +
            "</p></div></a>"
          );
        })
        .join("");
    }
  }

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
        myFollowing.delete(id);
        followBtn.textContent = "Follow";
        followBtn.classList.remove("btn-follow-active");
      } else {
        const { error: e2 } = await supabase.from("follows").insert({ follower_id: me.id, following_id: id });
        if (e2) {
          alert(e2.message);
          return;
        }
        isFollowing = true;
        myFollowing.add(id);
        followBtn.textContent = "Following";
        followBtn.classList.add("btn-follow-active");
      }
      const { count: nf } = await supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", id);
      if (cf) cf.textContent = String(nf ?? 0);
    });
  }

  if (msgA) {
    msgA.removeAttribute("hidden");
    msgA.href = "messages.html?with=" + encodeURIComponent(id);
  }

  const dialog = document.getElementById("pv-dialog");
  const dialogTitle = document.getElementById("pv-dialog-title");
  const dialogBody = document.getElementById("pv-dialog-body");
  const closeDlg = document.getElementById("pv-dialog-close");

  async function openFollowersModal() {
    dialogTitle.textContent = "Followers";
    dialogBody.innerHTML = "<p>Loading…</p>";
    dialog.showModal();
    const { data: rows } = await supabase.from("follows").select("follower_id").eq("following_id", id);
    const fids = (rows || []).map((r) => r.follower_id).filter(Boolean);
    if (!fids.length) {
      renderUserRows([], dialogBody, { showFollowBtn: true });
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
      .in("id", fids);
    renderUserRows(profs || [], dialogBody, { showFollowBtn: true });
  }

  async function openFollowingModal() {
    dialogTitle.textContent = "Following";
    dialogBody.innerHTML = "<p>Loading…</p>";
    dialog.showModal();
    const { data: rows } = await supabase.from("follows").select("following_id").eq("follower_id", id);
    const fids = (rows || []).map((r) => r.following_id).filter(Boolean);
    if (!fids.length) {
      renderUserRows([], dialogBody, { showFollowBtn: true });
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
      .in("id", fids);
    renderUserRows(profs || [], dialogBody, { showFollowBtn: true });
  }

  document.getElementById("pv-btn-followers")?.addEventListener("click", openFollowersModal);
  document.getElementById("pv-btn-following")?.addEventListener("click", openFollowingModal);
  closeDlg?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  document.getElementById("nav-logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    if (window.HoosOutSession) window.HoosOutSession.signOut();
  });

  await initNavActivityBadge();
})();
