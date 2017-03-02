import * as ieee754 from 'ieee754'
import * as net from 'net'
export class Client {
    client: net.Socket
    constructor(address = '127.0.0.1', port = 1735) {
        this.client = net.connect(port, address, () => {
            this.write(Buffer.from([0x01, 3, 0, ..."nodeClient".toLEBufA()]))
            this.client.on('data', (d) => {
                switch (d[0]) {
                    case 0x02:
                        console.log('Protocol Unsupported')
                        break
                    case 0x03:
                        console.log('Server Hello Complete')
                    case 0x04:
                        console.log('server Hello')
                        break
                    case 0x10:
                        console.log('Entry Assign')
                        break
                    case 0x11:
                        console.log('Entry Update')
                        break
                    case 0x12:
                        console.log('Flag Update')
                        break
                    case 0x13:
                        console.log('Entry Delete')
                        break
                }
            })
        })
    }
    private keys: string[]
    readonly keepAlive = Buffer.from([0])
    private aliveTimer: NodeJS.Timer
    write(buf: Buffer) {
        if (this.aliveTimer) clearTimeout(this.aliveTimer)
        this.aliveTimer = setTimeout(() => { this.write(this.keepAlive) }, 1000);
        this.aliveTimer.unref()
        this.client.write(buf)
    }
}
const enum e {
    Boolean = 0,
    Double = 1,
    String = 2,
    RawData = 3,
    BoolArray = 0x10,
    DoubleArray = 0x11,
    StringArray = 0x12,
    RPCD = 0x20
}
interface RPCD {
    name: string,
    par: RPCDPar[]
}
interface RPCDPar {
    type: number,
    name: string,
    default: any,
    result: {
        type: number,
        name: string
    }[]
}
interface d {
    Byte: number
    Bool: boolean
    Double: number
    String: string
    RawData: Buffer[]
    BoolArray: boolean[]
    DoubleArray: number[]
    StringArray: string[]
    RPCD: RPCD
}
type bufFrom<T> = (buf: Buffer, offset: number) => {
        offset: number,
        val: T
    }
interface f<T> {
    getlen: () => Number
    toBuf?: (val: T) => {
        len: () => any,
        func: (buf: Buffer, off: number) => any
    }
    fromBuf: (buf: Buffer, offset: number) => {
        offset: number,
        val: T
    }
}
var TypeBuf = {
    byte: <f<number>>{
        getlen: () => 1,
        toBuf: (val) => {
            return {
                len: () => 1,
                func: (buf, off) => {
                    buf[off] = val
                }
            }
        },
        fromBuf: (buf, off) => {
            return {
                offset: off + 1,
                val: buf[off]
            }
        }
    },
    Bool: <f<boolean>>{
        getlen: () => 1,
        toBuf: (val) => {
            return {
                len: () => 1,
                func: (buf, off) => {
                    buf[off] = val ? 1 : 0
                }
            }
        },
        fromBuf: (buf, off) => {
            return {
                offset: off + 1,
                val: buf[off] > 0
            }
        }
    },
    Double: <f<number>>{
        getlen: () => 8,
        toBuf: (val) => {
            return {
                len: () => 8,
                func: (buf, off) => {
                    ieee754.write(buf, val, off, false, 52, 8)
                }
            }
        },
        fromBuf: (buf, off) => {
            return {
                offset: off + 8,
                val: ieee754.read(buf, off, false, 52, 8)
            }
        }
    },
    String: <f<string>>{
        getlen: () => 0,
        toBuf: (val) => {
            let bufT = Buffer.concat([val.length.to128(), Buffer.from(val, 'utf8')])
            return {
                len: () => bufT.length,
                func: (buf, off) => {
                    bufT.copy(buf, off)
                }
            }
        },
        fromBuf: (buf, off) => {
            return fromLEBuf(buf, off)
        }
    },
    RawData: <f<Buffer>>{
        getlen: () => 0,
        toBuf: (val) => {
            let len = val.length.to128()
            return {
                len: () => val.length + len.length,
                func: (buf, off) => {
                    len.copy(buf, off)
                    val.copy(buf, off + len.length)
                }
            }
        },
        fromBuf: (buf, off) => {
            let {val, offset} = numFrom128(buf, off),
                nbuf = Buffer.allocUnsafe(val)
            buf.copy(nbuf, 0, offset)
            return {
                offset: offset + nbuf.length,
                val: nbuf
            }
        }
    },
    BoolArray: <f<Boolean[]>>{
        getlen: () => 0,
        toBuf: (val) => {
            return {
                len: () => val.length + 1,
                func: (buf, off) => {
                    buf[off] = val.length
                    for (let i = 0; i < val.length; i++) {
                        buf[off + i] = val[i] ? 1 : 0
                    }
                }
            }
        },
        fromBuf: (buf, off) => {
            let len = buf[off],
                res: boolean[] = []
            off++
            for (let i = 0; i < len; i++) {
                res.push(buf[off + i] > 0)
            }
            return {
                offset: off + len,
                val: res
            }
        }
    },
    DoubleArray: <f<number[]>>{
        getlen: () => 0,
        toBuf: (val) => {
            let len = val.length
            return {
                len: () => 8 * val.length + 1,
                func: (buf, off) => {
                    for (let i = 0; i < val.length; i++) {
                        buf[off] = val.length
                        off++
                        ieee754.write(buf, val[i], off + 8 * i, false, 52, 8)
                    }
                }
            }
        },
        fromBuf: (buf, off) => {
            let val = buf[off],
                num: number[] = []
            off++
            for (let i = 0; i < val; i++) {
                num.push(ieee754.read(buf, off + i * 8, false, 52, 8))
            }
            return {
                offset: off + val * 8,
                val: num
            }
        }
    },
    StringArray: <f<string[]>>{
        getlen: () => 0,
        toBuf: (val) => {
            let lens: Buffer[] = [],
                len = 1
            for (let i = 0; i < val.length; i++) {
                lens[i] = Buffer.concat([val[i].length.to128(), Buffer.from(val[i])])
                len += lens[i].length
            }
            return {
                len: () => len,
                func: (buf, off) => {
                    buf[off] = val.length
                    off++
                    for (let i = 0; i < val.length; i++) {
                        lens[i].copy(buf, off)
                        off += lens[i].length
                    }
                }
            }
        },
        fromBuf: (buf, off) => {
            let len = buf[off],
                s: string[] = [],
                st: { offset: number, val: string }
            off++
            for (let i = 0; i < len; i++) {
                st = fromLEBuf(buf, off)
                s[i] = st.val
                off = st.offset
            }
            return {
                offset: off,
                val: s
            }
        }
    },
    RPCD: <f<d['RPCD']>>{
        fromBuf: (buf, off) => {
            let len = buf[off], st: { val: string, offset: number }
            off++
            if (buf[off] !== 1) return
            off++
            st = fromLEBuf(buf, off)
            off = st.offset
            let name = st.val,
                parNum = buf[off],
                par: RPCDPar[] = [],
                s = { offset: 0, val: "" },
                resNum=0
            off++
            for (let i = 0; i < parNum; i++) {
                let lastPar: RPCDPar = { type: 0, name: "", default: 0, result: [] }
                lastPar.type = buf[off]
                s = fromLEBuf(buf, off)
                lastPar.name = s.val
                off = s.offset
                let t = TypesFrom[lastPar.type](buf, off)
                lastPar.default = t.val
                off = t.offset
                resNum = buf[off]
                off++
                for (let i = 0; i < resNum; i++) {
                    let res = { type: 0, name: "" }
                    res.type = buf[off]
                    s = fromLEBuf(buf, off + 1)
                    res.name = s.val
                    off = s.offset
                    lastPar.result.push(res)
                }
                par.push(lastPar)
            }
            return {
                offset: off,
                val: {
                    name,
                    par
                }
            }
        }
    }
}
interface typesFrom{
    [key:number]:bufFrom<any>
    0:bufFrom<Boolean>
    1:bufFrom<number>
    2:bufFrom<String>
    3:bufFrom<Buffer>
    0x10:bufFrom<Boolean[]>
    0x11:bufFrom<number[]>
    0x12:bufFrom<string[]>
    0x20:bufFrom<RPCD>

}
var TypesFrom:typesFrom = {
        0: TypeBuf.Bool.fromBuf,
        1: TypeBuf.Double.fromBuf,
        2: TypeBuf.String.fromBuf,
        3: TypeBuf.RawData.fromBuf,
        0x10: TypeBuf.BoolArray.fromBuf,
        0x11: TypeBuf.DoubleArray.fromBuf,
        0x12: TypeBuf.StringArray.fromBuf,
        0x20: TypeBuf.RPCD.fromBuf
    }
//type a = keyof typesFrom
//function build<T1 extends a>(s: [T1]): (a: [typesFrom[T1]]) => Buffer
//function build<T1 extends a, T2 extends a>(s: [T1, T2]): (a: [typesFrom[T1], typesFrom[T2]]) => Buffer
//function build<T1 extends a, T2 extends a, T3 extends a>(s: [T1, T2, T3]): (a: [typesFrom[T1], typesFrom[T2], typesFrom[T3]]) => Buffer
//function build<T1 extends a, T2 extends a, T3 extends a, T4 extends a>(s: [T1, T2, T3, T4]): (a: [typesFrom[T1], typesFrom[T2], typesFrom[T3], typesFrom[T4]]) => Buffer
//function build<T1 extends a, T2 extends a, T3 extends a, T4 extends a, T5 extends a>(s: [T1, T2, T3, T4, T5]): (a: [typesFrom[T1], typesFrom[T2], typesFrom[T3], typesFrom[T4], typesFrom[T5]]) => Buffer
//function build<T1 extends a, T2 extends a, T3 extends a, T4 extends a, T5 extends a, T6 extends a>(s: [T1, T2, T3, T4, T5, T6]): (a: [typesFrom[T1], typesFrom[T2], typesFrom[T3], typesFrom[T4], typesFrom[T5], typesFrom[T6]]) => Buffer
function build(s: number[]): (a: any[]) => Buffer{
    let byteCount = 0
    for (let i = 0; i < s.length; i++) {
        TypeBuf[s[i]]
    }
    return (a) => {

        return Buffer.alloc(0)
    }
}
String.prototype.toLEBufA = function (this: string) {
    let n = this.length
    let r: number[] = []
    while (n > 0x07f) {
        r.push((n & 0x7f) | 0x80)
        n = n >> 7
    }
    r.push(n)
    return [...r, ...Buffer.from(this, 'utf8')]
}
function fromLEBuf(buf, offset) {
    let res = numFrom128(buf, offset),
        end = res.offset + res.val
    return { offset: end, val: buf.slice(res.offset, end).toString('utf8') }
}
Number.prototype.to754 = function (this: number) {
    let b = Buffer.alloc(8)
    ieee754.write(b, this, 0, false, 52, 8)
    return [...b]
}
Number.prototype.to128 = function (this: number) {
    let n = this
    let r: number[] = []
    while (n > 0x07f) {
        r.push((n & 0x7f) | 0x80)
        n = n >> 7
    }
    r.push(n)
    return Buffer.from(r)
}
function numFrom128(buf: Buffer, offset: number) {
    let r = 0, n = buf[offset]
    offset++
    r = n;
    while (n > 0x7f) {
        n = buf[offset]
        r = (r << 7) + n & 0x7f
        offset++
    }
    return {
        val: r,
        offset
    }
}
declare global {
    interface Number {
        to754(): number[]
        to128(): Buffer
    }
    interface String {
        toLEBufA(): number[]
    }
}