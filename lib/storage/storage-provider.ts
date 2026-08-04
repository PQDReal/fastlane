export interface UploadResult {
  url: string
  publicId: string
  width?: number
  height?: number
  format?: string
  bytes?: number
}

export interface StorageProvider {
  /**
   * Upload a file buffer to storage.
   * @param fileBuffer Buffer containing file content
   * @param fileName Original file name or target filename
   * @param mimeType MIME type of the file
   * @param folder Subfolder in storage
   */
  uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    folder?: string,
  ): Promise<UploadResult>

  /**
   * Delete a file from storage by public ID or URL.
   * @param publicIdOrUrl Resource ID or URL
   */
  deleteFile(publicIdOrUrl: string): Promise<void>
}
