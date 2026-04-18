import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { ensureClubOwnerMembership } from "./club-membership.js";

const me = await requireAuth();
if (!me) throw new Error("auth");

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

const slug = new URLSearchParams(window.location.search).get("slug");
if (!slug) window.location.href = "clubs.html";

const { data: club } = await supabase
  .from("clubs")
  .select("id,slug,name,description,category,is_verified")
  .eq("slug", slug)
  .maybeSingle();
if (!club) {
  document.getElementById("club-title").textContent = "Club not found";
  throw new Error("club");
}

document.getElementById("club-title").innerHTML =
  esc(club.name) + (club.is_verified ? ' <span class="badge badge-student">Verified</span>' : "");
document.getElementById("club-meta").textContent = "Category: " + (club.category || "other");
document.getElementById("club-desc").textContent = club.description || "";
document.getElementById("club-create-link").href = "post.html?club=" + encodeURIComponent(club.id);

await ensureClubOwnerMembership(supabase, me.id);

const { data: myMem } = await supabase
  .from("club_members")
  .select("role")
  .eq("club_id", club.id)
  .eq("user_id", me.id)
  .maybeSingle();
const role = myMem && myMem.role;
const canManage = !!(role && ["owner", "admin", "editor"].includes(role));
const manageLink = document.getElementById("club-manage-link");
const createLink = document.getElementById("club-create-link");
if (manageLink) manageLink.hidden = !canManage;
if (createLink) createLink.hidden = !canManage;

const f = await supabase.from("club_follows").select("club_id").eq("club_id", club.id).eq("user_id", me.id).maybeSingle();
let following = !!f.data;
const btn = document.getElementById("club-follow-btn");
btn.textContent = following ? "Following" : "Follow";
btn.addEventListener("click", async () => {
  btn.disabled = true;
  try {
    if (following) {
      const { error } = await supabase.from("club_follows").delete().eq("club_id", club.id).eq("user_id", me.id);
      if (error) throw error;
      following = false;
    } else {
      const { error } = await supabase.from("club_follows").insert({ club_id: club.id, user_id: me.id });
      if (error) throw error;
      following = true;
    }
    btn.textContent = following ? "Following" : "Follow";
  } catch (err) {
    alert(err && err.message ? err.message : "Could not update follow. Try again.");
  } finally {
    btn.disabled = false;
  }
});

const followersRes = await supabase
  .from("club_follows")
  .select("user_id", { count: "exact", head: true })
  .eq("club_id", club.id);
document.getElementById("club-followers").textContent = String(followersRes.count || 0) + " followers";

const { data: events } = await supabase
  .from("events")
  .select("id,title,start_iso,place_label,notes,created_at")
  .eq("club_id", club.id)
  .order("start_iso", { ascending: true })
  .limit(120);

function eventCard(e) {
  return (
    '<article class="hub-card"><h3>' +
    esc(e.title) +
    '</h3><p class="hub-card-meta">' +
    esc(new Date(e.start_iso).toLocaleString()) +
    " · " +
    esc(e.place_label || "TBA") +
    '</p><p class="hub-card-meta">' +
    esc((e.notes || "").slice(0, 180)) +
    '</p><div class="hub-card-actions"><a class="btn btn-ghost btn-sm" href="event-detail.html?id=' +
    encodeURIComponent(e.id) +
    '">View details</a></div></article>'
  );
}

const now = Date.now();
const upcoming = (events || []).filter((e) => new Date(e.start_iso).getTime() >= now);
const past = (events || []).filter((e) => new Date(e.start_iso).getTime() < now).reverse();
document.getElementById("club-events-upcoming").innerHTML = upcoming.length
  ? upcoming.map(eventCard).join("")
  : '<p class="me-empty">No upcoming events.</p>';
document.getElementById("club-events-past").innerHTML = past.length
  ? past.map(eventCard).join("")
  : '<p class="me-empty">No past events yet.</p>';
