import { supabase } from "./supabase.js";
import { ensureClubOwnerMembership, fetchMyClubPostMemberships } from "./club-membership.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

const guest = document.getElementById("club-admin-guest");
const dash = document.getElementById("club-admin-dashboard");
const listEl = document.getElementById("club-admin-list");
const emptyEl = document.getElementById("club-admin-empty");
const loginLink = document.getElementById("club-admin-login-link");

if (loginLink) {
  loginLink.href = "login.html?next=" + encodeURIComponent("club-admin.html");
}

/** Resolve user after session is hydrated (getUser alone can be null on first paint). */
async function resolveUser() {
  const { data: s1 } = await supabase.auth.getSession();
  if (s1?.session?.user) return s1.session.user;
  const { data: u } = await supabase.auth.getUser();
  if (u?.user) return u.user;
  return null;
}

const user = await resolveUser();

const navLogout = document.getElementById("nav-logout");
if (navLogout) navLogout.style.display = user ? "" : "none";

if (!user) {
  if (guest) guest.hidden = false;
  if (dash) dash.hidden = true;
} else {
  if (guest) guest.hidden = true;
  if (dash) dash.hidden = false;

  await ensureClubOwnerMembership(supabase, user.id);

  const { rows: memberships, error: memErr } = await fetchMyClubPostMemberships(supabase, user.id);

  if (memErr) {
    if (listEl) listEl.innerHTML = '<p class="me-empty">Could not load clubs: ' + esc(memErr.message) + "</p>";
  } else if (!memberships.length) {
    if (emptyEl) emptyEl.hidden = false;
    if (listEl) listEl.innerHTML = "";
  } else {
    const ids = memberships.map((m) => m.club_id);
    const { data: clubRows, error: clubErr } = await supabase
      .from("clubs")
      .select("id, slug, name, is_verified")
      .in("id", ids);

    if (clubErr) {
      if (listEl) listEl.innerHTML = '<p class="me-empty">Could not load club details: ' + esc(clubErr.message) + "</p>";
    } else {
      const roleByClub = Object.fromEntries(memberships.map((m) => [m.club_id, m.role]));
      const clubs = (clubRows || []).map((c) => ({ ...c, role: roleByClub[c.id] || "editor" }));

      if (!clubs.length) {
        if (emptyEl) emptyEl.hidden = false;
        if (listEl) listEl.innerHTML = "";
      } else {
        if (emptyEl) emptyEl.hidden = true;
        if (listEl) {
          listEl.innerHTML = clubs
            .map(
              (c) =>
                '<article class="hub-card">' +
                "<h3>" +
                esc(c.name) +
                (c.is_verified ? ' <span class="badge badge-student">Verified</span>' : "") +
                "</h3>" +
                '<p class="hub-card-meta">Your role: ' +
                esc(c.role) +
                "</p>" +
                '<div class="hub-card-actions">' +
                '<a class="btn btn-ghost btn-sm" href="club-page.html?slug=' +
                encodeURIComponent(c.slug) +
                '">Club page</a>' +
                '<a class="btn btn-primary btn-sm" href="post.html?club=' +
                encodeURIComponent(c.id) +
                '">Post event as club</a>' +
                "</div>" +
                "</article>"
            )
            .join("");
        }
      }
    }
  }
}

document.getElementById("nav-logout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  if (window.HoosOutSession) window.HoosOutSession.signOut();
});
