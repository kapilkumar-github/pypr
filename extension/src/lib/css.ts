/** CSS.escape for identifiers (jsdom and old engines lack it). Follows the CSSOM spec. */
export function cssEscape(value: string): string {
  const s = String(value)
  let out = ""
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0) out += "\uFFFD"
    else if ((c >= 0x1 && c <= 0x1f) || c === 0x7f || (i === 0 && c >= 0x30 && c <= 0x39) || (i === 1 && c >= 0x30 && c <= 0x39 && s.charCodeAt(0) === 0x2d)) out += "\\" + c.toString(16) + " "
    else if (i === 0 && s.length === 1 && c === 0x2d) out += "\\" + s.charAt(i)
    else if (c >= 0x80 || c === 0x2d || c === 0x5f || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) out += s.charAt(i)
    else out += "\\" + s.charAt(i)
  }
  return out
}

/** Escapes a value for use inside a double-quoted attribute selector. */
export function cssString(value: string): string {
  return value.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, (c) => "\\" + c.charCodeAt(0).toString(16) + " ")
}
