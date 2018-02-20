import * as ieee754 from 'ieee754'
export type IFromBuf<T>=(buf: Buffer, offset: number) => {
        offset: number;
        val: T;
    };
export type IToBuf<T> = (val: T) => toBufRes
export interface toBufRes {
    length: number;
    write: (buf: Buffer, off: number) => any;
}
/**
 * Error thrown when buffer is too short
 */
export class LengthError extends Error {
    buf: Buffer;
    position: number;
    constructor(buf: Buffer, possition: number, length: number);
    constructor(mesg: string);
    constructor(mesg: string | Buffer, pos = 0, length = 1) {
        if (typeof mesg !== "string") {
            super(
                `Trying to read ${length} bytes from position ${pos} of a buffer that is ${
                mesg.length
                } long`
            );
            this.buf = mesg;
            this.position = pos;
        } else super(mesg);
    }
}
/**
 * Check if the Buffer is long enought
 * @param buf Buffer to check the length of
 * @param start Position to read from
 * @param length Number of bytes that will be read
 * @throws LengthError
 */
export function checkBufLen(buf: Buffer, start: number, length: number) {
    if (buf.length < start + length - 1)
        throw new LengthError(buf, start, length);
}


function numTo128(num: number) {
    let n = num;
    let r: number[] = [];
    while (n > 0x07f) {
        r.push((n & 0x7f) | 0x80);
        n = n >> 7;
    }
    r.push(n);
    return Buffer.from(r);
}
/**
 * Decodes a number encoded in LEB128
 * @param buf Buffer to red from
 * @param offset position to start reading from
 * @throws LengthError
 */
export function numFrom128(buf: Buffer, offset: number) {
    let r = 0,
        n = buf[offset];
    offset++;
    r = n & 0x7f;
    while (n > 0x7f) {
        checkBufLen(buf, offset, 1);
        n = buf[offset];
        r = (r << 7) + (n & 0x7f);
        offset++;
    }
    return {
        val: r,
        offset
    };
}

/**
 * Decodes String where first bytes are length encoded using LEB128
 * @param buf Buffer to red from
 * @param offset position to start reading from
 * @throws LengthError
 */
function fromLEBuf(buf: Buffer, offset: number) {
    let res = numFrom128(buf, offset),
        end = res.offset + res.val;
    checkBufLen(buf, res.offset, res.val);
    return { offset: end, val: buf.slice(res.offset, end).toString("utf8") };
}

/**
 * @param num Inputted number
 * @returns buffer containing last 2 bytes of num
 */
function numTo2Byte(num: number) {
    return Buffer.from([(num >> 8) & 0xff, num & 0xff]);
}

export interface ITypesFrom {
    [key: number]: IFromBuf<any>;
    [NTTypeID.Boolean]: IFromBuf<Boolean>;
    [NTTypeID.Number]: IFromBuf<number>;
    [NTTypeID.String]: IFromBuf<string>;
    [NTTypeID.Buffer]: IFromBuf<Buffer>;
    [NTTypeID.BooleanArray]: IFromBuf<Boolean[]>;
    [NTTypeID.NumberArray]: IFromBuf<number[]>;
    [NTTypeID.StringArray]: IFromBuf<string[]>;
    [NTTypeID.RPC]: IFromBuf<RPC>;
}

export interface ITypesTo {
    [key: number]: IToBuf<any>;
    [NTTypeID.Boolean]: IToBuf<Boolean>;
    [NTTypeID.Number]: IToBuf<number>;
    [NTTypeID.String]: IToBuf<string>;
    [NTTypeID.Buffer]: IToBuf<Buffer>;
    [NTTypeID.BooleanArray]: IToBuf<Boolean[]>;
    [NTTypeID.NumberArray]: IToBuf<number[]>;
    [NTTypeID.StringArray]: IToBuf<string[]>;
}

export class TypesTranslator {
    private stringLenEncoding:(len:number)=>Buffer
    constructor(is2_0=false){
        this.setStringEnc(is2_0)
    }
    setStringEnc(is2_0:boolean){
        this.stringLenEncoding = is2_0 ? numTo2Byte : numTo128
    }
    valToBuf:ITypesTo = {
        [NTTypeID.Boolean]: val => {
                return {
                    length: 1,
                    write: (buf, off) => {
                        buf[off] = +val;
                    }
                };
        },
        [NTTypeID.Number]: val => {
                return {
                    length: 8,
                    write: (buf, off) => {
                        ieee754.write(buf, val, off, false, 52, 8);
                    }
                };
            },
        [NTTypeID.String]: val => {
                let bufT = Buffer.concat([
                    this.stringLenEncoding(val.length),
                    Buffer.from(val, "utf8")
                ]);
                return {
                    length: bufT.length,
                    write: (buf, off) => {
                        bufT.copy(buf, off);
                    }
                };
        },
        [NTTypeID.Buffer]: val => {
                let len = numTo128(val.length);
                return {
                    length: val.length + len.length,
                    write: (buf, off) => {
                        len.copy(buf, off);
                        val.copy(buf, off + len.length);
                    }
                };
        },
        [NTTypeID.BooleanArray]: val => {
                return {
                    length: val.length + 1,
                    write: (buf, off) => {
                        buf[off] = val.length;
                        for (let i = 0; i < val.length; i++) {
                            buf[off + i] = +val[i];
                        }
                    }
                };
        },
        [NTTypeID.NumberArray]: val => {
                let len = val.length;
                return {
                    length: 8 * val.length + 1,
                    write: (buf, off) => {
                        for (let i = 0; i < val.length; i++) {
                            buf[off] = val.length;
                            off++;
                            ieee754.write(buf, val[i], off + 8 * i, false, 52, 8);
                        }
                    }
                };
        },
        [NTTypeID.StringArray]: val => {
                let lens: Buffer[] = [],
                    len = 1;
                for (let i = 0; i < val.length; i++) {
                    lens[i] = Buffer.concat([
                        this.stringLenEncoding(val[i].length),
                        Buffer.from(val[i])
                    ]);
                    len += lens[i].length;
                }
                return {
                    length: len,
                    write: (buf, off) => {
                        buf[off] = val.length;
                        off++;
                        for (let i = 0; i < val.length; i++) {
                            lens[i].copy(buf, off);
                            off += lens[i].length;
                        }
                    }
                };
        }
    }
    bufToVal :ITypesFrom = {
        [NTTypeID.Boolean]: (buf, off) => {
            checkBufLen(buf, off, 1);
            return {
                offset: off + 1,
                val: buf[off] > 0
            };
        },
        [NTTypeID.Number]: (buf, off) => {
            checkBufLen(buf, off, 8);
            return {
                offset: off + 8,
                val: ieee754.read(buf, off, false, 52, 8)
            }
        },
        [NTTypeID.String]: (buf, off) => {
            return fromLEBuf(buf, off);
        },
        [NTTypeID.Buffer]: (buf, off) => {
            let { val, offset } = numFrom128(buf, off),
                nbuf = Buffer.allocUnsafe(val),
                end = offset + val;
            checkBufLen(buf, off, val);
            buf.copy(nbuf, 0, offset);
            return {
                offset: end,
                val: nbuf
            };
        },
        [NTTypeID.BooleanArray]: (buf, off) => {
            checkBufLen(buf, off, 1);
            let len = buf[off],
                res: boolean[] = [];
            off++;
            checkBufLen(buf, off, len);
            for (let i = 0; i < len; i++) {
                res.push(buf[off + i] > 0);
            }
            return {
                offset: off + len,
                val: res
            };
        },
        [NTTypeID.NumberArray]: (buf, off) => {
            checkBufLen(buf, off, 1);
            let val = buf[off],
                num: number[] = [];
            off++;
            checkBufLen(buf, off, 8 * val);
            for (let i = 0; i < val; i++) {
                num.push(ieee754.read(buf, off + i * 8, false, 52, 8));
            }
            return {
                offset: off + val * 8,
                val: num
            };
        },
        [NTTypeID.StringArray]: (buf, off) => {
            checkBufLen(buf, off, 1);
            let len = buf[off],
                s: string[] = [],
                st: { offset: number; val: string };
            off++;
            for (let i = 0; i < len; i++) {
                st = fromLEBuf(buf, off);
                s[i] = st.val;
                off = st.offset;
            }
            return {
                offset: off,
                val: s
            };
        },
        [NTTypeID.RPC]: (buf, off) => {
            checkBufLen(buf, off, 1);
            let st: { val: string; offset: number };
            if (buf[off] !== 1) throw new Error("Unsupported RPC Definition");
            off++;
            st = fromLEBuf(buf, off);
            off = st.offset;
            checkBufLen(buf, off, 1);
            let name = st.val,
                parNum = buf[off],
                par: RPCPar[] = [],
                results: RPCResult[] = [],
                s = { offset: 0, val: "" },
                resNum = 0;
            off++;
            for (let i = 0; i < parNum; i++) {
                let lastPar: RPCPar = {
                    typeId: 0,
                    name: "",
                    default: 0
                };
                checkBufLen(buf, off, 1);
                lastPar.typeId = buf[off];
                s = fromLEBuf(buf, off);
                lastPar.name = s.val;
                off = s.offset;
                let t = this.bufToVal[lastPar.typeId](buf, off);
                lastPar.default = t.val;
                off = t.offset;
                par.push(lastPar);
            }
            checkBufLen(buf, off, 1);
            resNum = buf[off++];
            for (let i = 0; i < resNum; i++) {
                let res: RPCResult = { typeId: 0, name: "" };
                checkBufLen(buf, off, 1);
                res.typeId = buf[off];
                s = fromLEBuf(buf, off + 1);
                res.name = s.val;
                off = s.offset;
                results.push(res);
            }
            return {
                offset: off,
                val: {
                    name,
                    par,
                    results
                }
            };
        },
    }
}
export const enum NTID {
    KeepAlive = 0,
    ClientHello = 0x01,
    ProtocolVersionUnsupported = 0x02,
    ServerHelloComplete = 0x03,
    ServerHello = 0x04,
    ClientHelloComplete = 0x05,
    EntryAssignment = 0x10,
    EntryUpdate = 0x11,
    EntryFlagsUpdate = 0x12,
    EntryDelete = 0x13,
    ClearAllEntries = 0x14,
    ExecuteRPC = 0x20,
    RPCResponse = 0x21
}
export const enum NTTypeID {
    Boolean = 0x00,
    Number = 0x01,
    String = 0x02,
    Buffer = 0x03,
    BooleanArray = 0x10,
    NumberArray = 0x011,
    StringArray = 0x12,
    RPC = 0x20
}
export interface RPC {
    name: string;
    par: RPCPar[];
    results: RPCResult[];
}

export interface RPCPar {
    typeId: number;
    name: string;
    default: any;
}
export interface RPCResult {
    typeId: number;
    name: string;
}