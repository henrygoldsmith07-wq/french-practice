// Registers the JSX loader for node --import usage:
//   node --import ./tests/register-jsx.mjs tests/study-panel.render.test.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./jsx-loader.mjs', pathToFileURL('./tests/'));
