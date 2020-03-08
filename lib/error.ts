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
                `Trying to read ${length} byte${length == 1 ? '' : 's'} from position ${pos} of a buffer that is ${
                mesg.length
                } bytes long`
            );
            this.buf = mesg;
            this.position = pos;
        } else super(mesg);
    }
}