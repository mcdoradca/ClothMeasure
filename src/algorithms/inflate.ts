// =========================================
// Minimal zlib/inflate decoder (RFC 1950/1951)
// Pure TypeScript, zero dependencies
// Kompatybilne z React Native / Hermes
// =========================================

// ---- Tabele stałe (RFC 1951) ----

// Length codes 257-285: base values and extra bits
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

// Distance codes 0-29: base values and extra bits
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

// Kolejność odczytu code length alphabet w dynamic Huffman
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// ---- BitReader ----

class BitReader {
  private data: Uint8Array;
  private bytePos: number = 0;
  private bitBuf: number = 0;
  private bitCount: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  readBits(n: number): number {
    while (this.bitCount < n) {
      if (this.bytePos >= this.data.length) {
        throw new Error('inflate: unexpected end of compressed data');
      }
      this.bitBuf |= this.data[this.bytePos++] << this.bitCount;
      this.bitCount += 8;
    }
    const val = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitCount -= n;
    return val;
  }

  align(): void {
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  readByte(): number {
    this.align();
    if (this.bytePos >= this.data.length) {
      throw new Error('inflate: unexpected end of data reading byte');
    }
    return this.data[this.bytePos++];
  }

  readUint16LE(): number {
    const lo = this.readByte();
    const hi = this.readByte();
    return lo | (hi << 8);
  }
}

// ---- Huffman Table ----

interface HuffmanTable {
  counts: Uint16Array;
  symbols: Uint16Array;
}

function buildHuffmanTable(codeLengths: number[], maxSymbols: number): HuffmanTable {
  const MAX_BITS = 15;
  const counts = new Uint16Array(MAX_BITS + 1);
  const symbols = new Uint16Array(maxSymbols);

  for (let i = 0; i < maxSymbols; i++) {
    if (codeLengths[i]) counts[codeLengths[i]]++;
  }

  const offsets = new Uint16Array(MAX_BITS + 1);
  for (let i = 1; i <= MAX_BITS; i++) {
    offsets[i] = offsets[i - 1] + counts[i - 1];
  }

  for (let i = 0; i < maxSymbols; i++) {
    if (codeLengths[i]) {
      symbols[offsets[codeLengths[i]]++] = i;
    }
  }

  return { counts, symbols };
}

function decodeSymbol(reader: BitReader, table: HuffmanTable): number {
  let code = 0;
  let first = 0;
  let index = 0;

  for (let len = 1; len <= 15; len++) {
    code |= reader.readBits(1);
    const count = table.counts[len];
    if (code < first + count) {
      return table.symbols[index + (code - first)];
    }
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }

  throw new Error('inflate: invalid Huffman code');
}

// ---- Fixed Huffman tables (RFC 1951 §3.2.6) ----

function buildFixedLitLenTable(): HuffmanTable {
  const lengths = new Array(288);
  for (let i = 0; i <= 143; i++) lengths[i] = 8;
  for (let i = 144; i <= 255; i++) lengths[i] = 9;
  for (let i = 256; i <= 279; i++) lengths[i] = 7;
  for (let i = 280; i <= 287; i++) lengths[i] = 8;
  return buildHuffmanTable(lengths, 288);
}

function buildFixedDistTable(): HuffmanTable {
  const lengths = new Array(30).fill(5);
  return buildHuffmanTable(lengths, 30);
}

const FIXED_LIT_TABLE = buildFixedLitLenTable();
const FIXED_DIST_TABLE = buildFixedDistTable();

// ---- Inflate block decompression ----

function inflateBlock(
  reader: BitReader,
  litTable: HuffmanTable,
  distTable: HuffmanTable,
  output: number[]
): void {
  while (true) {
    const sym = decodeSymbol(reader, litTable);

    if (sym < 256) {
      output.push(sym);
    } else if (sym === 256) {
      return;
    } else {
      const lenIdx = sym - 257;
      if (lenIdx < 0 || lenIdx >= LENGTH_BASE.length) {
        throw new Error(`inflate: invalid length code ${sym}`);
      }
      const length = LENGTH_BASE[lenIdx] + reader.readBits(LENGTH_EXTRA[lenIdx]);

      const distSym = decodeSymbol(reader, distTable);
      if (distSym < 0 || distSym >= DIST_BASE.length) {
        throw new Error(`inflate: invalid distance code ${distSym}`);
      }
      const distance = DIST_BASE[distSym] + reader.readBits(DIST_EXTRA[distSym]);

      const start = output.length - distance;
      for (let i = 0; i < length; i++) {
        output.push(output[start + i]);
      }
    }
  }
}

function decodeDynamicTables(reader: BitReader): { litTable: HuffmanTable; distTable: HuffmanTable } {
  const hlit = reader.readBits(5) + 257;
  const hdist = reader.readBits(5) + 1;
  const hclen = reader.readBits(4) + 4;

  const clCodeLengths = new Array(19).fill(0);
  for (let i = 0; i < hclen; i++) {
    clCodeLengths[CL_ORDER[i]] = reader.readBits(3);
  }

  const clTable = buildHuffmanTable(clCodeLengths, 19);

  const totalCodes = hlit + hdist;
  const codeLengths: number[] = [];

  while (codeLengths.length < totalCodes) {
    const sym = decodeSymbol(reader, clTable);

    if (sym <= 15) {
      codeLengths.push(sym);
    } else if (sym === 16) {
      const repeat = reader.readBits(2) + 3;
      const prev = codeLengths[codeLengths.length - 1];
      for (let i = 0; i < repeat; i++) codeLengths.push(prev);
    } else if (sym === 17) {
      const repeat = reader.readBits(3) + 3;
      for (let i = 0; i < repeat; i++) codeLengths.push(0);
    } else if (sym === 18) {
      const repeat = reader.readBits(7) + 11;
      for (let i = 0; i < repeat; i++) codeLengths.push(0);
    }
  }

  return {
    litTable: buildHuffmanTable(codeLengths.slice(0, hlit), hlit),
    distTable: buildHuffmanTable(codeLengths.slice(hlit, hlit + hdist), hdist),
  };
}

// ---- Główna funkcja inflate (RFC 1951) ----

export function inflate(compressedData: Uint8Array): Uint8Array {
  const reader = new BitReader(compressedData);
  const output: number[] = [];

  let bfinal = 0;

  while (!bfinal) {
    bfinal = reader.readBits(1);
    const btype = reader.readBits(2);

    if (btype === 0) {
      // Stored block (uncompressed)
      reader.align();
      const len = reader.readUint16LE();
      reader.readUint16LE(); // nlen — complement, pomijamy
      for (let i = 0; i < len; i++) {
        output.push(reader.readByte());
      }
    } else if (btype === 1) {
      inflateBlock(reader, FIXED_LIT_TABLE, FIXED_DIST_TABLE, output);
    } else if (btype === 2) {
      const { litTable, distTable } = decodeDynamicTables(reader);
      inflateBlock(reader, litTable, distTable, output);
    } else {
      throw new Error('inflate: reserved block type 3');
    }
  }

  return new Uint8Array(output);
}

/**
 * Dekompresja danych w formacie zlib (RFC 1950).
 * Zdejmuje 2-bajtowy nagłówek CMF+FLG i 4-bajtowy Adler-32 checksum.
 */
export function zlibDecompress(data: Uint8Array): Uint8Array {
  if (data.length < 6) {
    throw new Error('zlib: data too short');
  }

  const cmf = data[0];
  const cm = cmf & 0x0F;
  if (cm !== 8) {
    throw new Error(`zlib: unsupported compression method ${cm}`);
  }

  const flg = data[1];
  let offset = 2;

  // FDICT flag — dodatkowe 4 bajty słownika
  if (flg & 0x20) {
    offset += 4;
  }

  // Dane deflate od offset do length-4 (4 bajty Adler-32 na końcu)
  const deflateData = data.subarray(offset, data.length - 4);
  return inflate(deflateData);
}

// ---- PNG Paeth predictor (RFC 2083 §9.4) ----

export function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Unfiltruje surowe zdekompresowane scanlines PNG i zwraca RGBA Uint8ClampedArray.
 * Obsługuje colorType 2 (RGB) i 6 (RGBA), bitDepth 8.
 */
export function unfilterPNG(
  rawData: Uint8Array,
  width: number,
  height: number,
  channels: number
): Uint8ClampedArray {
  const bpp = channels; // bytes per pixel (zakładamy bitDepth=8)
  const stride = width * channels;
  const rgba = new Uint8ClampedArray(width * height * 4);

  const prevRow = new Uint8Array(stride);
  const currRow = new Uint8Array(stride);

  let rawOffset = 0;

  for (let y = 0; y < height; y++) {
    if (rawOffset >= rawData.length) {
      console.warn(`[PNG unfilter] Unexpected end at row ${y}/${height}`);
      break;
    }

    const filterType = rawData[rawOffset++];

    // Odczytaj przefiltrowany wiersz
    for (let i = 0; i < stride; i++) {
      currRow[i] = rawOffset < rawData.length ? rawData[rawOffset++] : 0;
    }

    // Zastosuj odwrotny filtr
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? currRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;

      switch (filterType) {
        case 0: break; // None
        case 1: currRow[i] = (currRow[i] + a) & 0xFF; break; // Sub
        case 2: currRow[i] = (currRow[i] + b) & 0xFF; break; // Up
        case 3: currRow[i] = (currRow[i] + Math.floor((a + b) / 2)) & 0xFF; break; // Average
        case 4: currRow[i] = (currRow[i] + paethPredictor(a, b, c)) & 0xFF; break; // Paeth
        default:
          console.warn(`[PNG unfilter] Unknown filter type ${filterType} at row ${y}`);
          break;
      }
    }

    // Zapisz do RGBA output
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      rgba[di] = currRow[si];         // R
      rgba[di + 1] = currRow[si + 1]; // G
      rgba[di + 2] = currRow[si + 2]; // B
      rgba[di + 3] = channels === 4 ? currRow[si + 3] : 255; // A
    }

    // Zapisz bieżący wiersz jako poprzedni
    prevRow.set(currRow);
  }

  return rgba;
}
