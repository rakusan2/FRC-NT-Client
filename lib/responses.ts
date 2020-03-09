import { BufferDecoder } from './types';
import { Entry, RPC } from './definitions';
import { LengthError } from './error';

export class ResponseDecoder {
    buf: BufferDecoder
    callbacks: ResponseCallbacks
    decoders: { [key: number]: () => void }
    constructor(is2_0: boolean, callbacks: ResponseCallbacks) {
        this.callbacks = callbacks
        this.switch(is2_0)
    }
    switch(is2_0: boolean) {
        this.buf = new BufferDecoder(is2_0)
        if (is2_0) {
            this.decoders = {
                0x00: () => { },
                0x02: () => protocolUnsupported(this.buf, this.callbacks.ProtocolUnsupported),
                0x03: () => this.callbacks.ServerHelloComplete(),
                0x10: () => entryAssignment2_0(this.buf, this.callbacks.EntryAssignment),
                0x11: () => entryUpdate2_0(this.buf, this.callbacks.EntryUpdate, this.callbacks.GetEntry)
            }
        } else {
            this.decoders = {
                0x00: () => { },
                0x02: () => protocolUnsupported(this.buf, this.callbacks.ProtocolUnsupported),
                0x03: () => this.callbacks.ServerHelloComplete(),
                0x04: () => serverHello(this.buf, this.callbacks.ServerHello),
                0x10: () => entryAssignment3_0(this.buf, this.callbacks.EntryAssignment),
                0x11: () => entryUpdate3_0(this.buf, this.callbacks.EntryUpdate),
                0x12: () => entryFlagsUpdate(this.buf, this.callbacks.EntryFlagUpdate),
                0x13: () => entryDelete(this.buf, this.callbacks.EntryDelete),
                0x14: () => deleteAll(this.buf, this.callbacks.DeleteAll),
                0x21: () => RPCResponse(this.buf, this.callbacks.RPCResponse, this.callbacks.GetEntry)
            }
        }
    }
    decode(buf: Buffer) {
        try {
            this.buf.add(buf)
            this.buf.saveIndex()
            const messageType = this.buf.nextByte()
            while (!this.buf.isEnd) {
                if (typeof this.decoders[messageType] === 'function') {
                    this.decoders[messageType]()
                } else {
                    throw new Error("Unknown message type")
                }
            }
            this.buf.clear()
        } catch (e) {
            if (e instanceof LengthError) {
                this.buf.loadIndex()
            } else {
                throw e
            }
        }
    }
    clear() {
        this.buf.clear()
    }
}

interface ResponseCallbacks {
    /** Called with the highest supported protocol version  */
    ProtocolUnsupported(major: number, minor: number)
    /**
     * Server hello in response to Client hello
     * 
     * Not supported in 2.0
     * @param name The name of the server
     * @param flags The flags og the server (bit 0 is set on reconnect)
     */
    ServerHello(name: string, flags: number)
    /** Called when client is caught up with current entries */
    ServerHelloComplete()
    /**
     * New entry was created
     * @param entryID The id of the new entry
     * @param entry The new entry
     */
    EntryAssignment(entryID: number, entry: Entry)
    /**
     * Current Entry was updated
     * @param entryID The id of the entry
     * @param sn The version number of the entry
     * @param val The value of the entry
     * @param typeID The value type of the entry
     */
    EntryUpdate(entryID: number, sn: number, val: any, typeID: number)
    /**
     * Entry flag was updated
     * 
     * Not supported in 2.0
     * @param entryID The entry id
     * @param flags The new flags
     */
    EntryFlagUpdate(entryID: number, flags: number)
    /**
     * An Entry was deleted
     * 
     * Not supported in 2.0
     * @param entryID The id of the entry
     */
    EntryDelete(entryID: number)
    /**
     * All entries were deleted
     * 
     * Not supported in 2.0
     */
    DeleteAll()
    /**
     * Response to an RPC request
     * 
     * Not supported in 2.0
     * @param entryID The RPC entry id
     * @param uniqueID The id of the specific request
     * @param results The results of the request
     */
    RPCResponse(entryID: number, uniqueID: number, results: { [key: string]: any })
    /**
     * Internal method requesting an entry
     * @param EntryID the id of the the requested entry
     */
    GetEntry(EntryID): Entry
}

function protocolUnsupported(buf: BufferDecoder, callback: (major: number, minor: number) => void) {
    const major = buf.nextByte()
    const minor = buf.nextByte()
    callback(major, minor)
}

function serverHello(buf: BufferDecoder, callback: (name: string, flags: number) => void) {
    const flags = buf.nextByte()
    const name = buf.nextString()
    callback(name, flags)
}

function entryAssignment2_0(buf: BufferDecoder, callback: (entryID: number, entry: Entry) => void) {
    const name = buf.nextString()
    const typeID = buf.nextByte()
    const entryID = buf.next2ByteNumber()
    const entry: Entry = {
        name,
        typeID,
        sn: buf.next2ByteNumber(),
        val: buf.nextType(typeID),
        flags: 0
    }
    callback(entryID, entry)
}
function entryAssignment3_0(buf: BufferDecoder, callback: (entryID: number, entry: Entry) => void) {
    const name = buf.nextString()
    const typeID = buf.nextByte()
    const entryID = buf.next2ByteNumber()
    const entry: Entry = {
        name,
        typeID,
        sn: buf.next2ByteNumber(),
        flags: buf.nextByte(),
        val: buf.nextType(typeID)
    }
    callback(entryID, entry)
}
function entryUpdate2_0(buf: BufferDecoder, callback: (entryID: number, sn: number, val: any, typeID: number) => void, getEntry: (entryID: number) => Entry) {
    const entryID = buf.next2ByteNumber()
    const sn = buf.next2ByteNumber()
    const typeID = getEntry(entryID).typeID
    const val = buf.nextType(typeID)
    callback(entryID, sn, val, typeID)
}
function entryUpdate3_0(buf: BufferDecoder, callback: (entryID: number, sn: number, val: any, typeID: number) => void) {
    const entryID = buf.next2ByteNumber()
    const sn = buf.next2ByteNumber()
    const typeID = buf.nextByte()
    const val = buf.nextType(typeID)
    callback(entryID, sn, val, typeID)
}
function entryFlagsUpdate(buf: BufferDecoder, callback: (entryID: number, flags: number) => void) {
    const entryID = buf.next2ByteNumber()
    const flags = buf.nextByte()
    callback(entryID, flags)
}
function entryDelete(buf: BufferDecoder, callback: (entryID: number) => void) {
    callback(buf.next2ByteNumber())
}
function deleteAll(buf: BufferDecoder, callback: () => void) {
    const magicNum = buf.next2ByteNumber()
    if (magicNum === 0xD06CB27A) {
        callback()
    }
}
function RPCResponse(buf: BufferDecoder, callback: (entryID: number, uniqueID: number, results: { [key: string]: any }) => void, getEntry: (entryID: number) => Entry) {
    const entryID = buf.next2ByteNumber()
    const rpc: RPC = getEntry(entryID).val
    const uniqueID = buf.next2ByteNumber()
    const length = buf.nextLEB128Number()
    const results: { [key: string]: any } = {}

    buf.checkNextLength(length)

    for (let i = 0; i < rpc.results.length; i++) {
        const { typeId, name } = rpc.results[i];
        results[name] = buf.nextType(typeId)
    }
    callback(entryID, uniqueID, results)
}