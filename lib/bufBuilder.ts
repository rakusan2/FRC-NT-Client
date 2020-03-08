import {LengthError} from './error'

export class BufSequencer{
    buf: Buffer
    index: number
    savedIndex: number
    constructor(buf?: Buffer){
        this.buf = (Buffer.isBuffer(buf) ? buf : Buffer.alloc(0))
        this.savedIndex = this.index = 0
    }

    add(buf: Buffer){
        this.buf = Buffer.concat([this.buf, buf])
    }

    replace(buf: Buffer){
        this.buf = buf
        this.savedIndex = this.index = 0
    }

    saveIndex(){
        this.savedIndex = this.index
    }

    loadIndex(){
        this.index = this.savedIndex
    }

    nextByte(){
        if(this.buf.length > this.index && this.index >= 0){
            let i = this.index
            this.index++
            return this.buf[i]
        }else{
            throw new LengthError(this.buf, this.index, 1)
        }
    }

    nextSlice(length: number){
        if(this.index >= 0 && length>0 && this.index + length >= this.buf.length){
            let i = this.index - 1
            this.index += length
            return this.buf.slice(i, i + length)
        }else{
            throw new LengthError(this.buf, this.index, length)
        }
    }
}

export class BufBuilder{
    vals:(number|Buffer)[] = []
    constructor(val?:number|Buffer|number[]|Buffer[]){
        if(val !== undefined){
            this.add(val)
        }
    }
    add(val:number|Buffer|number[]| Buffer[]){
        if(typeof val === 'number'){
            this.vals.push(val & 0xff)
        }else if (Buffer.isBuffer(val)){
            this.vals.push(val)
        }else if(Array.isArray(val) && val.length > 0){
            if(Buffer.isBuffer(val[0])){
                this.vals.push(...val)
            }else{
                this.vals.push(Buffer.from(val))
            }
        }
        return this
    }
    build(){
        return Buffer.concat(this.vals.map(a=>Buffer.isBuffer(a)?a:Buffer.from([a])))
    }
}