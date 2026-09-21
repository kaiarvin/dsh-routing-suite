#!/usr/bin/env node
/**
 * Self-contained build for the injector bundles (package.json `build`).
 *
 * The built `lib/` is committed, so no install route (git, path, registry)
 * needs a build step — and a `prepare` script here would force pnpm to demand
 * an allowBuilds entry for every git install. `npm run build` forces a rebuild;
 * without `--force` the script is a no-op when lib/ is already present.
 *
 * Strategy:
 *   1. Use a locally installed tsdown (devDependency, installed for git deps
 *      by npm/pnpm) when available.
 *   2. Otherwise fall back to `npx --yes tsdown` (downloads on first use).
 *
 * Failing loudly on build errors is intentional: an install that ends with a
 * broken lib/ is worse than one that stops with a clear message.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// prepare.mjs lives in scripts/, so the package root is one level up.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TSDOWN_RANGE = 'tsdown@^0.22.14'
const REQUIRED = ['lib/index.js', 'lib/client.js']
const FORCE = process.argv.includes('--force')

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  return result.status
}

function localTsdownBin() {
  const bin = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsdown.cmd' : 'tsdown')
  return existsSync(bin) ? bin : undefined
}

function verifyOutputs() {
  for (const file of REQUIRED) {
    if (!existsSync(join(ROOT, file))) {
      return false
    }
  }
  return true
}

function main() {
  if (!FORCE && verifyOutputs()) {
    console.log('[prepare] lib/ already built — skipping tsdown run')
    return 0
  }

  const bin = localTsdownBin()
  let status
  if (bin !== undefined) {
    console.log('[prepare] building with local tsdown')
    status = run(bin, ['--config', 'tsdown.config.ts'])
  } else {
    console.log(`[prepare] local tsdown not found — fetching ${TSDOWN_RANGE} via npx (first install only)`)
    status = run('npx', ['--yes', TSDOWN_RANGE, '--config', 'tsdown.config.ts'])
  }

  if (status !== 0) {
    console.error('[prepare] tsdown build failed — the plugin cannot load without lib/')
    console.error('[prepare] alternatives: (a) install from the Release tgz (prebuilt), or')
    console.error('[prepare] (b) run "bash scripts/build.sh" with DSH_CHECKOUT set to a dsh source checkout, then reinstall.')
    return status ?? 1
  }
  if (!verifyOutputs()) {
    console.error(`[prepare] build finished but ${REQUIRED.join(', ')} missing`)
    return 1
  }
  return 0
}

process.exit(main())
