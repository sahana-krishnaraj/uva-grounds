/**
 * Insert rows into public.app_notifications (recipient sees in Activity).
 */
import { supabase } from "./supabase.js";

export async function notifyRsvp({ hostId, actorId, eventId, eventTitle, actorName }) {
  if (!hostId || !actorId || hostId === actorId || !eventId) return;
  var title = "New RSVP";
  var body = (actorName || "Someone") + " RSVP’d to " + (eventTitle || "your event") + ".";
  var ins = await supabase.from("app_notifications").insert({
    recipient_id: hostId,
    actor_id: actorId,
    type: "rsvp",
    title,
    body,
    event_id: eventId,
    read: false,
  });
  if (ins.error) console.warn("notifyRsvp", ins.error.message);
}

export async function notifyDirectMessage({ recipientId, senderId, messageId, senderName, preview }) {
  if (!recipientId || !senderId || recipientId === senderId || !messageId) return;
  var title = "New message";
  var body = (senderName || "Someone") + ": " + (preview || "").slice(0, 120);
  var ins = await supabase.from("app_notifications").insert({
    recipient_id: recipientId,
    actor_id: senderId,
    type: "message",
    title,
    body,
    message_id: messageId,
    read: false,
  });
  if (ins.error) console.warn("notifyDirectMessage", ins.error.message);
}
