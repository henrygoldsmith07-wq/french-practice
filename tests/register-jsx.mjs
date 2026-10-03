// Registers the JSX loader for node --import usage:
//   node --import ./tests/register-jsx.mjs tests/study-panel.render.test.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./jsx-loader.mjs', pathToFileURL('./tests/'));

// Node's fetch() rejects file: URLs, but the content registries (scenarios,
// vocab packs) load their per-language JSON assets through
// fetch(new URL('./asset.json', import.meta.url)). Under the browser that
// works; under node it rejects and the registry resolves empty, which made
// render tests see "no scenarios" and invalidate saved sessions on purpose.
// Wrap fetch so file: requests read from disk — every other request still
// goes to the real fetch, and no browser code changes for the test runner.
const realFetch = globalThis.fetch;
if (typeof realFetch === 'function') {
  globalThis.fetch = async (input, init) => {
    // fetch() may receive a string, a URL instance, or a Request — the URL
    // case is what the content registries use (new URL('./asset.json',
    // import.meta.url)), and its href is on `.href`, not `.url`.
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input && input.url;
    if (typeof url === 'string' && url.startsWith('file:')) {
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const body = await readFile(fileURLToPath(url), 'utf8');
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return realFetch(input, init);
  };
}
