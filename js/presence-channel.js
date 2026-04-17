/**
 * Shared Realtime presence so DM partners can see online status across app pages.
 */
import { supabase } from "./supabase.js";

let channel = null;
let boundUserId = null;
const presenceSyncListeners = [];

export function onHoosOutPresenceSync(fn) {
  if (typeof fn === "function") presenceSyncListeners.push(fn);
}

function firePresenceSync() {
  presenceSyncListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {}
  });
}

/** @param {string} myId auth user id */
export function ensureHoosOutOnlinePresence(myId) {
  if (!myId) return null;
  if (channel && boundUserId === myId) return channel;
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  boundUserId = myId;
  channel = supabase.channel("hoosout-online", { config: { presence: { key: myId } } });
  channel.on("presence", { event: "sync" }, () => firePresenceSync());
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && channel) {
      await channel.track({ online_at: Date.now() });
    }
  });
  return channel;
}

export function isPartnerOnline(presenceChannel, partnerId) {
  if (!presenceChannel || !partnerId) return false;
  try {
    const state = presenceChannel.presenceState();
    return !!(state && state[partnerId] && state[partnerId].length);
  } catch (e) {
    return false;
  }
}

export function getHoosOutPresenceChannel() {
  return channel;
}
