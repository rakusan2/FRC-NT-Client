import { Writable } from "stream";
import { NTID, TypesTranslator, LengthError, checkBufLen, ITypesTo, NTTypeID, ITypesFrom, RPC, numFrom128 } from "./NTTypes";

const KEEP_ALIVE_BUF = Buffer.from([0])
const HELLO_COMPLETE_BUF = Buffer.from([0x05])

export class translator extends Writable implements IToServer {
    private __writeFunc: (buf: Buffer) => any
    private __is2_0: boolean

    private __NTTypeTranslator = new TypesTranslator()
    private __interpreter: IInterpreter
    private __valTobuf = this.__NTTypeTranslator.valToBuf
    private __readerFuncs : IDFuncs
    private __callbackFunctions:requirements

    KeepAlive
    HelloComplete
    Hello
    Assign
    Update
    FlagsUpdate
    Delete
    DeleteAll
    RPCExec

    constructor(req: requirements,useVersion = '3.0') {
        super()
        this.__writeFunc = req.write
        this.__callbackFunctions = req
        this.useVersion(useVersion)
    }
    _write(chunk, encoding: string, next: (error?: Error) => any) {
        if (Buffer.isBuffer(chunk)) {
            this.read(chunk)
        } else if (typeof chunk == "string") {
            this.read(Buffer.from(chunk, encoding))
        }
        next()
    }
    read(buf: Buffer) {
        try {
            buf

        } catch (error) {
            if (error instanceof LengthError) {

            } else throw error
        }
    }
    useVersion(ver: string): boolean {
        switch (ver) {
            case "3.0":
                this.__readerFuncs = get3_0(this.__callbackFunctions,this.__NTTypeTranslator.bufToVal)
                return true
            case "2.0":
                this.__readerFuncs = get2_0(this.__callbackFunctions,this.__NTTypeTranslator.bufToVal)
                return true
            default:
                return false
        }
    }
}

let func3_0: IFunc3_0 = {
    Hello(callback: (name: string, flags: number) => any, translator) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 1)

            let flags = buf[offset++],
                name = translator[NTTypeID.String](buf, offset)

            callback(name.val, flags)
            return name.offset
        }
    },
    Assign(callback: (name: string, type: number, entryID: number, seq: number, val: any, flags: number) => any, translator, setTypeID) {
        return (buf, offset) => {
            let key = translator[NTTypeID.String](buf, offset)
            offset = key.offset

            checkBufLen(buf, offset, 6)

            let type = buf[offset++],
                id = get2Bytes(buf, offset),
                seq = get2Bytes(buf, offset + 2),
                flags = buf[offset + 4],
                val = translator[type](buf, offset + 5)

            offset = val.offset
            if (isRPC(val.val, type)) {
                setTypeID(id, val.val.results.map(a => a.typeId))
            }

            callback(key.val, type, id, seq, val.val, flags)
            return offset
        }
    },
    Update(callback: (entryID: number, seq: number, val: number, type: number) => any) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 4)

            let id = get2Bytes(buf, offset),
                seq = get2Bytes(buf, offset + 2),
                type = buf[offset + 4],
                val = translator[type](buf, offset + 5)

            offset = val.offset

            callback(id, seq, val.val, type)
            return offset
        }
    },
    FlagsUpdate(callback: (entryID: number, flags: number) => any) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 3)

            let id = get2Bytes(buf, offset),
                flags = buf[offset + 2]

            offset += 3

            callback(id, flags)
            return offset
        }
    },
    Delete(callback: (entryID: number) => any) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 2)

            let id = get2Bytes(buf, offset)

            offset + 2

            callback(id)
            return offset
        }
    },
    DeleteAll(callback: (secret: number) => any) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 4)

            let val = 0;
            for (let i = 0; i < 4; i++) {
                val = (val << 8) + buf[offset + i];
            }

            callback(val)
            return offset + 4
        }
    },
    RPCResponse(callback: (id: number, execID: number, result: any[]) => any, translator, getTypeID) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 4)

            let entryID = get2Bytes(buf, offset),
                execID = get2Bytes(buf, offset + 2),
                resultByteLength = numFrom128(buf, offset + 4),
                resulTypes = getTypeID(entryID)

            offset = resultByteLength.offset
            checkBufLen(buf, offset, resultByteLength.val)
            if (!Array.isArray(resulTypes)) {
                return offset + resultByteLength.val
            }

            let results = new Array(resulTypes.length),
                res: { val: any, offset: number }

            offset = resultByteLength.offset
            for (let i = 0; i < resulTypes.length; i++) {
                res = translator[resulTypes[i]](buf, offset)
                results[i] = res.val
                offset = res.offset
            }

            callback(entryID, execID, results)
            return offset
        }
    }
}

let func2_0: IFunc2_0 = {
    KeepAlive(callback: () => any) {
        return (buf, offset) => {
            callback()
            return offset
        }
    },
    VersionUnsupported(callback: (major: number, minor: number) => any) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 2)

            let maj = buf[offset++],
                min = buf[offset++]

            callback(maj, min)
            return offset
        }
    },
    HelloComplete(callback: () => any) {
        return (buf, offset) => {
            callback()
            return offset
        }
    },
    Hello(callback: (name: string) => any, translator) {
        return (buf, offset) => {
            let name = translator[NTTypeID.String](buf, offset)

            callback(name.val)
            return name.offset
        }
    },
    Assign(callback: (name: string, type: number, entryID: number, seq: number, val: any) => any, translator, setTypeID) {
        return (buf, offset) => {
            let key = translator[NTTypeID.String](buf, offset)
            offset = key.offset

            checkBufLen(buf, offset, 5)

            let type = buf[offset++],
                id = get2Bytes(buf, offset),
                seq = get2Bytes(buf, offset + 2),
                val = translator[type](buf, offset + 4)

            offset = val.offset
            setTypeID(id, type)

            callback(key.val, type, id, seq, val.val)
            return offset
        }
    },
    Update(callback: (entryID: number, seq: number, val: any, type: number) => any, translator, getTypeID) {
        return (buf, offset) => {
            checkBufLen(buf, offset, 4)

            let id = get2Bytes(buf, offset),
                seq = get2Bytes(buf, offset + 2),
                type = getTypeID(id) as number,
                val = translator[type](buf, offset + 4)

            offset = val.offset

            callback(id, seq, val.val, type)
            return offset
        }
    }
}

function get3_0(req: requirements, typeTranslator: ITypesFrom): IDFuncs {
    let ids = {}
    function getSetTypeID(id: number, val?: number | number[]) {
        if (typeof val == 'undefined') {
            return ids[id]
        } else {
            ids[id] = val
        }
    }
    return {
        [NTID.KeepAlive]: func2_0.KeepAlive(req.KeepAlive),
        [NTID.ProtocolVersionUnsupported]: func2_0.VersionUnsupported(req.VersionUnsupported),
        [NTID.ServerHelloComplete]: func2_0.HelloComplete(req.HelloComplete),
        [NTID.ServerHello]: func3_0.Hello(req.Hello, typeTranslator),
        [NTID.EntryAssignment]: func3_0.Assign(req.Assign, typeTranslator, getSetTypeID),
        [NTID.EntryUpdate]: func3_0.Update(req.Update, typeTranslator, getSetTypeID),
        [NTID.EntryFlagsUpdate]: func3_0.FlagsUpdate(req.FlagsUpdate),
        [NTID.EntryDelete]: func3_0.Delete(req.Delete),
        [NTID.ClearAllEntries]: func3_0.DeleteAll(req.DeleteAll),
        [NTID.RPCResponse]: func3_0.RPCResponse(req.getRPCResponse, translator, getSetTypeID)
    }
}

function get2_0(req: requirements, typeTranslator: ITypesFrom): IDFuncs {
    let ids = {}
    function getSetTypeID(id: number, val?: number | number[]) {
        if (typeof val == 'undefined') {
            return ids[id]
        } else {
            ids[id] = val
        }
    }
    return {
        [NTID.KeepAlive]: func2_0.KeepAlive(req.KeepAlive),
        [NTID.ProtocolVersionUnsupported]: func2_0.VersionUnsupported(req.VersionUnsupported),
        [NTID.ServerHelloComplete]: func2_0.HelloComplete(req.HelloComplete),
        [NTID.ServerHello]: func2_0.Hello(req.Hello, typeTranslator),
        [NTID.EntryAssignment]: func2_0.Assign(req.Assign, typeTranslator, getSetTypeID),
        [NTID.EntryUpdate]: func2_0.Update(req.Update, typeTranslator, getSetTypeID)
    }
}

function get2Bytes(buf: Buffer, offset: number) {
    return (buf[offset] << 8) + buf[offset + 1]
}

function isRPC(val: any, type: number): val is RPC {
    if (type == NTTypeID.RPC) return true
    else return false
}

// Types and Interfaces 
type IInterpreter = { [id: number]: (buf: Buffer, offset: number) => number }


export interface IToServer extends NetworkTablesServerAndClient {
    RPCExec(entryID: number, returnID: number, parameters: any[])
}

export interface NetworkTablesServerAndClient {
    KeepAlive()
    HelloComplete()
    Hello(name: string, flags?: number)
    Assign(name: string, type: number, entryID: number, seq: number, val: any, flags?: number)
    Update(entryID: number, seq: number, val: number, type: number)
    FlagsUpdate(entryID: number, flags: number)
    Delete(entryID: number)
    DeleteAll(secret: number)
}

export interface IFromServer extends NetworkTablesServerAndClient {
    VersionUnsupported(major: number, minor: number)
    getRPCResponse(id: number, execID: number, result: any[])
}

export interface requirements extends IFromServer {
    write(buf: Buffer)
}

interface IGetFromServer {
    KeepAlive(callbacl: () => any)
    VersionUnsupported(callback: (major: number, minor: number) => any)
    HelloComplete(callback: () => any)
    Hello(callback: (name: string, flags?: number) => any)
    Assign(callback: (name: string, type: number, entryID: number, seq: number, val: any, flags?: number) => any)
    Update(callback: (entryID: number, seq: number, val: number, type: number) => any)
    FlagsUpdate(callback: (entryID: number, flags: number) => any)
    Delete(callback: (entryID: number) => any)
    DeleteAll(callback: (secret: number) => any)
    RPCResponse(callback: (id: number, execID: number, result: any[]) => any)
}

interface IGetSetTypeID {
    (id: number, type: number | number[]): void
    (id: number): number | number[]
}

type functionBufferReturner = { [name: string]: (callback: Function, translator?: ITypesFrom, getSetTypeID?: IGetSetTypeID) => (buf: Buffer, offset: number) => number }

interface IFunc3_0 extends functionBufferReturner {
    Hello(callback: (name: string, flags: number) => any, translator: ITypesFrom)
    Assign(callback: (name: string, type: number, entryID: number, seq: number, val: any, flags: number) => any, translator: ITypesFrom, setTypeID: IGetSetTypeID)
    Update(callback: (entryID: number, seq: number, val: any, type: number) => any, translator: ITypesFrom, getTypeID: IGetSetTypeID)
    FlagsUpdate(callback: (entryID: number, flags: number) => any)
    Delete(callback: (entryID: number) => any)
    DeleteAll(callback: (secret: number) => any)
    RPCResponse(callback: (id: number, execID: number, result: any[]) => any, translator, getTypeID)
}
interface IFunc2_0 extends functionBufferReturner {
    KeepAlive(callback: () => any)
    VersionUnsupported(callback: (major: number, minor: number) => any)
    HelloComplete(callback: () => any)
    Hello(callback: (name: string) => any, translator: ITypesFrom)
    Assign(callback: (name: string, type: number, entryID: number, seq: number, val: any) => any, translator: ITypesFrom, setTypeID: IGetSetTypeID)
    Update(callback: (entryID: number, seq: number, val: any, type: number) => any, translator: ITypesFrom, getTypeID: IGetSetTypeID)
}

type IDFuncs = { [key: number]: (buf: Buffer, offset: number) => any }