import { Entry } from './definitions';
import { EntryType, getTypeID, isValidType } from './types';
type nKeyVal<V> = { [key: number]: V }
type sKeyVal<V> = { [key: string]: V }
type callbackArg = callbackAssign | callbackFlag | callbackUpdate | callbackDelete
type callback = (val: callbackArg[]) => any
interface callbackUpdate {
    type: 'U'
    entryID: number
    entry: Entry
}
interface callbackFlag {
    type: 'F'
    entryID: number
    flags: number
}
interface callbackAssign {
    type: 'A'
    entry: Entry
}
interface callbackDelete {
    type: 'D'
    entryID: number
}
interface TD {
    val?: any,
    flags?: number,
    entry?: Entry
    entryID?: number,
    toAdd?:boolean
    toDelete?: boolean
}
export class EntryStore {
    callback: callback
    entries: nKeyVal<Entry> = {}
    entryIDs: sKeyVal<number> = {}
    timeout: NodeJS.Timer
    toDo: sKeyVal<TD> = {}
    timeoutTime = 0
    nextID = -1
    isStrict:boolean
    constructor(isStrict:boolean, callback: callback) {
        this.callback = callback
        this.isStrict = isStrict
    }
    add(entry: Entry): number
    add(entry: Entry, id: number): void
    add(entry: Entry, id?: number) {
        const { name, flags, typeID, val } = entry

        if (typeof this.entryIDs[name] !== 'undefined') {
            if(this.isStrict){
                throw new Error(`The entry "${name}" already exists`)
            }
            return this.update(this.entryIDs[name], { val, flags })
        }

        if (typeof id === 'undefined') {
            this.toDo[name] = {
                val,
                flags,
                entry,
                toAdd: true
            }
            id = this.nextID
            this.nextID--
            this.entryIDs[entry.name] = id
            this.entries[id] = entry
            this.startTimer()

            return id
        } else {
            this.entries[id] = entry
            this.entryIDs[name] = id
        }
    }
    update(id: number | string, { val, flags, sn }: { val?: any, flags?: number, sn?: number }, type?: EntryType) {
        if (typeof id === 'string') {
            if (typeof this.entryIDs[id] === 'number') {
                id = this.entryIDs[id]
            } else {
                if(this.isStrict){
                    throw new Error(`The Entry "${id}" does not exist`)
                }
                const typeID = (type == null) ? getTypeID(val) : type
                if (!isValidType(typeID)) {
                    throw new Error('Unknown Entry with unknown type')
                }
                const entry: Entry = {
                    val,
                    typeID,
                    name: id,
                    flags,
                    sn: -1
                }
                return this.add(entry)
            }
        }
        const entry = this.entries[id]
        if (type != null && type != entry.typeID) {
            return
        }
        if (val != null) {
            entry.val = val
        }
        if (flags != null) {
            entry.flags = flags
        }
        if (sn != null) {
            entry.sn = sn
        } else {
            let callParm: TD
            if (typeof this.toDo[entry.name] === 'undefined') {
                callParm = { entry, entryID: id }
                this.toDo[entry.name] = callParm
            } else {
                callParm = this.toDo[entry.name]
                callParm.entry = entry
                callParm.entryID = id
            }
            if (val != null) {
                callParm.val = val
            }
            if (flags != null) {
                callParm.flags = flags
            }
            this.startTimer()
        }
    }
    delete(id: number | string) {
        if(typeof id === 'string'){
            if(typeof this.entryIDs[id] !== 'undefined'){
                id = this.entryIDs[id]
            }else{
                return
            }
        }
        if(typeof this.entries[id] != 'undefined'){
            const {name} = this.entries[id]
            if(typeof this.toDo[name] === 'undefined'){
                this.toDo[name]={toDelete:true, entryID: id}
            }else{
                this.toDo[name].toDelete = true
                this.toDo[name].entryID = id
            }
            this.startTimer()
        }
    }
    deleteAll() {
        this.entries = {}
        this.entryIDs = {}
        this.toDo = {}
    }
    get(id: number | string, strict = false) {
        if (strict && !this.exists(id)) {
            return null
        }
        if (typeof id === 'number') {
            return this.entries[id]
        } else {
            return this.entries[this.entryIDs[id]]
        }
    }
    getAllEntries() {

    }
    getType(id: number | string) {
        if(this.exists(id)){
            return this.get(id).typeID
        }
        return null
    }
    getName(id: number) {
        if(this.exists(id)){
            return this.get(id).name
        }
        return null
    }
    getAllNames() {
        return Object.keys(this.entryIDs)
    }
    getID(name: string) {
        return this.entryIDs[name]
    }
    getAllIDs() {
        return this.entryIDs
    }
    unloadEntries() {

    }
    loadEntries() {

    }
    exists(id: number | string) {
        if (typeof id === 'number') {
            return (typeof this.entries[id] !== 'undefined')
        } else {
            return (typeof this.entryIDs[id] !== 'undefined')
        }
    }
    startTimer() {
        if (this.timeout == null && this.timeoutTime > 0) {
            this.timeout = setTimeout(() => this.callCallback(), this.timeoutTime)
            this.timeout.unref()
        }
    }
    stopTimer() {
        if (this.timeout != null) {
            clearTimeout(this.timeout)
            this.timeout = null
        }
    }
    setTimeout(time: number) {
        this.timeoutTime = time
    }
    callCallback() {
        this.timeout = null
        let res: callbackArg[] = []
        Object.keys(this.toDo).forEach(key => {
            const toDoVal = this.toDo[key]
            if(toDoVal.toDelete === true && toDoVal.toAdd === true){
                return
            }
            if(toDoVal.toDelete === true){
                res.push({
                    type:'D',
                    entryID: toDoVal.entryID
                })
            }else if (toDoVal.toAdd === true) {
                res.push({
                    type: 'A',
                    entry: toDoVal.entry
                })
            }else{
                if(toDoVal.val != null){
                    res.push({
                        type: 'U',
                        entryID: toDoVal.entryID,
                        entry: toDoVal.entry
                    })
                }
                if(toDoVal.flags != null){
                    res.push({
                        type:'F',
                        entryID: toDoVal.entryID,
                        flags: toDoVal.flags
                    })
                }
            }
        })
        this.toDo = {}
        if(res.length>0){
            this.callback(res)
        }
    }
    getAllNewAssign(){
        
    }

}