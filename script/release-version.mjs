#!/usr/bin/env node
// Checks a version to release: it must be semver, greater than the current
// version in package.json, and not already tagged.
//   node script/release-version.mjs 0.2.0

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

// Semver precedence: < 0 when a < b.
export function compare(a, b) {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  if (!pa[4] || !pb[4]) return (pa[4] ? -1 : 0) + (pb[4] ? 1 : 0);
  const xa = pa[4].split('.');
  const xb = pb[4].split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    if (xa[i] === undefined) return -1;
    if (xb[i] === undefined) return 1;
    const na = /^\d+$/.test(xa[i]);
    const nb = /^\d+$/.test(xb[i]);
    if (na && nb && Number(xa[i]) !== Number(xb[i])) return Number(xa[i]) - Number(xb[i]);
    if (na !== nb) return na ? -1 : 1;
    if (xa[i] !== xb[i]) return xa[i] < xb[i] ? -1 : 1;
  }
  return 0;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2] ?? '';
  if (!SEMVER.test(version)) fail(`\`${version}\` is not a semver version such as 0.2.0 (no leading v)`);
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  if (compare(version, current) <= 0) fail(`${version} is not greater than the current version ${current}`);
  const git = args => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trim();
  const tag = `v${version}`;
  if (git(['tag', '--list', tag])) fail(`tag ${tag} already exists`);
  if (git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) fail(`tag ${tag} already exists on origin`);
  console.log(`releasing ${version} (current ${current})`);
}
