import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('admin product list actions', () => {
  it('requires service labels to be edited inside the product editor', () => {
    expect(source).not.toContain('Gán nhãn dịch vụ')
    expect(source).not.toContain('/service-labels')
    expect(source).not.toContain('saveServiceLabels')
    expect(source).not.toContain('assignmentProduct')
  })

  it('explains icon actions with accessible hover/focus tooltips', () => {
    expect(source).toContain('ProductActionButton')
    expect(source).toContain('Chỉnh sửa sản phẩm')
    expect(source).toContain('Xóa sản phẩm')
    expect(source).toContain('role="tooltip"')
    expect(source).toContain('top-full')
    expect(source).toContain('group-hover/action:opacity-100')
    expect(source).toContain('group-focus-visible/action:opacity-100')
    expect(source).not.toContain('bottom-full')
  })

  it('uses a responsive minmax grid instead of forcing a wide table', () => {
    expect(source).toContain('overflow-x-hidden overflow-y-auto')
    expect(source).toContain('minmax(0,1.7fr)')
    expect(source).toContain('min-w-0')
    expect(source).toContain('xl:hidden')
    expect(source).not.toContain('<table')
    expect(source).not.toContain('whitespace-nowrap">')
  })
})
