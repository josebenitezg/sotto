export type Profile = { name?: string; picture?: string };

// Google serves account pictures from googleusercontent.com. Anything else is
// dropped so the header never loads an attacker-chosen image.
const pictureHosts = /(^|\.)googleusercontent\.com$/i;

export function profileFromClaims(claims: {
  name?: unknown;
  picture?: unknown;
}): Profile {
  const profile: Profile = {};
  if (typeof claims.name === "string") {
    const name = claims.name.replace(/\s+/g, " ").trim().slice(0, 120);
    if (name) profile.name = name;
  }
  if (typeof claims.picture === "string" && claims.picture.length <= 512) {
    try {
      const url = new URL(claims.picture);
      if (url.protocol === "https:" && pictureHosts.test(url.hostname))
        profile.picture = url.toString();
    } catch {
      /* Not a URL. The header falls back to an initial. */
    }
  }
  return profile;
}
