// Custom module loader: transform .jsx via esbuild so node can import the
// real component chain (used by tests/study-panel.render.test.mjs).
import { readFileSync, existsSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  // Extensionless relative imports (the app relies on Vite's resolution):
  // try .js/.jsx against the importing directory.
  if (specifier.startsWith('.')) {
    const base = new URL(specifier, context.parentURL || pathToFileURL(process.cwd() + '/'));
    if (base.protocol === 'file:' && !/\.(js|mjs|jsx|css|json)$/.test(base.pathname)) {
      for (const ext of ['.js', '.jsx']) {
        const candidate = base.href + ext;
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate, shortCircuit: true, format: 'module' };
        }
      }
    }
  }
  if (specifier.endsWith('.jsx')) {
    const base = new URL(specifier, context.parentURL || pathToFileURL(process.cwd() + '/'));
    return { url: base.href, shortCircuit: true, format: 'module' };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    const file = fileURLToPath(url);
    const source = readFileSync(file, 'utf8');
    const out = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
    return { source: out.code, format: 'module', shortCircuit: true };
  }
  return nextLoad(url, context);
}
