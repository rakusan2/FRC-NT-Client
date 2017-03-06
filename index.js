"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ieee754 = require("ieee754");
const net = require("net");
class Client {
    constructor() {
        this.clientName = "node" + +new Date();
        this.connected = false;
        this.entries = {};
        this.keymap = {};
        this.reconnect = false;
        this.listeners = [];
        this.RPCExecCallback = {};
        this.lateCallbacks = [];
        this.recProto = {
            /** Protocol Version Unsupported */
            0x02: (buf, off) => {
                var ver = `${buf[off++]}.${buf[off++]}`;
                if (ver === '2.0')
                    this.reconnect = true;
                else
                    this.conCallback(false, new Error('Unsupported protocol: ' + ver));
                return off;
            },
            /** Server Hello Complete */
            0x03: (buf, off) => {
                this.toServer.HelloComplete();
                return off;
            },
            /** Server Hello */
            0x04: (buf, off) => {
                let flags = buf[off++];
                let sName = TypesFrom[2 /* String */](buf, off);
                this.serverName = sName.val;
                return sName.offset;
            },
            /** Entry Assignment */
            0x10: (buf, off) => {
                let keyName = TypesFrom[2 /* String */](buf, off);
                off = keyName.offset;
                let type = buf[off++], id = (buf[off++] << 8) + buf[off++], typeName = typeNames[type], entry = {
                    typeID: type,
                    name: keyName.val,
                    sn: (buf[off++] << 8) + buf[off++],
                    flags: buf[off++]
                };
                let val = TypesFrom[entry.typeID](buf, off);
                entry.val = val.val;
                this.entries[id] = entry;
                this.keymap[val.val] = id;
                for (let i = 0; i < this.listeners.length; i++) {
                    if (this.connected) {
                        this.listeners[i](keyName.val, val.val, typeName, "add", id, entry.flags);
                    }
                    else {
                        this.lateCallbacks.push(() => this.listeners[i](keyName.val, val.val, typeName, "add", id, entry.flags));
                    }
                }
                return val.offset;
            },
            /** Entry Update */
            0x11: (buf, off) => {
                let id = (buf[off++] << 8) + buf[off++], sn = (buf[off++] << 8) + buf[off++], type = buf[off++], val = TypesFrom[type](buf, off), typeName = typeNames[type], name = "";
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
                let id = (buf[off++] << 8) + buf[off++], executeID = (buf[off++] << 8) + buf[off++], len = fromLEBuf(buf, off), res = this.entries[id].val.results, results = {}, s;
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
                let s = TypeBuf[2 /* String */].toBuf(serverName), buf = Buffer.allocUnsafe(s.length + 3);
                buf[0] = 0x01;
                buf[1] = 3;
                buf[2] = 0;
                s.write(buf, 3);
                this.write(buf, true);
            },
            HelloComplete: () => {
                this.write(toServer.helloComplete, true);
                this.connected = true;
                this.conCallback(true, null);
                while (this.lateCallbacks.length) {
                    this.lateCallbacks.shift()();
                }
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
     * Start the Client
     * @param callback Called When an error occurs
     * @param address Address of the Server. Default = "localhost"
     * @param port Port of the Server. Default = 1735
     */
    start(callback, address = '127.0.0.1', port = 1735) {
        this.connected = false;
        this.address = address;
        this.port = port;
        this.conCallback = callback;
        this.client = net.connect(port, address, () => {
            this.toServer.Hello(this.clientName);
            this.client.on('data', data => {
                this.read(data, 0);
            });
        }).on('close', e => {
            this.connected = false;
            if (this.reconnect) {
                this.start(callback, address, port);
            }
        }).on('error', err => callback(false, err));
    }
    /**
     * Add a Listener to be called on change of an Entry
     * @param callback Listener
     */
    addListener(callback) {
        this.listeners.push(callback);
    }
    /**
     * Get the unique ID of a key or the IDs of all keys if called empty
     * @param key name of the key
     */
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
        if (buf[off] in this.recProto) {
            off = this.recProto[buf[off]](buf, off + 1);
            if (buf.length > off)
                this.read(buf, off);
        }
    }
    /**
     * Add an Entry
     * @param type ID of the type of the Value
     * @param val The Value
     * @param name The Key of the Entry
     * @param persist Whether the Value should persist on the server through a restart
     */
    Assign(type, val, name, persist = false) {
        let n = TypeBuf[2 /* String */].toBuf(name);
        let f = TypeBuf[type].toBuf(val), nlen = n.length, len = f.length + nlen + 7, buf = Buffer.allocUnsafe(len);
        buf[0] = 0x10;
        n.write(buf, 1);
        buf[nlen + 1] = type;
        buf[nlen + 2] = 0xff;
        buf[nlen + 3] = 0xff;
        buf[nlen + 4] = 0;
        buf[nlen + 5] = 0;
        buf[nlen + 6] = persist ? 1 : 0;
        f.write(buf, nlen + 7);
        this.write(buf);
    }
    /**
     * Updates an Entry
     * @param id The ID of the Entry
     * @param val The value of the Entry
     */
    Update(id, val) {
        if (!(id in this.entries))
            return new Error('ID not found');
        let entry = this.entries[id];
        if (!checkType(val, entry.typeID))
            return new Error('Wrong Type');
        entry.val = val;
        let f = TypeBuf[entry.typeID].toBuf(val), len = f.length + 6, buf = Buffer.allocUnsafe(len);
        entry.sn++;
        buf[0] = 0x11;
        buf[1] = id >> 8;
        buf[2] = id & 0xff;
        buf[3] = entry.sn >> 8;
        buf[4] = entry.sn & 0xff;
        buf[5] = entry.typeID;
        f.write(buf, 6);
        this.write(buf);
    }
    /**
     * Updates the Flag of an Entry
     * @param id The ID of the Entry
     * @param persist Whether the Entry should persist through a restart on the server
     */
    Flag(id, persist = false) {
        if (!(id in this.entries))
            return new Error('Does not exist');
        this.write(Buffer.from([0x12, id >> 8, id & 0xff, persist ? 1 : 0]));
    }
    /**
     * Deletes an Entry
     * @param id The ID of the Entry
     */
    Delete(id) {
        if (!(id in this.entries))
            return new Error('Does not exist');
        this.write(Buffer.from([0x13, id >> 8, id & 0xff]));
    }
    /**
     * Deletes All Entries
     */
    DeleteAll() {
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
        let encLen = len.to128(), buf = Buffer.allocUnsafe(len + encLen.length + 5), off = 5 + encLen.length, randId = Math.floor(Math.random() * 0xffff);
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
        this.aliveTimer.unref();
        if (immediate)
            this.client.write(buf);
        else {
            this.buffersToSend.push(buf);
            if (!this.bufferTimer)
                this.bufferTimer = setTimeout(() => this.client.write(Buffer.concat(this.buffersToSend)), 20);
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
const toServer = {
    helloComplete: Buffer.from([0x05]),
    deleteAll: Buffer.from([0xD0, 0x6C, 0xB2, 0x7A])
};
const TypeBuf = {
    0x00: {
        toBuf: (val) => {
            return {
                length: 1,
                write: (buf, off) => {
                    buf[off] = val ? 1 : 0;
                }
            };
        },
        fromBuf: (buf, off) => {
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
            return {
                offset: off + 8,
                val: ieee754.read(buf, off, false, 52, 8)
            };
        }
    },
    0x02: {
        toBuf: (val) => {
            let bufT = Buffer.concat([val.length.to128(), Buffer.from(val, 'utf8')]);
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
            let len = val.length.to128();
            return {
                length: val.length + len.length,
                write: (buf, off) => {
                    len.copy(buf, off);
                    val.copy(buf, off + len.length);
                }
            };
        },
        fromBuf: (buf, off) => {
            let { val, offset } = numFrom128(buf, off), nbuf = Buffer.allocUnsafe(val);
            buf.copy(nbuf, 0, offset);
            return {
                offset: offset + nbuf.length,
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
                        buf[off + i] = val[i] ? 1 : 0;
                    }
                }
            };
        },
        fromBuf: (buf, off) => {
            let len = buf[off], res = [];
            off++;
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
            let val = buf[off], num = [];
            off++;
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
                lens[i] = Buffer.concat([val[i].length.to128(), Buffer.from(val[i])]);
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
            let len = buf[off], st;
            off++;
            if (buf[off] !== 1)
                return;
            off++;
            st = fromLEBuf(buf, off);
            off = st.offset;
            let name = st.val, parNum = buf[off], par = [], results = [], s = { offset: 0, val: "" }, resNum = 0;
            off++;
            for (let i = 0; i < parNum; i++) {
                let lastPar = { typeId: 0, typeName: "", name: "", default: 0 };
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
            resNum = buf[off++];
            for (let i = 0; i < resNum; i++) {
                let res = { typeId: 0, typeName: "", name: "" };
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
function fromLEBuf(buf, offset) {
    let res = numFrom128(buf, offset), end = res.offset + res.val;
    return { offset: end, val: buf.slice(res.offset, end).toString('utf8') };
}
Number.prototype.to128 = function () {
    let n = this;
    let r = [];
    while (n > 0x07f) {
        r.push((n & 0x7f) | 0x80);
        n = n >> 7;
    }
    r.push(n);
    return Buffer.from(r);
};
function numFrom128(buf, offset) {
    let r = 0, n = buf[offset];
    offset++;
    r = n & 0x7f;
    while (n > 0x7f) {
        n = buf[offset];
        r = (r << 7) + (n & 0x7f);
        offset++;
    }
    return {
        val: r,
        offset
    };
}
