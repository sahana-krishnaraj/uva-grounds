import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { redirectIfProfileIncomplete } from "./profile-gate.js";
import { ensureHoosOutOnlinePresence } from "./presence-channel.js";
import { syncProfileToLocalStorage, applyCachedProfileToMeDom } from "./profile-cache.js";
import { initMePage } from "./me-page.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";

const meUser = await requireAuth();
if (!meUser) throw new Error("");
if (await redirectIfProfileIncomplete(meUser)) throw new Error("redirect");
ensureHoosOutOnlinePresence(meUser.id);
await syncProfileToLocalStorage();
applyCachedProfileToMeDom();
if (window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.initMeEditor === "function") {
  window.HoosOutProfilePhoto.initMeEditor(document.body);
}
const uvaLink = document.getElementById("nav-uva-cville");
if (uvaLink && window.HoosOutSession) {
  if (window.HoosOutSession.isSignedIn()) uvaLink.removeAttribute("hidden");
  else uvaLink.setAttribute("hidden", "");
}
const out = document.getElementById("nav-logout");
if (out) {
  out.addEventListener("click", async () => {
    await supabase.auth.signOut();
    if (window.HoosOutSession) window.HoosOutSession.signOut();
  });
}
await initMePage();
await initNavActivityBadge();
