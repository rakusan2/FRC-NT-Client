import { LengthError } from './error'

export class BufSequencer {
    buf: Buffer
    index: number
    savedIndex: number
    constructor(buf?: Buffer) {
        this.buf = (Buffer.isBuffer(buf) ? buf : Buffer.alloc(0))
        this.savedIndex = this.index = 0
    }

    add(buf: Buffer) {
        this.buf = Buffer.concat([this.buf, buf])
    }

    replace(buf: Buffer) {
        this.buf = buf
        this.savedIndex = this.index = 0
    }

    clear() {
        this.buf = Buffer.alloc(0)
    }

    saveIndex() {
        this.savedIndex = this.index
    }

    loadIndex() {
        this.index = this.savedIndex
    }
    isEnd() {
        return this.buf.length === this.index
    }

    nextByte() {
        this.checkNextLength(1)
        const i = this.index
        this.index++
        return this.buf[i]
    }

    nextSlice(length: number) {
        this.checkNextLength(length)
        const i = this.index - 1
        this.index += length
        return this.buf.slice(i, i + length)
    }
    checkNextLength(length: number) {
        if (this.index < 0 || this.buf.length < this.index + length) {
            throw new LengthError(this.buf, this.index, length)
        }
    }
}

export class BufBuilder {
    vals: (number | Buffer)[] = []
    constructor(val?: number | Buffer | number[] | Buffer[]) {
        if (val !== undefined) {
            this.add(val)
        }
    }
    add(val: number | Buffer | number[] | Buffer[]) {
        if (typeof val === 'number') {
            this.vals.push(val & 0xff)
        } else if (Buffer.isBuffer(val)) {
            this.vals.push(val)
        } else if (Array.isArray(val) && val.length > 0) {
            if (Buffer.isBuffer(val[0])) {
                this.vals.push(...val)
            } else {
                this.vals.push(Buffer.from(val))
            }
        }
        return this
    }
    build() {
        return Buffer.concat(this.vals.map(a => Buffer.isBuffer(a) ? a : Buffer.from([a])))
    }
}