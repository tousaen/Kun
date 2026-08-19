/**
 * @file iconv-lite 类型声明补充
 *
 * iconv-lite 0.6.x 自带的类型声明只有命名导出(decode/encode/...),没有
 * default 导出。但该包是 CJS 模块且内部使用 `var iconv = module.exports`
 * 别名导出,Node ESM 的 cjs-module-lexer 无法静态识别其命名导出,因此
 * 运行时只能通过 default 导入(始终指向完整 module.exports)使用。
 *
 * 本文件以 ambient 声明与 node_modules 中的原始声明合并,补上 default
 * 导出的类型,使 `import iconv from 'iconv-lite'` 类型与运行时一致。
 * 仅声明本模块实际使用的 decode/encode/encodingExists 接口。
 */
declare module 'iconv-lite' {
  const iconv: {
    decode(buffer: Buffer, encoding: string, options?: { stripBOM?: boolean; addBOM?: boolean }): string
    encode(content: string, encoding: string, options?: { stripBOM?: boolean; addBOM?: boolean }): Buffer
    encodingExists(encoding: string): boolean
  }
  export default iconv
}
