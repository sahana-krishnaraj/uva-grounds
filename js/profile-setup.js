/**
 * Onboarding profile.html — save to Supabase Storage + profiles + localStorage, then redirect.
 */
import { supabase } from "./supabase.js";
import { uploadAvatarFromDataUrl } from "./avatar-upload.js";

function fieldTrim(id) {
  var el = document.getElementById(id);
  return el && el.value != null ? String(el.value).trim() : "";
}

function showStatus(el, msg, isErr) {
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
  el.style.color = isErr ? "#b91c1c" : "var(--text-muted)";
}

(async function () {
  var sessionRes = await supabase.auth.getSession();
  var user = sessionRes.data && sessionRes.data.session ? sessionRes.data.session.user : null;
  if (!user) {
    var gu = await supabase.auth.getUser();
    user = gu.data && gu.data.user ? gu.data.user : null;
  }
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  var savedDbAvatar = "";
  var pr = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  if (pr.data && pr.data.avatar_url) savedDbAvatar = String(pr.data.avatar_url).trim();

  var form = document.getElementById("profile-form");
  var statusEl = document.getElementById("profile-setup-status");
  if (!form) return;

  if (window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.initMeEditor === "function") {
    window.HoosOutProfilePhoto.initMeEditor(document.body);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;

    var btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving…";
    }
    showStatus(statusEl, "Saving your profile…", false);

    var firstName = fieldTrim("first-name");
    var lastName = fieldTrim("last-name");
    var preferredName = fieldTrim("preferred-name");
    var photoDataUrl =
      window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.get === "function"
        ? window.HoosOutProfilePhoto.get() || ""
        : "";

    var cleared =
      window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.wasAvatarExplicitlyCleared === "function"
        ? window.HoosOutProfilePhoto.wasAvatarExplicitlyCleared()
        : false;

    var avatarPublicUrl = null;
    if (cleared) {
      avatarPublicUrl = null;
      if (window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.clearAvatarRemovedFlag === "function") {
        window.HoosOutProfilePhoto.clearAvatarRemovedFlag();
      }
    } else if (photoDataUrl) {
      showStatus(statusEl, "Uploading your photo…", false);
      avatarPublicUrl = await uploadAvatarFromDataUrl(user.id, photoDataUrl);
      if (!avatarPublicUrl) {
        showStatus(
          statusEl,
          "Could not upload your photo. Create the public “avatars” bucket (see supabase/migrations/004) or try a smaller image.",
          true
        );
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Save & Go to Feed";
        }
        return;
      }
    } else {
      avatarPublicUrl = savedDbAvatar || null;
    }

    var profileLocal = {
      firstName,
      lastName,
      preferredName,
      pronouns: fieldTrim("pronouns"),
      year: document.getElementById("year") ? document.getElementById("year").value : "",
      location: fieldTrim("location-dorm"),
      interests: fieldTrim("interests"),
      vibe: fieldTrim("vibe"),
      schedule: fieldTrim("schedule"),
      bio: fieldTrim("bio"),
      computingId: "",
      avatarUrl: avatarPublicUrl || photoDataUrl || "",
    };

    try {
      localStorage.setItem("hoosout_profile", JSON.stringify(profileLocal));
    } catch (err) {
      showStatus(statusEl, "Could not cache profile on this device.", true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save & Go to Feed";
      }
      return;
    }

    var row = {
      id: user.id,
      first_name: firstName || null,
      last_name: lastName || null,
      preferred_name: preferredName || null,
      pronouns: profileLocal.pronouns || null,
      year: profileLocal.year || null,
      location: profileLocal.location || null,
      interests: profileLocal.interests || null,
      vibe: profileLocal.vibe || null,
      schedule: profileLocal.schedule || null,
      bio: profileLocal.bio || null,
      avatar_url: avatarPublicUrl,
    };

    var up = await supabase.from("profiles").upsert(row, { onConflict: "id" });
    if (up.error) {
      showStatus(statusEl, up.error.message || "Could not save profile.", true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save & Go to Feed";
      }
      return;
    }

    var metaCid = "";
    if (user.user_metadata && user.user_metadata.computing_id) {
      metaCid = String(user.user_metadata.computing_id).trim();
    }
    if (!metaCid && user.email) {
      var em0 = String(user.email).trim();
      var at0 = em0.indexOf("@");
      if (at0 > 0) metaCid = em0.slice(0, at0);
    }
    await supabase.auth.updateUser({
      data: {
        first_name: firstName,
        last_name: lastName,
        preferred_name: preferredName,
        computing_id: metaCid || null,
      },
    });

    showStatus(statusEl, "Saved! Taking you to your feed…", false);
    if (window.HoosOutSession) window.HoosOutSession.signIn();
    window.location.href = "home.html";
  });
})();
