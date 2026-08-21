#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { correctNormalizedDataset } from './lib/after-sales-normalized-corrector.mjs'

function usage() {
  console.error(
    'Usage: node scripts/rebuild-after-sales-normalized.mjs '
      + '<input.json> <output.json> [manifest.json]',
  )
}

const [inputFile, outputFile, manifestFile] = process.argv.slice(2)

if (!inputFile || !outputFile) {
  usage()
  process.exitCode = 2
} else {
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'))
  const manifest = manifestFile
    ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    : null
  const corrected = correctNormalizedDataset(input, {
    modelPowertrains: manifest?.modelPowertrains,
    normalizedAt: new Date().toISOString(),
  })

  fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true })
  fs.writeFileSync(outputFile, `${JSON.stringify(corrected, null, 2)}\n`)

  console.log(JSON.stringify({
    output: path.resolve(outputFile),
    schemaVersion: corrected.schemaVersion,
    normalizedFacts: corrected.summary.normalizedFacts,
    evidenceCount: corrected.summary.evidenceCount,
    factsNeedingReview: corrected.summary.factsNeedingReview,
  }, null, 2))
}
