import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  DEFAULT_ANNOTATION_SCHEMA_REF,
  buildVfVisualAnalysisData,
  buildVisualAnalysisReportMarkdown,
  readJsonLines,
  toJsonLines,
} from './lib/vf-visual-analysis-build.mjs'

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const buildDirectory = path.resolve(valueAfter(
  '--build',
  process.env.KNOWLEDGE_BUILD_DIR || '.local/knowledge-build/v2',
))
const outputDirectory = path.resolve(valueAfter(
  '--output',
  process.env.VISUAL_ANALYSIS_BUILD_DIR || path.join(buildDirectory, 'visual-analysis'),
))
const chunksPath = path.join(buildDirectory, 'chunks.jsonl')
const documentsPath = path.join(buildDirectory, 'documents.jsonl')
const annotationSchemaRef = valueAfter('--annotation-schema', DEFAULT_ANNOTATION_SCHEMA_REF)

const outputPaths = {
  occurrences: path.join(outputDirectory, 'vf-visual-occurrences.v1.jsonl'),
  packets: path.join(outputDirectory, 'vf-visual-analysis-packets.v1.jsonl'),
  report: path.join(outputDirectory, 'vf-visual-analysis-report.v1.json'),
  reportMarkdown: path.join(outputDirectory, 'README.md'),
  annotationSchema: path.resolve(annotationSchemaRef),
}

try {
  const [documents, chunks] = await Promise.all([
    readJsonLines(documentsPath),
    readJsonLines(chunksPath),
  ])
  const result = buildVfVisualAnalysisData({
    documents,
    chunks,
    annotationSchemaRef,
  })

  if (result.report.mappingIssueCount > 0) {
    process.stderr.write(JSON.stringify({
      mappingIssueCount: result.report.mappingIssueCount,
      mappingIssues: result.report.mappingIssues,
    }, null, 2) + '\n')
    throw new Error(
      'Visual packet mapping failed with '
      + result.report.mappingIssueCount
      + ' issue(s). See report details from the library output.',
    )
  }

  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(outputPaths.occurrences, toJsonLines(result.occurrences), 'utf8'),
    writeFile(outputPaths.packets, toJsonLines(result.packets), 'utf8'),
    writeFile(
      outputPaths.report,
      JSON.stringify({
        ...result.report,
        generatedAt: new Date().toISOString(),
        inputs: {
          documents: documentsPath,
          chunks: chunksPath,
        },
        outputs: outputPaths,
      }, null, 2) + '\n',
      'utf8',
    ),
    writeFile(
      outputPaths.reportMarkdown,
      buildVisualAnalysisReportMarkdown(result.report, outputPaths),
      'utf8',
    ),
  ])

  process.stdout.write(JSON.stringify({
    ...result.report,
    outputDirectory,
    outputs: outputPaths,
  }, null, 2) + '\n')
} catch (error) {
  process.stderr.write(
    'Visual analysis preparation failed: '
    + (error instanceof Error ? error.message : String(error))
    + '\n',
  )
  process.exitCode = 1
}
