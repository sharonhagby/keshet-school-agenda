import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const outputDirectory = fileURLToPath(new URL('../public/data/', import.meta.url))

export async function writeDatasets(datasets) {
  await mkdir(outputDirectory, { recursive: true })
  const staging = await mkdtemp(join(outputDirectory, '.sync-'))
  try {
    await Promise.all(datasets.map(data => writeFile(
      join(staging, `grade-${data.grade}.json`), JSON.stringify(data) + '\n',
    )))
    for (const { grade } of datasets) {
      const name = `grade-${grade}.json`
      await rename(join(staging, name), join(outputDirectory, name))
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
