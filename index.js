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
        this.gListeners = [];
        this.keyListener = [];
        this.recProto = {
            /** Protocol Version Unsupported */
            0x02: (buf, off) => {
                var ver = `${buf[off++]}.${buf[off++]}`;
                console.log(`supported: ${buf[off++]}.${buf[off++]}`);
                if (ver === '2.0')
                    this.reconnect = true;
                return off;
            },
            /** Server Hello Complete */
            0x03: (buf, off) => {
                console.log('Server Hello');
                this.connected = true;
                return off;
            },
            /** Server Hello */
            0x04: (buf, off) => {
                console.log('Server Hello');
                let flags = buf[off++];
                let s = TypesFrom[2 /* String */](buf, off);
                off = s.offset;
                this.serverName = s.val;
                return off;
            },
            /** Entry Assignment */
            0x10: (buf, off) => {
                let s = TypesFrom[2 /* String */](buf, off);
                off = s.offset;
                let type = buf[off++], id = (buf[off++] << 8) + buf[off++];
                let entry = {
                    type: type,
                    name: s.val,
                    sn: (buf[off++] << 8) + buf[off++],
                    flags: buf[off++]
                };
                let val = TypesFrom[entry.type](buf, off);
                entry.val = val.val;
                this.entries[id] = entry;
                this.keymap[val.val] = id;
                return val.offset;
            },
            /** Entry Update */
            0x11: (buf, off) => {
                let id = (buf[off++] << 8) + buf[off++], sn = (buf[off++] << 8) + buf[off++], type = buf[off++], val = TypesFrom[type](buf, off);
                if (id in this.entries && type === this.entries[id].type) {
                    this.entries[id].sn = sn;
                    this.entries[id].val = val.val;
                }
                return val.offset;
            },
            /** Entry Flags Update */
            0x12: (buf, off) => {
                let id = (buf[off++] << 8) + buf[off++], flags = buf[off++];
                if (id in this.entries) {
                    this.entries[id].flags = flags;
                }
                return off;
            },
            /** Entry Delete */
            0x13: (buf, off) => {
                let id = (buf[off++] << 8) + buf[off++], name = this.entries[id].name;
                delete this.entries[id];
                delete this.keymap[name];
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
                let id = (buf[off++] << 8) + buf[off++], executeID = (buf[off++] << 8) + buf[off++], len = fromLEBuf(buf, off), par = this.entries[id].val.par, res, results = {}, s;
                for (let i = 0; i < par.length; i++) {
                    let parRes = {};
                    res = par[i].result;
                    for (let i = 0; i < res.length; i++) {
                        s = TypesFrom[res[i].type](buf, off);
                        off = s.offset;
                        parRes[res[i].name] = s.val;
                    }
                    results[par[i].name] = parRes;
                }
                return off;
            }
        };
        this.toServer = {
            Hello: (serverName) => {
                console.log('sending client hello');
                let s = TypeBuf[2 /* String */].toBuf(serverName), buf = Buffer.allocUnsafe(s.length + 3);
                buf[0] = 0x01;
                buf[1] = 3;
                buf[2] = 0;
                s.write(buf, 3);
                this.write(buf);
            },
            HelloComplete: () => {
                console.log('sending Hello Complete');
                this.write(toServer.helloComplete);
            },
            Assign: (type, val, name, flags) => {
                console.log('sending Entry Assignment');
                let n = TypeBuf[2 /* String */].toBuf(name);
                let f = TypeBuf[type].toBuf(val), nlen = n.length, len = f.length + nlen + 7, buf = Buffer.allocUnsafe(len);
                buf[0] = 0x10;
                n.write(buf, 1);
                buf[nlen + 1] = type;
                buf[nlen + 2] = 0xff;
                buf[nlen + 3] = 0xff;
                buf[nlen + 4] = 0;
                buf[nlen + 5] = 0;
                buf[nlen + 6] = flags;
                f.write(buf, nlen + 7);
                this.write(buf);
            },
            Update: (id) => {
                console.log('sending Entry update');
                let entry = this.entries[id];
                let f = TypeBuf[entry.type].toBuf(entry.val), len = f.length + 6, buf = Buffer.allocUnsafe(len);
                entry.sn++;
                buf[0] = 0x11;
                buf[1] = id >> 8;
                buf[2] = id & 0xff;
                buf[3] = entry.sn >> 8;
                buf[4] = entry.sn & 0xff;
                buf[5] = entry.type;
                f.write(buf, 6);
                this.write(buf);
            },
            Flag: (id, flags) => {
                console.log('sending Update Flag');
                this.write(Buffer.from([0x12, id >> 8, id & 0xff, flags]));
            },
            Delete: (id) => {
                console.log('sending Entry Delete');
                this.write(Buffer.from([0x13, id >> 8, id & 0xff]));
            },
            DeleteAll: () => {
                console.log('sending Delete All');
                this.write(toServer.deleteAll);
            },
            RPCExec: (id, val) => {
                console.log('Sending RPC Execute');
                if (id in this.entries) {
                    let entry = this.entries[id];
                    if (entry.type !== 32 /* RPC */)
                        return;
                    let par = entry.val.par, f = [], value, len = 0;
                    for (let i = 0; i < par.length; i++) {
                        value = val[par[i].name];
                        if (!checkType(value, par[i].type))
                            return;
                        let n = TypeBuf[par[i].type].toBuf(value);
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
                }
            }
        };
        this.keepAlive = Buffer.from([0]);
    }
    start(address = '127.0.0.1', port = 1735) {
        this.address = address;
        this.port = port;
        this.client = net.connect(port, address, () => {
            this.toServer.Hello(this.clientName);
            this.client.on('data', d => this.read(d, 0));
        }).on('close', e => {
            console.log({ client: 'closed', error: e });
            if (this.reconnect) {
                this.start(address, port);
            }
        });
    }
    onGlobal(callback) {
        this.gListeners.push(callback);
    }
    onKey(callback) {
    }
    read(buf, off) {
        if (buf[off] in this.recProto) {
            off = this.recProto[buf[off]](buf, 1);
            if (buf.length > off)
                this.read(buf, off);
        }
    }
    write(buf) {
        if (this.aliveTimer)
            clearTimeout(this.aliveTimer);
        this.aliveTimer = setTimeout(() => { this.write(this.keepAlive); }, 1000);
        this.aliveTimer.unref();
        this.client.write(buf);
    }
}
exports.Client = Client;
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
            let name = st.val, parNum = buf[off], par = [], s = { offset: 0, val: "" }, resNum = 0, resLen = 0;
            off++;
            for (let i = 0; i < parNum; i++) {
                let lastPar = { type: 0, name: "", default: 0, result: [] };
                lastPar.type = buf[off];
                s = fromLEBuf(buf, off);
                lastPar.name = s.val;
                off = s.offset;
                let t = TypesFrom[lastPar.type](buf, off);
                lastPar.default = t.val;
                off = t.offset;
                resNum = buf[off];
                resLen += resNum;
                off++;
                for (let i = 0; i < resNum; i++) {
                    let res = { type: 0, name: "" };
                    res.type = buf[off];
                    s = fromLEBuf(buf, off + 1);
                    res.name = s.val;
                    off = s.offset;
                    lastPar.result.push(res);
                }
                par.push(lastPar);
            }
            return {
                offset: off,
                val: {
                    name,
                    resLen,
                    par
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
String.prototype.toLEBufA = function () {
    let n = this.length;
    let r = [];
    while (n > 0x07f) {
        r.push((n & 0x7f) | 0x80);
        n = n >> 7;
    }
    r.push(n);
    return [...r, ...Buffer.from(this, 'utf8')];
};
function fromLEBuf(buf, offset) {
    let res = numFrom128(buf, offset), end = res.offset + res.val;
    return { offset: end, val: buf.slice(res.offset, end).toString('utf8') };
}
Number.prototype.to754 = function () {
    let b = Buffer.alloc(8);
    ieee754.write(b, this, 0, false, 52, 8);
    return [...b];
};
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
    r = n;
    while (n > 0x7f) {
        n = buf[offset];
        r = (r << 7) + n & 0x7f;
        offset++;
    }
    return {
        val: r,
        offset
    };
}
