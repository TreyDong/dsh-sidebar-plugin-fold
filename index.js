// Host half of the sidebar fold bundle: it keeps the user's sidebar layout
// (the order of the plugin entries and the ones that are hidden) in a file
// inside the profile directory, so the browser is not the only place that
// remembers it. The browser half reads and writes the file through the small
// HTTP route this plugin registers.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** The exact route the browser reads and writes. */
const STATE_PATH = '/api/sidebar-plugin-fold/state';
/** Where the state file lives, relative to the profile directory. */
const STATE_FILE = join('.sidebar-plugin-fold', 'state.json');
/** Largest accepted id list per field. */
const MAX_IDS = 64;
/** Largest accepted id length. */
const MAX_ID_LENGTH = 128;

/**
 * Keep only the fields the browser may set: two lists of ids.
 * @param {unknown} value - The candidate state.
 * @returns {{ order: string[], hidden: string[] } | null} The accepted state.
 */
function sanitizeState(value) {
  if (value === null || typeof value !== 'object') return null;
  const take = (list) => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((id) => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH)
      .slice(0, MAX_IDS);
  };
  return { order: take(value.order), hidden: take(value.hidden) };
}

/**
 * The state file path: inside the profile when there is one, else in the
 * harness home.
 * @param {object} ctx - The plugin context.
 * @returns {string} The absolute path of the state file.
 */
function stateFile(ctx) {
  const profile = ctx.get('profileContext');
  const home = ctx.get('homePaths')?.home ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return resolve(profile?.dir ?? home, STATE_FILE);
}

/**
 * Serve the sidebar layout over one exact route.
 * @param {object} ctx - The plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  const file = stateFile(ctx);

  const readState = async () => {
    try {
      return sanitizeState(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      return null;
    }
  };

  const writeState = async (state) => {
    const clean = sanitizeState(state);
    if (clean === null) throw new Error('sidebar-plugin-fold: the state needs order and hidden lists');
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, file);
    return clean;
  };

  ctx.inject(['connection'], (scope) => {
    scope.effect(() => scope.connection.fetch.register({
      path: STATE_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        if (request.method === 'POST') {
          let body;
          try {
            body = await request.json();
          } catch {
            return new Response(JSON.stringify({ error: 'invalid-json' }), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            });
          }
          const saved = await writeState(body);
          return new Response(JSON.stringify({ ok: true, state: saved }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const state = await readState();
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    }), `sidebar-plugin-fold: ${STATE_PATH}`);
  });
}
