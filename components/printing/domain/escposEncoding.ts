/**
 * PT-210 encoding notes (spike):
 * - The printer is ESC/POS 58 mm, not a PDF printer.
 * - The JS driver encodes text with UTF-8 (TextEncoder) even if codePage is cp850.
 * - Cheap thermal firmware usually expects CP437/CP850 single-byte chars.
 * - Sending UTF-8 for ñ/á prints garbage. We transliterate to ASCII before print.
 */
const ACCENT_MAP: Record<string, string> = {
  á: 'a',
  à: 'a',
  ä: 'a',
  â: 'a',
  ã: 'a',
  Á: 'A',
  À: 'A',
  Ä: 'A',
  Â: 'A',
  Ã: 'A',
  é: 'e',
  è: 'e',
  ë: 'e',
  ê: 'e',
  É: 'E',
  È: 'E',
  Ë: 'E',
  Ê: 'E',
  í: 'i',
  ì: 'i',
  ï: 'i',
  î: 'i',
  Í: 'I',
  Ì: 'I',
  Ï: 'I',
  Î: 'I',
  ó: 'o',
  ò: 'o',
  ö: 'o',
  ô: 'o',
  õ: 'o',
  Ó: 'O',
  Ò: 'O',
  Ö: 'O',
  Ô: 'O',
  Õ: 'O',
  ú: 'u',
  ù: 'u',
  ü: 'u',
  û: 'u',
  Ú: 'U',
  Ù: 'U',
  Ü: 'U',
  Û: 'U',
  ñ: 'n',
  Ñ: 'N',
  ç: 'c',
  Ç: 'C',
  '¿': '?',
  '¡': '!',
  '°': 'o',
  'º': 'o',
  'ª': 'a',
};

export function sanitizeForEscPos(value: string): string {
  return Array.from(value)
    .map((char) => {
      if (ACCENT_MAP[char]) return ACCENT_MAP[char];
      const code = char.charCodeAt(0);
      if (code >= 32 && code <= 126) return char;
      if (char === '\n' || char === '\r') return ' ';
      return '?';
    })
    .join('');
}
