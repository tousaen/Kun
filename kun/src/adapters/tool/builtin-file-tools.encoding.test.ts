/**
 * @file edit / write 工具编码感知集成测试
 *
 * 验证 edit 工具自动检测文件编码(GBK/UTF-8 BOM/UTF-16 等)、按原编码
 * 编辑并写回,不破坏未修改部分与 BOM;write 工具保持 UTF-8 语义。
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decode as iconvDecode, encode as iconvEncode } from 'iconv-lite'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolHostContext } from '../../ports/tool-host.js'
import { createEditLocalTool, createWriteLocalTool } from './builtin-file-tools.js'

const cleanup: string[] = []

function context(workspace: string): ToolHostContext {
  return {
    threadId: 'thr_encoding',
    turnId: 'turn_encoding',
    workspace,
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    allowedReadPaths: ['.'],
    allowedWritePaths: ['.'],
    abortSignal: new AbortController().signal,
    awaitApproval: async () => 'allow'
  }
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kun-encoding-'))
  cleanup.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('edit tool encoding-aware behavior', () => {
  it('edits a GBK file in place, preserving GBK bytes for untouched text', async () => {
    const root = await fixture()
    const file = join(root, 'notes.txt')
    const original = '版本号:1.0\n功能说明:自动检测编码并正确编辑。\n'
    await writeFile(file, iconvEncode(original, 'gbk'))

    const result = await createEditLocalTool().execute(
      { path: 'notes.txt', oldText: '版本号:1.0', newText: '版本号:2.0' },
      context(root)
    )

    expect(result.isError).toBeUndefined()
    const output = result.output as Record<string, unknown>
    expect(output.encoding).toBe('GBK')
    expect(output.replacements).toBe(1)

    const bytes = await readFile(file)
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
    const decoded = iconvDecode(bytes, 'gbk')
    expect(decoded).toBe('版本号:2.0\n功能说明:自动检测编码并正确编辑。\n')
    // 未修改的中文片段字节保持不变(写回仍为合法 GBK)
    expect(bytes.equals(iconvEncode(decoded, 'gbk'))).toBe(true)
  })

  it('edits a UTF-8 file without adding a BOM', async () => {
    const root = await fixture()
    const file = join(root, 'utf8.txt')
    await writeFile(file, 'line one\nline two\n', 'utf8')

    const result = await createEditLocalTool().execute(
      { path: 'utf8.txt', oldText: 'line one', newText: 'line 1' },
      context(root)
    )

    const output = result.output as Record<string, unknown>
    expect(output.encoding).toBe('UTF-8')
    const bytes = await readFile(file)
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
    expect(bytes.toString('utf8')).toBe('line 1\nline two\n')
  })

  it('preserves a UTF-8 BOM across edits', async () => {
    const root = await fixture()
    const file = join(root, 'bom.txt')
    await writeFile(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('你好世界', 'utf8')]))

    const result = await createEditLocalTool().execute(
      { path: 'bom.txt', oldText: '你好', newText: '您好' },
      context(root)
    )

    const output = result.output as Record<string, unknown>
    expect(output.encoding).toBe('UTF-8 (BOM)')
    const bytes = await readFile(file)
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true)
    expect(bytes.subarray(3).toString('utf8')).toBe('您好世界')
  })

  it('edits a UTF-16LE file with BOM, keeping the same encoding', async () => {
    const root = await fixture()
    const file = join(root, 'utf16.txt')
    const original = '标题:测试\n正文:UTF-16 内容\n'
    await writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(original, 'utf16le')]))

    const result = await createEditLocalTool().execute(
      { path: 'utf16.txt', oldText: '测试', newText: '通过' },
      context(root)
    )

    const output = result.output as Record<string, unknown>
    expect(output.encoding).toBe('UTF-16LE (BOM)')
    const bytes = await readFile(file)
    expect(bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))).toBe(true)
    expect(bytes.subarray(2).toString('utf16le')).toBe('标题:通过\n正文:UTF-16 内容\n')
  })

  it('reports encoding on multi-edit calls', async () => {
    const root = await fixture()
    const file = join(root, 'multi.txt')
    await writeFile(file, iconvEncode('alpha 甲\nbeta 乙\n', 'gbk'))

    const result = await createEditLocalTool().execute(
      {
        path: 'multi.txt',
        edits: [
          { oldText: 'alpha 甲', newText: 'gamma 丙' },
          { oldText: 'beta 乙', newText: 'delta 丁' }
        ]
      },
      context(root)
    )

    const output = result.output as Record<string, unknown>
    expect(output.encoding).toBe('GBK')
    expect(output.replacements).toBe(2)
    expect(iconvDecode(await readFile(file), 'gbk')).toBe('gamma 丙\ndelta 丁\n')
  })
})

describe('write tool stays UTF-8', () => {
  it('creates UTF-8 files without BOM', async () => {
    const root = await fixture()
    const result = await createWriteLocalTool().execute(
      { path: 'new.txt', content: '新文件内容' },
      context(root)
    )

    expect(result.isError).toBeUndefined()
    const bytes = await readFile(join(root, 'new.txt'))
    expect(bytes.equals(Buffer.from('新文件内容', 'utf8'))).toBe(true)
  })
})
