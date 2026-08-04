import { StorageProvider } from './storage-provider'
import { CloudinaryStorageProvider } from './cloudinary-provider'

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

    throw new Error(
      'Chưa cấu hình dịch vụ lưu trữ (CLOUDINARY_URL). Vui lòng kiểm tra file .env.local.',
    )
  }

  /**
   * Reset instance for testing purposes
   */
  public static resetInstance(): void {
    this.instance = null
  }
}
