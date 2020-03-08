import { BufSequencer, BufBuilder } from './bufBuilder'
import * as ieee754 from 'ieee754'
import { RPC, RPCPar, RPCResult, MessageType } from './definitions'

export const typeNames = {
    0x00: "Boolean",
    0x01: "Number",
    0x02: "String",
    0x03: "Buffer",
    0x10: "BooleanArray",
    0x11: "NumberArray",
    0x12: "StringArray",
    0x20: "RPC"
}

interface EntryValTypes {
    0x00: boolean,
    0x01: number,
    0x02: string,
    0x03: Buffer,
    0x10: boolean[],
    0x11: number[],
    0x12: string[],
    0x20: RPC
}

export const enum EntryType {
    Boolean = 0x00,
    Number = 0x01,
    String = 0x02,
    Buffer = 0x03,
    BooleanArray = 0x10,
    NumberArray = 0x11,
    StringArray = 0x12,
    RPC = 0x20
}

export class BufferDecoder extends BufSequencer {
    private entryValDecoders = {
        0x00: this.nextBoolean,
        0x01: this.nextNumber,
        0x02: this.nextString,
        0x03: this.nextBuffer,
        0x10: this.nextBooleanArray,
        0x11: this.nextNumberArray,
        0x12: this.nextStringArray,
        0x20: this.nextRPC
    }
    private is2_0: boolean
    constructor(is2_0: boolean, buf?: Buffer) {
        super(buf)
        this.is2_0 = is2_0
    }

    nextType<T extends keyof EntryValTypes>(typeID: T): EntryValTypes[T]
    nextType(typeID: number): any
    nextType(typeID: number) {
        if (typeof this.entryValDecoders[typeID] === 'function') {
            return this.entryValDecoders[typeID]()
        } else {
            throw new Error(`Unknown Type 0x${typeID.toString(16)}`)
        }
    }
    nextBoolean() {
        return this.nextByte() > 0
    }
    nextNumber() {
        return ieee754.read(this.nextSlice(8), 0, false, 52, 8)
    }
    next2ByteNumber() {
        const [major, minor] = this.nextSlice(2)
        return (major << 8) + minor
    }
    nextLEB128Number() {
        let byte = this.nextByte()
        let result = byte & 0x7f

        while (byte > 0x7f) {
            byte = this.nextByte()
            result = (result << 7) + (byte & 0x7f)
        }

        return result
    }
    nextString() {
        const length = this.is2_0 ? this.next2ByteNumber() : this.nextLEB128Number()
        return this.nextSlice(length).toString('utf8')
    }
    nextBuffer() {
        const length = this.nextLEB128Number()
        return this.nextSlice(length)
    }
    nextBooleanArray() {
        const length = this.nextByte()
        return [...this.nextSlice(length)].map(val => val > 0)
    }
    nextNumberArray() {
        const length = this.nextByte()
        const result = new Array<number>(length)

        for (let i = 0; i < length; i++) {
            result[i] = this.nextNumber()
        }

        return result
    }
    nextStringArray() {
        const length = this.nextByte()
        const result = new Array<string>(length)

        for (let i = 0; i < length; i++) {
            result[i] = this.nextString()
        }

        return result
    }
    nextRPC(): RPC {
        const version = this.nextByte()
        if (version !== 1) throw new Error("Unsupported RPC Definition")

        const name = this.nextString()
        const paramLength = this.nextByte()
        const params = new Array<RPCPar>(paramLength)

        for (let i = 0; i < paramLength; i++) {
            const typeId = this.nextByte()
            params[i] = {
                typeId,
                name: this.nextString(),
                default: this.nextType(typeId),
                typeName: typeNames[typeId]
            }
        }

        const resultLength = this.nextByte()
        const results = new Array<RPCResult>(resultLength)

        for (let i = 0; i < resultLength; i++) {
            const typeId = this.nextByte()
            results[i] = {
                typeId,
                typeName: typeNames[typeId],
                name: this.nextString()
            }
        }
        return {
            name,
            par: params,
            results
        }
    }
}
export class BufferEncoder extends BufBuilder {
    private entryValEncoders = {
        0x00: this.addBoolean,
        0x01: this.addNumber,
        0x02: this.addString,
        0x03: this.addBuffer,
        0x10: this.addBooleanArray,
        0x11: this.addNumberArray,
        0x12: this.addStringArray
    }
    private is2_0: boolean
    constructor(is2_0: boolean) {
        super()
        this.is2_0 = is2_0
    }
    addType<T extends keyof EntryValTypes>(typeID: T, val: EntryValTypes[T]): this
    addType(typeID: number, val: any): this
    addType(typeID: number, val: any): this {
        if (typeof this.entryValEncoders[typeID] === 'function') {
            return this.entryValEncoders[typeID](val)
        } else {
            throw new Error(`Unknown Type 0x${typeID.toString(16)}`)
        }
    }
    addBoolean(val: boolean) {
        return this.add(+val)
    }
    addNumber(val: number) {
        let buf = Buffer.allocUnsafe(8)
        ieee754.write(buf, val, 0, false, 52, 8)

        return this.add(buf)
    }
    addLEB128Number(val: number) {
        let num = val;
        let bytes: number[] = [];
        while (num > 0x07f) {
            bytes.push((num & 0x7f) | 0x80);
            num = num >> 7;
        }
        bytes.push(num);
        return this.add(bytes)
    }
    add2ByteNumber(val: number) {
        return this.add([(val >> 8) & 0xff, val & 0xff])
    }
    addString(val: string) {
        if (this.is2_0) {
            if (val.length > 0xffff) {
                throw new Error('In 2.0 Strings can be maximum 65535 long')
            }
            this.add2ByteNumber(val.length)
        } else {
            this.addLEB128Number(val.length)
        }
        return this.add(Buffer.from(val, 'utf8'))
    }
    addBuffer(val: Buffer) {
        return this.add(val)
    }
    addBooleanArray(val: boolean[]) {
        checkArrayLength(val)
        this.add(val.length)
        return this.add(val.map(a => +a))
    }
    addNumberArray(val: number[]) {
        checkArrayLength(val)
        this.add(val.length)
        val.forEach(a => this.addNumber(a))
        return this
    }
    addStringArray(val: string[]) {
        checkArrayLength(val)
        this.add(val.length)
        val.forEach(a => this.addString(a))
        return this
    }
}

export function fixTypeID(val: any, typeID: EntryType, isStrict = false) {
    if (typeof typeNames[typeID] === 'undefined') {
        throw new Error(`Unknown Type 0x${typeID.toString(16)}`)
    }

    if (isStrict) {
        if (checkStrictTypeId(val, typeID)) {
            return val
        } else {
            throwNotType(typeID)
        }
    }

    if (Array.isArray(val)) {
        if (val.length === 0) {
            if ((typeID & 0x10) > 0) {
                return val
            } else if (typeID === EntryType.Buffer) {
                return Buffer.from([])
            } else if (typeID === EntryType.String) {
                return ''
            }
        } else if (typeID === EntryType.BooleanArray) {
            if (val.every(a => typeof a === 'boolean')) {
                return val
            } else if (val.every(a => a === 'true' || a === 'false' || a === 'TRUE' || a === 'FALSE')) {
                return val.map(a => a === 'true' || a === 'TRUE')
            } else if (val.every(a => typeof a === 'number')) {
                return val.map(a => a > 0)
            }
        } else if (typeID === EntryType.NumberArray) {
            if (val.every(a => typeof a === 'number')) {
                return val
            } else if (val.every(a => (typeof a === 'string' || typeof a === 'boolean') && !Number.isNaN(+a))) {
                return val.map(a => +a)
            }
        } else if (typeID === EntryType.StringArray) {
            if (val.every(a => typeof a === 'string')) {
                return val
            } else if (val.every(a => typeof a === 'boolean' || typeof a === 'number')) {
                return val.map(a => a.toString())
            }
        } else if (typeID === EntryType.Buffer) {
            if (val.every(a => (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') && isByte(+a))) {
                return Buffer.from(val.map(a => +a))
            }
        } else if (val.length == 1) {
            const value = val[0]
            if (typeID === EntryType.Boolean) {
                if (typeof value === 'boolean') {
                    return value
                } else if (value === 'true' || value === 'TRUE' || value === 'false' || value === 'FALSE') {
                    return value === 'true' || value === 'TRUE'
                } else if (typeof value === 'number') {
                    return value > 0
                }
            } else if (typeID === EntryType.Number) {
                if (typeof value === 'number') {
                    return value
                } else if (typeof value === 'boolean') {
                    return +value
                } else if ((typeof value === 'string') && !Number.isNaN(+value)) {
                    return value
                }
            } else if (typeID === EntryType.String) {
                if (typeof value === 'string') {
                    return value
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                    return value.toString()
                }
            }
        }
    } else if (Buffer.isBuffer(val)) {
        if (typeID === EntryType.Buffer) {
            return val
        } else if (typeID === EntryType.BooleanArray) {
            return [...val].map(a => a > 0)
        } else if (typeID === EntryType.NumberArray) {
            return [...val]
        } else if (typeID === EntryType.StringArray) {
            return [...val.toString('utf8')]
        } else if (typeID === EntryType.String) {
            return val.toString('utf8')
        } else if (val.length === 1) {
            if (typeID === EntryType.Boolean) {
                return val[0] > 0
            } else if (typeID === EntryType.Number) {
                return val[0]
            }
        }
    } else if (typeID === EntryType.Boolean) {
        if (typeof val === 'boolean') {
            return val
        } else if (typeof val === 'number') {
            return val > 0
        } else if (val === 'true' || val === 'false' || val === 'TRUE' || val === 'FALSE') {
            return val === 'true' || val === 'TRUE'
        }
    } else if (typeID === EntryType.Number) {
        if (typeof val === 'number') {
            return val
        } else if (typeof val === 'boolean') {
            return +val
        } else if ((typeof val === 'string') && !Number.isNaN(+val)) {
            return +val
        }
    } else if (typeID === EntryType.String) {
        if (typeof val === 'string') {
            return val
        } else if (typeof val === 'boolean' || typeof val === 'number') {
            return val.toString()
        }
    } else if (typeID === EntryType.Buffer) {
        if (typeof val === 'boolean') {
            return Buffer.from([+val])
        } else if (typeof val === 'number' && isByte(val)) {
            return Buffer.from([val])
        } else if (typeof val === 'string') {
            return Buffer.from(val, 'utf8')
        }
    } else if (typeID === EntryType.BooleanArray) {
        if (typeof val === 'boolean') {
            return [val]
        } else if (typeof val === 'number') {
            return [val > 0]
        } else if (val === 'true' || val === 'false' || val === 'TRUE' || val === 'FALSE') {
            return [val === 'true' || val === 'TRUE']
        }
    } else if (typeID === EntryType.NumberArray) {
        if (typeof val === 'number') {
            return [val]
        } else if (typeof val === 'boolean') {
            return [+val]
        } else if ((typeof val === 'string') && !Number.isNaN(+val)) {
            return [+val]
        }
    } else if (typeID === EntryType.StringArray) {
        if (typeof val === 'string') {
            return [val]
        } else if (typeof val === 'boolean' || typeof val === 'number') {
            return [val.toString()]
        }
    }
    throwCouldNotConvert(typeID)
}

function checkStrictTypeId(val: any, typeID: EntryType) {
    if (Array.isArray(val)) {
        if (val.length == 0) {
            if ((typeID & 0x10) > 0) {
                return true
            }
        } else if (typeID === EntryType.BooleanArray) {
            if (val.every(a => typeof a === 'boolean')) {
                return true
            }
        } else if (typeID === EntryType.NumberArray) {
            if (val.every(a => typeof a === 'number')) {
                return true
            }
        } else if (typeID === EntryType.StringArray) {
            if (val.every(a => typeof a === 'string')) {
                return true
            }
        }
    } else if (typeID === EntryType.Boolean) {
        if (typeof val === 'boolean') {
            return true
        }
    } else if (typeID === EntryType.Number) {
        if (typeof val === 'number') {
            return true
        }
    } else if (typeID === EntryType.String) {
        if (typeof val === 'string') {
            return true
        }
    } else if (typeID === EntryType.Buffer) {
        if (Buffer.isBuffer(val)) {
            return true
        }
    }
    throwNotType(typeID)
}

export function getTypeID(val: any) {
    if (Array.isArray(val)) {
        if (val.length > 0) {
            if (val.every(a => typeof a === 'boolean')) {
                return EntryType.BooleanArray
            } else if (val.every(a => typeof a === 'number')) {
                return EntryType.NumberArray
            } else if (val.every(a => typeof a === 'string')) {
                return EntryType.StringArray
            }
        }
    } else if (Buffer.isBuffer(val)) {
        return EntryType.Buffer
    } else if (typeof val === 'boolean') {
        return EntryType.Boolean
    } else if (typeof val === 'number') {
        return EntryType.Number
    } else if (typeof val === 'string') {
        return EntryType.String
    } else if (val != null && typeof val === 'object') {
        return EntryType.RPC
    }
}
function isByte(val: number) {
    return !Number.isNaN(val) && val > 0 && val < 256
}
function throwNotType(typeID: EntryType) {
    throw new Error(`The type of the value was not ${typeNames[typeID]}`)
}
function throwCouldNotConvert(typeID: EntryType) {
    throw new Error(`Could not convert value to ${typeNames[typeID]}`)
}


function checkArrayLength(arr) {
    if (arr.length > 0xff) {
        throw new Error('The array can have a maximum of 255 items')
    }
}