import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runtimeFile } from './paths.mjs';

/** Read runtime.json; missing or corrupt files read as null. */
export function readRuntime(env = process.env) {
  const file = runtimeFile(env);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    try {
      rmSync(file, { force: true });
    } catch {
      // ignore: best-effort cleanup of a corrupt file
    }
    return null;
  }
}

export function writeRuntime(data, env = process.env) {
  const file = runtimeFile(env);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function clearRuntime(env = process.env) {
  rmSync(runtimeFile(env), { force: true });
}
