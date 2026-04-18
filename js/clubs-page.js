import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";

const me = await requireAuth();
if (!me) throw new Error("auth");

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/** Lowercase URL-safe slug from a display name (no user-facing slug field). */
function slugFromName(name) {
  const s = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "club";
}

let allClubs = [];
let myFollowed = new Set();
/** @type {{ user_id: string } | null} */
let myGrant = null;
/** @type {{ status: string, rejection_reason?: string | null } | null} */
let pendingRequest = null;
/** @type {{ rejection_reason?: string | null } | null} */
let lastRejected = null;

async function loadApprovalState() {
  const [{ data: grant }, { data: pendingRows }] = await Promise.all([
    supabase.from("club_creation_grants").select("user_id").eq("user_id", me.id).maybeSingle(),
    supabase.from("club_page_requests").select("status,rejection_reason").eq("user_id", me.id).eq("status", "pending").maybeSingle(),
  ]);
  myGrant = grant || null;
  pendingRequest = pendingRows || null;
  lastRejected = null;
  if (!myGrant && !pendingRequest) {
    const { data: rej } = await supabase
      .from("club_page_requests")
      .select("rejection_reason")
      .eq("user_id", me.id)
      .eq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastRejected = rej || null;
  }
}

function syncApprovalPanel() {
  const reqForm = document.getElementById("club-request-form");
  const createForm = document.getElementById("club-create-form");
  const statusEl = document.getElementById("club-status-message");
  if (!reqForm || !createForm || !statusEl) return;

  reqForm.hidden = true;
  createForm.hidden = true;
  statusEl.hidden = true;
  statusEl.innerHTML = "";
  statusEl.className = "club-approval-status";

  if (myGrant) {
    createForm.hidden = false;
    statusEl.hidden = false;
    statusEl.classList.add("club-approval-status--ok");
    statusEl.innerHTML =
      "<p style=\"margin:0\"><strong>Approved.</strong> You can create your organization’s page below. This uses your one-time approval — after the page exists, submit a new request if you need another club in the future.</p>";
    return;
  }

  if (pendingRequest) {
    statusEl.hidden = false;
    statusEl.classList.add("club-approval-status--pending");
    statusEl.innerHTML =
      "<p style=\"margin:0\"><strong>Request received.</strong> The HoosOut team will review it. Check back here — once approved, the “create club page” form will unlock.</p>";
    return;
  }

  reqForm.hidden = false;
  statusEl.hidden = false;
  if (lastRejected) {
    statusEl.classList.add("club-approval-status--rejected");
    const reason = esc(lastRejected.rejection_reason || "No details provided.");
    statusEl.innerHTML =
      '<p style="margin:0"><strong>Previous request wasn’t approved.</strong> ' +
      reason +
      '</p><p class="section-sub" style="margin:.45rem 0 0;text-align:left">You can submit a new request below.</p>';
  } else {
    statusEl.classList.add("club-approval-status--info");
    statusEl.innerHTML =
      "<p style=\"margin:0\">Don’t have a page yet? Submit a request. Only approved organizations can publish a club page.</p>";
  }
}

async function loadData() {
  await loadApprovalState();
  const [{ data: clubs }, { data: follows }] = await Promise.all([
    supabase.from("clubs").select("id,slug,name,logo_url,description,category,is_verified").order("name"),
    supabase.from("club_follows").select("club_id").eq("user_id", me.id),
  ]);
  allClubs = clubs || [];
  myFollowed = new Set((follows || []).map((r) => r.club_id));
  syncApprovalPanel();
}

function card(c) {
  const badge = c.is_verified ? ' <span class="badge badge-student">Verified</span>' : "";
  const logo = c.logo_url
    ? '<img src="' + esc(c.logo_url) + '" alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover" />'
    : '<div class="avatar avatar--md avatar--color-1" aria-hidden="true">' + esc((c.name || "C").slice(0, 2).toUpperCase()) + "</div>";
  return (
    '<article class="hub-card" data-club-id="' +
    esc(c.id) +
    '"><div style="display:flex;gap:.7rem;align-items:center">' +
    logo +
    '<div><h3 style="margin:0">' +
    esc(c.name) +
    badge +
    '</h3><p class="hub-card-meta" style="margin:.1rem 0 0">Category: ' +
    esc(c.category) +
    '</p></div></div><p class="hub-card-meta">' +
    esc(c.description || "") +
    '</p><div class="hub-card-actions"><a class="btn btn-ghost btn-sm" href="club-page.html?slug=' +
    encodeURIComponent(c.slug) +
    '">View page</a><button class="btn btn-primary btn-sm js-follow-club" data-club-id="' +
    esc(c.id) +
    '">' +
    (myFollowed.has(c.id) ? "Following" : "Follow") +
    "</button></div></article>"
  );
}

function render() {
  const cat = (document.getElementById("clubs-category").value || "").toLowerCase();
  const q = (document.getElementById("clubs-search").value || "").trim().toLowerCase();
  const rows = allClubs.filter((c) => (!cat || c.category === cat) && (!q || c.name.toLowerCase().includes(q)));
  const mount = document.getElementById("clubs-list");
  mount.innerHTML = rows.length ? rows.map(card).join("") : '<p class="me-empty">No clubs found.</p>';
  mount.querySelectorAll(".js-follow-club").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-club-id");
      if (!id) return;
      if (myFollowed.has(id)) {
        await supabase.from("club_follows").delete().eq("club_id", id).eq("user_id", me.id);
        myFollowed.delete(id);
      } else {
        await supabase.from("club_follows").insert({ club_id: id, user_id: me.id });
        myFollowed.add(id);
      }
      render();
    });
  });
}

document.getElementById("club-request-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const proposed_name = (document.getElementById("req-name").value || "").trim();
  const proposed_slug = slugFromName(proposed_name) || null;
  const category = document.getElementById("req-category").value || "other";
  const description = (document.getElementById("req-description").value || "").trim();
  const contact_email = (document.getElementById("req-email").value || "").trim();
  const message = (document.getElementById("req-message").value || "").trim();
  if (!proposed_name || !description || !contact_email) return;

  const { error } = await supabase.from("club_page_requests").insert({
    user_id: me.id,
    proposed_name,
    proposed_slug,
    category,
    description,
    contact_email,
    message: message || null,
    status: "pending",
  });
  if (error) {
    alert(error.message);
    return;
  }
  await loadData();
  render();
});

document.getElementById("club-create-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!myGrant) {
    alert("You need an approved request before creating a club page.");
    return;
  }
  const name = (document.getElementById("club-name").value || "").trim();
  const slug = slugFromName(name);
  const category = document.getElementById("club-category").value || "other";
  const description = (document.getElementById("club-description").value || "").trim();
  if (!name || !slug) return;

  const { data, error } = await supabase
    .from("clubs")
    .insert({ name, slug, category, description, created_by: me.id })
    .select("id, slug")
    .single();
  if (error) {
    alert(error.message);
    return;
  }
  if (data && data.id) {
    const { error: memErr } = await supabase.from("club_members").upsert({ club_id: data.id, user_id: me.id, role: "owner" });
    if (memErr) {
      alert(memErr.message);
      return;
    }
    const { error: grantErr } = await supabase.from("club_creation_grants").delete().eq("user_id", me.id);
    if (grantErr) console.warn(grantErr);
    myGrant = null;
    window.location.href = "club-page.html?slug=" + encodeURIComponent(data.slug);
  }
});

await loadData();
render();
document.getElementById("clubs-category").addEventListener("change", render);
document.getElementById("clubs-search").addEventListener("input", render);
document.getElementById("nav-logout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  if (window.HoosOutSession) window.HoosOutSession.signOut();
});
