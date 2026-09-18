import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { StorageProviderFactory } from '@/lib/storage/storage-factory'

function handleAuthorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return handleAuthorizationError(error)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Dữ liệu tải lên phải dạng multipart/form-data.' },
      { status: 400 },
    )
  }

  const files = formData.getAll('file') as File[]
  const uploadFiles = files.length > 0 ? files : (formData.getAll('files') as File[])

  if (!uploadFiles || uploadFiles.length === 0 || !(uploadFiles[0] instanceof File)) {
    return NextResponse.json(
      { error: 'Không tìm thấy file ảnh trong dữ liệu gửi lên (field `file`).' },
      { status: 400 },
    )
  }

  const folder = (formData.get('folder') as string) || 'fastlane/products'
  const uploadedResults = []

  try {
    const provider = StorageProviderFactory.getProvider()

    for (const file of uploadFiles) {
      if (!(file instanceof File) || file.size === 0) continue

      if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
        return NextResponse.json(
          {
            error: `Định dạng file ${file.name} (${file.type}) không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, WebP, GIF, AVIF.`,
          },
          { status: 400 },
        )
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `File ${file.name} vượt quá dung lượng tối đa cho phép (10MB).`,
          },
          { status: 400 },
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const result = await provider.uploadFile(
        buffer,
        file.name,
        file.type,
        folder,
      )
      uploadedResults.push(result)
    }

    if (uploadedResults.length === 0) {
      return NextResponse.json(
        { error: 'Không có file hợp lệ nào được tải lên.' },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      data: uploadedResults,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định khi tải ảnh.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
