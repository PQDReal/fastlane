import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'

import sharp from 'sharp'

import {
  buildVfVisualAssetInventory,
  buildVisualKnowledgeEvalSet,
  toJsonLines,
} from './lib/vf-visual-asset-inventory-build.mjs'

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

function mimeTypeForFormat(format) {
  const values = {
    avif: 'image/avif',
    gif: 'image/gif',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    tiff: 'image/tiff',
    webp: 'image/webp',
  }
  return values[format] || `image/${format || 'unknown'}`
}

const rootDirectory = path.resolve(valueAfter('--workbench', '.local/vf-image-agent'))
const analysisDirectory = path.resolve(valueAfter(
  '--analysis',
  '.local/knowledge-build/v2/visual-analysis',
))
const outputDirectory = path.resolve(valueAfter('--output', analysisDirectory))
const mapPath = path.join(rootDirectory, 'state', 'image-map.v1.jsonl')
const completedPath = path.join(rootDirectory, 'state', 'completed-images.jsonl')
const annotationsDirectory = path.join(rootDirectory, 'annotations')
const imagesDirectory = path.join(rootDirectory, 'cache', 'images')
const packetsPath = path.join(analysisDirectory, 'vf-visual-analysis-packets.v1.jsonl')
const qaLabelsPath = path.join(analysisDirectory, 'vf-visual-garbage-filter-qa-labels.v1.json')

const [mapRows, completedRows, packetRows] = await Promise.all([
  readJsonLines(mapPath),
  readJsonLines(completedPath),
  readJsonLines(packetsPath),
])
const completedByPacket = new Map(completedRows.map((row) => [row.packetId, row]))
const packetsById = new Map(packetRows.map((packet) => [packet.packetId, packet]))
const qaLabelsDocument = fs.existsSync(qaLabelsPath)
  ? JSON.parse(await readFile(qaLabelsPath, 'utf8'))
  : { labels: [] }
const qaLabelsBySha256 = new Map(
  (qaLabelsDocument.labels || []).map((label) => [label.sha256, label]),
)
const annotationsByPacket = new Map()
for (const mapRow of mapRows) {
  const completed = completedByPacket.get(mapRow.packetId)
  const annotationPath = completed?.annotationPath
    || path.join(annotationsDirectory, `${mapRow.packetId}.json`)
  annotationsByPacket.set(
    mapRow.packetId,
    JSON.parse(await readFile(annotationPath, 'utf8')),
  )
}

const imageFiles = (await fs.promises.readdir(imagesDirectory))
  .filter((fileName) => /^\d{6}-/.test(fileName))
  .sort()
const rawImages = []
for (const fileName of imageFiles) {
  const absolutePath = path.join(imagesDirectory, fileName)
  const bytes = await readFile(absolutePath)
  rawImages.push({
    sequence: Number(fileName.slice(0, 6)),
    absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.length,
  })
}

const representativeByHash = new Map()
for (const image of rawImages) {
  if (!representativeByHash.has(image.sha256)) representativeByHash.set(image.sha256, image)
}
const metadataByHash = new Map()
for (const [sha256, representative] of representativeByHash) {
  const metadata = await sharp(representative.absolutePath).metadata()
  if (!metadata.format || !metadata.width || !metadata.height) {
    throw new Error(`Missing image metadata for ${representative.relativePath}`)
  }
  metadataByHash.set(sha256, {
    format: metadata.format,
    mimeType: mimeTypeForFormat(metadata.format),
    width: metadata.width,
    height: metadata.height,
  })
}
const imageRows = rawImages.map((image) => ({
  ...image,
  ...metadataByHash.get(image.sha256),
}))

const result = buildVfVisualAssetInventory({
  mapRows,
  imageRows,
  annotationsByPacket,
  packetsById,
  qaLabelsBySha256,
})
const outputPaths = {
  inventory: path.join(outputDirectory, 'vf-visual-asset-inventory.v1.jsonl'),
  report: path.join(outputDirectory, 'vf-visual-asset-inventory-report.v1.json'),
  qaSample: path.join(outputDirectory, 'vf-visual-garbage-filter-sample.v1.json'),
  evalSet: path.join(outputDirectory, 'vf-visual-retrieval-eval-set.v1.json'),
}
const evalSet = buildVisualKnowledgeEvalSet({
  assets: result.assets,
  qaSample: result.qaSample,
  annotationsByPacket,
})
await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(outputPaths.inventory, toJsonLines(result.assets), 'utf8'),
  writeFile(
    outputPaths.report,
    `${JSON.stringify({ ...result.report, generatedAt: new Date().toISOString(), outputs: outputPaths }, null, 2)}\n`,
    'utf8',
  ),
  writeFile(outputPaths.qaSample, `${JSON.stringify(result.qaSample, null, 2)}\n`, 'utf8'),
  writeFile(outputPaths.evalSet, `${JSON.stringify(evalSet, null, 2)}\n`, 'utf8'),
])

process.stdout.write(`${JSON.stringify({ ...result.report, outputs: outputPaths }, null, 2)}\n`)
