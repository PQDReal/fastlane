import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

import { createWorkbench } from '../.local/vf-image-agent/lib/workbench.mjs'
import { normalizeAnnotationVehicleMentions } from './lib/vf-visual-annotation-normalize.mjs'

const apply = process.argv.includes('--apply')
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDirectory = path.join(projectRoot, '.local', 'vf-image-agent')
const workbench = await createWorkbench({ rootDirectory })
await workbench.ensureInitialized()
const completedByPacket = new Map(
  (await workbench.loadCompletedRows()).map((item) => [item.packetId, item]),
)
const repairs = []

for (const row of workbench.rows) {
  const packet = await workbench.readPacket(row)
  const completed = completedByPacket.get(packet.packetId)
  if (!completed) continue
  const annotation = JSON.parse(await readFile(completed.annotationPath, 'utf8'))
  const expectedModels = [...new Set(
    (packet.contexts || []).map((context) => context?.document?.vehicleModel).filter(Boolean),
  )]
  const result = normalizeAnnotationVehicleMentions(
    annotation.annotation?.summary || '',
    expectedModels,
  )
  if (!result.changed) continue

  repairs.push({
    sequence: row.sequence,
    packetId: packet.packetId,
    expectedModels,
    replacements: result.replacements,
  })
  if (apply) {
    const note = 'Đã đối chiếu tên dòng xe theo packet context của Task 020.'
    await workbench.writeItem(row.sequence, {
      ...annotation,
      annotation: {
        ...annotation.annotation,
        summary: result.summary,
      },
      notes: annotation.notes ? `${annotation.notes} ${note}`.slice(0, 1_000) : note,
    })
  }
}

process.stdout.write(`${JSON.stringify({
  mode: apply ? 'APPLY' : 'PLAN',
  repairCount: repairs.length,
  repairs,
}, null, 2)}\n`)
