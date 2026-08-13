import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  createAdminAccessoryTemplate,
  listAdminAccessoryTemplates,
  AdminAccessoryTemplatePersistenceError,
} from '@/lib/catalog/admin-accessory-template-server'
import { parseAccessoryTemplateWriteInput, AdminAccessoryTemplateValidationError } from '@/lib/catalog/admin-accessory-template-validation'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function templateError(error: unknown) {
  if (error instanceof AdminAccessoryTemplateValidationError) {
    return NextResponse.json({ error: error.message, code: error.code, field: { path: error.path } }, { status: 400 })
  }
  if (error instanceof AdminAccessoryTemplatePersistenceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  return NextResponse.json({ error: 'Không thể xử lý mẫu phụ kiện.' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }
  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true'
  try {
    return NextResponse.json({ data: await listAdminAccessoryTemplates({ includeInactive }) })
  } catch (error) {
    return templateError(error)
  }
}

export async function POST(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }
  try {
    const input = parseAccessoryTemplateWriteInput(await request.json())
    return NextResponse.json({ data: await createAdminAccessoryTemplate(input) }, { status: 201 })
  } catch (error) {
    return templateError(error)
  }
}
