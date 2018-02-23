import { NTID, NTTypeID, toBufRes } from "./NTTypes";

export default class BufBuilder {
  private id: NTID;
  private length = 1;
  private funcs: toBufRes[] = [];
  constructor(id: NTID) {
    this.id = id;
  }
  addNumber(num: number, byteCount = 1) {
    this.length += byteCount;
    if (byteCount == 1) {
      this.funcs.push({
        length: byteCount,
        write: (buf, off) => (buf[off] = num & 0xff)
      });
      return this;
    }
    let res: number[] = new Array(byteCount);
    for (let i = byteCount - 1; i >= 0; i--) {
      res[i] = num & 0xff;
    }
    this.funcs.push({
      length: byteCount,
      write: (buf, off) => {
        for (let i = 0; i < byteCount; i++) {
          buf[off + i] = res[i];
        }
      }
    });
    return this;
  }
  addBytes(bytes: number[]) {
    this.funcs.push({
      length: bytes.length,
      write: (buf, off) => {
        for (let i = 0; i < bytes.length; i++) {
          buf[off + i] = bytes[i];
        }
      }
    });
    return this;
  }
  add(type: toBufRes) {
    this.length += type.length;
    this.funcs.push(type);
    return this;
  }
  write(writeFunc: (buf: Buffer) => any) {
    let buf = Buffer.allocUnsafe(this.length);
    let offset = 1,
      obj: toBufRes;
    buf[0] = this.id;
    for (let i = 0; i < this.funcs.length; i++) {
      obj = this.funcs[i];
      obj.write(buf, offset);
      offset += obj.length;
    }
  }
}
