/**
 * @file 文件编码检测与转换模块
 *
 * 为 read / edit / write 工具提供统一的文件编码能力:
 *  - detectFileEncoding: 基于 BOM、严格 UTF-8 校验与 GBK 字节结构启发式检测编码
 *  - decodeBuffer / encodeText: 按检测到的编码无损解码/回写,保证编辑非 UTF-8
 *    文件(如 GBK/GB2312、UTF-16)时不破坏原有字节结构
 *
 * 检测优先级:
 *  1. BOM 嗅探(UTF-8 / UTF-16LE / UTF-16BE)
 *  2. 严格 UTF-8 校验(fatal TextDecoder),通过即判定为 UTF-8
 *  3. GBK 双字节结构启发式(要求至少 50% 双字节落在 GB2312 汉字区)
 *  4. 兜底 ISO-8859-1(单字节无损映射,保证写回不丢字节)
 *
 * 说明:GB2312 是 GBK 的子集,统一按 'gbk' 处理;iconv-lite 的 gbk 解码
 * 兼容 gb2312 编码数据。
 */

// iconv-lite 是 CJS 模块,内部使用 `var iconv = module.exports` 别名导出,
// Node ESM 的 cjs-module-lexer 无法静态识别命名导出(命名/namespace 导入
// 在运行时分别报 "does not provide an export named 'decode'" 或缺少
// encode 函数)。default 导入始终指向完整 module.exports,运行时可用;
// 类型声明补充见同目录 iconv-lite.d.ts。
import iconv from 'iconv-lite'
import { TextDecoder } from 'node:util'

/** 支持的检测编码。utf-16 系列仅通过 BOM 识别。 */
export type FileEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gbk' | 'latin1'

/** 编码检测结果:编码 + 原文件 BOM 字节(无 BOM 时为 null)。 */
export interface FileEncodingDetection {
  encoding: FileEncoding
  bom: Buffer | null
}

/** UTF-8 BOM:EF BB BF */
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
/** UTF-16LE BOM:FF FE */
const UTF16LE_BOM = Buffer.from([0xff, 0xfe])
/** UTF-16BE BOM:FE FF */
const UTF16BE_BOM = Buffer.from([0xfe, 0xff])

/**
 * @brief 检测文件字节流的编码。
 * @param buffer 文件原始字节
 * @returns 检测到的编码与原文件 BOM(便于写回时保留)
 */
export function detectFileEncoding(buffer: Buffer): FileEncodingDetection {
  if (buffer.length >= UTF8_BOM.length && buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    return { encoding: 'utf-8', bom: UTF8_BOM }
  }
  if (buffer.length >= UTF16LE_BOM.length && buffer.subarray(0, UTF16LE_BOM.length).equals(UTF16LE_BOM)) {
    return { encoding: 'utf-16le', bom: UTF16LE_BOM }
  }
  if (buffer.length >= UTF16BE_BOM.length && buffer.subarray(0, UTF16BE_BOM.length).equals(UTF16BE_BOM)) {
    return { encoding: 'utf-16be', bom: UTF16BE_BOM }
  }
  if (isValidUtf8(buffer)) return { encoding: 'utf-8', bom: null }
  if (isLikelyGbk(buffer)) return { encoding: 'gbk', bom: null }
  // 单字节兜底:任何字节都可无损映射,避免后续写回破坏数据
  return { encoding: 'latin1', bom: null }
}

/**
 * @brief 严格校验字节流是否为合法 UTF-8。
 * @param buffer 待校验字节
 * @returns 合法 UTF-8 返回 true,含非法序列返回 false
 */
export function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

/**
 * @brief GBK/GB2312 双字节结构启发式检测。
 *
 * GBK 双字节规则:首字节 0x81-0xFE,次字节 0x40-0xFE(不含 0x7F);
 * 0x80 与 0xFF 为非法单字节。为避免把 ISO-8859-1 文本误判为 GBK,
 * 要求至少存在一个双字节对,且落在 GB2312 汉字区(首字节 0xB0-0xF7)
 * 的对占比不低于 50%。
 *
 * @param buffer 待检测字节
 * @returns 符合 GBK 结构且含足够汉字区双字节时返回 true
 */
export function isLikelyGbk(buffer: Buffer): boolean {
  let doubleBytePairs = 0
  let hanPairs = 0
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index]!
    if (byte <= 0x7f) continue
    if (byte === 0x80 || byte === 0xff) return false
    if (byte >= 0x81 && byte <= 0xfe) {
      if (index + 1 >= buffer.length) return false
      const second = buffer[index + 1]!
      if (second < 0x40 || second > 0xfe || second === 0x7f) return false
      doubleBytePairs += 1
      if (byte >= 0xb0 && byte <= 0xf7) hanPairs += 1
      index += 1
      continue
    }
    return false
  }
  if (doubleBytePairs === 0) return false
  return hanPairs / doubleBytePairs >= 0.5
}

/**
 * @brief 按编码解码字节流,自动剥离已检测到的 BOM。
 * @param buffer 文件原始字节
 * @param encoding 目标编码(须与检测结果一致)
 * @param bom 检测到的 BOM 字节,用于剥离
 * @returns 解码后的文本
 */
export function decodeBuffer(buffer: Buffer, encoding: FileEncoding, bom: Buffer | null): string {
  const body =
    bom !== null && buffer.length >= bom.length && buffer.subarray(0, bom.length).equals(bom)
      ? buffer.subarray(bom.length)
      : buffer
  switch (encoding) {
    case 'utf-8':
      return body.toString('utf8')
    case 'utf-16le':
      return body.toString('utf16le')
    case 'utf-16be':
      return iconv.decode(body, 'utf-16be')
    case 'gbk':
      return iconv.decode(body, 'gbk')
    case 'latin1':
      return body.toString('latin1')
  }
}

/**
 * @brief 按编码将文本编码为字节流(不含 BOM,BOM 由调用方前置拼接)。
 * @param text 待编码文本
 * @param encoding 目标编码
 * @returns 编码后的字节
 */
export function encodeText(text: string, encoding: FileEncoding): Buffer {
  switch (encoding) {
    case 'utf-8':
      return Buffer.from(text, 'utf8')
    case 'utf-16le':
      return Buffer.from(text, 'utf16le')
    case 'utf-16be':
      return iconv.encode(text, 'utf-16be')
    case 'gbk':
      return iconv.encode(text, 'gbk')
    case 'latin1':
      return Buffer.from(text, 'latin1')
  }
}

/**
 * @brief 格式化编码名称,供工具输出与提示使用。
 * @param encoding 检测到的编码
 * @param bom 是否带 BOM
 * @returns 人类可读的编码名,如 "GBK"、"UTF-8 (BOM)"
 */
export function formatFileEncoding(encoding: FileEncoding, bom: Buffer | null): string {
  const base =
    encoding === 'utf-8'
      ? 'UTF-8'
      : encoding === 'utf-16le'
        ? 'UTF-16LE'
        : encoding === 'utf-16be'
          ? 'UTF-16BE'
          : encoding === 'gbk'
            ? 'GBK'
            : 'ISO-8859-1'
  return bom ? `${base} (BOM)` : base
}
