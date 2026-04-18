/**
 * Normalize profile.avatar_url for <img src> — handles full URLs, data URLs,
 * and storage object paths that were saved without the public base URL.
 */
const BUCKET = "avatars";

/**
 * @param {unknown} raw value from profiles.avatar_url
 * @param {*} supabaseClient Supabase client (same as ./supabase.js)
 */
export function resolveProfileAvatarUrl(raw, supabaseClient) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("data:image")) return s;

  const sb = supabaseClient;
  if (!sb || !sb.storage) return "";

  let path = s.replace(/^\//, "");

  const marker = "/object/public/" + BUCKET + "/";
  const mi = path.indexOf(marker);
  if (mi >= 0) {
    path = path.slice(mi + marker.length);
  } else if (path.startsWith("storage/v1/object/public/" + BUCKET + "/")) {
    path = path.slice(("storage/v1/object/public/" + BUCKET + "/").length);
  } else if (path.startsWith(BUCKET + "/")) {
    path = path.slice(BUCKET.length + 1);
  }

  try {
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data && data.publicUrl ? data.publicUrl : "";
  } catch (e) {
    return "";
  }
}

export function withResolvedAvatarUrl(row, supabaseClient) {
  if (!row) return null;
  return {
    ...row,
    avatar_url: resolveProfileAvatarUrl(row.avatar_url, supabaseClient),
  };
}
