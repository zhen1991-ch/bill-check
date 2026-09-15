interface ZipEntryIndex {
  name: Uint8Array;
  crc32: number;
  size: number;
  offset: number;
  dosTime: number;
  dosDate: number;
}

const encoder = new TextEncoder();
const UTF8_FLAG = 0x0800;
const CRC_TABLE = createCrcTable();

export class StoredZipWriter {
  private readonly entries: ZipEntryIndex[] = [];
  private offset = 0;

  constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  add(name: string, bytes: Uint8Array, modifiedAt = new Date()): void {
    if (this.entries.length >= 10_000) throw new Error("ZIP entry limit exceeded");
    if (bytes.byteLength > 0xffffffff || this.offset > 0xffffffff) throw new Error("ZIP64 archives are not supported");
    const encodedName = encoder.encode(name);
    if (encodedName.byteLength > 0xffff) throw new Error("ZIP file name is too long");
    const { time, date } = dosTimestamp(modifiedAt);
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + encodedName.byteLength);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.byteLength, true);
    view.setUint32(22, bytes.byteLength, true);
    view.setUint16(26, encodedName.byteLength, true);
    view.setUint16(28, 0, true);
    header.set(encodedName, 30);
    this.controller.enqueue(header);
    this.controller.enqueue(bytes);
    this.entries.push({ name: encodedName, crc32: crc, size: bytes.byteLength, offset: this.offset, dosTime: time, dosDate: date });
    this.offset += header.byteLength + bytes.byteLength;
  }

  close(): void {
    const centralOffset = this.offset;
    for (const entry of this.entries) {
      const header = new Uint8Array(46 + entry.name.byteLength);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, UTF8_FLAG, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, entry.dosTime, true);
      view.setUint16(14, entry.dosDate, true);
      view.setUint32(16, entry.crc32, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.name.byteLength, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, entry.offset, true);
      header.set(entry.name, 46);
      this.controller.enqueue(header);
      this.offset += header.byteLength;
    }
    const centralSize = this.offset - centralOffset;
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, this.entries.length, true);
    view.setUint16(10, this.entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    this.controller.enqueue(end);
    this.controller.close();
  }
}

export function createStoredZipStream(
  build: (writer: StoredZipWriter) => Promise<void>
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer = new StoredZipWriter(controller);
      try {
        await build(writer);
        writer.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

function dosTimestamp(value: Date): { time: number; date: number } {
  const year = Math.min(Math.max(value.getUTCFullYear(), 1980), 2107);
  return {
    time: (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | Math.floor(value.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate()
  };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    table[index] = value >>> 0;
  }
  return table;
}
