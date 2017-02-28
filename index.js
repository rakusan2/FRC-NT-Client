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
            setTimeout(this.aliveTimer, 1000);
        else
            this.aliveTimer = setTimeout(() => { this.write(this.keepAlive); }, 1000);
        this.client.write(buf);
    }
}
exports.Client = Client;
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
Number.from754 = (buf, offset) => {
    return ieee754.read(buf, offset, false, 52, 8);
};
