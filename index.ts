import * as ieee754 from "ieee754";
import * as net from "net";
import { Buffer } from "buffer";
import * as url from 'url'
var strLenIdent = numTo128;
export type Listener = (
    key: string,
    value: any,
    valueType: String,
    type: "add" | "delete" | "update" | "flagChange",
    id: number,
    flags: number
) => any;
export class Client {
    private debug = (level: debugType, st: any) => { }
    serverName: String;
    clientName = "NodeJS" + Date.now();
    private client: net.Socket;
    private connected = false;
    private socketConnected = false
    private entries: { [key: number]: Entry } = {};
    private oldEntries: { [key: number]: Entry } = {};
    private keymap: { [key: string]: number } = {};
    private newKeyMap: newEntry[] = [];
    private updatedIDs: number[] = [];
    private reconnect = false;
    private address: string;
    private port: number;
    private known = false;
    private listeners: Listener[] = [];
    private RPCExecCallback: { [key: number]: (result: Object) => any } = {};
    private lateCallbacks: (() => any)[] = [];
    private conCallback: (
        connected: boolean,
        err: Error,
        is2_0: boolean
    ) => any;
    private is2_0 = false;
    private reAssign: { [key: string]: { val: any; flags: number } } = {};
    private beingAssigned: string[] = [];
    private continuation: { buf: Buffer; offset: number };
    private strictInput = false;
    private reconnectDelay = 0

    constructor(options?: clientOptions) {
        if (options == undefined) return;
        if (options.strictInput) this.strictInput = true;
    }
    /**
     * True if the Client has completed its hello and is connected
     */
    isConnected() {
        return this.connected;
    }
    /**
     * True if the client has switched to 2.0
     */
    uses2_0() {
        return this.is2_0;
    }

    /**
     * Set and activate the reconnect feature
     * 
     * 
     * Delay of 20 or less will deactivate this feature
     * @param delay Time in milisecconds before the next reconnect attempt
     */
    setReconnectDelay(delay: number) {
        this.reconnectDelay = delay
        this.debug(debugType.basic, `Setting Reconnect dellay to ${delay}`)
    }

    /**
     * Start the Client
     * @param callback Called on connect or error
     * @param address Address of the Server. Default = "localhost"
     * @param port Port of the Server. Default = 1735
     */
    start(
        callback?: (connected: boolean, err: Error, is2_0: boolean) => any,
        address = "127.0.0.1",
        port = 1735
    ) {
        /:\/\/\w/.test(address)
        let parsedAddress = url.parse((/:\/\/\w/.test(address) ? "" : "tcp://") + address)
        address = parsedAddress.hostname
        port = parseInt(parsedAddress.port) || port
        this.conCallback = callback;
        this.debug(debugType.basic, `Connecting to ${address} on port ${port}`)
        this.__connect(address,port)
    }
    private __connect(address:string,port:number){
        this.connected = false;
        this.address = address;
        this.port = port;
        this.reAssign = {};
        this.beingAssigned = [];
        this.client = net
            .connect(port, address, () => {
                this.socketConnected = true
                this.toServer.Hello(this.clientName);
                this.client.on("data", data => {
                    let pos = 0,
                        buf = data;
                    if (this.continuation != null) {
                        pos = this.continuation.offset;
                        buf = Buffer.concat([this.continuation.buf, buf]);
                        this.continuation = null;
                    }
                    try {
                        this.read(buf, pos);
                    } catch (e) {
                        this.conCallback(true, e, this.is2_0);
                    }
                });
            })
            .on("close", hadError => {
                this.debug(debugType.basic, 'Closing socket')
                this.socketConnected = false
                this.connected = false;
                this.oldEntries = this.entries;
                this.entries = {};
                this.keymap = {};

                let reconn: NodeJS.Timer
                if (!this.reconnect && this.reconnectDelay >= 20) {
                    reconn = setTimeout(() => {
                        this.debug(debugType.basic, `Trying to reconnect to ${address}:${port}`)
                        this.__connect(address, port);
                    }, this.reconnectDelay)
                }
                if (this.reconnect) {
                    this.__connect(address, port);
                } else if (!hadError) this.conCallback(false, null, this.is2_0);
            })
            .on("error", err => {
                let mesgPar = err.message.split(' ')
                if (mesgPar.length < 2 || mesgPar[1] != 'ECONNREFUSED' || this.reconnectDelay < 20) {
                    this.conCallback(false, err, this.is2_0)
                }else{
                    this.conCallback(false, null, this.is2_0)
                }
            })
            .on('end', () => {
                this.socketConnected = false
            })
    }
    /** Attempts to stop the client */
    stop() {
        this.client.end()
    }
    /** Immediately closes the client */
    destroy() {
        this.client.destroy()
    }
    /**
     * Adds and returns a Listener to be called on change of an Entry
     * @param callback Listener
     */
    addListener(callback: Listener, getCurrent?: boolean) {
        this.listeners.push(callback);
        if (getCurrent && this.connected) {
            for (let key in this.keymap) {
                let entry = this.entries[this.keymap[key]]
                callback(key, entry.val, typeNames[entry.typeID], "add", this.keymap[key], entry.flags)
            }
        }
        return callback;
    }
    /**
     * Removes a Listener
     * @param listener the Listener to remove
     */
    removeListener(listener: Listener) {
        var index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }
    /**
     * Get the unique ID of a key or the IDs of all keys if called empty
     * @param key name of the key
     */
    getKeyID(): { [key: string]: number };
    getKeyID(key: string): number;
    getKeyID(key?: string) {
        if (key == undefined) {
            return this.keymap;
        } else return this.keymap[key];
    }
    /**
     * Gets an Entry
     * @param id ID of an Entry
     */
    getEntry(id: number) {
        return this.entries[id];
    }
    /**
     * Get an Array of Keys
     */
    getKeys() {
        return Object.keys(this.keymap);
    }
    /**
     * Get All of the Entries
     */
    getEntries() {
        return this.entries;
    }
    private read(buf: Buffer, off: number) {
        checkBufLen(buf, off, 1);
        if (buf.length == off) return;
        if (typeof this.recProto[buf[off]] != 'undefined') {
            try {
                off = this.recProto[buf[off]](buf, off + 1);
                this.read(buf, off);
            } catch (e) {
                if (e instanceof LengthError) {
                    this.continuation = { buf, offset: off };
                    return;
                } else throw e;
            }
        } else throw new Error("Unknown Message Type " + buf[off]);
    }
    private readonly recProto: {
        [key: number]: (buf: Buffer, offset: number) => number;
    } = {
            /** Keep Alive */
            0x00: (buf, off) => {
                return off;
            },
            /** Protocol Version Unsupported */
            0x02: (buf, off) => {
                checkBufLen(buf, off, 2);
                var ver = `${buf[off++]}.${buf[off++]}`;
                this.debug(debugType.basic, `version ${this.is2_0 ? '2.0' : '3.0'}`)
                this.debug(debugType.basic, `Server supports version ${ver}`)
                if (ver === "2.0") {
                    this.reconnect = true;
                    this.is2_0 = true;
                    strLenIdent = numTo2Byte;
                } else
                    this.conCallback(
                        false,
                        new Error("Unsupported protocol: " + ver),
                        this.is2_0
                    );
                return off;
            },
            /** Server Hello Complete */
            0x03: (buf, off) => {
                this.debug(debugType.messageType, 'Received Server Hello Complete')
                this.connected = true;
                for (let key in this.oldEntries) {
                    if (typeof this.entries[key] == 'undefined') {
                        let old = this.oldEntries[key];
                        this.Assign(old.val, old.name, old.flags > 0);
                    }
                }
                if (this.is2_0) {
                    this.afterConnect();
                } else {
                    this.newKeyMap.map(e => {
                        if (typeof this.keymap[e.name] == 'undefined') {
                            this.Assign(e.val, e.name, e.flags > 0);
                        }
                    });
                    if (this.oldEntries != null && this.reconnectDelay >= 20) {
                        let keys = Object.keys(this.oldEntries)
                        for (let i = 0; i < keys.length; i++) {
                            if (typeof this.entries[keys[i]] == 'undefined') {
                                let entry = this.oldEntries[keys[i]] as Entry
                                this.Assign(entry.val, entry.name, entry.flags)
                            }
                        }
                    }
                    this.toServer.HelloComplete();
                    if (this.known) {
                        while (this.updatedIDs.length > 0) {
                            let e = this.updatedIDs.pop();
                            if (typeof this.entries[e] != 'undefined')
                                this.Update(e, this.entries[e].val);
                        }
                    }
                }
                return off;
            },
            /** Server Hello */
            0x04: (buf, off) => {
                this.debug(debugType.messageType, `Received Server Hello`)
                checkBufLen(buf, off, 1);
                let flags = this.is2_0 ? 0 : buf[off++];
                this.known = flags > 0;
                let sName = TypesFrom[e.String](buf, off);
                this.serverName = sName.val;
                this.debug(debugType.messages, { serverName: sName.val, isKnown: flags > 0 })
                return sName.offset;
            },
            /** Entry Assignment */
            0x10: (buf, off) => {
                let keyName = TypesFrom[e.String](buf, off);
                this.debug(debugType.messageType, `Received entry assignment for ${keyName.val}`)
                off = keyName.offset;
                checkBufLen(buf, off, 5 + (this.is2_0 ? 0 : 1));
                let type = buf[off++],
                    id = (buf[off++] << 8) + buf[off++],
                    typeName = typeNames[type],
                    key = keyName.val,
                    entry: Entry = {
                        typeID: type,
                        name: key,
                        sn: (buf[off++] << 8) + buf[off++],
                        flags: this.is2_0 ? 0 : buf[off++]
                    };
                let val = TypesFrom[entry.typeID](buf, off);
                entry.val = val.val;
                this.entries[id] = entry;
                this.keymap[key] = id;
                this.callListeners(keyName.val, val.val, typeName, "add", id, entry.flags);
                if (typeof this.reAssign[key] != 'undefined') {
                    let toUpdate = this.reAssign[key];
                    this.Update(id, toUpdate.val);
                    if (!this.is2_0 && entry.flags !== toUpdate.flags) {
                        this.Flag(id, toUpdate.flags);
                    }
                    delete this.reAssign[key];
                }
                this.debug(debugType.messages, { key: keyName.val, type, id, sequenceNumber: entry.sn, flags: entry.flags, value: entry.val })
                return val.offset;
            },
            /** Entry Update */
            0x11: (buf, off) => {
                this.debug(debugType.messageType, 'Received an entry update')
                checkBufLen(buf, off, 4 + (this.is2_0 ? 0 : 1));
                let id = (buf[off++] << 8) + buf[off++],
                    sn = (buf[off++] << 8) + buf[off++],
                    type = this.is2_0 ? this.entries[id].typeID : buf[off++],
                    val = TypesFrom[type](buf, off),
                    typeName = typeNames[type],
                    name = "";
                if (typeof this.entries[id] != 'undefined' && type === this.entries[id].typeID) {
                    let entry = this.entries[id];
                    entry.sn = sn;
                    entry.val = val.val;
                    name = entry.name;
                    this.callListeners(
                        name,
                        val.val,
                        typeName,
                        "update",
                        id,
                        entry.flags
                    );
                }
                this.debug(debugType.messages, { id, sequenceNumber: sn, type, value: val.val })
                return val.offset;
            },
            /** Entry Flags Update */
            0x12: (buf, off) => {
                this.debug(debugType.messageType, 'Received a flags update')
                checkBufLen(buf, off, 3);
                let id = (buf[off++] << 8) + buf[off++],
                    flags = buf[off++];
                if (typeof this.entries[id] != 'undefined') {
                    let entry = this.entries[id];
                    entry.flags = flags;
                    this.callListeners(
                        entry.name,
                        entry.val,
                        typeNames[entry.typeID],
                        "flagChange",
                        id,
                        flags
                    )
                }
                this.debug(debugType.messages, { id, flags })
                return off;
            },
            /** Entry Delete */
            0x13: (buf, off) => {
                this.debug(debugType.messageType, 'Received an entry delete')
                checkBufLen(buf, off, 2);
                let id = (buf[off++] << 8) + buf[off++],
                    name = this.entries[id].name,
                    typename = typeNames[this.entries[id].typeID],
                    flags = this.entries[id].flags;
                delete this.entries[id];
                delete this.keymap[name];
                this.callListeners(
                    name,
                    null,
                    typename,
                    "delete",
                    id,
                    flags
                );
                this.debug(debugType.messages, { id })
                return off;
            },
            /** Clear All Entries */
            0x14: (buf, off) => {
                this.debug(debugType.messageType, 'Received an entry update')
                checkBufLen(buf, off, 4);
                let val = 0;
                for (let i = 0; i < 4; i++) {
                    val = (val << 8) + buf[off + i];
                }
                if (val === 0xd06cb27a) {
                    this.entries = {};
                    this.keymap = {};
                }
                this.debug(debugType.messages, { val, isCorrect: val === 0xd06cb27a })
                return off + 4;
            },
            /** RPC Response */
            0x21: (buf, off) => {
                this.debug(debugType.messageType, 'Received an RPC Response')
                checkBufLen(buf, off, 4);
                let id = (buf[off++] << 8) + buf[off++],
                    executeID = (buf[off++] << 8) + buf[off++],
                    len = numFrom128(buf, off),
                    res = (<RPC>this.entries[id].val).results,
                    results = {},
                    s: { val: any; offset: number };
                for (let i = 0; i < res.length; i++) {
                    for (let i = 0; i < res.length; i++) {
                        s = TypesFrom[res[i].typeId](buf, off);
                        off = s.offset;
                        results[res[i].name] = s.val;
                    }
                }
                if (typeof this.RPCExecCallback[executeID] != 'undefined') {
                    this.RPCExecCallback[executeID](results);
                    delete this.RPCExecCallback[executeID];
                }
                this.debug(debugType.messages, { id, executeID, results })
                return off;
            }
        };
    private afterConnect() {
        this.conCallback(true, null, this.is2_0);
        while (this.lateCallbacks.length) {
            this.lateCallbacks.shift()();
        }
    }
    private readonly toServer = {
        Hello: (serverName: string) => {
            this.debug(debugType.messageType, 'Sending a Hello')
            if (this.is2_0) {
                this.write(toServer.hello2_0);
            } else {
                let s = TypeBuf[e.String].toBuf(serverName),
                    buf = Buffer.allocUnsafe(s.length + 3);
                buf[0] = 0x01;
                buf[1] = 3;
                buf[2] = 0;
                s.write(buf, 3);
                this.write(buf, true);
            }
        },
        HelloComplete: () => {
            this.debug(debugType.messageType, 'Sending a Hello Complete')
            this.write(toServer.helloComplete, true);
            this.afterConnect();
        }
    };
    /**
     * Add an Entry
     * @param val The Value
     * @param name The Key of the Entry
     * @param persist Whether the Value should persist on the server through a restart
     */
    Assign(val: any, name: string, persist: boolean | number = false) {
        this.debug(debugType.messageType, `Assigning ${name}`)
        let type = getType(val);
        if (this.is2_0 && type === e.RawData)
            return new Error("2.0 does not have Raw Data");
        if (type === e.RPC) return new Error("Clients can not assign an RPC");
        if (!this.connected) {
            let nID = this.newKeyMap.length;
            this.newKeyMap[nID] = {
                typeID: type,
                val,
                flags: +persist,
                name: name
            };
            this.listeners.map(e =>
                e(name, val, typeNames[type], "add", -nID - 1, +persist)
            );
            return;
        }
        if (typeof this.keymap[name] != 'undefined') {
            return this.Update(this.keymap[name], val);
        }
        if (this.beingAssigned.indexOf(name) >= 0) {
            this.reAssign[name] = { val, flags: +persist };
            return;
        } else {
            this.beingAssigned.push(name);
        }
        let n = TypeBuf[e.String].toBuf(name),
            f = TypeBuf[type].toBuf(val),
            nlen = n.length,
            assignLen = this.is2_0 ? 6 : 7,
            len = f.length + nlen + assignLen,
            buf = Buffer.allocUnsafe(len);
        buf[0] = 0x10;
        n.write(buf, 1);
        buf[nlen + 1] = type;
        buf[nlen + 2] = 0xff;
        buf[nlen + 3] = 0xff;
        buf[nlen + 4] = 0;
        buf[nlen + 5] = 0;
        if (!this.is2_0) buf[nlen + 6] = +persist;
        f.write(buf, nlen + assignLen);
        this.debug(debugType.messages, { key: name, type, flags: +persist, val })
        this.write(buf);
    }
    /**
     * Updates an Entry
     * @param id The ID of the Entry
     * @param val The value of the Entry
     */
    Update(id: number, val: any): Error {
        this.debug(debugType.messageType, `Updating Entry`)
        if (id < 0) {
            let nEntry = this.newKeyMap[-id - 1];
            let testVal = this.fixType(val, nEntry.typeID);
            if (testVal != null) {
                val = testVal;
                if (this.connected) {
                    if (typeof this.keymap[nEntry.name] != 'undefined') {
                        id = this.keymap[nEntry.name];
                    } else {
                        return this.Assign(val, nEntry.name, nEntry.flags > 0);
                    }
                } else {
                    nEntry.val = val;
                    this.listeners.map(e =>
                        e(
                            nEntry.name,
                            val,
                            typeNames[nEntry.typeID],
                            "update",
                            id,
                            nEntry.val
                        )
                    );
                    return;
                }
            } else
                return new Error(
                    `Wrong Type: ${val} is not a ${typeNames[nEntry.typeID]}`
                );
        }
        if (typeof this.entries[id] == 'undefined') return new Error("ID not found");
        let entry = this.entries[id],
            testVal = this.fixType(val, entry.typeID);
        if (testVal == null)
            return new Error(
                `Wrong Type: ${val} is not a ${typeNames[entry.typeID]}`
            );
        val = entry.val = testVal;
        entry.sn++;
        if (!this.connected) {
            if (this.updatedIDs.indexOf(id) < 0) this.updatedIDs.push(id);
            this.listeners.map(e =>
                e(
                    entry.name,
                    val,
                    typeNames[entry.typeID],
                    "update",
                    id,
                    entry.flags
                )
            );
            return;
        }
        let f = TypeBuf[entry.typeID].toBuf(val),
            updateLen = this.is2_0 ? 5 : 6,
            len = f.length + updateLen,
            buf = Buffer.allocUnsafe(len);
        buf[0] = 0x11;
        buf[1] = id >> 8;
        buf[2] = id & 0xff;
        buf[3] = entry.sn >> 8;
        buf[4] = entry.sn & 0xff;
        if (!this.is2_0) buf[5] = entry.typeID;
        f.write(buf, updateLen);
        this.debug(debugType.messages, { id, sequenceNumber: entry.sn, type: entry.typeID, value: val })
        this.write(buf);
        this.listeners.map(e =>
            e(
                entry.name,
                val,
                typeNames[entry.typeID],
                "update",
                id,
                entry.flags
            )
        );
    }
    /**
     * Updates the Flag of an Entry
     * @param id The ID of the Entry
     * @param flags Whether the Entry should persist through a restart on the server
     */
    Flag(id: number, flags: boolean | number = false) {
        this.debug(debugType.messageType, `Updating Flags`)
        if (this.is2_0) return new Error("2.0 does not support flags");
        if (typeof this.entries[id] == 'undefined') return new Error("Does not exist");
        this.debug(debugType.messages, { id, flags: +flags })
        this.write(Buffer.from([0x12, id >> 8, id & 0xff, +flags]));
    }
    /**
     * Deletes an Entry
     * @param id The ID of the Entry
     */
    Delete(id: number) {
        this.debug(debugType.messageType, `Delete Entry`)
        if (this.is2_0) return new Error("2.0 does not support delete");
        if (typeof this.entries[id] == 'undefined') return new Error("Does not exist");
        this.write(Buffer.from([0x13, id >> 8, id & 0xff]));
        this.debug(debugType.messages, `Delete ${id}`)
    }
    /**
     * Deletes All Entries
     */
    DeleteAll() {
        this.debug(debugType.messageType, `Delete All Entries`)
        if (this.is2_0) return new Error("2.0 does not support delete");
        this.write(toServer.deleteAll);
        this.entries = {};
        this.keymap = {};
    }
    /**
     * Executes an RPC
     * @param id The ID of the RPC Entry
     * @param val The Values of the Parameters
     * @param callback To be called with the Results
     */
    RPCExec(id: number, val: Object, callback: (result: Object) => any) {
        this.debug(debugType.messageType, `Execute RPC`)
        if (this.is2_0) return new Error("2.0 does not support RPC");
        if (typeof this.entries[id] == 'undefined') return new Error("Does not exist");
        let entry = this.entries[id];
        if (entry.typeID !== e.RPC) return new Error("Is not an RPC");
        let par = (<RPC>entry.val).par,
            f: toBufRes[] = [],
            value: any,
            len = 0,
            parName = "";
        for (let i = 0; i < par.length; i++) {
            parName = par[i].name;
            value = typeof val[parName] != 'undefined' ? val[parName] : par[i].default;
            let testVal = this.fixType(value, par[i].typeId);
            if (testVal == null)
                return new Error(
                    `Wrong Type: ${value} is not a ${typeNames[par[i].typeId]}`
                );
            let n = TypeBuf[par[i].typeId].toBuf(testVal);
            len += n.length;
            f.push(n);
        }
        let encLen = numTo128(len),
            buf = Buffer.allocUnsafe(len + encLen.length + 5),
            off = 5 + encLen.length,
            randId = Math.floor(Math.random() * 0xffff);
        buf[0] = 0x21;
        buf[1] = id >> 8;
        buf[2] = id & 0xff;
        buf[3] = randId >> 8;
        buf[4] = randId & 0xff;
        encLen.copy(buf, 5);
        for (let i = 0; i < f.length; i++) {
            f[i].write(buf, off);
            off += f[i].length;
        }
        this.debug(debugType.messages, { id, randId, val })
        this.write(buf);
        this.RPCExecCallback[randId] = callback;
    }
    private keys: string[];
    private readonly keepAlive = Buffer.from([0]);
    private aliveTimer: NodeJS.Timer;
    private bufferTimer: NodeJS.Timer;
    private buffersToSend: Buffer[] = [];
    /**
     * Direct Write to the Server
     * @param buf The Buffer to be sent
     * @param immediate whether the write should happen right away
     */
    write(buf: Buffer, immediate = false) {
        if (this.aliveTimer) clearTimeout(this.aliveTimer);
        if (!this.socketConnected) return
        this.aliveTimer = setTimeout(() => {
            this.write(this.keepAlive);
        }, 1000);
        if (this.aliveTimer.unref) this.aliveTimer.unref();
        this.buffersToSend.push(buf);
        let writeFunc = () => {
            this.debug(debugType.basic, `Writing to Server`)
            this.debug(debugType.everything, buf)
            this.client.write(Buffer.concat(this.buffersToSend));
            this.bufferTimer = null;
            this.buffersToSend = []
        }
        if (immediate) {
            writeFunc()
        }
        else {
            this.debug(debugType.everything, 'Buffering write')
            if (this.bufferTimer == null)
                this.bufferTimer = setTimeout(writeFunc, 20);
        }
    }
    startDebug(name: string, debugLevel = debugType.basic) {
        if (typeof name == 'string' && name.length > 0) {
            this.debug = (level: debugType, st: any) => {
                if (level > debugLevel) return
                if (typeof st == 'string') {
                    console.log(name + ': ' + st)
                } else {
                    console.log({ [name]: st })
                }
            }
        }
    }
    private fixType(val: any, type: e) {
        if (Array.isArray(val)) {
            if (type === e.BoolArray) {
                if (val.every(e => typeof e === "boolean")) return val;
                else if (!this.strictInput) {
                    let tryVal = [];
                    for (let i = 0; i < val.length; i++) {
                        if (val[i] == "true" || val[i] == "false")
                            tryVal.push(val[i] == "true");
                        else return;
                    }
                    return tryVal;
                }
            } else if (type === e.DoubleArray) {
                if (val.every(e => typeof e === "number")) {
                    return val;
                } else if (!this.strictInput) {
                    let tryVal = [];
                    for (let i = 0; i < val.length; i++) {
                        let testVal = parseFloat(val[i]);
                        if (Number.isNaN(testVal)) return;
                        else tryVal.push(testVal);
                    }
                    return tryVal;
                }
            } else if (type === e.StringArray) {
                if (val.every(e => typeof e === "string")) {
                    return val;
                } else if (!this.strictInput) {
                    return val.map(a => a.toString());
                }
            }
        } else {
            if (type === e.Boolean) {
                if (typeof val === "boolean") {
                    return val;
                } else if (
                    !this.strictInput &&
                    (val == "true" || val == "false")
                ) {
                    return val == "true";
                }
            } else if (type === e.Double) {
                if (typeof val === "number") {
                    return val;
                } else if (!this.strictInput) {
                    let testVal = parseFloat(val);
                    if (!Number.isNaN(testVal)) {
                        return testVal;
                    }
                }
            } else if (type === e.String) {
                if (!this.strictInput || typeof val == "string")
                    return val.toString();
            } else if (type === e.RawData && Buffer.isBuffer(val)) return val;
        }
        if (type === e.RawData && !this.strictInput) {
            if (
                typeof val == "number" &&
                val <= 0xff &&
                val >= 0 &&
                Number.isInteger(val)
            ) {
                return Buffer.from([val]);
            } else if (
                Array.isArray(val) &&
                val.every(
                    a =>
                        typeof a == "number" &&
                        a >= 0 &&
                        a <= 0xff &&
                        Number.isInteger(a)
                )
            ) {
                return Buffer.from(val);
            } else if (typeof val == "string") {
                return Buffer.from(val);
            }
        }
    }
    private callListeners: Listener = (key, val, valType, type, id, flags) => {
        for (let i = 0; i < this.listeners.length; i++) {
            if (this.connected) {
                this.listeners[i](key, val, valType, type, id, flags);
            } else {
                this.lateCallbacks.push(() =>
                    this.listeners[i](key, val, valType, type, id, flags)
                );
            }
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
};
function checkTypeI(val: any, type: number) {
    if (Array.isArray(val)) {
        if (type === e.BoolArray && val.every(e => typeof e === "boolean"))
            return true;
        else if (
            type === e.DoubleArray &&
            val.every(e => typeof e === "number")
        )
            return true;
        else if (
            type === e.StringArray &&
            val.every(e => typeof e === "string")
        )
            return true;
        else return false;
    } else {
        if (type === e.Boolean && typeof val === "boolean") return true;
        else if (type === e.Double && typeof val === "number") return true;
        else if (type === e.String && typeof val === "string") return true;
        else if (type === e.RawData && Buffer.isBuffer(val)) return true;
        else return false;
    }
}
function getType(val: any) {
    if (Array.isArray(val)) {
        if (typeof val[0] === "boolean") return 0x10;
        else if (typeof val[0] === "number") return 0x11;
        else if (typeof val[0] === "string") return 0x12;
        else if (typeof val[0] === "object") return 0x20;
    } else {
        if (typeof val === "boolean") return 0x00;
        else if (typeof val === "number") return 0x01;
        else if (typeof val === "string") return 0x02;
        else if (Buffer.isBuffer(val)) return 0x03;
    }
}
const toServer = {
    helloComplete: Buffer.from([0x05]),
    deleteAll: Buffer.from([0x14, 0xd0, 0x6c, 0xb2, 0x7a]),
    hello2_0: Buffer.from([0x01, 2, 0])
};
export interface Entry {
    typeID: number;
    name: string;
    sn: number;
    flags: number;
    val?: any;
}
interface newEntry {
    typeID: number;
    name: string;
    val: any;
    flags: number;
    oldID?: number;
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
    name: string;
    par: RPCPar[];
    results: RPCResult[];
}
interface RPCPar {
    typeId: number;
    typeName: string;
    name: string;
    default: any;
}
interface RPCResult {
    typeId: number;
    typeName: string;
    name: string;
}
type bufFrom<T> = (
    buf: Buffer,
    offset: number
) => {
        offset: number;
        val: T;
    };
interface toBufRes {
    length: number;
    write: (buf: Buffer, off: number) => any;
}
interface f<T> {
    toBuf?: (val: T) => toBufRes;
    fromBuf: (
        buf: Buffer,
        offset: number
    ) => {
            offset: number;
            val: T;
        };
}
interface fromBuf {
    [key: number]: f<any>;
    0x00: f<Boolean>;
    0x01: f<number>;
    0x02: f<string>;
    0x03: f<Buffer>;
    0x10: f<Boolean[]>;
    0x11: f<number[]>;
    0x12: f<string[]>;
    0x20: f<RPC>;
}

const TypeBuf: fromBuf = {
    0x00: <f<boolean>>{
        toBuf: val => {
            return {
                length: 1,
                write: (buf, off) => {
                    buf[off] = +val;
                }
            };
        },
        fromBuf: (buf, off) => {
            checkBufLen(buf, off, 1);
            return {
                offset: off + 1,
                val: buf[off] > 0
            };
        }
    },
    0x01: <f<number>>{
        toBuf: val => {
            return {
                length: 8,
                write: (buf, off) => {
                    ieee754.write(buf, val, off, false, 52, 8);
                }
            };
        },
        fromBuf: (buf, off) => {
            checkBufLen(buf, off, 8);
            return {
                offset: off + 8,
                val: ieee754.read(buf, off, false, 52, 8)
            };
        }
    },
    0x02: <f<string>>{
        toBuf: val => {
            let bufT = Buffer.concat([
                strLenIdent(val.length),
                Buffer.from(val, "utf8")
            ]);
            return {
                length: bufT.length,
                write: (buf, off) => {
                    bufT.copy(buf, off);
                }
            };
        },
        fromBuf: (buf, off) => {
            return fromLEBuf(buf, off);
        }
    },
    0x03: <f<Buffer>>{
        toBuf: val => {
            let len = numTo128(val.length);
            return {
                length: val.length + len.length,
                write: (buf, off) => {
                    len.copy(buf, off);
                    val.copy(buf, off + len.length);
                }
            };
        },
        fromBuf: (buf, off) => {
            let { val, offset } = numFrom128(buf, off),
                nbuf = Buffer.allocUnsafe(val),
                end = offset + val;
            checkBufLen(buf, off, val);
            buf.copy(nbuf, 0, offset);
            return {
                offset: end,
                val: nbuf
            };
        }
    },
    0x10: <f<Boolean[]>>{
        toBuf: val => {
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
        fromBuf: (buf, off) => {
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
        }
    },
    0x11: <f<number[]>>{
        toBuf: val => {
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
        fromBuf: (buf, off) => {
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
        }
    },
    0x12: <f<string[]>>{
        toBuf: val => {
            let lens: Buffer[] = [],
                len = 1;
            for (let i = 0; i < val.length; i++) {
                lens[i] = Buffer.concat([
                    strLenIdent(val[i].length),
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
        },
        fromBuf: (buf, off) => {
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
        }
    },
    0x20: <f<RPC>>{
        fromBuf: (buf, off) => {
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
                    typeName: "",
                    name: "",
                    default: 0
                };
                checkBufLen(buf, off, 1);
                lastPar.typeId = buf[off];
                lastPar.typeName = typeNames[lastPar.typeId];
                s = fromLEBuf(buf, off);
                lastPar.name = s.val;
                off = s.offset;
                let t = TypesFrom[lastPar.typeId](buf, off);
                lastPar.default = t.val;
                off = t.offset;
                par.push(lastPar);
            }
            checkBufLen(buf, off, 1);
            resNum = buf[off++];
            for (let i = 0; i < resNum; i++) {
                let res: RPCResult = { typeId: 0, typeName: "", name: "" };
                checkBufLen(buf, off, 1);
                res.typeId = buf[off];
                res.typeName = typeNames[res.typeId];
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
        }
    }
};
interface typesFrom {
    [key: number]: bufFrom<any>;
    0x00: bufFrom<Boolean>;
    0x01: bufFrom<number>;
    0x02: bufFrom<string>;
    0x03: bufFrom<Buffer>;
    0x10: bufFrom<Boolean[]>;
    0x11: bufFrom<number[]>;
    0x12: bufFrom<string[]>;
    0x20: bufFrom<RPC>;
}
var TypesFrom: typesFrom = {
    0x00: TypeBuf[e.Boolean].fromBuf,
    0x01: TypeBuf[e.Double].fromBuf,
    0x02: TypeBuf[e.String].fromBuf,
    0x03: TypeBuf[e.RawData].fromBuf,
    0x10: TypeBuf[e.BoolArray].fromBuf,
    0x11: TypeBuf[e.DoubleArray].fromBuf,
    0x12: TypeBuf[e.StringArray].fromBuf,
    0x20: TypeBuf[e.RPC].fromBuf
};
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
function numTo2Byte(num: number) {
    return Buffer.from([(this >> 8) & 0xff, this & 0xff]);
}

/**
 * Decodes a number encoded in LEB128
 * @param buf Buffer to red from
 * @param offset position to start reading from
 * @throws LengthError
 */
function numFrom128(buf: Buffer, offset: number) {
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
function checkBufLen(buf: Buffer, start: number, length: number) {
    if (buf.length < start + length - 1)
        throw new LengthError(buf, start, length);
}

export interface clientOptions {
    strictInput?: boolean;
}
export const enum debugType {
    /** Client connection status */
    basic,
    /** All message types received */
    messageType,
    /** All decoded messages */
    messages,
    /** Client Status and write data */
    everything,

}