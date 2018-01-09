"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ieee754 = require("ieee754");
const net = require("net");
var strLenIdent = numTo128;
class Client {
    constructor() {
        this.clientName = "NodeJS" + Date.now();
        this.connected = false;
        this.entries = {};
        this.oldEntries = {};
        this.keymap = {};
        this.newKeyMap = [];
        this.updatedIDs = [];
        this.reconnect = false;
        this.known = false;
        this.listeners = [];
        this.RPCExecCallback = {};
        this.lateCallbacks = [];
        this.is2_0 = false;
        this.reAssign = {};
        this.beingAssigned = [];
        this.recProto = {
            /** Keep Alive */
            0x00: (buf, off) => {
                return off;
            },
            /** Protocol Version Unsupported */
            0x02: (buf, off) => {
                checkBufLen(buf, off, 2);
                var ver = `${buf[off++]}.${buf[off++]}`;
                if (ver === '2.0') {
                    this.reconnect = true;
                    this.is2_0 = true;
                    strLenIdent = numTo2Byte;
                }
                else
                    this.conCallback(false, new Error('Unsupported protocol: ' + ver), this.is2_0);
                return off;
            },
            /** Server Hello Complete */
            0x03: (buf, off) => {
                this.connected = true;
                for (let key in this.oldEntries) {
                    if (!(key in this.entries)) {
                        let old = this.oldEntries[key];
                        this.Assign(old.val, old.name, old.flags > 0);
                    }
                }
                if (this.is2_0) {
                    this.afterConnect();
                }
                else {
                    this.newKeyMap.map(e => {
                        if (!(e.name in this.keymap)) {
                            this.Assign(e.val, e.name, e.flags > 0);
                        }
                    });
                    this.toServer.HelloComplete();
                    if (this.known) {
                        while (this.updatedIDs.length > 0) {
                            let e = this.updatedIDs.pop();
                            if (e in this.entries)
                                this.Update(e, this.entries[e].val);
                        }
                    }
                }
                return off;
            },
            /** Server Hello */
            0x04: (buf, off) => {
                checkBufLen(buf, off, 1);
                let flags = this.is2_0 ? 0 : buf[off++];
                this.known = flags > 0;
                let sName = TypesFrom[2 /* String */](buf, off);
                this.serverName = sName.val;
                return sName.offset;
            },
            /** Entry Assignment */
            0x10: (buf, off) => {
                let keyName = TypesFrom[2 /* String */](buf, off);
                off = keyName.offset;
                checkBufLen(buf, off, 5 + (this.is2_0 ? 0 : 1));
                let type = buf[off++], id = (buf[off++] << 8) + buf[off++], typeName = typeNames[type], key = keyName.val, entry = {
                    typeID: type,
                    name: key,
                    sn: (buf[off++] << 8) + buf[off++],
                    flags: this.is2_0 ? 0 : buf[off++]
                };
                let val = TypesFrom[entry.typeID](buf, off);
                entry.val = val.val;
                this.entries[id] = entry;
                this.keymap[key] = id;
                for (let i = 0; i < this.listeners.length; i++) {
                    if (this.connected) {
                        this.listeners[i](keyName.val, val.val, typeName, "add", id, entry.flags);
                    }
                    else {
                        this.lateCallbacks.push(() => this.listeners[i](keyName.val, val.val, typeName, "add", id, entry.flags));
                    }
                }
                if (key in this.reAssign) {
                    let toUpdate = this.reAssign[key];
                    this.Update(id, toUpdate.val);
                    if (!this.is2_0 && entry.flags !== toUpdate.flags) {
                        this.Flag(id, toUpdate.flags);
                    }
                    delete this.reAssign[key];
                }
                return val.offset;
            },
            /** Entry Update */
            0x11: (buf, off) => {
                checkBufLen(buf, off, 4 + (this.is2_0 ? 0 : 1));
                let id = (buf[off++] << 8) + buf[off++], sn = (buf[off++] << 8) + buf[off++], type = this.is2_0 ? this.entries[id].typeID : buf[off++], val = TypesFrom[type](buf, off), typeName = typeNames[type], name = "";
                if (id in this.entries && type === this.entries[id].typeID) {
                    let entry = this.entries[id];
                    entry.sn = sn;
                    entry.val = val.val;
                    name = entry.name;
                    for (let i = 0; i < this.listeners.length; i++) {
                        if (this.connected) {
                            this.listeners[i](name, val.val, typeName, "update", id, entry.flags);
                        }
                        else {
                            this.lateCallbacks.push(() => this.listeners[i](name, val.val, typeName, "update", id, entry.flags));
                        }
                    }
                }
                return val.offset;
            },
            /** Entry Flags Update */
            0x12: (buf, off) => {
                checkBufLen(buf, off, 3);
                let id = (buf[off++] << 8) + buf[off++], flags = buf[off++];
                if (id in this.entries) {
                    let entry = this.entries[id];
                    entry.flags = flags;
                    for (let i = 0; i < this.listeners.length; i++) {
                        if (this.connected) {
                            this.listeners[i](entry.name, entry.val, typeNames[entry.typeID], "flagChange", id, flags);
                        }
                        else {
                            this.lateCallbacks.push(() => this.listeners[i](entry.name, entry.val, typeNames[entry.typeID], "flagChange", id, flags));
                        }
                    }
                }
                return off;
            },
            /** Entry Delete */
            0x13: (buf, off) => {
                checkBufLen(buf, off, 2);
                let id = (buf[off++] << 8) + buf[off++], name = this.entries[id].name, typename = typeNames[this.entries[id].typeID], flags = this.entries[id].flags;
                delete this.entries[id];
                delete this.keymap[name];
                for (let i = 0; i < this.listeners.length; i++) {
                    if (this.connected) {
                        this.listeners[i](name, null, typename, "delete", id, flags);
                    }
                    else {
                        this.lateCallbacks.push(() => this.listeners[i](name, null, typename, "delete", id, flags));
                    }
                }
                return off;
            },
            /** Clear All Entries */
            0x14: (buf, off) => {
                checkBufLen(buf, off, 4);
                let val = 0;
                for (let i = 0; i < 4; i++) {
                    val = (val << 8) + buf[off + i];
                }
                if (val === 0xD06CB27A) {
                    this.entries = {};
                    this.keymap = {};
                }
                return off + 4;
            },
            /** RPC Response */
            0x21: (buf, off) => {
                checkBufLen(buf, off, 4);
                let id = (buf[off++] << 8) + buf[off++], executeID = (buf[off++] << 8) + buf[off++], len = numFrom128(buf, off), res = this.entries[id].val.results, results = {}, s;
                for (let i = 0; i < res.length; i++) {
                    for (let i = 0; i < res.length; i++) {
                        s = TypesFrom[res[i].typeId](buf, off);
                        off = s.offset;
                        results[res[i].name] = s.val;
                    }
                }
                if (executeID in this.RPCExecCallback) {
                    this.RPCExecCallback[executeID](results);
                    delete this.RPCExecCallback[executeID];
                }
                return off;
            }
        };
        this.toServer = {
            Hello: (serverName) => {
                if (this.is2_0) {
                    this.write(toServer.hello2_0);
                }
                else {
                    let s = TypeBuf[2 /* String */].toBuf(serverName), buf = Buffer.allocUnsafe(s.length + 3);
                    buf[0] = 0x01;
                    buf[1] = 3;
                    buf[2] = 0;
                    s.write(buf, 3);
                    this.write(buf, true);
                }
            },
            HelloComplete: () => {
                this.write(toServer.helloComplete, true);
                this.afterConnect();
            }
        };
        this.keepAlive = Buffer.from([0]);
        this.buffersToSend = [];
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
     * Start the Client
     * @param callback Called on connect or error
     * @param address Address of the Server. Default = "localhost"
     * @param port Port of the Server. Default = 1735
     */
    start(callback, address = '127.0.0.1', port = 1735) {
        this.connected = false;
        this.address = address;
        this.port = port;
        this.conCallback = callback;
        this.reAssign = {};
        this.beingAssigned = [];
        this.client = net.connect(port, address, () => {
            this.toServer.Hello(this.clientName);
            this.client.on('data', data => {
                let pos = 0, buf = data;
                if (this.continuation != null) {
                    pos = this.continuation.offset;
                    buf = Buffer.concat([this.continuation.buf, buf]);
                    this.continuation = null;
                }
                try {
                    this.read(buf, pos);
                }
                catch (e) {
                    this.conCallback(true, e, this.is2_0);
                }
            });
        }).on('close', hadError => {
            this.connected = false;
            this.oldEntries = this.entries;
            this.entries = {};
            this.keymap = {};
            if (this.reconnect) {
                this.start(callback, address, port);
            }
            else if (!hadError)
                callback(false, null, this.is2_0);
        }).on('error', err => callback(false, err, this.is2_0));
    }
    /**
     * Adds and returns a Listener to be called on change of an Entry
     * @param callback Listener
     */
    addListener(callback) {
        this.listeners.push(callback);
        return callback;
    }
    /**
     * Removes a Listener
     * @param listener the Listener to remove
     */
    removeListener(listener) {
        var index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }
    getKeyID(key) {
        if (key == undefined) {
            return this.keymap;
        }
        else
            return this.keymap[key];
    }
    /**
     * Gets an Entry
     * @param id ID of an Entry
     */
    getEntry(id) {
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
    read(buf, off) {
        checkBufLen(buf, off, 1);
        if (buf.length == off)
            return;
        if (buf[off] in this.recProto) {
            try {
                off = this.recProto[buf[off]](buf, off + 1);
                this.read(buf, off);
            }
            catch (e) {
                if (e instanceof LengthError) {
                    this.continuation = { buf, offset: off };
                    return;
                }
                else
                    throw e;
            }
        }
        else
            throw new Error("Unknown Message Type " + buf[off]);
    }
    afterConnect() {
        this.conCallback(true, null, this.is2_0);
        while (this.lateCallbacks.length) {
            this.lateCallbacks.shift()();
        }
    }
    /**
     * Add an Entry
     * @param val The Value
     * @param name The Key of the Entry
     * @param persist Whether the Value should persist on the server through a restart
     */
    Assign(val, name, persist = false) {
        let type = getType(val);
        if (this.is2_0 && type === 3 /* RawData */)
            return new Error('2.0 does not have Raw Data');
        if (type === 32 /* RPC */)
            return new Error('Clients can not assign an RPC');
        if (!this.connected) {
            let nID = this.newKeyMap.length;
            this.newKeyMap[nID] = { typeID: type, val, flags: +persist, name: name };
            this.listeners.map(e => e(name, val, typeNames[type], "add", -nID - 1, +persist));
            return;
        }
        if (name in this.keymap) {
            return this.Update(this.keymap[name], val);
        }
        if (this.beingAssigned.indexOf(name) >= 0) {
            this.reAssign[name] = { val, flags: +persist };
            return;
        }
        else {
            this.beingAssigned.push(name);
        }
        let n = TypeBuf[2 /* String */].toBuf(name), f = TypeBuf[type].toBuf(val), nlen = n.length, assignLen = this.is2_0 ? 6 : 7, len = f.length + nlen + assignLen, buf = Buffer.allocUnsafe(len);
        buf[0] = 0x10;
        n.write(buf, 1);
        buf[nlen + 1] = type;
        buf[nlen + 2] = 0xff;
        buf[nlen + 3] = 0xff;
        buf[nlen + 4] = 0;
        buf[nlen + 5] = 0;
        if (!this.is2_0)
            buf[nlen + 6] = +persist;
        f.write(buf, nlen + assignLen);
        this.write(buf);
    }
    /**
     * Updates an Entry
     * @param id The ID of the Entry
     * @param val The value of the Entry
     */
    Update(id, val) {
        if (id < 0) {
            let nEntry = this.newKeyMap[-id - 1];
            if (checkType(val, nEntry.typeID)) {
                if (this.connected) {
                    if (nEntry.name in this.keymap) {
                        id = this.keymap[nEntry.name];
                    }
                    else {
                        return this.Assign(val, nEntry.name, nEntry.flags > 0);
                    }
                }
                else {
                    nEntry.val = val;
                    this.listeners.map(e => e(nEntry.name, val, typeNames[nEntry.typeID], "update", id, nEntry.val));
                    return;
                }
            }
            else
                return new Error('Wrong Type');
        }
        if (!(id in this.entries))
            return new Error('ID not found');
        let entry = this.entries[id];
        if (!checkType(val, entry.typeID))
            return new Error('Wrong Type');
        entry.val = val;
        entry.sn++;
        if (!this.connected) {
            if (this.updatedIDs.indexOf(id) < 0)
                this.updatedIDs.push(id);
            this.listeners.map(e => e(entry.name, val, typeNames[entry.typeID], "update", id, entry.flags));
            return;
        }
        let f = TypeBuf[entry.typeID].toBuf(val), updateLen = this.is2_0 ? 5 : 6, len = f.length + updateLen, buf = Buffer.allocUnsafe(len);
        buf[0] = 0x11;
        buf[1] = id >> 8;
        buf[2] = id & 0xff;
        buf[3] = entry.sn >> 8;
        buf[4] = entry.sn & 0xff;
        if (!this.is2_0)
            buf[5] = entry.typeID;
        f.write(buf, updateLen);
        this.write(buf);
        this.listeners.map(e => e(entry.name, val, typeNames[entry.typeID], "update", id, entry.flags));
    }
    /**
     * Updates the Flag of an Entry
     * @param id The ID of the Entry
     * @param flags Whether the Entry should persist through a restart on the server
     */
    Flag(id, flags = false) {
        if (this.is2_0)
            return new Error('2.0 does not support flags');
        if (!(id in this.entries))
            return new Error('Does not exist');
        this.write(Buffer.from([0x12, id >> 8, id & 0xff, +flags]));
    }
    /**
     * Deletes an Entry
     * @param id The ID of the Entry
     */
    Delete(id) {
        if (this.is2_0)
            return new Error('2.0 does not support delete');
        if (!(id in this.entries))
            return new Error('Does not exist');
        this.write(Buffer.from([0x13, id >> 8, id & 0xff]));
    }
    /**
     * Deletes All Entries
     */
    DeleteAll() {
        if (this.is2_0)
            return new Error('2.0 does not support delete');
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
    RPCExec(id, val, callback) {
        if (this.is2_0)
            return new Error('2.0 does not support RPC');
        if (id in this.entries)
            return new Error('Does not exist');
        let entry = this.entries[id];
        if (entry.typeID !== 32 /* RPC */)
            return new Error('Is not an RPC');
        let par = entry.val.par, f = [], value, len = 0, parName = "";
        for (let i = 0; i < par.length; i++) {
            parName = par[i].name;
            value = parName in val ? val[par[i].name] : par[i].default;
            if (!checkType(value, par[i].typeId))
                return new Error(`Wrong Type: ${value} is not a ${typeNames[par[i].typeId]}`);
            let n = TypeBuf[par[i].typeId].toBuf(value);
            len += n.length;
            f.push(n);
        }
        let encLen = numTo128(len), buf = Buffer.allocUnsafe(len + encLen.length + 5), off = 5 + encLen.length, randId = Math.floor(Math.random() * 0xffff);
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
        this.write(buf);
        this.RPCExecCallback[randId] = callback;
    }
    /**
     * Direct Write to the Server
     * @param buf The Buffer to be sent
     * @param immediate whether the write should happen right away
     */
    write(buf, immediate = false) {
        if (this.aliveTimer)
            clearTimeout(this.aliveTimer);
        this.aliveTimer = setTimeout(() => { this.write(this.keepAlive); }, 1000);
        if (this.aliveTimer.unref)
            this.aliveTimer.unref();
        if (immediate)
            this.client.write(buf);
        else {
            this.buffersToSend.push(buf);
            if (!this.bufferTimer)
                this.bufferTimer = setTimeout(() => {
                    this.client.write(Buffer.concat(this.buffersToSend));
                    this.bufferTimer = null;
                }, 20);
        }
    }
}
exports.Client = Client;
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
function checkType(val, type) {
    if (Array.isArray(val)) {
        if (type === 16 /* BoolArray */ && val.every(e => typeof e === "boolean"))
            return true;
        else if (type === 17 /* DoubleArray */ && val.every(e => typeof e === "number"))
            return true;
        else if (type === 18 /* StringArray */ && val.every(e => typeof e === "string"))
            return true;
        else
            return false;
    }
    else {
        if (type === 0 /* Boolean */ && typeof val === "boolean")
            return true;
        else if (type === 1 /* Double */ && typeof val === "number")
            return true;
        else if (type === 2 /* String */ && typeof val === "string")
            return true;
        else if (type === 3 /* RawData */ && Buffer.isBuffer(val))
            return true;
        else
            return false;
    }
}
function getType(val) {
    if (Array.isArray(val)) {
        if (typeof val[0] === "boolean")
            return 0x10;
        else if (typeof val[0] === "number")
            return 0x11;
        else if (typeof val[0] === "string")
            return 0x12;
        else if (typeof val[0] === "object")
            return 0x20;
    }
    else {
        if (typeof val === "boolean")
            return 0x00;
        else if (typeof val === "number")
            return 0x01;
        else if (typeof val === "string")
            return 0x02;
        else if (Buffer.isBuffer(val))
            return 0x03;
    }
}
const toServer = {
    helloComplete: Buffer.from([0x05]),
    deleteAll: Buffer.from([0x14, 0xD0, 0x6C, 0xB2, 0x7A]),
    hello2_0: Buffer.from([0x01, 2, 0])
};
const TypeBuf = {
    0x00: {
        toBuf: (val) => {
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
    0x01: {
        toBuf: (val) => {
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
    0x02: {
        toBuf: (val) => {
            let bufT = Buffer.concat([strLenIdent(val.length), Buffer.from(val, 'utf8')]);
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
    0x03: {
        toBuf: (val) => {
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
            let { val, offset } = numFrom128(buf, off), nbuf = Buffer.allocUnsafe(val), end = offset + val;
            checkBufLen(buf, off, val);
            buf.copy(nbuf, 0, offset);
            return {
                offset: end,
                val: nbuf
            };
        }
    },
    0x10: {
        toBuf: (val) => {
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
            let len = buf[off], res = [];
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
    0x11: {
        toBuf: (val) => {
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
            let val = buf[off], num = [];
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
    0x12: {
        toBuf: (val) => {
            let lens = [], len = 1;
            for (let i = 0; i < val.length; i++) {
                lens[i] = Buffer.concat([strLenIdent(val[i].length), Buffer.from(val[i])]);
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
            let len = buf[off], s = [], st;
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
    0x20: {
        fromBuf: (buf, off) => {
            checkBufLen(buf, off, 1);
            let st;
            if (buf[off] !== 1)
                throw new Error('Unsupported RPC Definition');
            off++;
            st = fromLEBuf(buf, off);
            off = st.offset;
            checkBufLen(buf, off, 1);
            let name = st.val, parNum = buf[off], par = [], results = [], s = { offset: 0, val: "" }, resNum = 0;
            off++;
            for (let i = 0; i < parNum; i++) {
                let lastPar = { typeId: 0, typeName: "", name: "", default: 0 };
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
                let res = { typeId: 0, typeName: "", name: "" };
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
var TypesFrom = {
    0x00: TypeBuf[0 /* Boolean */].fromBuf,
    0x01: TypeBuf[1 /* Double */].fromBuf,
    0x02: TypeBuf[2 /* String */].fromBuf,
    0x03: TypeBuf[3 /* RawData */].fromBuf,
    0x10: TypeBuf[16 /* BoolArray */].fromBuf,
    0x11: TypeBuf[17 /* DoubleArray */].fromBuf,
    0x12: TypeBuf[18 /* StringArray */].fromBuf,
    0x20: TypeBuf[32 /* RPC */].fromBuf,
};
/**
 * Decodes String where first bytes are length encoded using LEB128
 * @param buf Buffer to red from
 * @param offset position to start reading from
 * @throws LengthError
 */
function fromLEBuf(buf, offset) {
    let res = numFrom128(buf, offset), end = res.offset + res.val;
    checkBufLen(buf, res.offset, res.val);
    return { offset: end, val: buf.slice(res.offset, end).toString('utf8') };
}
function numTo128(num) {
    let n = num;
    let r = [];
    while (n > 0x07f) {
        r.push((n & 0x7f) | 0x80);
        n = n >> 7;
    }
    r.push(n);
    return Buffer.from(r);
}
function numTo2Byte(num) {
    return Buffer.from([(this >> 8) & 0xff, this & 0xff]);
}
/**
 * Decodes a number encoded in LEB128
 * @param buf Buffer to red from
 * @param offset position to start reading from
 * @throws LengthError
 */
function numFrom128(buf, offset) {
    let r = 0, n = buf[offset];
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
class LengthError extends Error {
    constructor(mesg, pos = 0, length = 1) {
        if (typeof mesg !== "string") {
            super(`Trying to read ${length} bytes from position ${pos} of a buffer that is ${mesg.length} long`);
            this.buf = mesg;
            this.position = pos;
        }
        else
            super(mesg);
    }
}
exports.LengthError = LengthError;
/**
 * Check if the Buffer is long enought
 * @param buf Buffer to check the length of
 * @param start Position to read from
 * @param length Number of bytes that will be read
 * @throws LengthError
 */
function checkBufLen(buf, start, length) {
    if (buf.length < start + length - 1)
        throw new LengthError(buf, start, length);
}
