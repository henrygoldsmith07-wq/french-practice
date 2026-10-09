// Single source of truth for the public site URL.
//
// The canonical/OG/Twitter tags in index.html, the sitemap, robots.txt and
// llms.txt must all name the SAME deployment. They used to drift: index.html
// pointed at `claude-code-alpha-nine.vercel.app` (a deployment that no longer
// exists) while the app itself was served from elsewhere, so crawlers and
// share previews sent people to a 404.
//
// Set SITE_URL in the build environment to the deployment that actually serves
// the app. It falls back to the project's default production host so a plain
// `npm run build` is never wrong in a way that ships a dead link.
//
// `verifyPublicUrls.mjs` reads this value and fails the build if any of the
// public-facing files disagree with it.

const DEFAULT_SITE_URL = 'https://le-studio-french.vercel.app';

export const SITE_URL = String(process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');

/** Absolute URL for a site-root-relative path, e.g. site('/llms.txt'). */
export function siteUrl(path = '/') {
  const suffix = String(path || '/').startsWith('/') ? String(path) : `/${path}`;
  return `${SITE_URL}${suffix}`;
}
