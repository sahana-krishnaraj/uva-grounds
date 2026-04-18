/**
 * Direct messages: threads, reactions, read receipts, typing, presence, grouped UI.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import {
  ensureHoosOutOnlinePresence,
  isPartnerOnline,
  getHoosOutPresenceChannel,
  onHoosOutPresenceSync,
} from "./presence-channel.js";
import { notifyDirectMessage } from "./app-notifications.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";
import { resolveProfileAvatarUrl, withResolvedAvatarUrl } from "./avatar-url.js";
import { getBlockedUserIds } from "./user-safety.js";

const user = await requireAuth();
if (!user) throw new Error("auth");

const myId = user.id;

let activePartnerId = null;
let profileMap = new Map();
let allMessages = [];
/** @type {Map<string, Array<{ id: string, message_id: string, user_id: string, emoji: string }>>} */
let reactionsByMessage = new Map();
let typingChannel = null;
let typingHideTimer = null;
let typingRemoteTimer = null;
let realtimeChannel = null;
let blockedUserIds = new Set();
let refreshTimer = null;

const QUICK_REACTIONS = ["👍", "❤️", "😂", "‼️"];

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

function fullNameFromProfile(p) {
  if (!p) return "Student";
  const fn = String(p.first_name || "").trim();
  const ln = String(p.last_name || "").trim();
  const full = [fn, ln].filter(Boolean).join(" ").trim();
  return full || displayName(p);
}

function usernameFromProfile(p) {
  if (!p) return "";
  return String(p.preferred_name || p.computing_id || "").trim();
}

function initialsFromProfile(p) {
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

function threadAvatarHtml(p, extraClass) {
  const cls = "msg-avatar" + (extraClass ? " " + extraClass : "");
  const ini = escapeHtml(initialsFromProfile(p));
  const av = p ? resolveProfileAvatarUrl(p.avatar_url, supabase) : "";
  if (p && av) {
    return (
      '<span class="' +
      cls +
      ' msg-avatar--img" aria-hidden="true" data-ini="' +
      ini +
      '"><img class="msg-avatar-img" alt="" src="' +
      escapeHtml(av) +
      '" /></span>'
    );
  }
  return (
    '<span class="' + cls + '" aria-hidden="true"><span class="msg-avatar-fallback">' + ini + "</span></span>"
  );
}

function partnerForRow(m) {
  return m.sender_id === myId ? m.recipient_id : m.sender_id;
}

async function loadProfilesForIds(ids) {
  const need = [...new Set(ids)].filter((id) => id && !profileMap.has(id));
  if (!need.length) return;
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
    .in("id", need);
  (data || []).forEach((p) => profileMap.set(p.id, withResolvedAvatarUrl(p, supabase)));
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
    t.unread = t.messages.filter((m) => m.recipient_id === myId && m.read === false).length;
  }
  return [...threads.values()].sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
}

async function loadReactionsForMessages(ids) {
  reactionsByMessage = new Map();
  if (!ids.length) return;
  const { data, error } = await supabase
    .from("message_reactions")
    .select("id, message_id, user_id, emoji")
    .in("message_id", ids);
  if (error) {
    console.warn("HoosOut: message_reactions", error.message);
    return;
  }
  (data || []).forEach((r) => {
    const list = reactionsByMessage.get(r.message_id) || [];
    list.push(r);
    reactionsByMessage.set(r.message_id, list);
  });
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
  allMessages = (data || []).filter((m) => !blockedUserIds.has(m.sender_id) && !blockedUserIds.has(m.recipient_id));
  const partners = allMessages.map(partnerForRow);
  await loadProfilesForIds([...partners, myId]);
  const mids = allMessages.map((m) => m.id).filter(Boolean);
  await loadReactionsForMessages(mids);
}

function formatGroupDivider(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (e) {
    return iso;
  }
}

function renderReactionsLine(messageId) {
  const rows = reactionsByMessage.get(messageId) || [];
  if (!rows.length) return "";
  const counts = new Map();
  rows.forEach((r) => counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1));
  const chips = [...counts.entries()]
    .map(
      ([emo, n]) =>
        '<span class="msg-reaction-chip"><span class="msg-reaction-chip-emo">' +
        escapeHtml(emo) +
        '</span><span class="msg-reaction-chip-n">' +
        n +
        "</span></span>"
    )
    .join("");
  return '<div class="msg-reactions-line">' + chips + "</div>";
}

function renderReactionPicks(messageId) {
  return (
    '<div class="msg-reaction-picks" role="toolbar" aria-label="React">' +
    QUICK_REACTIONS.map(
      (emo) =>
        '<button type="button" class="msg-reaction-pick" data-msg-id="' +
        escapeHtml(messageId) +
        '" data-emoji="' +
        escapeHtml(emo) +
        '" title="React">' +
        emo +
        "</button>"
    ).join("") +
    "</div>"
  );
}

function groupMessages(msgs) {
  const groups = [];
  for (const m of msgs) {
    const last = groups[groups.length - 1];
    if (last && last.sender_id === m.sender_id) last.items.push(m);
    else groups.push({ sender_id: m.sender_id, items: [m] });
  }
  return groups;
}

function lastReadOutgoingMessageId(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].sender_id === myId && msgs[i].read) return msgs[i].id;
  }
  return null;
}

function updateThreadHeaderPresence(partnerId) {
  const header = document.getElementById("messages-thread-header");
  if (!header || !partnerId) return;
  const p = profileMap.get(partnerId);
  const ch = getHoosOutPresenceChannel();
  const online = isPartnerOnline(ch, partnerId);
  const dotClass = online ? "presence-dot presence-dot--online" : "presence-dot presence-dot--offline";
  const status = online ? "Online" : "Offline";
  header.innerHTML =
    '<a class="messages-thread-header-link" href="profile-view.html?id=' +
    encodeURIComponent(partnerId) +
    '">' +
    escapeHtml(displayName(p)) +
    '</a><span class="presence-wrap" title="' +
    escapeHtml(status) +
    '"><span class="' +
    dotClass +
    '" aria-hidden="true"></span><span class="presence-label">' +
    escapeHtml(status) +
    "</span></span>";
  header.hidden = false;
}

function renderThread(partnerId) {
  const header = document.getElementById("messages-thread-header");
  const scroll = document.getElementById("messages-thread-scroll");
  const empty = document.getElementById("messages-empty");
  const form = document.getElementById("messages-compose-form");
  if (!scroll || !header || !empty || !form) return;

  updateThreadHeaderPresence(partnerId);

  empty.hidden = true;
  form.hidden = false;

  const msgs = allMessages.filter((m) => partnerForRow(m) === partnerId);
  const themP = profileMap.get(partnerId);
  const meP = profileMap.get(myId);
  const readReceiptId = lastReadOutgoingMessageId(msgs);
  const groups = groupMessages(msgs);

  const blocks = groups.map((g) => {
    const mine = g.sender_id === myId;
    const t0 = g.items[0].created_at;
    const timeRow =
      '<div class="msg-group-time"><span>' + escapeHtml(formatGroupDivider(t0)) + "</span></div>";

    const bubbles = g.items
      .map((m) => {
        const bubbleCls = mine ? "msg-bubble msg-bubble--me" : "msg-bubble msg-bubble--them";
        const readHtml =
          mine && m.id === readReceiptId ? '<div class="msg-read-receipt">Read</div>' : "";
        return (
          '<div class="msg-bubble-wrap" data-msg-id="' +
          escapeHtml(m.id) +
          '">' +
          '<div class="' +
          bubbleCls +
          '">' +
          escapeHtml(m.text) +
          "</div>" +
          renderReactionsLine(m.id) +
          renderReactionPicks(m.id) +
          readHtml +
          "</div>"
        );
      })
      .join("");

    if (mine) {
      return (
        '<div class="msg-group msg-group--me">' +
        timeRow +
        '<div class="msg-row-inner msg-row-inner--me">' +
        '<div class="msg-stack msg-stack--me">' +
        bubbles +
        "</div></div></div>"
      );
    }
    return (
      '<div class="msg-group msg-group--them">' +
      timeRow +
      '<div class="msg-row-inner msg-row-inner--them">' +
      threadAvatarHtml(themP, "msg-avatar--them") +
      '<div class="msg-stack msg-stack--them">' +
      bubbles +
      "</div></div></div>"
    );
  });

  scroll.innerHTML = blocks.join("");
  scroll.querySelectorAll(".msg-avatar--img img").forEach((img) => {
    img.addEventListener("error", function () {
      const sp = img.closest(".msg-avatar");
      if (!sp) return;
      const ini = sp.getAttribute("data-ini") || "?";
      sp.classList.remove("msg-avatar--img");
      sp.innerHTML = '<span class="msg-avatar-fallback">' + ini + "</span>";
    });
  });
  scroll.scrollTop = scroll.scrollHeight;
}

function renderConvoList(threads) {
  const el = document.getElementById("messages-convo-list");
  if (!el) return;
  if (!threads.length) {
    el.innerHTML =
      '<p class="me-empty" style="margin:1rem;border:none">No conversations yet. Search for someone above.</p>';
    return;
  }
  el.innerHTML = threads
    .map((t) => {
      const p = profileMap.get(t.partnerId);
      const full = fullNameFromProfile(p);
      const name = escapeHtml(full);
      const preview = escapeHtml((t.last.text || "").slice(0, 72));
      const rawUname = usernameFromProfile(p);
      const uname = escapeHtml(rawUname);
      const showUname = !!rawUname && rawUname.toLowerCase() !== full.toLowerCase();
      const av = threadAvatarHtml(p, "msg-avatar--convo");
      const unread =
        t.unread > 0
          ? '<span class="messages-unread-badge">' + (t.unread > 9 ? "9+" : t.unread) + "</span>"
          : "";
      const active = t.partnerId === activePartnerId ? " is-active" : "";
      return (
        '<button type="button" class="messages-convo-item' +
        active +
        '" data-partner-id="' +
        escapeHtml(t.partnerId) +
        '">' +
        av +
        '<span class="messages-convo-text"><strong>' +
        name +
        "</strong>" +
        (showUname ? '<span class="messages-user-hit-meta">@' + uname + "</span>" : '<span class="messages-user-hit-meta"> </span>') +
        '<span class="messages-convo-preview">' +
        preview +
        "</span></span>" +
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

function typingChannelName(partnerId) {
  return [myId, partnerId].sort().join(":") + ":typing";
}

function detachTypingChannel() {
  if (typingChannel) {
    supabase.removeChannel(typingChannel);
    typingChannel = null;
  }
}

function attachTypingChannel(partnerId) {
  detachTypingChannel();
  if (!partnerId) return;
  const name = typingChannelName(partnerId);
  typingChannel = supabase.channel(name, { config: { broadcast: { self: false } } });
  typingChannel
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (!payload || payload.from === myId) return;
      const el = document.getElementById("messages-typing");
      if (!el) return;
      el.textContent = displayName(profileMap.get(partnerId)) + " is typing…";
      el.hidden = false;
      if (typingRemoteTimer) clearTimeout(typingRemoteTimer);
      typingRemoteTimer = setTimeout(() => {
        el.hidden = true;
        typingRemoteTimer = null;
      }, 2400);
    })
    .subscribe();
}

function sendTypingBroadcast(partnerId) {
  if (!typingChannel || !partnerId) return;
  typingChannel.send({ type: "broadcast", event: "typing", payload: { from: myId } });
}

async function openThread(partnerId) {
  if (!partnerId) return;
  activePartnerId = partnerId;
  await loadProfilesForIds([myId, partnerId]);
  await markThreadRead(partnerId);
  await fetchMessages();
  renderConvoList(buildThreads());
  attachTypingChannel(partnerId);
  renderThread(partnerId);
}

async function sendMessage(text) {
  if (!activePartnerId || !text.trim()) return;
  const trimmed = text.trim();
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      sender_id: myId,
      recipient_id: activePartnerId,
      text: trimmed,
      read: false,
    })
    .select("id")
    .single();
  if (error) {
    alert(error.message);
    return;
  }
  await loadProfilesForIds([myId]);
  const meP = profileMap.get(myId);
  if (inserted && inserted.id) {
    await notifyDirectMessage({
      recipientId: activePartnerId,
      senderId: myId,
      messageId: inserted.id,
      senderName: displayName(meP),
      preview: trimmed,
    });
  }
  await fetchMessages();
  renderConvoList(buildThreads());
  renderThread(activePartnerId);
}

async function toggleReaction(messageId, emoji) {
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id, emoji")
    .eq("message_id", messageId)
    .eq("user_id", myId)
    .maybeSingle();
  if (existing) {
    if (existing.emoji === emoji) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").update({ emoji }).eq("id", existing.id);
    }
  } else {
    await supabase.from("message_reactions").insert({
      message_id: messageId,
      user_id: myId,
      emoji,
    });
  }
  await fetchMessages();
  renderConvoList(buildThreads());
  if (activePartnerId) renderThread(activePartnerId);
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
    const sel = "id, first_name, last_name, preferred_name, computing_id, avatar_url";
    const [r1, r2, r3] = await Promise.all([
      supabase.from("profiles").select(sel).ilike("first_name", pat).neq("id", myId).limit(8),
      supabase.from("profiles").select(sel).ilike("last_name", pat).neq("id", myId).limit(8),
      supabase.from("profiles").select(sel).ilike("preferred_name", pat).neq("id", myId).limit(8),
    ]);
    const merged = [...(r1.data || []), ...(r2.data || []), ...(r3.data || [])];
    const seen = new Set();
    const rows = [];
    for (const x of merged) {
      if (blockedUserIds.has(x.id)) continue;
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      rows.push(x);
      if (rows.length >= 12) break;
    }
    if (!rows.length) {
      hits.innerHTML =
        '<p style="padding:0.5rem 0.75rem;font-size:0.85rem;color:var(--text-muted)">No matches</p>';
      hits.hidden = false;
      return;
    }
    hits.innerHTML = rows
      .map((r) => {
        profileMap.set(r.id, withResolvedAvatarUrl(r, supabase));
        return (
          '<button type="button" class="messages-user-hit" data-user-id="' +
          escapeHtml(r.id) +
          '">' +
          threadAvatarHtml(r, "msg-avatar--search") +
          '<span><span class="messages-user-hit-name">' +
          escapeHtml([r.first_name, r.last_name].filter(Boolean).join(" ") || displayName(r)) +
          '</span><span class="messages-user-hit-meta">@' +
          escapeHtml(usernameFromProfile(r) || "student") +
          "</span></span>" +
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

async function composeSend() {
  const ta = document.getElementById("messages-input");
  const raw = ta && ta.value;
  const text = raw != null ? String(raw).trim() : "";
  if (!text) return;
  if (ta) ta.value = "";
  await sendMessage(text);
}

document.getElementById("messages-compose-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  composeSend();
});

document.getElementById("messages-send-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  composeSend();
});

const inputEl = document.getElementById("messages-input");
inputEl?.addEventListener("keydown", (e) => {
  if (e.isComposing || e.key !== "Enter" || e.shiftKey) return;
  e.preventDefault();
  composeSend();
});

inputEl?.addEventListener("input", () => {
  if (!activePartnerId) return;
  const tip = document.getElementById("messages-typing");
  if (tip && !tip.hidden && tip.textContent.indexOf("You") === 0) {
    /* already showing self typing */
  }
  sendTypingBroadcast(activePartnerId);
  const el = document.getElementById("messages-typing");
  if (el) {
    el.textContent = "You are typing…";
    el.hidden = false;
  }
  if (typingHideTimer) clearTimeout(typingHideTimer);
  typingHideTimer = setTimeout(() => {
    const t = document.getElementById("messages-typing");
    if (t && t.textContent === "You are typing…") t.hidden = true;
    typingHideTimer = null;
  }, 1200);
});

document.getElementById("messages-thread-scroll")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".msg-reaction-pick");
  if (!btn) return;
  const mid = btn.getAttribute("data-msg-id");
  const emo = btn.getAttribute("data-emoji");
  if (!mid || !emo) return;
  e.preventDefault();
  toggleReaction(mid, emo);
});

document.getElementById("messages-thread-scroll")?.addEventListener("contextmenu", (e) => {
  const wrap = e.target.closest && e.target.closest(".msg-bubble-wrap");
  if (!wrap) return;
  e.preventDefault();
  document.querySelectorAll(".msg-bubble-wrap--react-open").forEach((el) => {
    if (el !== wrap) el.classList.remove("msg-bubble-wrap--react-open");
  });
  wrap.classList.toggle("msg-bubble-wrap--react-open");
});

document.addEventListener("click", (e) => {
  const inPicker = e.target.closest && e.target.closest(".msg-reaction-picks, .msg-bubble-wrap");
  if (inPicker) return;
  document.querySelectorAll(".msg-bubble-wrap--react-open").forEach((el) => {
    el.classList.remove("msg-bubble-wrap--react-open");
  });
});

document.getElementById("nav-logout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  if (window.HoosOutSession) window.HoosOutSession.signOut();
});

blockedUserIds = await getBlockedUserIds(myId);
await fetchMessages();
renderConvoList(buildThreads());

onHoosOutPresenceSync(() => {
  if (activePartnerId) updateThreadHeaderPresence(activePartnerId);
});
ensureHoosOutOnlinePresence(myId);

realtimeChannel = supabase
  .channel("hoosout-dm")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "messages" },
    () => scheduleRealtimeRefresh()
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "message_reactions" },
    () => scheduleRealtimeRefresh()
  )
  .subscribe();

function scheduleRealtimeRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    blockedUserIds = await getBlockedUserIds(myId);
    await fetchMessages();
    renderConvoList(buildThreads());
    if (activePartnerId) renderThread(activePartnerId);
  }, 120);
}

const params = new URLSearchParams(window.location.search);
const withUser = params.get("with");
if (withUser) {
  await openThread(withUser);
}

await initNavActivityBadge();
