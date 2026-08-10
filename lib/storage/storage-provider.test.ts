import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageProviderFactory } from './storage-factory'
import { CloudinaryStorageProvider } from './cloudinary-provider'
import { LocalStorageProvider } from './local-provider'

describe('StorageProviderFactory & CloudinaryStorageProvider', () => {
  const originalEnv = process.env.CLOUDINARY_URL

  beforeEach(() => {
    StorageProviderFactory.resetInstance()
  })

  afterEach(() => {
    process.env.CLOUDINARY_URL = originalEnv
    StorageProviderFactory.resetInstance()
  })

  it('should return LocalStorageProvider if CLOUDINARY_URL is not set', () => {
    delete process.env.CLOUDINARY_URL
    const provider = StorageProviderFactory.getProvider()
    expect(provider).toBeInstanceOf(LocalStorageProvider)
  })

  it('should return LocalStorageProvider if CLOUDINARY_URL is a placeholder', () => {
    process.env.CLOUDINARY_URL =
      'cloudinary://<your_api_key>:<your_api_secret>@cloud'
    const provider = StorageProviderFactory.getProvider()
    expect(provider).toBeInstanceOf(LocalStorageProvider)
  })

  it('should return CloudinaryStorageProvider instance if CLOUDINARY_URL is valid', () => {
    process.env.CLOUDINARY_URL = 'cloudinary://12345:secret@dawbec7mw'
    const provider = StorageProviderFactory.getProvider()
    expect(provider).toBeInstanceOf(CloudinaryStorageProvider)
  })

  it('should initialize CloudinaryStorageProvider without error for valid URL', () => {
    const provider = new CloudinaryStorageProvider('cloudinary://683288223136819:VydCYq-7fA8PTOTdkKZFI8ZQWaQ@dawbec7mw')
    expect(provider).toBeInstanceOf(CloudinaryStorageProvider)
  })
})
