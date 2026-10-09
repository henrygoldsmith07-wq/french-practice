// The single definition of Le Studio's HTTP security headers.
//
// Vercel applies these to the deployed site (vercel.json), and the Vite
// dev/preview server applies the same set (vite.config.js) so that the
// Playwright suite exercises the real policy rather than a permissive local
// one. Keep the two in sync — `npm run check` pins them together.

// Content Security Policy. The app is a Vite SPA:
//   - 'self' for everything, since all JS/CSS is first-party and hashed.
//   - The worker and the audio pipeline both need blob:/data: (MediaRecorder
//     chunks, WAV re-encoding), and inline <style> blocks exist in index.html.
//   - connect-src allowlists ONLY the app's own origin, the AI relay (which is
//     how the free, no-key path reaches the model) and the direct provider
//     endpoints used by bring-your-own-key mode. The relay path is relative
//     (/api/relay) so it inherits the deployment origin; the absolute forms
//     cover a relay hosted on another domain. archive.org streams the
//     provenance-verified public-domain audio.
//   - frame-ancestors 'none': nothing embeds Le Studio, so nothing needs to.
//   - microphone=() — the app asks for the mic itself, but Le Studio must never
//     be embedded by a third party that could capture audio.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Vite emits a modulepreload graph and small inline styles; no inline scripts
  // are used outside the theme bootstrap, which is hash-free and tiny.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data: https://archive.org",
  "worker-src 'self' blob:",
  "connect-src 'self' https://integrate.api.nvidia.com https://archive.org",
  "frame-src 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
];

// The 'unsafe-inline' in script-src is a deliberate, scoped exception for the
// pre-paint theme bootstrap in index.html: without it the first paint flashes
// the wrong theme. Everything else is 'self'.
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP_DIRECTIVES.join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Camera and geolocation are never used; the microphone is only ever
  // requested by Le Studio's own UI, never by an embedding frame.
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
});
