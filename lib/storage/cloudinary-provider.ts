import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'
import { StorageProvider, UploadResult } from './storage-provider'

export class CloudinaryStorageProvider implements StorageProvider {
  private configured = false

  constructor(cloudinaryUrl?: string) {
    const url = cloudinaryUrl || process.env.CLOUDINARY_URL
    if (url && !url.includes('<your_api_key>')) {
      this.configureCloudinary(url)
    }
  }

  private configureCloudinary(cloudinaryUrl: string): void {
    try {
      const parsed = new URL(cloudinaryUrl)
      cloudinary.config({
        cloud_name: parsed.hostname,
        api_key: decodeURIComponent(parsed.username),
        api_secret: decodeURIComponent(parsed.password),
        secure: true,
      })
      this.configured = true
    } catch {
      throw new Error(
        'Cấu hình CLOUDINARY_URL không hợp lệ. Phải có dạng cloudinary://api_key:api_secret@cloud_name.',
      )
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    _mimeType: string,
    folder: string = 'fastlane/products',
  ): Promise<UploadResult> {
    if (!this.configured) {
      const url = process.env.CLOUDINARY_URL
      if (url && !url.includes('<your_api_key>')) {
        this.configureCloudinary(url)
      } else {
        throw new Error('Chưa cấu hình CLOUDINARY_URL hợp lệ trong biến môi trường.')
      }
    }

    const dotIndex = fileName.lastIndexOf('.')
    const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
    const uniquePublicId = `${sanitizedName}_${Date.now()}`

    const options: Record<string, unknown> = {
      resource_type: 'auto',
      folder,
      public_id: uniquePublicId,
    }

    return new Promise<UploadResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            reject(new Error(`Tải ảnh lên Cloudinary thất bại: ${error.message}`))
          } else if (result) {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              width: result.width,
              height: result.height,
              format: result.format,
              bytes: result.bytes,
            })
          } else {
            reject(new Error('Tải ảnh lên Cloudinary thất bại: Lỗi không xác định.'))
          }
        },
      )

      Readable.from(fileBuffer).pipe(uploadStream)
    })
  }

  async deleteFile(targetPath: string): Promise<void> {
    if (!this.configured) {
      const url = process.env.CLOUDINARY_URL
      if (url && !url.includes('<your_api_key>')) {
        this.configureCloudinary(url)
      }
    }

    let publicId = targetPath
    if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
      const match = targetPath.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/)
      if (match && match[1]) {
        const rawPath = match[1]
        const dotIndex = rawPath.lastIndexOf('.')
        publicId = dotIndex !== -1 ? rawPath.substring(0, dotIndex) : rawPath
      }
    } else {
      const dotIndex = targetPath.lastIndexOf('.')
      publicId = dotIndex !== -1 ? targetPath.substring(0, dotIndex) : targetPath
    }

    try {
      await cloudinary.uploader.destroy(publicId)
    } catch (err) {
      console.error(`Xóa file ${publicId} trên Cloudinary thất bại:`, err)
    }
  }
}
