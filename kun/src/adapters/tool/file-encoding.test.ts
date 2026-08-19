/**
 * @file file-encoding 模块单元测试
 *
 * 覆盖编码检测(BOM / 严格 UTF-8 / GBK 启发式 / latin1 兜底)与
 * 解码/编码往返一致性,确保编辑非 UTF-8 文件时不破坏字节结构。
 */

import iconv from 'iconv-lite'
import { describe, expect, it } from 'vitest'
import {
  decodeBuffer,
  detectFileEncoding,
  encodeText,
  formatFileEncoding,
  isLikelyGbk,
  isValidUtf8
} from './file-encoding.js'

describe('detectFileEncoding', () => {
  it('detects UTF-8 without BOM', () => {
    const buffer = Buffer.from('const x = 1 // 注释\n', 'utf8')
    expect(detectFileEncoding(buffer)).toEqual({ encoding: 'utf-8', bom: null })
  })

  it('detects UTF-8 with BOM and reports the BOM bytes', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('中文内容', 'utf8')])
    const detected = detectFileEncoding(buffer)
    expect(detected.encoding).toBe('utf-8')
    expect(detected.bom).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(decodeBuffer(buffer, detected.encoding, detected.bom)).toBe('中文内容')
  })

  it('detects GBK/GB2312 text as gbk', () => {
    const buffer = iconv.encode('你好,世界!这是一个 GBK 编码文件。', 'gbk')
    expect(detectFileEncoding(buffer).encoding).toBe('gbk')
  })

  it('detects UTF-16LE with BOM', () => {
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文 UTF-16', 'utf16le')])
    const detected = detectFileEncoding(buffer)
    expect(detected.encoding).toBe('utf-16le')
    expect(decodeBuffer(buffer, detected.encoding, detected.bom)).toBe('中文 UTF-16')
  })

  it('detects UTF-16BE with BOM', () => {
    const body = iconv.encode('中文 UTF-16BE', 'utf-16be')
    const buffer = Buffer.concat([Buffer.from([0xfe, 0xff]), body])
    const detected = detectFileEncoding(buffer)
    expect(detected.encoding).toBe('utf-16be')
    expect(decodeBuffer(buffer, detected.encoding, detected.bom)).toBe('中文 UTF-16BE')
  })

  it('falls back to latin1 for bytes that are neither UTF-8 nor GBK', () => {
    // 0xE9 0x80 0xFF 是非法 UTF-8,0xFF 又违反 GBK 结构 → latin1 兜底
    const buffer = Buffer.from([0x61, 0xe9, 0x80, 0xff])
    expect(detectFileEncoding(buffer).encoding).toBe('latin1')
  })

  it('treats ASCII and empty buffers as UTF-8', () => {
    expect(detectFileEncoding(Buffer.from('plain ascii')).encoding).toBe('utf-8')
    expect(detectFileEncoding(Buffer.alloc(0)).encoding).toBe('utf-8')
  })
})

describe('isValidUtf8 / isLikelyGbk', () => {
  it('rejects invalid UTF-8 sequences strictly', () => {
    expect(isValidUtf8(Buffer.from('valid utf-8 中文', 'utf8'))).toBe(true)
    expect(isValidUtf8(Buffer.from([0xc3, 0x28]))).toBe(false)
    expect(isValidUtf8(Buffer.from([0xe4, 0xbd, 0xa0]))).toBe(true)
  })

  it('accepts GBK structures and rejects latin1-style byte runs', () => {
    expect(isLikelyGbk(iconv.encode('中文测试', 'gbk'))).toBe(true)
    // 纯 ASCII 无双字节对 → false
    expect(isLikelyGbk(Buffer.from('ascii only'))).toBe(false)
    // 非法单字节 0x80 → false
    expect(isLikelyGbk(Buffer.from([0x81, 0x40, 0x80]))).toBe(false)
    // 次字节 0x7F 非法 → false
    expect(isLikelyGbk(Buffer.from([0x81, 0x7f]))).toBe(false)
  })
})

describe('encodeText round-trips', () => {
  const samples: Array<['utf-8' | 'utf-16le' | 'utf-16be' | 'gbk' | 'latin1', string]> = [
    ['utf-8', 'hello 中文'],
    ['utf-16le', 'hello 中文'],
    ['utf-16be', 'hello 中文'],
    ['gbk', 'hello 中文'],
    ['latin1', 'café']
  ]

  for (const [encoding, text] of samples) {
    it(`round-trips ${encoding}`, () => {
      const bytes = encodeText(text, encoding)
      const decoded = decodeBuffer(bytes, encoding, null)
      expect(decoded).toBe(text)
    })
  }

  it('preserves GBK byte structure for gb2312-encoded data', () => {
    const original = iconv.encode('接口返回结果', 'gb2312')
    const decoded = decodeBuffer(original, 'gbk', null)
    const reencoded = encodeText(decoded, 'gbk')
    expect(reencoded.equals(original)).toBe(true)
  })
})

describe('formatFileEncoding', () => {
  it('formats readable names including BOM state', () => {
    expect(formatFileEncoding('utf-8', null)).toBe('UTF-8')
    expect(formatFileEncoding('utf-8', Buffer.from([0xef, 0xbb, 0xbf]))).toBe('UTF-8 (BOM)')
    expect(formatFileEncoding('gbk', null)).toBe('GBK')
    expect(formatFileEncoding('utf-16le', Buffer.from([0xff, 0xfe]))).toBe('UTF-16LE (BOM)')
    expect(formatFileEncoding('latin1', null)).toBe('ISO-8859-1')
  })
})
