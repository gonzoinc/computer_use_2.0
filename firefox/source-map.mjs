import { FirefoxError } from './rdp.mjs';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(segment) {
  const values = []; let value = 0, shift = 0;
  for (const character of segment) {
    const digit = alphabet.indexOf(character);
    if (digit < 0 || shift > 30) throw new FirefoxError('INVALID_SOURCE_MAP', 'Invalid or oversized source-map VLQ value.');
    value += (digit & 31) * 2 ** shift;
    if (digit & 32) shift += 5;
    else { values.push((value & 1) ? -(value >> 1) : value >> 1); value = 0; shift = 0; }
  }
  if (shift) throw new FirefoxError('INVALID_SOURCE_MAP', 'Truncated source-map VLQ value.');
  return values;
}
export class SourceMap {
  constructor(value, url) {
    const map = typeof value === 'string' ? JSON.parse(value.replace(/^\)\]\}'[^\n]*\n/, '')) : value;
    if (map.version !== 3 || !Array.isArray(map.sources) || typeof map.mappings !== 'string' || map.sections) throw new FirefoxError('UNSUPPORTED_SOURCE_MAP', 'Only flat version-3 source maps are supported; indexed/section maps are explicitly unsupported.');
    if (map.mappings.length > 2 * 1024 * 1024 || map.sources.length > 10000) throw new FirefoxError('SOURCE_MAP_TOO_LARGE', 'Source-map mapping/source count exceeds bounds.');
    this.url = url; this.map = map;
    this.sources = map.sources.map(source => {
      const combined = map.sourceRoot && !/^[a-z][a-z\d+.-]*:/i.test(source) ? `${map.sourceRoot.replace(/\/?$/, '/')}${source}` : source;
      try { return new URL(combined, url).href; } catch { return combined; }
    });
    this.entries = []; let source = 0, line = 0, column = 0, name = 0;
    const lines = map.mappings.split(';');
    for (let generatedLine = 0; generatedLine < lines.length; generatedLine++) {
      let generatedColumn = 0;
      for (const segment of lines[generatedLine].split(',')) {
        if (!segment) continue;
        const fields = vlq(segment); generatedColumn += fields[0];
        if (fields.length === 1) { this.entries.push({ generatedLine: generatedLine + 1, generatedColumn, source: null }); continue; }
        if (fields.length !== 4 && fields.length !== 5) throw new FirefoxError('INVALID_SOURCE_MAP', 'Invalid source-map segment.');
        source += fields[1]; line += fields[2]; column += fields[3]; if (fields.length === 5) name += fields[4];
        if (source < 0 || source >= this.sources.length || line < 0 || column < 0 || generatedColumn < 0) throw new FirefoxError('INVALID_SOURCE_MAP', 'Source-map position is outside bounds.');
        this.entries.push({ generatedLine: generatedLine + 1, generatedColumn, source: this.sources[source], sourceIndex: source, originalLine: line + 1, originalColumn: column, name: fields.length === 5 ? map.names?.[name] ?? null : null });
        if (this.entries.length > 500000) throw new FirefoxError('SOURCE_MAP_TOO_LARGE', 'Source-map decoded segment count exceeds bounds.');
      }
    }
  }
  originalPosition(line, column = 0) {
    const entry = this.entries.filter(entry => entry.generatedLine === line && entry.generatedColumn <= column).at(-1);
    return entry?.source ? entry : null;
  }
  generatedPosition(source, line, column = 0) {
    return this.entries.filter(entry => entry.source === source && entry.originalLine === line && entry.originalColumn >= column).sort((a, b) => a.originalColumn - b.originalColumn || a.generatedColumn - b.generatedColumn)[0] ?? null;
  }
}
