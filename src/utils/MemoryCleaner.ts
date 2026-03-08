export class MemoryCleaner {
  static clearBuffer(buffer: Buffer | null | undefined): void {
    if (buffer && buffer.fill) {
      buffer.fill(0);
      if (global.gc) {
        global.gc();
      }
    }
  }

  static clearString(str: string | null | undefined): void {
    if (str) {
      const buffer = Buffer.from(str);
      this.clearBuffer(buffer);
      str = ''.padStart(str.length, '0');
    }
  }

  static clearObject<T extends Record<string, any>>(obj: T, sensitiveKeys: (keyof T)[]): void {
    for (const key of sensitiveKeys) {
      const value = obj[key];
      if (typeof value === 'string') {
        this.clearString(value);
      } else if (Buffer.isBuffer(value)) {
        this.clearBuffer(value);
      }
      delete obj[key];
    }
  }

  static secureWipe(data: any): void {
    if (typeof data === 'string') {
      this.clearString(data);
    } else if (Buffer.isBuffer(data)) {
      this.clearBuffer(data);
    } else if (Array.isArray(data)) {
      data.forEach(item => this.secureWipe(item));
    } else if (typeof data === 'object' && data !== null) {
      Object.keys(data).forEach(key => {
        if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
          this.secureWipe(data[key]);
          delete data[key];
        }
      });
    }
  }
}