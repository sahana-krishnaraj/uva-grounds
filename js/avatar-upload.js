/**
 * Upload a canvas/data-URL avatar into Supabase Storage (public bucket `avatars`).
 */
import { supabase } from "./supabase.js";

const BUCKET = "avatars";

/**
 * @param {string} userId
 * @param {string} dataUrl data:image/...;base64,...
 * @returns {Promise<string|null>} public URL or null
 */
export async function uploadAvatarFromDataUrl(userId, dataUrl) {
  if (!userId || !dataUrl || !String(dataUrl).startsWith("data:image")) return null;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
    const ext = type === "image/png" ? "png" : "jpg";
    const path = userId + "/avatar." + ext;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: type,
      cacheControl: "3600",
    });
    if (error) {
      console.warn("HoosOut: avatar upload", error.message);
      return null;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data && data.publicUrl ? data.publicUrl : null;
  } catch (e) {
    console.warn("HoosOut: avatar upload", e);
    return null;
  }
}
