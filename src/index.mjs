/**
 * Package entry point.
 *
 * The CLI lives in ./cli.mjs (exposed through the `dsh-boss-job` / `boss-job`
 * bins) and the MCP stdio server in ./mcp.mjs. This module exists so the
 * package has a real, importable entry file for npm/registry checks and for
 * hosts that import the package instead of spawning a bin.
 *
 * It has no side effects and starts no browser.
 */
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/** Package name, e.g. "dsh-boss-job". */
export const name = pkg.name;
/** Package version, kept in sync with package.json. */
export const version = pkg.version;
