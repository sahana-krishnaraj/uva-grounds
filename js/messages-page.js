/**
 * Direct messages: list threads, send, mark read, Realtime sync.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";

const user = await requireAuth();
if (!user) throw new Error("auth");

const myId = user.id;
let activePartnerId = null;
let profileMap = new Map();
let allMessages = [];

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function displayName(p) {
  if (!p) return "Student";
  const pref = (p.preferred_name || "").trim();
  if (pref) return pref;
  const fn = (p.first_name || "").trim();
  const ln = (p.last_name || "").trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return (p.computing_id || "").trim() || "Student";
}

function partnerForRow(m) {
  return m.sender_id === myId ? m.recipient_id : m.sender_id;
}

async function loadProfilesForIds(ids) {
  const need = [...new Set(ids)].filter((id) => id && !profileMap.has(id));
  if (!need.length) return;
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, preferred_name, computing_id")
    .in("id", need);
  (data || []).forEach((p) => profileMap.set(p.id, p));
}

function buildThreads() {
  const threads = new Map();
  for (const m of allMessages) {
    const pid = partnerForRow(m);
    if (!pid) continue;
    if (!threads.has(pid)) {
      threads.set(pid, { partnerId: pid, messages: [], unread: 0, last: m });
    }
    const t = threads.get(pid);
    t.messages.push(m);
    if (new Date(m.created_at) > new Date(t.last.created_at)) t.last = m;
  }
  for (const t of threads.values()) {
    t.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    t.unread = t.messages.filter(
      (m) => m.recipient_id === myId && m.read === false
    ).length;
  }
  return [...threads.values()].sort(
    (a, b) => new Date(b.last.created_at) - new Date(a.last.created_at)
  );
}

async function fetchMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error(error);
    return;
  }
  allMessages = data || [];
  const partners = allMessages.map(partnerForRow);
  await loadProfilesForIds(partners);
}

function renderConvoList(threads) {
  const el = document.getElementById("messages-convo-list");
  if (!el) return;
  if (!threads.length) {
    el.innerHTML = '<p class="me-empty" style="margin:1rem;border:none">No conversations yet. Search for someone above.</p>';
    return;
  }
  el.innerHTML = threads
    .map((t) => {
      const p = profileMap.get(t.partnerId);
      const name = escapeHtml(displayName(p));
      const preview = escapeHtml((t.last.text || "").slice(0, 72));
      const unread =
        t.unread > 0
          ? '<span class="messages-unread-badge">' +
            (t.unread > 9 ? "9+" : t.unread) +
            "</span>"
          : "";
      const active = t.partnerId === activePartnerId ? " is-active" : "";
      return (
        '<button type="button" class="messages-convo-item' +
        active +
        '" data-partner-id="' +
        escapeHtml(t.partnerId) +
        '"><strong>' +
        name +
        '</strong><span class="messages-convo-preview">' +
        preview +
        "</span>" +
        unread +
        "</button>"
      );
    })
    .join("");
  el.querySelectorAll(".messages-convo-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      openThread(btn.getAttribute("data-partner-id"));
    });
  });
}

async function markThreadRead(partnerId) {
  await supabase
    .from("messages")
    .update({ read: true })
    .eq("recipient_id", myId)
    .eq("sender_id", partnerId)
    .eq("read", false);
}

function renderThread(partnerId) {
  const header = document.getElementById("messages-thread-header");
  const scroll = document.getElementById("messages-thread-scroll");
  const empty = document.getElementById("messages-empty");
  const form = document.getElementById("messages-compose-form");
  if (!scroll || !header || !empty || !form) return;

  const p = profileMap.get(partnerId);
  header.textContent = displayName(p);
  header.hidden = false;
  empty.hidden = true;
  form.hidden = false;

  const msgs = allMessages.filter((m) => partnerForRow(m) === partnerId);
  scroll.innerHTML = msgs
    .map((m) => {
      const mine = m.sender_id === myId;
      const bubble = mine ? "msg-bubble msg-bubble--me" : "msg-bubble msg-bubble--them";
      const row = mine ? "msg-row msg-row--me" : "msg-row";
      const time = new Date(m.created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return (
        '<div class="' +
        row +
        '"><div><div class="' +
        bubble +
        '">' +
        escapeHtml(m.text) +
        '</div><div class="msg-meta">' +
        escapeHtml(time) +
        "</div></div></div>"
      );
    })
    .join("");
  scroll.scrollTop = scroll.scrollHeight;
}

async function openThread(partnerId) {
  if (!partnerId) return;
  activePartnerId = partnerId;
  await loadProfilesForIds([partnerId]);
  await markThreadRead(partnerId);
  await fetchMessages();
  renderConvoList(buildThreads());
  renderThread(partnerId);
}

async function sendMessage(text) {
  if (!activePartnerId || !text.trim()) return;
  const { error } = await supabase.from("messages").insert({
    sender_id: myId,
    recipient_id: activePartnerId,
    text: text.trim(),
    read: false,
  });
  if (error) {
    alert(error.message);
    return;
  }
  await fetchMessages();
  renderConvoList(buildThreads());
  renderThread(activePartnerId);
}

let searchTimer = null;
document.getElementById("msg-user-search")?.addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  const hits = document.getElementById("messages-user-hits");
  if (!hits) return;
  if (q.length < 2) {
    hits.hidden = true;
    hits.innerHTML = "";
    return;
  }
  searchTimer = setTimeout(async () => {
    const safe = q.replace(/[%]/g, "").slice(0, 48);
    const pat = `%${safe}%`;
    const sel = "id, first_name, last_name, preferred_name, computing_id";
    const [r1, r2, r3] = await Promise.all([
      supabase.from("profiles").select(sel).ilike("first_name", pat).neq("id", myId).limit(8),
      supabase.from("profiles").select(sel).ilike("last_name", pat).neq("id", myId).limit(8),
      supabase.from("profiles").select(sel).ilike("preferred_name", pat).neq("id", myId).limit(8),
    ]);
    const merged = [...(r1.data || []), ...(r2.data || []), ...(r3.data || [])];
    const seen = new Set();
    const rows = [];
    for (const x of merged) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      rows.push(x);
      if (rows.length >= 12) break;
    }
    if (!rows.length) {
      hits.innerHTML = '<p style="padding:0.5rem 0.75rem;font-size:0.85rem;color:var(--text-muted)">No matches</p>';
      hits.hidden = false;
      return;
    }
    hits.innerHTML = rows
      .map((r) => {
        profileMap.set(r.id, r);
        return (
          '<button type="button" class="messages-user-hit" data-user-id="' +
          escapeHtml(r.id) +
          '">' +
          escapeHtml(displayName(r)) +
          "</button>"
        );
      })
      .join("");
    hits.hidden = false;
    hits.querySelectorAll(".messages-user-hit").forEach((b) => {
      b.addEventListener("click", async () => {
        hits.hidden = true;
        document.getElementById("msg-user-search").value = "";
        await openThread(b.getAttribute("data-user-id"));
      });
    });
  }, 280);
});

document.getElementById("messages-compose-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ta = document.getElementById("messages-input");
  const text = ta && ta.value;
  if (ta) ta.value = "";
  await sendMessage(text || "");
});

document.getElementById("nav-logout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  if (window.HoosOutSession) window.HoosOutSession.signOut();
});

await fetchMessages();
renderConvoList(buildThreads());

supabase
  .channel("hoosout-dm")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "messages" },
    async () => {
      await fetchMessages();
      renderConvoList(buildThreads());
      if (activePartnerId) renderThread(activePartnerId);
    }
  )
  .subscribe();

const params = new URLSearchParams(window.location.search);
const withUser = params.get("with");
if (withUser) {
  await openThread(withUser);
}
