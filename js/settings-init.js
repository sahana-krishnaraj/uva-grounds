import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";
import { uploadAvatarFromDataUrl } from "./avatar-upload.js";
import { unblockUser } from "./user-safety.js";

const user = await requireAuth();
if (!user) throw new Error("auth");

const statusEl = document.getElementById("settings-status");
function flash(msg, isError) {
  if (!statusEl) return;
  statusEl.style.display = "block";
  statusEl.style.color = isError ? "#b91c1c" : "var(--text-muted)";
  statusEl.textContent = msg;
}

function rowToLocal(row) {
  return {
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    preferredName: row.preferred_name || "",
    pronouns: row.pronouns || "",
    year: row.year || "",
    location: row.location || "",
    interests: row.interests || "",
    schedule: row.schedule || "",
    bio: row.bio || "",
    avatarUrl: row.avatar_url || "",
  };
}

function fillFormFromLocal(p) {
  document.getElementById("first-name").value = p.firstName || "";
  document.getElementById("last-name").value = p.lastName || "";
  document.getElementById("preferred-name").value = p.preferredName || "";
  document.getElementById("pronouns").value = p.pronouns || "";
  document.getElementById("year").value = p.year || "";
  document.getElementById("location-dorm").value = p.location || "";
  document.getElementById("interests").value = p.interests || "";
  document.getElementById("schedule").value = p.schedule || "";
  document.getElementById("bio").value = p.bio || "";
}

const { data: row } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
let savedAvatarUrl = row && row.avatar_url ? String(row.avatar_url).trim() : "";
if (row) fillFormFromLocal(rowToLocal(row));

document.getElementById("account-email").value = user.email || "";

const { data: prefRow } = await supabase
  .from("user_preferences")
  .select("*")
  .eq("user_id", user.id)
  .maybeSingle();
const prefs = prefRow || {
  dark_mode: true,
  notify_rsvp: true,
  notify_likes: true,
  notify_comments: true,
  notify_messages: true,
  notify_followers: true,
  profile_visibility: "public",
};

document.getElementById("notify-rsvp").checked = !!prefs.notify_rsvp;
document.getElementById("notify-likes").checked = !!prefs.notify_likes;
document.getElementById("notify-comments").checked = !!prefs.notify_comments;
document.getElementById("notify-messages").checked = !!prefs.notify_messages;
document.getElementById("notify-followers").checked = !!prefs.notify_followers;
document.getElementById("profile-visibility").value = prefs.profile_visibility || "public";

if (window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.initMeEditor === "function") {
  window.HoosOutProfilePhoto.initMeEditor(document.body);
}

async function savePreferences() {
  const payload = {
    user_id: user.id,
    dark_mode: true,
    notify_rsvp: !!document.getElementById("notify-rsvp").checked,
    notify_likes: !!document.getElementById("notify-likes").checked,
    notify_comments: !!document.getElementById("notify-comments").checked,
    notify_messages: !!document.getElementById("notify-messages").checked,
    notify_followers: !!document.getElementById("notify-followers").checked,
    profile_visibility: document.getElementById("profile-visibility").value || "public",
  };
  const { error } = await supabase.from("user_preferences").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

[
  "notify-rsvp",
  "notify-likes",
  "notify-comments",
  "notify-messages",
  "notify-followers",
  "profile-visibility",
].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", async () => {
    try {
      await savePreferences();
      flash("Preferences saved.", false);
    } catch (e) {
      flash(e.message || "Could not save preferences.", true);
    }
  });
});

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.reportValidity()) return;
  const profile = {
    firstName: document.getElementById("first-name").value.trim(),
    lastName: document.getElementById("last-name").value.trim(),
    preferredName: document.getElementById("preferred-name").value.trim(),
    pronouns: document.getElementById("pronouns").value.trim(),
    year: document.getElementById("year").value,
    location: document.getElementById("location-dorm").value.trim(),
    interests: document.getElementById("interests").value.trim(),
    schedule: document.getElementById("schedule").value.trim(),
    bio: document.getElementById("bio").value.trim(),
  };
  if (profile.preferredName.length > 7) {
    flash("Username must be 7 characters or fewer.", true);
    return;
  }

  const photoDataUrl =
    window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.get === "function"
      ? window.HoosOutProfilePhoto.get() || ""
      : "";
  const cleared =
    window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.wasAvatarExplicitlyCleared === "function"
      ? window.HoosOutProfilePhoto.wasAvatarExplicitlyCleared()
      : false;

  let avatar_url = null;
  if (cleared) {
    avatar_url = null;
    if (window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.clearAvatarRemovedFlag === "function") {
      window.HoosOutProfilePhoto.clearAvatarRemovedFlag();
    }
  } else if (photoDataUrl) {
    const up = await uploadAvatarFromDataUrl(user.id, photoDataUrl);
    if (!up) {
      flash("Could not upload photo. Check the avatars bucket setup.", true);
      return;
    }
    avatar_url = up;
  } else {
    avatar_url = savedAvatarUrl || null;
  }

  const up = {
    id: user.id,
    first_name: profile.firstName || null,
    last_name: profile.lastName || null,
    preferred_name: profile.preferredName || null,
    pronouns: profile.pronouns || null,
    year: profile.year || null,
    location: profile.location || null,
    interests: profile.interests || null,
    schedule: profile.schedule || null,
    bio: profile.bio || null,
    avatar_url,
  };
  const { error } = await supabase.from("profiles").upsert(up, { onConflict: "id" });
  if (error) {
    flash(error.message || "Could not save profile.", true);
    return;
  }
  await supabase.auth.updateUser({
    data: {
      first_name: profile.firstName,
      last_name: profile.lastName,
      preferred_name: profile.preferredName,
    },
  });
  savedAvatarUrl = avatar_url || "";
  flash("Profile updated.", false);
});

document.getElementById("account-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = document.getElementById("account-email").value.trim();
  const pw = document.getElementById("new-password").value;
  const pw2 = document.getElementById("confirm-password").value;
  if (pw || pw2) {
    if (pw.length < 8) return flash("Password must be at least 8 characters.", true);
    if (pw !== pw2) return flash("Password confirmation does not match.", true);
  }
  const payload = {};
  if (email && email !== (user.email || "")) payload.email = email;
  if (pw) payload.password = pw;
  if (!Object.keys(payload).length) return flash("No account changes to save. Update email or password first.", true);
  if (submitBtn) submitBtn.disabled = true;
  const { error } = await supabase.auth.updateUser(payload);
  if (submitBtn) submitBtn.disabled = false;
  if (error) {
    flash(error.message || "Could not save account changes.", true);
    alert(error.message || "Could not save account changes.");
    return;
  }
  document.getElementById("new-password").value = "";
  document.getElementById("confirm-password").value = "";
  flash("Account changes saved.", false);
  alert("Account changes saved.");
});

async function loadBlockedUsers() {
  const mount = document.getElementById("blocked-users-list");
  const { data } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id);
  const ids = (data || []).map((r) => r.blocked_id).filter(Boolean);
  if (!ids.length) {
    mount.innerHTML = '<p class="me-empty" style="margin:0;border:none">No blocked users.</p>';
    return;
  }
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, preferred_name, computing_id")
    .in("id", ids);
  mount.innerHTML = (profs || [])
    .map((p) => {
      const name =
        p.preferred_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.computing_id || "Student";
      return (
        '<div class="settings-row"><span>' +
        name +
        '</span><button class="btn btn-ghost btn-sm js-unblock" data-id="' +
        p.id +
        '">Unblock</button></div>'
      );
    })
    .join("");
  mount.querySelectorAll(".js-unblock").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-id");
      const { error } = await unblockUser(user.id, id);
      if (error) return flash(error.message, true);
      await loadBlockedUsers();
      flash("User unblocked.", false);
    });
  });
}

document.getElementById("feedback-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const msg = document.getElementById("feedback-message").value.trim();
  if (!msg) return flash("Please enter feedback before submitting.", true);
  if (submitBtn) submitBtn.disabled = true;
  const { error } = await supabase.from("moderation_reports").insert({
    reporter_id: user.id,
    report_type: "user",
    reported_user_id: user.id,
    reason: "[FEEDBACK] " + msg,
  });
  if (submitBtn) submitBtn.disabled = false;
  if (error) {
    flash(error.message || "Could not send feedback.", true);
    alert(error.message || "Could not send feedback.");
    return;
  }
  document.getElementById("feedback-message").value = "";
  flash("Feedback sent. Thank you.", false);
  alert("Feedback sent. Thank you.");
});

document.getElementById("delete-account-btn").addEventListener("click", async () => {
  const deleteBtn = document.getElementById("delete-account-btn");
  const ok = window.confirm("Delete your account and associated data? This action cannot be undone.");
  if (!ok) return;
  if (deleteBtn) deleteBtn.disabled = true;
  const sessionRes = await supabase.auth.getSession();
  const accessToken = sessionRes && sessionRes.data && sessionRes.data.session ? sessionRes.data.session.access_token : null;
  if (!accessToken) {
    if (deleteBtn) deleteBtn.disabled = false;
    flash("Could not verify your session. Please log in again and retry.", true);
    alert("Could not verify your session. Please log in again and retry.");
    return;
  }
  const { data, error } = await supabase.functions.invoke("delete-account", {
    headers: {
      Authorization: "Bearer " + accessToken,
    },
    body: { confirmDelete: true },
  });
  if (deleteBtn) deleteBtn.disabled = false;
  if (error) {
    const rawMsg = error.message || "Could not delete account.";
    const lower = String(rawMsg).toLowerCase();
    const msg =
      lower.includes("failed to send a request") || lower.includes("fetch")
        ? "Delete account is not available yet (edge function not deployed/reachable). Ask a developer to deploy Supabase function: delete-account."
        : rawMsg;
    flash(msg, true);
    alert(msg);
    return;
  }
  if (!data || !data.ok) {
    const msg = "Could not delete account. If this continues, confirm edge function delete-account is deployed with service role secret.";
    flash(msg, true);
    alert(msg);
    return;
  }
  if (window.HoosOutSession) window.HoosOutSession.signOut();
  flash("Account deleted.", false);
  alert("Account deleted.");
  setTimeout(() => (window.location.href = "index.html"), 900);
});

document.getElementById("nav-logout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  if (window.HoosOutSession) window.HoosOutSession.signOut();
});

await loadBlockedUsers();
await initNavActivityBadge();
