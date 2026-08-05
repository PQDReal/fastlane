import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ApiRouteError } from '@/lib/api/errors'
import {
  mapCartMutationRpcError,
} from '@/lib/cart/rpc'

describe('cart mutation RPC adapter', () => {
  it('maps stable database error codes without exposing SQL text', () => {
    expect(() => mapCartMutationRpcError({ message: 'OUT_OF_STOCK' })).toThrowError(
      expect.objectContaining({ status: 409, code: 'OUT_OF_STOCK' }),
    )
    expect(() => mapCartMutationRpcError({ message: 'RESOURCE_NOT_FOUND' })).toThrowError(
      expect.objectContaining({ status: 404, code: 'RESOURCE_NOT_FOUND' }),
    )
    expect(() => mapCartMutationRpcError({ message: '22023 VALIDATION_ERROR' })).toThrowError(
      expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }),
    )
    expect(() => mapCartMutationRpcError({ message: 'INSUFFICIENT_PERMISSION' })).toThrowError(
      expect.objectContaining({ status: 403, code: 'INSUFFICIENT_PERMISSION' }),
    )
  })

  it('surfaces unknown RPC failures instead of falling back to a relative ADD', () => {
    expect(() => mapCartMutationRpcError({ message: 'timeout after commit' }))
      .toThrowError(Error)
    expect(() => mapCartMutationRpcError({ message: 'timeout after commit' }))
      .not.toThrowError(ApiRouteError)
  })
})
