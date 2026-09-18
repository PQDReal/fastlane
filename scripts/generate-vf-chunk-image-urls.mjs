import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const sourcePath = resolve(process.argv[2] || '.local/knowledge-build/v2/chunks.jsonl')
const outputPath = resolve(
  process.argv[3] || '.local/tasks/sales-agent-visual-knowledge-020/vf-chunk-image-urls.md',
)

const editions = new Map()
const globalUrls = new Set()
let parsedChunks = 0
let vfChunks = 0
let vfChunksWithImages = 0
let imageUrlOccurrences = 0

const lines = createInterface({
  input: createReadStream(sourcePath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
})

for await (const line of lines) {
  if (!line.trim()) continue
  parsedChunks += 1

  const chunk = JSON.parse(line)
  if (typeof chunk.vehicleKey !== 'string' || !chunk.vehicleKey.startsWith('vf-')) continue
  vfChunks += 1

  const images = Array.isArray(chunk.extractedImages) ? chunk.extractedImages : []
  const urls = images
    .map((image) => typeof image?.url === 'string' ? image.url.trim() : '')
    .filter(Boolean)

  if (urls.length === 0) continue
  vfChunksWithImages += 1

  const editionId = String(chunk.editionId || `${chunk.vehicleModel}_${chunk.modelYear}`)
  let edition = editions.get(editionId)
  if (!edition) {
    edition = {
      editionId,
      vehicleKey: String(chunk.vehicleKey),
      vehicleModel: String(chunk.vehicleModel || chunk.vehicleKey),
      modelYear: Number(chunk.modelYear),
      documentKey: String(chunk.documentKey || ''),
      urls: new Set(),
      occurrences: 0,
    }
    editions.set(editionId, edition)
  }

  for (const url of urls) {
    edition.occurrences += 1
    imageUrlOccurrences += 1
    edition.urls.add(url)
    globalUrls.add(url)
  }
}

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' })
const sortedEditions = [...editions.values()].sort((left, right) => {
  const byModel = collator.compare(left.vehicleModel, right.vehicleModel)
  return byModel || left.modelYear - right.modelYear || collator.compare(left.editionId, right.editionId)
})

const listedUrlCount = sortedEditions.reduce((total, edition) => total + edition.urls.size, 0)
const markdown = [
  '# URL ảnh VF trong knowledge chunks',
  '',
  `> Nguồn canonical: \`${sourcePath.replaceAll('\\', '/')}\``,
  '>',
  '> Phạm vi: chỉ các chunk có `vehicleKey` bắt đầu bằng `vf-`; không gồm Lạc Hồng 900 LX, ảnh catalog hoặc ảnh ngoài chunk.',
  '',
  '## Tổng hợp',
  '',
  `- Tổng chunk đã đọc: ${parsedChunks.toLocaleString('vi-VN')}`,
  `- Chunk thuộc xe VF: ${vfChunks.toLocaleString('vi-VN')}`,
  `- Chunk VF có ảnh: ${vfChunksWithImages.toLocaleString('vi-VN')}`,
  `- Edition VF có ảnh: ${sortedEditions.length.toLocaleString('vi-VN')}`,
  `- Tổng lần URL ảnh xuất hiện trong chunk VF: ${imageUrlOccurrences.toLocaleString('vi-VN')}`,
  `- URL unique toàn bộ xe VF: ${globalUrls.size.toLocaleString('vi-VN')}`,
  `- URL được liệt kê theo edition: ${listedUrlCount.toLocaleString('vi-VN')} (URL dùng lại ở nhiều edition được giữ trong từng edition tương ứng)`,
  '',
  ...sortedEditions.flatMap((edition) => {
    const urls = [...edition.urls].sort((left, right) => collator.compare(left, right))
    return [
      `## ${edition.vehicleModel} — ${edition.modelYear}`,
      '',
      `- Edition: \`${edition.editionId}\``,
      `- Document: \`${edition.documentKey}\``,
      `- Occurrences: ${edition.occurrences.toLocaleString('vi-VN')}`,
      `- URL unique trong edition: ${urls.length.toLocaleString('vi-VN')}`,
      '',
      ...urls.map((url) => `- <${url}>`),
      '',
    ]
  }),
].join('\n')

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${markdown}\n`, 'utf8')

process.stdout.write(`${JSON.stringify({
  sourcePath,
  outputPath,
  parsedChunks,
  vfChunks,
  vfChunksWithImages,
  vfEditionsWithImages: sortedEditions.length,
  imageUrlOccurrences,
  globalUniqueUrls: globalUrls.size,
  listedUrlCount,
}, null, 2)}\n`)
