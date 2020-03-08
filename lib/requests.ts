import { BufferEncoder } from './types';
import { MessageType, Entry } from './definitions';

const toServer = {
    keepAlive: Buffer.from([0x00]),
    helloComplete: Buffer.from([MessageType.ClientHelloComplete]),
    deleteAll: Buffer.from([0x14, 0xd0, 0x6c, 0xb2, 0x7a]),
    hello2_0: Buffer.from([0x01, 2, 0])
};

export function getRequests(is2_0: boolean, identity: string): Requests {
    if (is2_0) {
        return {
            KeepAlive: getKeepAlive,
            ClientHello: getClientHello2_0,
            ClientHelloComplete: () => notSupported2_0('Client Hello Complete'),
            EntryAssignment: getEntryUpdate2_0,
            EntryUpdate: getEntryUpdate2_0,
            EntryFlagUpdate: () => notSupported2_0('flags'),
            EntryDelete: () => notSupported2_0('Entry Delete'),
            DeleteAll: () => notSupported2_0('Delete All'),
            RPCExecute: () => notSupported2_0('RPC')
        }
    } else {
        return {
            KeepAlive: getKeepAlive,
            ClientHello: () => getClientHello3_0(identity),
            ClientHelloComplete: getClientHelloComplete,
            EntryAssignment: getEntryUpdate3_0,
            EntryUpdate: getEntryUpdate3_0,
            EntryFlagUpdate: getFlagUpdate,
            EntryDelete: getEntryDelete,
            DeleteAll: getDeleteAll,
            RPCExecute: getRPCExecute
        }
    }
}

interface Requests {
    KeepAlive(): Buffer
    ClientHello(): Buffer
    ClientHelloComplete(): Buffer
    EntryAssignment(entryID: number, entry: Entry): Buffer
    EntryUpdate(entryID: number, entry: Entry): Buffer
    EntryFlagUpdate(entryID: number, flags: number): Buffer
    EntryDelete(entryID: number): Buffer
    DeleteAll(): Buffer
    RPCExecute(entryID: number, returnID: number, params: { typeID: number, val: any }[]): Buffer
}

function notSupported2_0(name: string): Buffer {
    throw new Error(`2.0 does not support ${name}`)
}

function getKeepAlive() {
    return toServer.keepAlive
}

function getClientHello3_0(identity: string) {
    return new BufferEncoder(false)
        .add(MessageType.ClientHello)
        .add([3, 0])
        .addString(identity)
        .build()
}
function getClientHello2_0() {
    return toServer.hello2_0
}

function getClientHelloComplete() {
    return toServer.helloComplete
}

function getEntryAssignment3_0(entry: Entry) {
    return new BufferEncoder(false)
        .add(MessageType.EntryAssignment)
        .addString(entry.name)
        .add(entry.typeID)
        .add([0xff, 0xff, 0, 0])
        .add(entry.flags)
        .addType(entry.typeID, entry.val)
        .build()
}

function getEntryAssignment2_0(entry: Entry) {
    return new BufferEncoder(true)
        .add(MessageType.EntryAssignment)
        .addString(entry.name)
        .add(entry.typeID)
        .add([0xff, 0xff, 0, 0])
        .addType(entry.typeID, entry.val)
        .build()
}
function getEntryUpdate3_0(entryID: number, entry: Entry) {
    entry.sn++
    return new BufferEncoder(false)
        .add(MessageType.EntryUpdate)
        .add2ByteNumber(entryID)
        .add2ByteNumber(entry.sn)
        .add(entry.typeID)
        .addType(entry.typeID, entry.val)
        .build()
}
function getEntryUpdate2_0(entryID: number, entry: Entry) {
    entry.sn++
    return new BufferEncoder(true)
        .add(MessageType.EntryUpdate)
        .add2ByteNumber(entryID)
        .add2ByteNumber(entry.sn)
        .addType(entry.typeID, entry.val)
        .build()
}
function getFlagUpdate(entryID: number, flags: number) {
    return new BufferEncoder(false)
        .add(MessageType.EntryFlagsUpdate)
        .add2ByteNumber(entryID)
        .add(flags)
        .build()
}
function getEntryDelete(entryID: number) {
    return new BufferEncoder(false)
        .add(MessageType.EntryDelete)
        .add2ByteNumber(entryID)
        .build()
}
function getDeleteAll() {
    return toServer.deleteAll
}
function getRPCExecute(entryID: number, returnID: number, params: { typeID: number, val: any }[]) {
    const paramBufEnc = new BufferEncoder(false)

    params.forEach(par => paramBufEnc.addType(par.typeID, par.val))

    const paramBuf = paramBufEnc.build()

    return new BufferEncoder(false)
        .add(MessageType.RPCExecute)
        .add2ByteNumber(entryID)
        .add2ByteNumber(returnID)
        .addLEB128Number(paramBuf.length)
        .add(paramBuf)
        .build()
}