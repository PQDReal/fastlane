import { StorageProvider } from './storage-provider'
import { CloudinaryStorageProvider } from './cloudinary-provider'
import { LocalStorageProvider } from './local-provider'

export class StorageProviderFactory {
  private static instance: StorageProvider | null = null

  public static getProvider(): StorageProvider {
    if (this.instance) {
      return this.instance
    }

    const cloudinaryUrl = process.env.CLOUDINARY_URL
    if (cloudinaryUrl && !cloudinaryUrl.includes('<your_api_key>')) {
      this.instance = new CloudinaryStorageProvider(cloudinaryUrl)
      return this.instance
    }

    // Fallback to LocalStorageProvider for local development when Cloudinary is not configured
    console.log('[STORAGE] CLOUDINARY_URL chưa được cấu hình. Sử dụng LocalStorageProvider lưu trữ tệp cục bộ.')
    this.instance = new LocalStorageProvider()
    return this.instance
  }

  /**
   * Reset instance for testing purposes
   */
  public static resetInstance(): void {
    this.instance = null
  }
}
