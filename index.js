"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ieee754 = require("ieee754");
const net = require("net");
class Client {
    constructor(address = '127.0.0.1', port = 1735) {
        this.keepAlive = Buffer.from([0]);
        this.client = net.connect(port, address, () => {
            this.write(Buffer.from([0x01, 3, 0, ..."nodeClient".toLEBufA()]));
            this.client.on('data', (d) => {
                switch (d[0]) {
                    case 0x02:
                        console.log('Protocol Unsupported');
                        break;
                    case 0x03:
                        console.log('Server Hello Complete');
                    case 0x04:
                        console.log('server Hello');
                        break;
                    case 0x10:
                        console.log('Entry Assign');
                        break;
                    case 0x11:
                        console.log('Entry Update');
                        break;
                    case 0x12:
                        console.log('Flag Update');
                        break;
                    case 0x13:
                        console.log('Entry Delete');
                        break;
                }
            });
        });
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
var TypeBuf = {
    byte: {
        getlen: () => 1, func: (val) => {
            return {
                len: () => 1,
                func: (buf, off) => {
                    buf[off] = val;
                }
            };
        }
    },
    Bool: {
        getlen: () => 1, func: (val) => {
            return {
                len: () => 1,
                func: (buf, off) => {
                    buf[off] = val ? 1 : 0;
                }
            };
        }
    },
    Double: {
        getlen: () => 8, func: (val) => {
            return {
                len: () => 8,
                func: (buf, off) => {
                    ieee754.write(buf, val, off, false, 52, 8);
                }
            };
        }
    },
    String: {
        getlen: () => 0, func: (val) => {
            let bufT = Buffer.concat([val.length.to128(), Buffer.from(val, 'utf8')]);
            return {
                len: () => bufT.length,
                func: (buf, off) => {
                    bufT.copy(buf, off);
                }
            };
        }
    },
    RawData: {
        getlen: () => 0, func: (val) => {
            let len = val.length.to128();
            return {
                len: () => val.length + len.length,
                func: (buf, off) => {
                    len.copy(buf, off);
                    val.copy(buf, off + len.length);
                }
            };
        }
    },
    BoolArray: {
        getlen: () => 0, func: (val) => {
            return {
                len: () => val.length + 1,
                func: (buf, off) => {
                    buf[off] = val.length;
                    for (let i = 0; i < val.length; i++) {
                        buf[off + i] = val[i] ? 1 : 0;
                    }
                }
            };
        }
    },
    DoubleArray: {
        getlen: () => 0, func: (val) => {
            let len = val.length;
            return {
                len: () => 8 * val.length + 1,
                func: (buf, off) => {
                    for (let i = 0; i < val.length; i++) {
                        buf[off] = val.length;
                        off++;
                        ieee754.write(buf, val[i], off + 8 * i, false, 52, 8);
                    }
                }
            };
        }
    },
    StringArray: {
        getlen: () => 0, func: (val) => {
            let lens = [], len = 1;
            for (let i = 0; i < val.length; i++) {
                lens[i] = Buffer.concat([val[i].length.to128(), Buffer.from(val[i])]);
                len += lens[i].length;
            }
            return {
                len: () => len,
                func: (buf, off) => {
                    buf[off] = val.length;
                    off++;
                    for (let i = 0; i < val.length; i++) {
                        lens[i].copy(buf, off);
                        off += lens[i].length;
                    }
                }
            };
        }
    }
};
build(['Bool', 'BoolArray', 'Double']);
function build(s) {
    let byteCount = 0;
    for (let i = 0; i < s.length; i++) {
        TypeBuf[s[i]];
    }
    return (a) => {
        return Buffer.alloc(0);
    };
}
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
String.fromLEBuf = (buf, offset) => {
    let r = 0, n = buf[offset], s = '';
    offset++;
    r = n;
    while (n > 0x7f) {
        n = buf[offset];
        r = (r << 7) + n & 0x7f;
        offset++;
    }
    return buf.slice(offset, offset + r).toString('utf8');
};
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
Number.from754 = (buf, offset) => {
    return ieee754.read(buf, offset, false, 52, 8);
};
