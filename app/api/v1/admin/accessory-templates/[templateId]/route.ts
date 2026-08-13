import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  AdminAccessoryTemplatePersistenceError,
  createAdminAccessoryTemplateVersion,
  deleteAdminAccessoryTemplate,
  getAdminAccessoryTemplate,
  updateAdminAccessoryTemplate,
} from '@/lib/catalog/admin-accessory-template-server'
import {
  AdminAccessoryTemplateValidationError,
  parseAccessoryTemplateDefinition,
  parseAccessoryTemplateMetadataPatch,
} from '@/lib/catalog/admin-accessory-template-validation'

type Context = { params: Promise<{ templateId: string }> }

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

async function templateId(context: Context) {
  const { templateId: id } = await context.params
  return id
}

export async function GET(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }
  try {
    const id = await templateId(context)
    const rawVersion = new URL(request.url).searchParams.get('version')
    const version = rawVersion === null ? undefined : Number.parseInt(rawVersion, 10)
    return NextResponse.json({ data: await getAdminAccessoryTemplate(id, version) })
  } catch (error) {
    return templateError(error)
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }
  try {
    return NextResponse.json({ data: await updateAdminAccessoryTemplate(await templateId(context), parseAccessoryTemplateMetadataPatch(await request.json())) })
  } catch (error) {
    return templateError(error)
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }
  try {
    return NextResponse.json({ data: await deleteAdminAccessoryTemplate(await templateId(context)) })
  } catch (error) {
    return templateError(error)
  }
}

export async function POST(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminAccessoryTemplateValidationError('body', 'OBJECT_REQUIRED', 'Dữ liệu phiên bản mẫu không hợp lệ.')
    const input = body as Record<string, unknown>
    const definition = parseAccessoryTemplateDefinition(input.definition, 'definition')
    const changeNote = input.changeNote === undefined || input.changeNote === null ? null : String(input.changeNote).trim()
    const expectedUpdatedAt = input.expectedUpdatedAt === undefined ? undefined : String(input.expectedUpdatedAt)
    return NextResponse.json({ data: await createAdminAccessoryTemplateVersion(await templateId(context), definition, changeNote, expectedUpdatedAt) }, { status: 201 })
  } catch (error) {
    return templateError(error)
  }
}
