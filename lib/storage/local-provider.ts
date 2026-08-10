import fs from 'node:fs'
import path from 'node:path'
import { StorageProvider, UploadResult } from './storage-provider'

export class LocalStorageProvider implements StorageProvider {
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    _mimeType: string,
    folder: string = 'fastlane/products',
  ): Promise<UploadResult> {
    const dotIndex = fileName.lastIndexOf('.')
    const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName
    const extension = dotIndex !== -1 ? fileName.substring(dotIndex) : ''
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
    const uniqueFileName = `${sanitizedName}_${Date.now()}${extension}`

    // Target directory inside public/
    const publicPath = path.join(process.cwd(), 'public')
    const relativeUploadDir = path.join('uploads', folder)
    const targetDir = path.join(publicPath, relativeUploadDir)

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // Write file to targetDir
    const targetFilePath = path.join(targetDir, uniqueFileName)
    fs.writeFileSync(targetFilePath, fileBuffer)

    // Return the relative URL (Next.js serves public folder as root)
    const url = `/uploads/${folder.replace(/\\/g, '/')}/${uniqueFileName}`
    
    return {
      url,
      publicId: `local:${folder}/${uniqueFileName}`,
      bytes: fileBuffer.length,
      format: extension.replace('.', ''),
    }
  }

  async deleteFile(targetPath: string): Promise<void> {
    if (targetPath.startsWith('/uploads/')) {
      const publicPath = path.join(process.cwd(), 'public')
      const filePath = path.join(publicPath, targetPath)
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch (err) {
        console.error(`Failed to delete local file ${filePath}:`, err)
      }
    }
  }
}
