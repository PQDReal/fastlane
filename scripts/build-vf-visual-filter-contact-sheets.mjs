import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

const analysisDirectory = path.resolve('.local/knowledge-build/v2/visual-analysis')
const sample = JSON.parse(await readFile(
  path.join(analysisDirectory, 'vf-visual-garbage-filter-sample.v1.json'),
  'utf8',
))

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

async function buildSheet(rows, outputPath, title) {
  const columns = 5
  const cellWidth = 240
  const cellHeight = 210
  const headerHeight = 50
  const sheetWidth = columns * cellWidth
  const sheetHeight = headerHeight + Math.ceil(rows.length / columns) * cellHeight
  const composites = [{
    input: Buffer.from(`<svg width="${sheetWidth}" height="${headerHeight}">
      <rect width="100%" height="100%" fill="#111827"/>
      <text x="20" y="33" font-size="24" fill="#ffffff" font-family="Arial">${escapeXml(title)}</text>
    </svg>`),
    top: 0,
    left: 0,
  }]

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const column = index % columns
    const line = Math.floor(index / columns)
    const top = headerHeight + line * cellHeight
    const left = column * cellWidth
    const thumbnail = await sharp(path.resolve(row.imagePath))
      .resize(220, 150, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer()
    composites.push({ input: thumbnail, top: top + 8, left: left + 10 })
    composites.push({
      input: Buffer.from(`<svg width="${cellWidth}" height="52">
        <rect width="100%" height="100%" fill="#f3f4f6"/>
        <text x="8" y="18" font-size="13" fill="#111827" font-family="Arial">#${row.representativeSequence} ${escapeXml(row.imageType)}</text>
        <text x="8" y="37" font-size="11" fill="#374151" font-family="Arial">${row.width}x${row.height} · reuse ${row.reuseCount} · ${escapeXml((row.reasonCodes || []).join(','))}</text>
      </svg>`),
      top: top + 158,
      left,
    })
  }

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: '#d1d5db',
    },
  }).composite(composites).png().toFile(outputPath)
}

await mkdir(analysisDirectory, { recursive: true })
const outputs = {
  eligibleReview: path.join(analysisDirectory, 'vf-visual-filter-positive-sample.v1.png'),
  possibleDecorative: path.join(analysisDirectory, 'vf-visual-filter-possible-decorative-sample.v1.png'),
}
await Promise.all([
  buildSheet(sample.strata.eligibleReview, outputs.eligibleReview, 'VF visual filter — positive/eligible sample'),
  buildSheet(sample.strata.possibleDecorative, outputs.possibleDecorative, 'VF visual filter — possible decorative/icon sample'),
])
process.stdout.write(`${JSON.stringify({
  eligibleReviewCount: sample.strata.eligibleReview.length,
  possibleDecorativeCount: sample.strata.possibleDecorative.length,
  outputs,
}, null, 2)}\n`)
