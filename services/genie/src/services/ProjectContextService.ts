import { promises as fs } from 'fs'
import path from 'path'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

import logger from '../utils/logger'

export class ProjectContextService {
  async onboardRepo(repoPath: string): Promise<FileNode> {
    logger.info(`Onboarding repository: ${repoPath}`)
    const stats = await fs.stat(repoPath)
    if (!stats.isDirectory()) {
      logger.error(`Invalid repository path: ${repoPath}`)
      throw new Error(JSON.stringify({ message: 'Invalid repository path', path: repoPath }))
    }

    return this.scanFiles(repoPath)
  }

  private async scanFiles(dirPath: string): Promise<FileNode> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const root: FileNode = {
      name: path.basename(dirPath),
      path: dirPath,
      type: 'directory',
      children: [],
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        root.children?.push(await this.scanFiles(entryPath))
      } else {
        root.children?.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
        })
      }
    }

    return root
  }
}
