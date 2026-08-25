import path from 'node:path'
import {
  loadVinFastKnowledgeCorpus,
  writePreparedBuild,
} from './lib/vinfast-knowledge-build.mjs'

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const sourceRoot = valueAfter('--source', process.env.VINFAST_MANUAL_SOURCE || '.local/vinfast_manuals_copy')
const manifestPath = valueAfter('--manifest', process.env.MANUAL_CORPUS_MANIFEST_PATH || 'scripts/data/manual-corpus-allowlist.v2.json')
const outputDirectory = valueAfter('--output', process.env.KNOWLEDGE_BUILD_DIR || '.local/knowledge-build/v2')

try {
  const build = loadVinFastKnowledgeCorpus({ sourceRoot, manifestPath })
  const output = writePreparedBuild(outputDirectory, build)
  console.log(JSON.stringify({
    status: build.report.status,
    output: path.relative(process.cwd(), output),
    ...build.report,
    note: 'No database write and no OpenAI API call were performed.',
  }, null, 2))
} catch (error) {
  console.error(`Knowledge preparation failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
