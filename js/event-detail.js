import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { submitEventReport } from "./user-safety.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function displayName(p) {
  if (!p) return "Student";
  return (
    String(p.preferred_name || "").trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    String(p.computing_id || "").trim() ||
    "Student"
  );
}

function liForProfile(p) {
  return '<li><a class="event-attendee-link" href="profile-view.html?id=' + encodeURIComponent(p.id) + '">' + esc(displayName(p)) + "</a></li>";
}

(async function main() {
  const me = await requireAuth();
  if (!me) return;

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    window.location.href = "home.html";
    return;
  }

  const evRes = await supabase
    .from("events")
    .select("id,user_id,club_id,title,activity_type,start_iso,duration,place_label,notes,created_at")
    .eq("id", id)
    .maybeSingle();
  if (evRes.error || !evRes.data) {
    document.getElementById("ed-title").textContent = "Event not found";
    return;
  }
  const ev = evRes.data;
  document.getElementById("ed-title").textContent = ev.title || "Event";
  document.getElementById("ed-meta").textContent =
    new Date(ev.start_iso).toLocaleString() +
    " · " +
    (ev.place_label || "") +
    (ev.activity_type ? " · " + ev.activity_type : "") +
    (ev.duration ? " · " + ev.duration : "");
  document.getElementById("ed-body").textContent = ev.notes || "";
  document.getElementById("ed-report-btn")?.addEventListener("click", async () => {
    const reason = window.prompt("Why are you reporting this post?");
    if (!reason || !reason.trim()) return;
    const { error } = await submitEventReport(me.id, ev.id, reason);
    if (error) return alert(error.message);
    alert("Report submitted.");
  });

  const out = document.getElementById("nav-logout");
  if (out) {
    out.addEventListener("click", async () => {
      await supabase.auth.signOut();
      if (window.HoosOutSession) window.HoosOutSession.signOut();
    });
  }

  let canManage = ev.user_id === me.id;
  if (!canManage && ev.club_id) {
    const cm = await supabase
      .from("club_members")
      .select("club_id, role")
      .eq("club_id", ev.club_id)
      .eq("user_id", me.id)
      .in("role", ["owner", "admin", "editor"])
      .maybeSingle();
    canManage = !!cm.data;
  }
  if (!canManage) return;
  const ownerBlock = document.getElementById("ed-owner-rsvp");
  ownerBlock.hidden = false;

  const rsvpRes = await supabase.from("rsvps").select("user_id").eq("event_id", id);
  const respondedIds = [...new Set((rsvpRes.data || []).map((r) => r.user_id).filter(Boolean))];

  const followerRows = ev.club_id
    ? await supabase.from("club_follows").select("user_id").eq("club_id", ev.club_id)
    : await supabase.from("follows").select("follower_id").eq("following_id", me.id);
  const invitePoolIds = ev.club_id
    ? [...new Set((followerRows.data || []).map((r) => r.user_id).filter(Boolean))]
    : [...new Set((followerRows.data || []).map((r) => r.follower_id).filter(Boolean))];
  const pendingLabel = document.getElementById("ed-pending-label");
  if (pendingLabel) {
    pendingLabel.textContent = ev.club_id ? "Club followers not yet RSVP'd" : "Not responded yet";
  }
  const profileIds = [...new Set([...respondedIds, ...invitePoolIds])];

  const profRes = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id,first_name,last_name,preferred_name,computing_id")
        .in("id", profileIds)
    : { data: [] };
  const pmap = new Map((profRes.data || []).map((p) => [p.id, p]));

  const responded = respondedIds.map((x) => pmap.get(x)).filter(Boolean);
  const pending = invitePoolIds.filter((x) => !respondedIds.includes(x)).map((x) => pmap.get(x)).filter(Boolean);

  document.getElementById("ed-going-count").textContent = responded.length + " people RSVP’d";
  document.getElementById("ed-responded").innerHTML = responded.length
    ? responded.map(liForProfile).join("")
    : "<li>No responses yet.</li>";
  document.getElementById("ed-pending").innerHTML = pending.length
    ? pending.map(liForProfile).join("")
    : "<li>Everyone responded.</li>";
})();
