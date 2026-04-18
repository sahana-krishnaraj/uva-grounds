/**
 * Home feed: Supabase events, RSVPs, comments, follows; realtime refresh.
 */
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { ensureHoosOutOnlinePresence } from "./presence-channel.js";
import { syncHoosOutDisplayName, upsertMyProfileRow } from "./hoosout-profile-sync.js";
import { notifyRsvp } from "./app-notifications.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";
import { withResolvedAvatarUrl } from "./avatar-url.js";
import { blockUser, getBlockedUserIds, submitEventReport } from "./user-safety.js";

let currentUserId = null;
let feedScope = "discover";
let feedRows = [];
let followingIds = [];
let rsvpCountMap = new Map();
let myRsvpSet = new Set();
let commentsByEvent = new Map();
let realtimeChannel = null;
/** Server-backed like counts / my likes (see supabase/migrations/007_event_likes.sql) */
let eventLikeCountMap = new Map();
let myLikedEventIds = new Set();
let myProfileRow = null;
let blockedUserIds = new Set();

function escapeHtml(s) {
  if (!s) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function formatWhen(iso) {
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

function formatCommentAge(iso) {
  if (!iso) return "just now";
  try {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "just now";
    const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (sec < 10) return "just now";
    if (sec < 60) return sec + " sec ago";
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? "1 min ago" : min + " min ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? "1 hour ago" : hr + " hours ago";
    const day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? "1 day ago" : day + " days ago";
    return formatWhen(iso);
  } catch (e) {
    return "just now";
  }
}

function visibilityPill(vis) {
  if (vis === "friends") {
    return '<span class="post-visibility-pill pill-friends">👥 Friends only</span>';
  }
  if (vis === "invite") {
    return '<span class="post-visibility-pill pill-invite">✉️ Invite-only</span>';
  }
  return '<span class="post-visibility-pill pill-public">🌐 Anyone at UVA</span>';
}

function visibilityBadge(vis) {
  if (vis === "friends") return '<span class="badge badge-friends">Friends only</span>';
  if (vis === "invite") return '<span class="badge badge-student">Invite-only</span>';
  return '<span class="badge badge-student">Student event</span>';
}

function hashStoryColor(id) {
  const s = String(id || "x");
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i);
  return 1 + (n % 4);
}

function displayNameFromProfile(p) {
  if (!p) return "Student";
  const pref = (p.preferred_name || "").trim();
  if (pref) return pref;
  const fn = (p.first_name || "").trim();
  const ln = (p.last_name || "").trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return (p.computing_id || "").trim() || "Student";
}

function initialsFromProfile(p) {
  if (!p) return "?";
  const fn = (p.first_name || "").trim();
  const ln = (p.last_name || "").trim();
  if (fn && ln) return (fn[0] + ln[0]).toUpperCase();
  if (fn.length >= 2) return fn.slice(0, 2).toUpperCase();
  if (ln.length >= 2) return ln.slice(0, 2).toUpperCase();
  if (fn.length === 1) return (fn[0] + fn[0]).toUpperCase();
  if (ln.length === 1) return (ln[0] + ln[0]).toUpperCase();
  const pref = (p.preferred_name || "").trim();
  if (pref.length >= 2) return pref.slice(0, 2).toUpperCase();
  if (pref.length === 1) return (pref[0] + pref[0]).toUpperCase();
  const c = (p.computing_id || "").trim();
  if (c.length >= 2) return c.slice(0, 2).toUpperCase();
  if (c.length === 1) return (c + c).toUpperCase();
  return "?";
}

function userEventFeedTags(ev) {
  const t = [];
  if (ev.activity_type) t.push(String(ev.activity_type).toLowerCase());
  if (ev.tags) {
    ev.tags.split(",").forEach((x) => {
      const s = String(x).trim().toLowerCase();
      if (s) t.push(s);
    });
  }
  if (ev.vibe) {
    ev.vibe.split(",").forEach((x) => {
      const s = String(x).trim().toLowerCase();
      if (s) t.push(s);
    });
  }
  if (ev.place_label) t.push(String(ev.place_label).toLowerCase());
  if (ev.title) t.push(String(ev.title).toLowerCase());
  return t.join(" ");
}

function regionFromEvent(ev) {
  const place = ((ev.place_label || "") + " " + (ev.tags || "")).toLowerCase();
  if (/\b(cville|charlottesville|downtown|mall|grit)\b/.test(place)) return "cville";
  const lng = Number(ev.lng);
  if (isFinite(lng) && lng > -78.49) return "cville";
  return "grounds";
}

function trimPreview(text, maxLen) {
  var s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)).trim() + "…";
}

function profileCompletionPercent(row) {
  if (!row) return 0;
  var checks = [
    row.first_name,
    row.last_name,
    row.preferred_name,
    row.year,
    row.pronouns,
    row.bio,
    row.location,
    row.interests,
    row.schedule,
    row.avatar_url,
  ];
  var done = checks.filter(function (x) {
    return String(x || "").trim().length > 0;
  }).length;
  return Math.round((done / checks.length) * 100);
}

function renderProfileProgressBar(row) {
  var wrap = document.getElementById("feed-profile-progress");
  var label = document.getElementById("feed-profile-progress-label");
  var fill = document.getElementById("feed-profile-progress-fill");
  if (!wrap || !label || !fill) return;
  var pct = profileCompletionPercent(row);
  if (pct >= 100) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  label.textContent = pct + "% complete";
  fill.style.width = pct + "%";
  var track = wrap.querySelector(".feed-profile-progress-track");
  if (track) track.setAttribute("aria-valuenow", String(pct));
}

async function loadCommunityStories() {
  const mount = document.getElementById("hoosout-community-stories");
  if (!mount) return;
  try {
    const { data: u } = await supabase.auth.getUser();
    const selfId = u.user ? u.user.id : null;
    const q = await supabase
      .from("profiles")
      .select("id, first_name, last_name, computing_id, created_at")
      .order("created_at", { ascending: false })
      .limit(32);
    if (q.error) throw q.error;
    const rawRows = q.data || [];
    const rows = rawRows.filter((p) => !selfId || p.id !== selfId);
    if (!rows.length) {
      mount.innerHTML =
        rawRows.length && selfId
          ? '<span class="story-strip-hint" style="font-size:0.82rem;color:var(--text-muted)">You’re the only profile so far — invite friends to join.</span>'
          : '<span class="story-strip-hint" style="font-size:0.82rem;color:var(--text-muted)">No profiles yet.</span>';
      return;
    }
    function shortLabel(p) {
      const full = [p.first_name, p.last_name]
        .map((x) => (x ? String(x).trim() : ""))
        .filter(Boolean)
        .join(" ");
      if (full) return full.split(/\s+/)[0] || full;
      return p.computing_id || "Student";
    }
    mount.innerHTML = rows
      .map((p) => {
        const name = [p.first_name, p.last_name]
          .map((x) => (x ? String(x).trim() : ""))
          .filter(Boolean)
          .join(" ")
          .trim();
        const label = name || p.computing_id || "Student";
        const fn = String(p.first_name || "").trim();
        const ln = String(p.last_name || "").trim();
        let ini = "?";
        if (fn && ln) ini = (fn[0] + ln[0]).toUpperCase();
        else if (fn) ini = fn.slice(0, 2).toUpperCase();
        else if (p.computing_id) ini = String(p.computing_id).slice(0, 2).toUpperCase();
        const c = hashStoryColor(p.id);
        return (
          '<a class="story-ring" href="home.html" title="' +
          escapeHtml(label) +
          '"><div class="story-avatar"><span class="story-avatar-inner avatar--color-' +
          c +
          '">' +
          escapeHtml(ini) +
          '</span></div><span>' +
          escapeHtml(shortLabel(p)) +
          "</span></a>"
        );
      })
      .join("");
  } catch (e) {
    console.warn("HoosOut: community stories", e);
    mount.innerHTML =
      '<span class="story-strip-hint" style="font-size:0.82rem;color:var(--text-muted)">Could not load community.</span>';
  }
}

function commentPanelHtml(postKey) {
  return (
    '<div class="post-comment-panel" hidden>' +
    '<div class="post-comment-list js-comment-list" data-post-key="' +
    escapeHtml(postKey) +
    '"></div>' +
    '<form class="post-comment-form js-comment-form" data-post-key="' +
    escapeHtml(postKey) +
    '">' +
    '<textarea class="js-comment-input" placeholder="Write a comment…" rows="2"></textarea>' +
    '<button type="submit" class="btn btn-primary btn-sm">Post comment</button>' +
    "</form></div>"
  );
}

function renderCommentItems(eventId) {
  const rows = commentsByEvent.get(eventId) || [];
  if (!rows.length) {
    return '<p class="post-comment-empty" style="margin:0 0 0.5rem;font-size:0.82rem;color:var(--text-muted)">No comments yet.</p>';
  }
  return rows
    .map((r) => {
      const prof = r.profiles || {};
      const who = displayNameFromProfile(prof);
      const whoHref = r.user_id ? "profile-view.html?id=" + encodeURIComponent(r.user_id) : "";
      const whoHtml = whoHref
        ? '<a class="post-comment-author" href="' + escapeHtml(whoHref) + '"><strong>' + escapeHtml(who) + "</strong></a>"
        : "<strong>" + escapeHtml(who) + "</strong>";
      const age = formatCommentAge(r.created_at);
      const dt = escapeHtml(r.created_at || "");
      return (
        '<div class="post-comment-item"><p style="margin:0 0 0.25rem;font-size:0.9rem">' +
        whoHtml +
        " — " +
        escapeHtml(r.text) +
        '</p><span class="post-comment-meta" style="font-size:0.72rem;color:var(--text-muted)">' +
        '<time datetime="' +
        dt +
        '" title="' +
        escapeHtml(r.created_at ? formatWhen(r.created_at) : "") +
        '">' +
        escapeHtml(age) +
        "</time></span></div>"
      );
    })
    .join("");
}

function renderEventCard(ev, profile, opts, attendeesForEvent) {
  const hostLabel = displayNameFromProfile(profile);
  const isSelf = ev.user_id === currentUserId;
  const nComments = opts && opts.commentCountMap ? opts.commentCountMap.get(ev.id) || 0 : 0;
  const nLikes = eventLikeCountMap.get(ev.id) || 0;
  const profileHref = ev.user_id ? "profile-view.html?id=" + encodeURIComponent(ev.user_id) : "#";
  const detailHref = "event-detail.html?id=" + encodeURIComponent(ev.id);
  const notesHtml = ev.notes
    ? '<div class="post-body"><p>' + escapeHtml(trimPreview(ev.notes, 140)) + "</p></div>"
    : "";
  const tags =
    ev.tags &&
    ev.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => '<span class="tag">' + escapeHtml(t) + "</span>")
      .join(" ");

  const friendsOnlyAttr =
    ev.visibility === "friends" || ev.visibility === "invite" ? "true" : "false";
  const region = regionFromEvent(ev);
  const feedTags = userEventFeedTags(ev);
  const initials = initialsFromProfile(profile);
  const colorN = hashStoryColor(ev.user_id || ev.id);
  const avatarHtml =
    profile && profile.avatar_url
      ? '<img class="js-hoosout-avatar-img" alt="" src="' +
        escapeHtml(profile.avatar_url) +
        '" onerror="this.hidden=true;var n=this.nextElementSibling;if(n)n.hidden=false;" /><span class="js-hoosout-avatar-fallback" hidden>' +
        escapeHtml(initials) +
        "</span>"
      : '<span class="js-hoosout-avatar-fallback">' + escapeHtml(initials) + "</span>";

  const attendeeBlock =
    attendeesForEvent && attendeesForEvent.length
      ? '<div class="event-attendees">' +
        '<p class="event-attendees-heading">Who\'s going (' +
        attendeesForEvent.length +
        ")</p>" +
        '<ul class="event-attendees-list">' +
        attendeesForEvent
          .map((a) => {
            const nm = displayNameFromProfile(a.profile);
            const href = "profile-view.html?id=" + encodeURIComponent(a.user_id);
            return (
              '<li><a class="event-attendee-link" href="' +
              escapeHtml(href) +
              '">' +
              escapeHtml(nm) +
              "</a></li>"
            );
          })
          .join("") +
        "</ul></div>"
      : "";
  const pendingBlock =
    isSelf && opts && opts.followingProfiles && opts.followingProfiles.length
      ? (function () {
          const responded = new Set((attendeesForEvent || []).map((x) => x.user_id));
          const pending = opts.followingProfiles.filter((p) => !responded.has(p.id));
          if (!pending.length) return "";
          return (
            '<div class="event-attendees" style="margin-top:0.5rem">' +
            '<p class="event-attendees-heading">Not responded yet (' +
            pending.length +
            ")</p><ul class=\"event-attendees-list\">" +
            pending
              .map(function (p) {
                return (
                  '<li><a class="event-attendee-link" href="profile-view.html?id=' +
                  encodeURIComponent(p.id) +
                  '">' +
                  escapeHtml(displayNameFromProfile(p)) +
                  "</a></li>"
                );
              })
              .join("") +
            "</ul></div>"
          );
        })()
      : "";

  const fset = opts && opts.followingSet ? opts.followingSet : new Set();
  const followBlock = !isSelf
    ? '<div class="post-follow-wrap">' +
      '<button type="button" class="js-follow-btn btn-follow-pill" data-person-id="' +
      escapeHtml(ev.user_id) +
      '" data-person-name="' +
      escapeHtml(hostLabel) +
      '" data-person-initials="' +
      escapeHtml(initials) +
      '">' +
      (fset.has(ev.user_id) ? "Following" : "Follow") +
      '</button><button type="button" class="post-menu" aria-label="Post options">⋯</button></div>'
    : "";

  const rsvpN = rsvpCountMap.get(ev.id) || 0;
  const statusBase =
    rsvpN + " Hoos " + (rsvpN === 1 ? "is" : "are") + " going";

  return (
    '<article class="feed-post hoosout-user-event" id="' +
    escapeHtml(ev.id) +
    '" data-event-id="' +
    escapeHtml(ev.id) +
    '" data-post-key="' +
    escapeHtml(ev.id) +
    '" data-author-id="' +
    escapeHtml(ev.user_id) +
    '" data-post-kind="event" data-friends-only="' +
    friendsOnlyAttr +
    '" data-feed-tags="' +
    escapeHtml(feedTags) +
    '" data-region="' +
    region +
    '" data-like-count="' +
    nLikes +
    '">' +
    '<header class="post-header">' +
    '<a class="post-profile-hit post-profile-hit--avatar" href="' +
    escapeHtml(profileHref) +
    '" aria-label="View ' +
    escapeHtml(hostLabel) +
    '\'s profile">' +
    '<div class="avatar avatar--md avatar--color-' +
    colorN +
    '" aria-hidden="true">' +
    avatarHtml +
    "</div></a>" +
    '<div class="post-header-main">' +
    '<div class="post-names">' +
    '<a class="post-profile-hit post-profile-hit--name" href="' +
    escapeHtml(profileHref) +
    '"><strong>' +
    escapeHtml(hostLabel) +
    "</strong></a> posted an event " +
    visibilityPill(ev.visibility) +
    "</div>" +
    '<div class="post-meta-line">' +
    formatWhen(ev.created_at) +
    " · " +
    escapeHtml(ev.place_label || "") +
    "</div></div>" +
    followBlock +
    "</header>" +
    notesHtml +
    '<div class="post-event-box">' +
    visibilityBadge(ev.visibility) +
    "<h3>" +
    escapeHtml(ev.title) +
    "</h3>" +
    '<p class="event-line">' +
    formatWhen(ev.start_iso) +
    " · " +
    escapeHtml(ev.duration || "") +
    (ev.cap ? " · up to " + escapeHtml(String(ev.cap)) + " people" : "") +
    "</p>" +
    '<p class="event-line">' +
    escapeHtml(ev.activity_type || "") +
    (ev.vibe ? " · " + escapeHtml(ev.vibe) : "") +
    "</p>" +
    (tags ? '<div class="event-tags" style="margin-top:0.35rem">' + tags + "</div>" : "") +
    '<div class="mini-map-wrap" id="mini-map-' +
    escapeHtml(ev.id) +
    '" data-lat="' +
    ev.lat +
    '" data-lng="' +
    ev.lng +
    '" aria-label="Event location map"></div>' +
    '<div class="event-actions" style="margin-top:0.5rem">' +
    '<button type="button" class="btn btn-primary btn-sm js-rsvp-btn" data-event-id="' +
    escapeHtml(ev.id) +
    '" data-rsvp-label="RSVP">RSVP</button>' +
    '<button type="button" class="btn btn-ghost btn-sm js-save-btn" data-event-id="' +
    escapeHtml(ev.id) +
    '">Save</button>' +
    "</div>" +
    attendeeBlock +
    pendingBlock +
    '<div style="margin-top:0.5rem"><a class="btn btn-ghost btn-sm" href="' +
    escapeHtml(detailHref) +
    '">View details</a></div>' +
    "</div>" +
    '<div class="post-stats js-event-status" data-event-id="' +
    escapeHtml(ev.id) +
    '" data-status-base="' +
    escapeHtml(statusBase) +
    '">' +
    statusBase +
    (myRsvpSet.has(ev.id) ? " · You're registered" : "") +
    "</div>" +
    '<div class="post-actions-row">' +
    '<button type="button" class="post-action-btn js-post-action" data-action="like" data-like-label="Like">👍 <span class="js-like-text">Like</span><span class="js-like-count"></span></button>' +
    '<button type="button" class="post-action-btn js-post-action" data-action="comment">💬 Comment <span class="js-comment-count">' +
    (nComments ? "(" + nComments + ")" : "") +
    "</span></button>" +
    '<button type="button" class="post-action-btn js-post-action" data-action="share">↗ Share</button>' +
    "</div>" +
    commentPanelHtml(ev.id) +
    "</article>"
  );
}

async function fetchFollowingIds() {
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUserId);
  if (error) {
    console.warn("HoosOut: follows", error.message);
    return [];
  }
  return (data || []).map((r) => r.following_id);
}

async function fetchProfilesByIds(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
    .in("id", uniq);
  if (error) return [];
  return (data || []).map((p) => withResolvedAvatarUrl(p, supabase));
}

async function fetchEventsForScope() {
  const evCols =
    "id, user_id, title, activity_type, duration, start_iso, lat, lng, place_label, visibility, tags, vibe, notes, cap, created_at";
  let query = supabase.from("events").select(evCols);

  if (feedScope === "mine") {
    query = query.eq("user_id", currentUserId);
  } else if (feedScope === "discover") {
    query = query.eq("visibility", "public");
  } else if (feedScope === "following") {
    if (!followingIds.length) {
      return [];
    }
    query = query.in("user_id", followingIds);
  }

  const { data: evs, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) {
    console.error("HoosOut: events", error.message);
    return [];
  }
  const list = evs || [];
  const uids = [...new Set(list.map((e) => e.user_id).filter(Boolean))];
  const pmap = new Map();
  if (uids.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
      .in("id", uids);
    if (pErr) console.warn("HoosOut: profiles for feed", pErr.message);
    (profs || []).forEach((p) => {
      pmap.set(p.id, withResolvedAvatarUrl(p, supabase));
    });
  }
  return list
    .filter((e) => !blockedUserIds.has(e.user_id))
    .map((e) => ({ ...e, profiles: pmap.get(e.user_id) || null }));
}

async function loadRsvpData(eventIds) {
  rsvpCountMap = new Map();
  myRsvpSet = new Set();
  if (!eventIds.length) return;

  const { data: counts } = await supabase.from("rsvps").select("event_id").in("event_id", eventIds);
  if (counts) {
    counts.forEach((r) => {
      const id = r.event_id;
      rsvpCountMap.set(id, (rsvpCountMap.get(id) || 0) + 1);
    });
  }

  const { data: mine } = await supabase
    .from("rsvps")
    .select("event_id")
    .eq("user_id", currentUserId)
    .in("event_id", eventIds);
  if (mine) mine.forEach((r) => myRsvpSet.add(r.event_id));
}

async function loadAttendeesForAllEvents(rows) {
  const m = new Map();
  const eventIds = (rows || []).map((r) => r.id).filter(Boolean);
  if (!eventIds.length) return m;
  const { data: rs, error } = await supabase.from("rsvps").select("event_id, user_id").in("event_id", eventIds);
  if (error || !rs || !rs.length) return m;
  const uids = [...new Set(rs.map((r) => r.user_id).filter(Boolean))];
  const pmap = new Map();
  if (uids.length) {
    const pr = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
      .in("id", uids);
    (pr.data || []).forEach((p) => pmap.set(p.id, withResolvedAvatarUrl(p, supabase)));
  }
  rs.forEach((r) => {
    if (!r.user_id) return;
    const list = m.get(r.event_id) || [];
    if (!list.some((x) => x.user_id === r.user_id)) {
      list.push({ user_id: r.user_id, profile: pmap.get(r.user_id) || null });
    }
    m.set(r.event_id, list);
  });
  return m;
}

async function loadLikeData(eventIds) {
  eventLikeCountMap = new Map();
  myLikedEventIds = new Set();
  if (!eventIds.length) return;
  const { data, error } = await supabase.from("event_likes").select("event_id, user_id").in("event_id", eventIds);
  if (error) {
    console.warn("HoosOut: event_likes", error.message);
    return;
  }
  (data || []).forEach((r) => {
    eventLikeCountMap.set(r.event_id, (eventLikeCountMap.get(r.event_id) || 0) + 1);
    if (r.user_id === currentUserId) myLikedEventIds.add(r.event_id);
  });
}

async function loadCommentsForEvents(eventIds) {
  commentsByEvent = new Map();
  if (!eventIds.length) return;
  const q2 = await supabase
    .from("comments")
    .select("id, user_id, event_id, text, created_at")
    .in("event_id", eventIds)
    .order("created_at", { ascending: true });
  if (q2.error) {
    console.warn("HoosOut: comments", q2.error.message);
    return;
  }
  const uids = [...new Set((q2.data || []).map((c) => c.user_id).filter(Boolean))];
  const pmap = new Map();
  if (uids.length) {
    const pr = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, computing_id, avatar_url")
      .in("id", uids);
    (pr.data || []).forEach((p) => pmap.set(p.id, withResolvedAvatarUrl(p, supabase)));
  }
  const data = (q2.data || [])
    .filter((c) => !blockedUserIds.has(c.user_id))
    .map((c) => ({ ...c, profiles: pmap.get(c.user_id) || null }));
  (data || []).forEach((c) => {
    const list = commentsByEvent.get(c.event_id) || [];
    list.push(c);
    commentsByEvent.set(c.event_id, list);
  });
}

function initMiniMaps() {
  if (typeof L === "undefined") return;
  document.querySelectorAll(".mini-map-wrap").forEach((el, idx) => {
    const latStr = el.getAttribute("data-lat");
    const lngStr = el.getAttribute("data-lng");
    if (latStr == null || lngStr == null || latStr === "" || lngStr === "") return;
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!isFinite(lat) || !isFinite(lng)) return;
    setTimeout(() => {
      if (el.querySelector(".leaflet-container")) return;
      const mini = L.map(el, {
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        attributionControl: true,
      }).setView([lat, lng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OSM",
      }).addTo(mini);
      L.marker([lat, lng]).addTo(mini);
      mini.invalidateSize();
    }, 80 + idx * 40);
  });
}

async function refreshFeed() {
  followingIds = await fetchFollowingIds();
  const followingSet = new Set(followingIds);
  const followingProfiles = await fetchProfilesByIds(followingIds);

  let rows = await fetchEventsForScope();
  feedRows = rows;

  const mount = document.getElementById("feed-posts-mount");
  const emptyFeed = document.getElementById("feed-posts-empty");

  const eventIds = rows.map((r) => r.id);
  await loadRsvpData(eventIds);
  await loadCommentsForEvents(eventIds);
  await loadLikeData(eventIds);

  const commentCountMap = new Map();
  eventIds.forEach((id) => commentCountMap.set(id, (commentsByEvent.get(id) || []).length));

  const attendeesByEvent = await loadAttendeesForAllEvents(rows);

  const opts = { followingSet, commentCountMap, followingProfiles };

  if (mount) {
    if (!rows.length) {
      mount.innerHTML = "";
      if (emptyFeed) {
        emptyFeed.hidden = false;
        emptyFeed.textContent =
          feedScope === "following" && !followingIds.length
            ? "Follow people to see their events here, or open Discover for all public events."
            : "No events yet. Create one from the top nav.";
      }
    } else {
      if (emptyFeed) emptyFeed.hidden = true;
      mount.innerHTML = rows
        .map((row) => {
          const prof = row.profiles;
          const att = attendeesByEvent.get(row.id);
          return renderEventCard(row, prof, opts, att);
        })
        .join("");
    }
  }

  initMiniMaps();

  if (window.HoosOutProfilePhoto && window.HoosOutProfilePhoto.refreshTargets) {
    var composer = document.querySelector(".composer-card");
    if (composer) window.HoosOutProfilePhoto.refreshTargets(composer);
  }

  syncPostSocialUi(document);
  refreshActionButtons(document);
  refreshFollowButtons(document, followingSet);
}

function rsvpActiveLabel(btn) {
  const def = btn.getAttribute("data-rsvp-label") || "RSVP";
  if (def === "Join") return "You're in ✓";
  return "Going ✓";
}

function refreshActionButtons(root) {
  const scope = root || document;
  scope.querySelectorAll(".js-rsvp-btn").forEach((btn) => {
    const id = btn.getAttribute("data-event-id");
    if (!id) return;
    const def = btn.getAttribute("data-rsvp-label") || "RSVP";
    const on = myRsvpSet.has(id);
    btn.textContent = on ? rsvpActiveLabel(btn) : def;
    btn.classList.toggle("btn-rsvp-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  scope.querySelectorAll(".js-save-btn").forEach((btn) => {
    if (!window.HoosOutEvents) return;
    const id = btn.getAttribute("data-event-id");
    if (!id) return;
    const on = window.HoosOutEvents.isSaved(id);
    btn.textContent = on ? "Saved ✓" : "Save";
    btn.classList.toggle("btn-save-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  scope.querySelectorAll(".js-event-status").forEach((el) => {
    const id = el.getAttribute("data-event-id");
    if (!id) return;
    const n = rsvpCountMap.get(id) || 0;
    const base = n + " Hoos " + (n === 1 ? "is" : "are") + " going";
    const parts = [];
    if (myRsvpSet.has(id)) parts.push("You're registered");
    if (window.HoosOutEvents && window.HoosOutEvents.isSaved(id)) parts.push("saved");
    el.textContent = base + (parts.length ? " · " + parts.join(" · ") : "");
  });
}

function refreshFollowButtons(root, followingSet) {
  const scope = root || document;
  scope.querySelectorAll(".js-follow-btn").forEach((btn) => {
    const pid = btn.getAttribute("data-person-id");
    if (!pid) return;
    const on = followingSet.has(pid);
    btn.textContent = on ? "Following" : "Follow";
    btn.classList.toggle("btn-follow-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function updateLikeButton(btn, article) {
  if (!btn || !article) return;
  const key = article.getAttribute("data-post-key") || article.getAttribute("data-event-id");
  if (!key) return;
  const count = eventLikeCountMap.get(key) || 0;
  const liked = myLikedEventIds.has(key);
  const label = btn.getAttribute("data-like-label") || "Like";
  const textSpan = btn.querySelector(".js-like-text");
  const countSpan = btn.querySelector(".js-like-count");
  btn.classList.toggle("post-action-btn--active", liked);
  btn.setAttribute("aria-pressed", liked ? "true" : "false");
  if (textSpan) textSpan.textContent = liked ? "Liked" : label;
  if (countSpan) countSpan.textContent = count ? " · " + count : "";
}

function syncPostSocialUi(scope) {
  const root = scope || document;
  root.querySelectorAll(".feed-post").forEach((art) => {
    const key = art.getAttribute("data-post-key") || art.getAttribute("data-event-id");
    if (!key) return;
    art.querySelectorAll('.js-post-action[data-action="like"]').forEach((btn) => {
      updateLikeButton(btn, art);
    });
    const n = (commentsByEvent.get(key) || []).length;
    art.querySelectorAll(".js-comment-count").forEach((el) => {
      el.textContent = n ? "(" + n + ")" : "";
    });
    art.querySelectorAll(".js-comment-list").forEach((listEl) => {
      const eid = listEl.getAttribute("data-post-key");
      listEl.innerHTML = renderCommentItems(eid);
    });
  });
}

function toggleCommentPanel(article) {
  const panel = article && article.querySelector(".post-comment-panel");
  if (!panel) return;
  const open = panel.hidden;
  document.querySelectorAll(".post-comment-panel").forEach((p) => {
    p.hidden = true;
  });
  panel.hidden = !open;
  if (!panel.hidden) {
    const key = article.getAttribute("data-post-key") || article.getAttribute("data-event-id");
    const listEl = panel.querySelector(".js-comment-list");
    if (listEl && key) {
      listEl.setAttribute("data-post-key", key);
      listEl.innerHTML = renderCommentItems(key);
    }
    const ta = panel.querySelector(".js-comment-input");
    if (ta) ta.focus();
  }
}

function sharePost(article) {
  const key = article.getAttribute("data-post-key") || article.getAttribute("data-event-id") || "";
  const path = "home.html";
  try {
    const u = new URL(path, window.location.href);
    if (key) u.hash = encodeURIComponent(key);
    const shareUrl = u.href;
    if (navigator.share) {
      navigator.share({ title: "HoosOut", text: "Check this on HoosOut", url: shareUrl }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert("Link copied — paste anywhere to share.");
      });
    } else {
      window.prompt("Copy this link:", shareUrl);
    }
  } catch (err) {
    window.prompt("Copy this link:", path + (key ? "#" + encodeURIComponent(key) : ""));
  }
}

let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshFeed();
  }, 400);
}

function subscribeRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  realtimeChannel = supabase
    .channel("hoosout-feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events" },
      () => scheduleRefresh()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rsvps" },
      () => scheduleRefresh()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "comments" },
      () => scheduleRefresh()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "follows" },
      () => scheduleRefresh()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "event_likes" },
      () => scheduleRefresh()
    )
    .subscribe();
}

(async function main() {
  const user = await requireAuth();
  if (!user) return;
  currentUserId = user.id;
  blockedUserIds = await getBlockedUserIds(currentUserId);

  ensureHoosOutOnlinePresence(user.id);

  await syncHoosOutDisplayName();
  await upsertMyProfileRow();
  const myPr = await supabase
    .from("profiles")
    .select("first_name,last_name,preferred_name,year,pronouns,bio,location,interests,schedule,avatar_url")
    .eq("id", currentUserId)
    .maybeSingle();
  myProfileRow = myPr.data || null;
  renderProfileProgressBar(myProfileRow);
  await loadCommunityStories();

  document.querySelectorAll(".chip[data-feed-scope]").forEach((c) => {
    c.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-feed-scope]").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      feedScope = c.getAttribute("data-feed-scope") || "discover";
      refreshFeed();
    });
  });

  document.body.addEventListener("click", (e) => {
    const card = e.target.closest && e.target.closest(".feed-post");
    if (card) {
      const interactive = e.target.closest(
        "button,a,textarea,input,select,label,.post-comment-panel,.post-actions-row,.event-actions"
      );
      if (!interactive) {
        const id = card.getAttribute("data-event-id");
        if (id) {
          window.location.href = "event-detail.html?id=" + encodeURIComponent(id);
          return;
        }
      }
    }
    const menuBtn = e.target.closest && e.target.closest(".post-menu");
    if (menuBtn) {
      e.preventDefault();
      const articleEl = menuBtn.closest(".feed-post");
      const evId = articleEl && articleEl.getAttribute("data-event-id");
      const authorId = articleEl && articleEl.getAttribute("data-author-id");
      if (!evId) return;
      const choice = window.prompt('Type "report" to report this post, or "block" to block the author.');
      if (!choice) return;
      if (choice.toLowerCase() === "report") {
        const reason = window.prompt("Reason for report:");
        if (!reason || !reason.trim()) return;
        void (async () => {
          const { error } = await submitEventReport(currentUserId, evId, reason);
          if (error) return alert(error.message);
          alert("Report submitted.");
        })();
      } else if (choice.toLowerCase() === "block" && authorId && authorId !== currentUserId) {
        void (async () => {
          const why = window.prompt("Optional reason for blocking:");
          const { error } = await blockUser(currentUserId, authorId, why || "");
          if (error) return alert(error.message);
          blockedUserIds = await getBlockedUserIds(currentUserId);
          scheduleRefresh();
        })();
      }
      return;
    }

    const btn = e.target.closest && e.target.closest(".js-post-action");
    if (!btn) return;
    const article = btn.closest(".feed-post");
    if (!article) return;
    const action = btn.getAttribute("data-action");
    const key = article.getAttribute("data-post-key") || article.getAttribute("data-event-id");
    if (!key || !action) return;
    if (action === "like") {
      e.preventDefault();
      void (async () => {
        try {
          if (myLikedEventIds.has(key)) {
            const { error } = await supabase
              .from("event_likes")
              .delete()
              .eq("event_id", key)
              .eq("user_id", currentUserId);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("event_likes").insert({
              event_id: key,
              user_id: currentUserId,
            });
            if (error) throw error;
          }
        } catch (err) {
          alert((err && err.message) || "Could not update like. Run supabase/migrations/007_event_likes.sql if needed.");
          return;
        }
        scheduleRefresh();
      })();
    } else if (action === "comment") {
      e.preventDefault();
      toggleCommentPanel(article);
    } else if (action === "share") {
      e.preventDefault();
      sharePost(article);
    }
  });

  document.body.addEventListener("submit", async (e) => {
    const form = e.target.closest && e.target.closest(".js-comment-form");
    if (!form || !form.closest("main.container--feed")) return;
    e.preventDefault();
    const key = form.getAttribute("data-post-key");
    const ta = form.querySelector(".js-comment-input");
    const text = ta && ta.value.trim();
    if (!key || !text) return;
    const { error } = await supabase.from("comments").insert({
      event_id: key,
      user_id: currentUserId,
      text,
    });
    if (error) {
      alert(error.message);
      return;
    }
    if (ta) ta.value = "";
    scheduleRefresh();
  });

  document.body.addEventListener("click", async (e) => {
    const el = e.target.closest && e.target.closest(".js-rsvp-btn, .js-save-btn, .js-follow-btn");
    if (!el) return;
    const rsvp = el.closest(".js-rsvp-btn");
    const save = el.closest(".js-save-btn");
    const follow = el.closest(".js-follow-btn");
    if (rsvp) {
      e.preventDefault();
      const id = rsvp.getAttribute("data-event-id");
      if (!id) return;
      if (myRsvpSet.has(id)) {
        await supabase.from("rsvps").delete().eq("event_id", id).eq("user_id", currentUserId);
        myRsvpSet.delete(id);
        rsvpCountMap.set(id, Math.max(0, (rsvpCountMap.get(id) || 1) - 1));
      } else {
        const { error } = await supabase.from("rsvps").insert({ event_id: id, user_id: currentUserId });
        if (error) {
          alert(error.message);
          return;
        }
        myRsvpSet.add(id);
        rsvpCountMap.set(id, (rsvpCountMap.get(id) || 0) + 1);
        const { data: evRow } = await supabase
          .from("events")
          .select("user_id, title")
          .eq("id", id)
          .maybeSingle();
        if (evRow && evRow.user_id && evRow.user_id !== currentUserId) {
          const { data: myProf } = await supabase
            .from("profiles")
            .select("first_name, last_name, preferred_name, computing_id")
            .eq("id", currentUserId)
            .maybeSingle();
          const actorName = displayNameFromProfile(myProf);
          await notifyRsvp({
            hostId: evRow.user_id,
            actorId: currentUserId,
            eventId: id,
            eventTitle: evRow.title,
            actorName,
          });
        }
      }
      refreshActionButtons(document);
      scheduleRefresh();
    } else if (save) {
      e.preventDefault();
      const sid = save.getAttribute("data-event-id");
      if (!sid) return;
      window.HoosOutEvents.toggleSaved(sid);
      refreshActionButtons(document);
    } else if (follow) {
      e.preventDefault();
      const pid = follow.getAttribute("data-person-id");
      if (!pid || pid === currentUserId) return;
      const isFollowing = followingIds.includes(pid);
      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", pid);
        followingIds = followingIds.filter((x) => x !== pid);
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: currentUserId,
          following_id: pid,
        });
        if (error) {
          alert(error.message);
          return;
        }
        followingIds.push(pid);
      }
      const fs = new Set(followingIds);
      refreshFollowButtons(document, fs);
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("posted") === "1") {
    const toast = document.createElement("div");
    toast.className = "hoosout-toast";
    toast.textContent = "Published — visible on the feed for others.";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hoosout-toast--out");
      setTimeout(() => toast.remove(), 400);
    }, 3200);
    history.replaceState({}, "", "home.html" + window.location.hash);
  }

  await refreshFeed();
  subscribeRealtime();

  (function scrollToHashEvent() {
    const h = window.location.hash;
    if (!h || h.length < 2) return;
    const id = decodeURIComponent(h.slice(1));
    if (!id) return;
    setTimeout(() => {
      const esc = String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const el = document.getElementById(id) || document.querySelector('.feed-post[data-event-id="' + esc + '"]');
      if (el && el.classList && el.classList.contains("feed-post")) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("feed-post--map-focus");
        setTimeout(() => el.classList.remove("feed-post--map-focus"), 2400);
      }
    }, 500);
  })();

  const signedIn = window.HoosOutSession && window.HoosOutSession.isSignedIn();
  const uva = document.getElementById("nav-uva-cville");
  if (uva && window.HoosOutSession) {
    if (signedIn) uva.removeAttribute("hidden");
    else uva.setAttribute("hidden", "");
  }
  const out = document.getElementById("nav-logout");
  if (out) {
    out.addEventListener("click", async () => {
      await supabase.auth.signOut();
      if (window.HoosOutSession) window.HoosOutSession.signOut();
    });
  }

  await initNavActivityBadge();
})();
