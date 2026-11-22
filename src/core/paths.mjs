import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Root of all runtime data. `BOSS_JOB_HOME` overrides for tests and power users.
 * Never touches the user's real Chrome profile directory.
 */
export function dataDir(env = process.env) {
  return env.BOSS_JOB_HOME || join(homedir(), '.dsh-boss-job');
}

/** Dedicated Chrome profile owned by this tool. */
export function profileDir(env = process.env) {
  return join(dataDir(env), 'chrome-profile');
}

/** One directory per crawl batch: jobs/<timestamp>/{NN.json, all.json}. */
export function jobsDir(ts, env = process.env) {
  return join(dataDir(env), 'jobs', ts);
}

/** One directory per report batch: reports/<timestamp>/report.md. */
export function reportsDir(ts, env = process.env) {
  return join(dataDir(env), 'reports', ts);
}

/** User preferences produced by the interview flow. */
export function prefsFile(env = process.env) {
  return join(dataDir(env), 'preferences.json');
}

/** Chrome PID / CDP endpoint / profile path for the live instance. */
export function runtimeFile(env = process.env) {
  return join(dataDir(env), 'runtime.json');
}
