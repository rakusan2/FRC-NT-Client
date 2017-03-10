import * as ieee754 from 'ieee754'
import * as net from 'net'
var strLenIdent = numTo128
export type Listener = (key: string, value: any, valueType: String, type: "add" | "delete" | "update" | "flagChange", id: number, flags: number) => any
export class Client {
    serverName: String
    clientName = "node" + +new Date()
    private client: net.Socket
    private connected = false
    private entries: { [key: number]: Entry } = {}
    private keymap: { [key: string]: number } = {}
    private reconnect = false
    private address: string
    private port: number
    private listeners: Listener[] = []
    private RPCExecCallback: { [key: number]: (result: Object) => any } = {}
    private lateCallbacks: (() => any)[] = []
    private conCallback: (connected: boolean, err: Error, is2_0: boolean) => any
    private is2_0 = false
    /**
     * True if the Client has completed its hello and is connected
     */
    isConnected() {
        return this.connected
    }
    /**
     * True if the client has switched to 2.0
     */
    uses2_0() {
        return this.is2_0
    }
    /**
     * Start the Client
     * @param callback Called on connect or error
     * @param address Address of the Server. Default = "localhost"
     * @param port Port of the Server. Default = 1735
     */
    start(callback?: (connected: boolean, err: Error, is2_0: boolean) => any, address = '127.0.0.1', port = 1735) {
        this.connected = false
        this.address = address
        this.port = port
        this.conCallback = callback
        this.client = net.connect(port, address, () => {
            this.toServer.Hello(this.clientName)
            this.client.on('data', data => {
                this.read(data, 0)
            })
        }).on('close', e => {
            this.connected = false
            if (this.reconnect) {
                this.start(callback, address, port)
            }
        }).on('error', err => callback(false, err, this.is2_0))
    }
    /**
     * Add a Listener to be called on change of an Entry
     * @param callback Listener
     */
    addListener(callback: Listener) {
        this.listeners.push(callback)
    }
    /**
     * Get the unique ID of a key or the IDs of all keys if called empty
     * @param key name of the key
     */
    getKeyID(key?: string) {
        if (key == undefined) {
            return this.keymap
        }
        else return this.keymap[key]
    }
    /**
     * Gets an Entry
     * @param id ID of an Entry
     */
    getEntry(id: number) {
        return this.entries[id]
    }
    /**
     * Get an Array of Keys
     */
    getKeys() {
        return Object.keys(this.keymap)
    }
    /**
     * Get All of the Entries
     */
    getEntries() {
        return this.entries
    }
    private read(buf: Buffer, off: number) {
        if (buf[off] in this.recProto) {
            off = this.recProto[buf[off]](buf, off + 1)
            if (buf.length > off) this.read(buf, off)
        }
    }
    private readonly recProto: { [key: number]: (buf: Buffer, offset: number) => number } = {
        /** Protocol Version Unsupported */
        0x02: (buf, off) => {
            var ver = `${buf[off++]}.${buf[off++]}`
            if (ver === '2.0') {
                this.reconnect = true
                this.is2_0 = true
                strLenIdent = numTo2Byte
            }
            else this.conCallback(false, new Error('Unsupported protocol: ' + ver), this.is2_0)
            return off
        },
        /** Server Hello Complete */
        0x03: (buf, off) => {
            if (this.is2_0) {
                this.afterConnect()
            } else {
                this.toServer.HelloComplete()
            }
            return off
        },
        /** Server Hello */
        0x04: (buf, off) => {
            let flags = buf[off++]
            let sName = TypesFrom[e.String](buf, off)
            this.serverName = sName.val
            return sName.offset
        },
        /** Entry Assignment */
        0x10: (buf, off) => {
            let keyName = TypesFrom[e.String](buf, off)
            off = keyName.offset
            let type = buf[off++],
                id = (buf[off++] << 8) + buf[off++],
                typeName = typeNames[type],
                entry: Entry = {
                    typeID: type,
                    name: keyName.val,
                    sn: (buf[off++] << 8) + buf[off++],
                    flags: buf[off++]
                }
            let val = TypesFrom[entry.typeID](buf, off)
            entry.val = val.val
            this.entries[id] = entry
            this.keymap[val.val] = id
            for (let i = 0; i < this.listeners.length; i++) {
                if (this.connected) {
                    this.listeners[i](keyName.val, val.val, typeName, "add", id, entry.flags)
                }
                else {
                    this.lateCallbacks.push(() => this.listeners[i](keyName.val, val.val, typeName, "add", id, entry.flags))
                }
            }
            return val.offset
        },
        /** Entry Update */
        0x11: (buf, off) => {
            let id = (buf[off++] << 8) + buf[off++],
                sn = (buf[off++] << 8) + buf[off++],
                type = buf[off++],
                val = TypesFrom[type](buf, off),
                typeName = typeNames[type],
                name = ""
            if (id in this.entries && type === this.entries[id].typeID) {
                let entry = this.entries[id]
                entry.sn = sn
                entry.val = val.val
                name = entry.name
                for (let i = 0; i < this.listeners.length; i++) {
                    if (this.connected) {
                        this.listeners[i](name, val.val, typeName, "update", id, entry.flags)
                    }
                    else {
                        this.lateCallbacks.push(() => this.listeners[i](name, val.val, typeName, "update", id, entry.flags))
                    }
                }
            }
            return val.offset
        },
        /** Entry Flags Update */
        0x12: (buf, off) => {
            let id = (buf[off++] << 8) + buf[off++],
                flags = buf[off++]
            if (id in this.entries) {
                let entry = this.entries[id]
                entry.flags = flags
                for (let i = 0; i < this.listeners.length; i++) {
                    if (this.connected) {
                        this.listeners[i](entry.name, entry.val, typeNames[entry.typeID], "flagChange", id, flags)
                    }
                    else {
                        this.lateCallbacks.push(() => this.listeners[i](entry.name, entry.val, typeNames[entry.typeID], "flagChange", id, flags))
                    }
                }
            }
            return off
        },
        /** Entry Delete */
        0x13: (buf, off) => {
            let id = (buf[off++] << 8) + buf[off++],
                name = this.entries[id].name,
                typename = typeNames[this.entries[id].typeID],
                flags = this.entries[id].flags
            delete this.entries[id]
            delete this.keymap[name]
            for (let i = 0; i < this.listeners.length; i++) {
                if (this.connected) {
                    this.listeners[i](name, null, typename, "delete", id, flags)
                }
                else {
                    this.lateCallbacks.push(() => this.listeners[i](name, null, typename, "delete", id, flags))
                }
            }
            return off
        },
        /** Clear All Entries */
        0x14: (buf, off) => {
            let val = 0
            for (let i = 0; i < 4; i++) {
                val = (val << 8) + buf[off + i]
            }
            if (val === 0xD06CB27A) {
                this.entries = {}
                this.keymap = {}
            }
            return off + 4
        },
        /** RPC Response */
        0x21: (buf, off) => {
            let id = (buf[off++] << 8) + buf[off++],
                executeID = (buf[off++] << 8) + buf[off++],
                len = fromLEBuf(buf, off),
                res = (<RPC>this.entries[id].val).results,
                results = {},
                s: { val: any, offset: number }
            for (let i = 0; i < res.length; i++) {
                for (let i = 0; i < res.length; i++) {
                    s = TypesFrom[res[i].typeId](buf, off)
                    off = s.offset
                    results[res[i].name] = s.val
                }
            }
            if (executeID in this.RPCExecCallback) {
                this.RPCExecCallback[executeID](results)
                delete this.RPCExecCallback[executeID]
            }
            return off
        }
    }
    private afterConnect() {
        this.connected = true
        this.conCallback(true, null, this.is2_0)
        while (this.lateCallbacks.length) {
            this.lateCallbacks.shift()()
        }
    }
    private readonly toServer = {
        Hello: (serverName: string) => {
            if (this.is2_0) {
                this.write(toServer.hello2_0)
            } else {
                let s = TypeBuf[e.String].toBuf(serverName),
                    buf = Buffer.allocUnsafe(s.length + 3)
                buf[0] = 0x01
                buf[1] = 3
                buf[2] = 0
                s.write(buf, 3)
                this.write(buf, true)
            }
        },
        HelloComplete: () => {
            this.write(toServer.helloComplete, true)
            this.afterConnect()
        }
    }
    /**
     * Add an Entry
     * @param val The Value
     * @param name The Key of the Entry
     * @param persist Whether the Value should persist on the server through a restart
     */
    Assign(val: any, name: string, persist = false) {
        let type = getType(val)
        if (this.is2_0 && type === e.RawData) return new Error('2.0 does not have Raw Data')
        if (type === e.RPC) return new Error('Clients can not assign an RPC')
        let n = TypeBuf[e.String].toBuf(name),
            f = TypeBuf[type].toBuf(val),
            nlen = n.length,
            assignLen = this.is2_0 ? 6 : 7,
            len = f.length + nlen + assignLen,
            buf = Buffer.allocUnsafe(len)
        buf[0] = 0x10
        n.write(buf, 1)
        buf[nlen + 1] = type
        buf[nlen + 2] = 0xff
        buf[nlen + 3] = 0xff
        buf[nlen + 4] = 0
        buf[nlen + 5] = 0
        if (!this.is2_0) buf[nlen + 6] = persist ? 1 : 0
        f.write(buf, nlen + assignLen)
        this.write(buf)
    }
    /**
     * Updates an Entry
     * @param id The ID of the Entry
     * @param val The value of the Entry
     */
    Update(id: number, val: any) {
        if (!(id in this.entries)) return new Error('ID not found')
        let entry = this.entries[id]
        if (!checkType(val, entry.typeID)) return new Error('Wrong Type')
        entry.val = val
        let f = TypeBuf[entry.typeID].toBuf(val),
            updateLen = this.is2_0 ? 5 : 6,
            len = f.length + updateLen,
            buf = Buffer.allocUnsafe(len)
        entry.sn++
        buf[0] = 0x11
        buf[1] = id >> 8
        buf[2] = id & 0xff
        buf[3] = entry.sn >> 8
        buf[4] = entry.sn & 0xff
        if (!this.is2_0) buf[5] = entry.typeID
        f.write(buf, updateLen)
        this.write(buf)
    }
    /**
     * Updates the Flag of an Entry
     * @param id The ID of the Entry
     * @param persist Whether the Entry should persist through a restart on the server
     */
    Flag(id: number, persist = false) {
        if (this.is2_0) return new Error('2.0 does not support flags')
        if (!(id in this.entries)) return new Error('Does not exist')
        this.write(Buffer.from([0x12, id >> 8, id & 0xff, persist ? 1 : 0]))
    }
    /**
     * Deletes an Entry
     * @param id The ID of the Entry
     */
    Delete(id: number) {
        if (this.is2_0) return new Error('2.0 does not support delete')
        if (!(id in this.entries)) return new Error('Does not exist')
        this.write(Buffer.from([0x13, id >> 8, id & 0xff]))
    }
    /**
     * Deletes All Entries
     */
    DeleteAll() {
        if (this.is2_0) return new Error('2.0 does not support delete')
        this.write(toServer.deleteAll)
        this.entries = {}
        this.keymap = {}
    }
    /**
     * Executes an RPC
     * @param id The ID of the RPC Entry
     * @param val The Values of the Parameters
     * @param callback To be called with the Results
     */
    RPCExec(id: number, val: Object, callback: (result: Object) => any) {
        if (this.is2_0) return new Error('2.0 does not support RPC')
        if (id in this.entries) return new Error('Does not exist')
        let entry = this.entries[id]
        if (entry.typeID !== e.RPC) return new Error('Is not an RPC')
        let par = (<RPC>entry.val).par,
            f: toBufRes[] = [],
            value: any,
            len = 0,
            parName = ""
        for (let i = 0; i < par.length; i++) {
            parName = par[i].name
            value = parName in val ? val[par[i].name] : par[i].default
            if (!checkType(value, par[i].typeId)) return new Error(`Wrong Type: ${value} is not a ${typeNames[par[i].typeId]}`)
            let n = TypeBuf[par[i].typeId].toBuf(value)
            len += n.length
            f.push(n)
        }
        let encLen = numTo128(len),
            buf = Buffer.allocUnsafe(len + encLen.length + 5),
            off = 5 + encLen.length,
            randId = Math.floor(Math.random() * 0xffff)
        buf[0] = 0x21
        buf[1] = id >> 8
        buf[2] = id & 0xff
        buf[3] = randId >> 8
        buf[4] = randId & 0xff
        encLen.copy(buf, 5)
        for (let i = 0; i < f.length; i++) {
            f[i].write(buf, off)
            off += f[i].length
        }
        this.write(buf)
        this.RPCExecCallback[randId] = callback
    }
    private keys: string[]
    private readonly keepAlive = Buffer.from([0])
    private aliveTimer: NodeJS.Timer
    private bufferTimer: NodeJS.Timer
    private buffersToSend: Buffer[] = []
    /**
     * Direct Write to the Server
     * @param buf The Buffer to be sent
     * @param immediate whether the write should happen right away
     */
    write(buf: Buffer, immediate = false) {
        if (this.aliveTimer) clearTimeout(this.aliveTimer)
        this.aliveTimer = setTimeout(() => { this.write(this.keepAlive) }, 1000);
        this.aliveTimer.unref()
        if (immediate) this.client.write(buf)
        else {
            this.buffersToSend.push(buf)
            if (!this.bufferTimer) this.bufferTimer = setTimeout(() => this.client.write(Buffer.concat(this.buffersToSend)), 20)
        }
    }
}
const typeNames = {
    0x00: "Boolean",
    0x01: "Number",
    0x02: "String",
    0x03: "Buffer",
    0x10: "BooleanArray",
    0x11: "NumberArray",
    0x12: "StringArray",
    0x20: "RPC"
}
function checkType(val: any, type: number) {
    if (Array.isArray(val)) {
        if (type === e.BoolArray && val.every(e => typeof e === "boolean")) return true
        else if (type === e.DoubleArray && val.every(e => typeof e === "number")) return true
        else if (type === e.StringArray && val.every(e => typeof e === "string")) return true
        else return false
    } else {
        if (type === e.Boolean && typeof val === "boolean") return true
        else if (type === e.Double && typeof val === "number") return true
        else if (type === e.String && typeof val === "string") return true
        else if (type === e.RawData && Buffer.isBuffer(val)) return true
        else return false
    }
}
function getType(val: any) {
    if (Array.isArray(val)) {
        if (typeof val[0] === "boolean") return 0x10
        else if (typeof val[0] === "number") return 0x11
        else if (typeof val[0] === "string") return 0x12
        else if (typeof val[0] === "object") return 0x20
    } else {
        if (typeof val === "boolean") return 0x00
        else if (typeof val === "number") return 0x01
        else if (typeof val === "string") return 0x02
        else if (Buffer.isBuffer(val)) return 0x03
    }
}
const toServer = {
    helloComplete: Buffer.from([0x05]),
    deleteAll: Buffer.from([0x14, 0xD0, 0x6C, 0xB2, 0x7A]),
    hello2_0: Buffer.from([0x01, 2, 0])
}
export interface Entry {
    typeID: number,
    name: string,
    sn: number,
    flags: number,
    val?: any
}
const enum e {
    Boolean = 0x00,
    Double = 0x01,
    String = 0x02,
    RawData = 0x03,
    BoolArray = 0x10,
    DoubleArray = 0x11,
    StringArray = 0x12,
    RPC = 0x20
}
interface RPC {
    name: string,
    par: RPCPar[],
    results: RPCResult[]
}
interface RPCPar {
    typeId: number,
    typeName: string,
    name: string,
    default: any
}
interface RPCResult {
    typeId: number,
    typeName: string,
    name: string
}
type bufFrom<T> = (buf: Buffer, offset: number) => {
    offset: number,
    val: T
}
interface toBufRes {
    length: number,
    write: (buf: Buffer, off: number) => any
}
interface f<T> {
    toBuf?: (val: T) => toBufRes
    fromBuf: (buf: Buffer, offset: number) => {
        offset: number,
        val: T
    }
}
interface fromBuf {
    [key: number]: f<any>
    0x00: f<Boolean>
    0x01: f<number>
    0x02: f<string>
    0x03: f<Buffer>
    0x10: f<Boolean[]>
    0x11: f<number[]>
    0x12: f<string[]>
    0x20: f<RPC>
}

const TypeBuf: fromBuf = {
    0x00: <f<boolean>>{
        toBuf: (val) => {
            return {
                length: 1,
                write: (buf, off) => {
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
    0x01: <f<number>>{
        toBuf: (val) => {
            return {
                length: 8,
                write: (buf, off) => {
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
    0x02: <f<string>>{
        toBuf: (val) => {
            let bufT = Buffer.concat([strLenIdent(val.length), Buffer.from(val, 'utf8')])
            return {
                length: bufT.length,
                write: (buf, off) => {
                    bufT.copy(buf, off)
                }
            }
        },
        fromBuf: (buf, off) => {
            return fromLEBuf(buf, off)
        }
    },
    0x03: <f<Buffer>>{
        toBuf: (val) => {
            let len = numTo128(val.length)
            return {
                length: val.length + len.length,
                write: (buf, off) => {
                    len.copy(buf, off)
                    val.copy(buf, off + len.length)
                }
            }
        },
        fromBuf: (buf, off) => {
            let { val, offset } = numFrom128(buf, off),
                nbuf = Buffer.allocUnsafe(val)
            buf.copy(nbuf, 0, offset)
            return {
                offset: offset + nbuf.length,
                val: nbuf
            }
        }
    },
    0x10: <f<Boolean[]>>{
        toBuf: (val) => {
            return {
                length: val.length + 1,
                write: (buf, off) => {
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
    0x11: <f<number[]>>{
        toBuf: (val) => {
            let len = val.length
            return {
                length: 8 * val.length + 1,
                write: (buf, off) => {
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
    0x12: <f<string[]>>{
        toBuf: (val) => {
            let lens: Buffer[] = [],
                len = 1
            for (let i = 0; i < val.length; i++) {
                lens[i] = Buffer.concat([strLenIdent(val[i].length), Buffer.from(val[i])])
                len += lens[i].length
            }
            return {
                length: len,
                write: (buf, off) => {
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
    0x20: <f<RPC>>{
        fromBuf: (buf, off) => {
            let len = buf[off], st: { val: string, offset: number }
            off++
            if (buf[off] !== 1) return
            off++
            st = fromLEBuf(buf, off)
            off = st.offset
            let name = st.val,
                parNum = buf[off],
                par: RPCPar[] = [],
                results: RPCResult[] = [],
                s = { offset: 0, val: "" },
                resNum = 0
            off++
            for (let i = 0; i < parNum; i++) {
                let lastPar: RPCPar = { typeId: 0, typeName: "", name: "", default: 0 }
                lastPar.typeId = buf[off]
                lastPar.typeName = typeNames[lastPar.typeId]
                s = fromLEBuf(buf, off)
                lastPar.name = s.val
                off = s.offset
                let t = TypesFrom[lastPar.typeId](buf, off)
                lastPar.default = t.val
                off = t.offset
                par.push(lastPar)
            }
            resNum = buf[off++]
            for (let i = 0; i < resNum; i++) {
                let res: RPCResult = { typeId: 0, typeName: "", name: "" }
                res.typeId = buf[off]
                res.typeName = typeNames[res.typeId]
                s = fromLEBuf(buf, off + 1)
                res.name = s.val
                off = s.offset
                results.push(res)
            }
            return {
                offset: off,
                val: {
                    name,
                    par,
                    results
                }
            }
        }
    }
}
interface typesFrom {
    [key: number]: bufFrom<any>
    0x00: bufFrom<Boolean>
    0x01: bufFrom<number>
    0x02: bufFrom<string>
    0x03: bufFrom<Buffer>
    0x10: bufFrom<Boolean[]>
    0x11: bufFrom<number[]>
    0x12: bufFrom<string[]>
    0x20: bufFrom<RPC>
    //0x21: bufFrom<number>

}
var TypesFrom: typesFrom = {
    0x00: TypeBuf[e.Boolean].fromBuf,
    0x01: TypeBuf[e.Double].fromBuf,
    0x02: TypeBuf[e.String].fromBuf,
    0x03: TypeBuf[e.RawData].fromBuf,
    0x10: TypeBuf[e.BoolArray].fromBuf,
    0x11: TypeBuf[e.DoubleArray].fromBuf,
    0x12: TypeBuf[e.StringArray].fromBuf,
    0x20: TypeBuf[e.RPC].fromBuf,
    //0x21: TypeBuf[e.Byte].fromBuf
}
function fromLEBuf(buf: Buffer, offset: number) {
    let res = numFrom128(buf, offset),
        end = res.offset + res.val
    return { offset: end, val: buf.slice(res.offset, end).toString('utf8') }
}


function numTo128(num: number) {
    let n = num
    let r: number[] = []
    while (n > 0x07f) {
        r.push((n & 0x7f) | 0x80)
        n = n >> 7
    }
    r.push(n)
    return Buffer.from(r)
}
function numTo2Byte(num: number) {
    return Buffer.from([(this >> 8) & 0xff, this & 0xff])
}
function numFrom128(buf: Buffer, offset: number) {
    let r = 0, n = buf[offset]
    offset++
    r = n & 0x7f;
    while (n > 0x7f) {
        n = buf[offset]
        r = (r << 7) + (n & 0x7f)
        offset++
    }
    return {
        val: r,
        offset
    }
}