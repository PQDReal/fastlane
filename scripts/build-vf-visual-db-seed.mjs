import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'

import {
  buildVfVisualDbSeed,
  toJsonLines,
} from './lib/vf-visual-db-seed-build.mjs'

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

async function readJsonLines(filePath) {
  const rows = []
  const lines = createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line))
  }
  return rows
}

const analysisDirectory = path.resolve(valueAfter(
  '--analysis',
  '.local/knowledge-build/v2/visual-analysis',
))
const workbenchDirectory = path.resolve(valueAfter('--workbench', '.local/vf-image-agent'))
const outputDirectory = path.resolve(valueAfter(
  '--output',
  path.join(analysisDirectory, 'db-seed'),
))

const [inventoryAssets, visualOccurrences, completedRows] = await Promise.all([
  readJsonLines(path.join(analysisDirectory, 'vf-visual-asset-inventory.v1.jsonl')),
  readJsonLines(path.join(analysisDirectory, 'vf-visual-occurrences.v1.jsonl')),
  readJsonLines(path.join(workbenchDirectory, 'state', 'completed-images.jsonl')),
])
const documents = await readJsonLines(path.resolve('.local/knowledge-build/v2/documents.jsonl'))
const documentsByKey = new Map(documents.map((document) => [document.documentKey, document]))
const annotationsByPacket = new Map()
for (const completed of completedRows) {
  annotationsByPacket.set(
    completed.packetId,
    JSON.parse(await readFile(completed.annotationPath, 'utf8')),
  )
}

const result = buildVfVisualDbSeed({
  inventoryAssets,
  visualOccurrences,
  annotationsByPacket,
  documentsByKey,
})
const outputPaths = {
  assets: path.join(outputDirectory, 'assets.v1.jsonl'),
  occurrences: path.join(outputDirectory, 'occurrences.v1.jsonl'),
  annotations: path.join(outputDirectory, 'annotations.v1.jsonl'),
  report: path.join(outputDirectory, 'report.v1.json'),
}
await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(outputPaths.assets, toJsonLines(result.assets), 'utf8'),
  writeFile(outputPaths.occurrences, toJsonLines(result.occurrences), 'utf8'),
  writeFile(outputPaths.annotations, toJsonLines(result.annotations), 'utf8'),
  writeFile(
    outputPaths.report,
    `${JSON.stringify({ ...result.report, generatedAt: new Date().toISOString(), outputs: outputPaths }, null, 2)}\n`,
    'utf8',
  ),
])
process.stdout.write(`${JSON.stringify({ ...result.report, outputs: outputPaths }, null, 2)}\n`)
