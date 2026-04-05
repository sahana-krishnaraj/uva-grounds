/**
 * Detect new follows, RSVPs on your events, and DMs — feed HoosOutNotifications (localStorage).
 */
import { supabase } from "./supabase.js";

function displayName(p) {
  if (!p) return "Someone";
  var pref = (p.preferred_name || "").trim();
  if (pref) return pref;
  var fn = (p.first_name || "").trim();
  var ln = (p.last_name || "").trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return (p.computing_id || "").trim() || "Someone";
}

export async function syncNotificationsFromSupabase(userId) {
  if (!userId || !window.HoosOutNotifications) return;

  var N = window.HoosOutNotifications;
  var seen = N.getSeen();

  /* —— Followers —— */
  var { data: followRows } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("following_id", userId);

  var followerIds = (followRows || []).map(function (r) { return r.follower_id; }).filter(Boolean);

  if (!seen.initialized) {
    followerIds.forEach(function (id) { seen.followers.add(id); });
    seen.initialized = true;
    N.saveSeen(seen);
    N.flushSeen();
  } else {
    var newFollowers = followerIds.filter(function (id) { return !seen.followers.has(id); });
    if (newFollowers.length) {
      var { data: fprofs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, preferred_name, computing_id")
        .in("id", newFollowers);
      var pmap = new Map((fprofs || []).map(function (p) { return [p.id, p]; }));
      newFollowers.forEach(function (fid, idx) {
        seen.followers.add(fid);
        N.add({
          id: "follow-" + fid + "-" + String(Date.now()) + "-" + idx,
          type: "follow",
          title: "New follower",
          body: displayName(pmap.get(fid)) + " started following you.",
          href: "profile-view.html?id=" + encodeURIComponent(fid),
          ts: Date.now(),
        });
      });
      N.saveSeen(seen);
      N.flushSeen();
    }
  }

  /* —— RSVPs on my events —— */
  var { data: myEvents } = await supabase.from("events").select("id, title").eq("user_id", userId);
  var eventIds = (myEvents || []).map(function (e) { return e.id; });
  var titleByEvent = new Map((myEvents || []).map(function (e) { return [e.id, e.title || "your event"]; }));

  if (eventIds.length) {
    var { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("id, user_id, event_id, created_at")
      .in("event_id", eventIds);

    if (!seen.rsvpInit) {
      (rsvpRows || []).forEach(function (r) {
        if (r.user_id && r.user_id !== userId) seen.rsvpKeys.add(r.event_id + ":" + r.user_id);
      });
      seen.rsvpInit = true;
      N.saveSeen(seen);
      N.flushSeen();
    }

    var newRsvps = (rsvpRows || []).filter(function (r) {
      if (!r.user_id || r.user_id === userId) return false;
      var key = r.event_id + ":" + r.user_id;
      return !seen.rsvpKeys.has(key);
    });

    if (newRsvps.length) {
      var uids = [...new Set(newRsvps.map(function (r) { return r.user_id; }))];
      var { data: rprofs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, preferred_name, computing_id")
        .in("id", uids);
      var rpmap = new Map((rprofs || []).map(function (p) { return [p.id, p]; }));

      newRsvps.forEach(function (r) {
        seen.rsvpKeys.add(r.event_id + ":" + r.user_id);
        N.add({
          id: "rsvp-" + r.id,
          type: "rsvp",
          title: "New RSVP",
          body: displayName(rpmap.get(r.user_id)) + " RSVP’d to " + (titleByEvent.get(r.event_id) || "your event") + ".",
          href: "home.html#" + encodeURIComponent(r.event_id),
          ts: new Date(r.created_at || Date.now()).getTime(),
        });
      });
      N.saveSeen(seen);
      N.flushSeen();
    }
  }

  /* —— Messages (skip backlog on first msg init) —— */
  var { data: msgRows } = await supabase
    .from("messages")
    .select("id, sender_id, text, created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!seen.msgInit) {
    (msgRows || []).forEach(function (m) { seen.messageIds.add(m.id); });
    seen.msgInit = true;
    N.saveSeen(seen);
    N.flushSeen();
    return;
  }

  for (var i = 0; i < (msgRows || []).length; i++) {
    var m = msgRows[i];
    if (seen.messageIds.has(m.id)) continue;
    seen.messageIds.add(m.id);
    var res = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, computing_id")
      .eq("id", m.sender_id)
      .maybeSingle();
    var name = displayName(res.data);
    var preview = String(m.text || "").slice(0, 80);
    if ((m.text || "").length > 80) preview += "…";
    N.add({
      id: "msg-" + m.id,
      type: "message",
      title: "New message",
      body: name + ": " + preview,
      href: "messages.html?with=" + encodeURIComponent(m.sender_id),
      ts: new Date(m.created_at || Date.now()).getTime(),
    });
  }
  N.saveSeen(seen);
  N.flushSeen();
}
