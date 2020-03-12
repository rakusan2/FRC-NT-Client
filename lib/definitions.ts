export interface Entry<T = any> extends NewEntry<T> {
    sn: number;
}

export interface NewEntry<T = any> {
    typeID: number;
    name: string;
    flags: number;
    val: T;
}
export interface RPC {
    name: string;
    par: RPCPar[];
    results: RPCResult[];
}
export interface RPCPar {
    typeId: number;
    typeName: string;
    name: string;
    default: any;
}
export interface RPCResult {
    typeId: number;
    typeName: string;
    name: string;
}
export const enum MessageType {
    KeepAlive = 0x00,
    ClientHello = 0x01,
    ProtocolUnsupported = 0x02,
    ServerHelloComplete = 0x03,
    ServerHello = 0x04,
    ClientHelloComplete = 0x05,
    EntryAssignment = 0x10,
    EntryUpdate = 0x11,
    EntryFlagsUpdate = 0x12,
    EntryDelete = 0x13,
    ClearAllEntries = 0x14,
    RPCExecute = 0x20,
    RPCResponse = 0x21
}

declare global{
    interface Function{
        /** This function always throws an error */
        throwsError?:boolean
    }
}