import { Socket } from 'net'
import { getRequests } from './lib/requests';
import { EntryType, fixTypeID, getTypeID, isValidType } from './lib/types';
import { Entry, RPC, RPCPar } from './lib/definitions';
import { ResponseDecoder } from './lib/responses';
import { EntryStore } from './lib/entryStore';

export type Listener = (key: string, value: any, valueType: String, eventType: "add" | "delete" | "update" | "flagChange", id: number, flags: number) => any;
type conCallback = (connected: boolean, err: Error, is2_0: boolean) => void
function setObj<T>(opts: T, toSet: T, key: keyof T, type: 'string' | 'number' | 'boolean' | 'object') {
    if (typeof toSet[key] === 'undefined') {
        return
    }
    if (typeof toSet[key] == type) {
        opts[key] = toSet[key]
    } else {
        throw new Error(`${key} option needs to be a ${type}`)
    }
}

export class Client {
    private debug = (level: debugType, val: any) => { }
    private connectionCallback: conCallback
    private RPCCallbacks: ((responses: { [key: string]: any }) => any)[] = []
    private options: Required<IClientOptions> = {
        strictInput: false,
        name: "NodeJS_" + Date.now(),
        force2_0: false,
        returnTypeIDs: false,
        strictFunction: false,
        keepAfterClose: false,
        onlyWhenConnected: false
    }
    private serverOptions: { name: string, flags: number }
    private client: Socket
    private connected = false
    private socketConnected = false
    private entryStore = new EntryStore(false, updates => { // TODO change strict
        updates.forEach(update => {
            if (update.type === 'A') {
                this.sendRequest.EntryAssignment(update.entry)
            } else if (update.type === 'U') {
                this.sendRequest.EntryUpdate(update.entryID, update.entry)
            } else if (update.type === 'F') {
                this.sendRequest.EntryFlagUpdate(update.entryID, update.flags)
            } else {
                this.sendRequest.EntryDelete(update.entryID)
            }
        })
    })
    private is2_0 = false
    private sendRequest = getRequests(false, this.options.name, (buf, immediate) => this.write(buf, immediate))
    private response = new ResponseDecoder(false, {
        ProtocolUnsupported: (major, minor) => {
            if (major === 2 && minor == 0) {
                // TODO Restart client
            } else {
                this.connectionCallback(false, new Error(`This Server supports minimum version ${major}.${minor}`), this.options.force2_0)
            }
        },
        ServerHello: (name, flags) => {
            this.serverOptions = { name, flags }
            const known = (flags & 0x1) > 0
            if (known) {
                this.entryStore.loadEntries()
            }
        },
        ServerHelloComplete: () => {
            this.connected = true
            // TODO Do Assign
            if (!this.sendRequest.ClientHelloComplete.throwsError) {
                this.sendRequest.ClientHelloComplete()
            }
            this.connectionCallback(true, null, this.options.force2_0)
        },
        EntryAssignment: (entryID, entry) => {
            this.entryStore.add(entry, entryID)
            // TODO Call listeners
        },
        EntryUpdate: (entryID, sn, val, typeID) => {
            this.entryStore.update(entryID, { sn, val }, typeID)
            // TODO Call listeners
        },
        EntryFlagUpdate: (entryID, flags) => {
            this.entryStore.update(entryID, { flags })
            // TODO Call listeners
        },
        EntryDelete: (entryID) => {
            this.entryStore.delete(entryID)
            // TODO Call listeners
        },
        DeleteAll: () => {
            this.entryStore.deleteAll()
            // TODO Call listeners
        },
        RPCResponse: (_entryID, uniqueID, results) => {
            if (typeof this.RPCCallbacks[uniqueID] === 'function') {
                this.RPCCallbacks[uniqueID](results)
            }
        },
        GetEntry: (entryID) => {
            return this.entryStore.get(entryID)
        }
    })

    constructor(options?: IClientOptions) {
        if (options != null && typeof options == 'object') {
            this.setOptions(options)
        }
        this.client = new Socket()
        this.client.on('connect', () => {
            this.socketConnected = true
            this.entryStore.setTimeout(20)
            this.client.setTimeout(1000)
            this.sendRequest.ClientHello()
        })
            .on('data', data => {
                this.response.decode(data)
            })
            .on('end', () => {

            })
            .on('error', err => {

            })
            .on('close', had_error => {
                this.entryStore.unloadEntries()
            }).on('timeout', () => {
                if (this.socketConnected) {
                    this.client.setTimeout(1000)
                    this.write(Buffer.from([0]), true)
                }
            })

    }
    private setOptions(options: IClientOptions) {
        setObj(this.options, options, 'force2_0', 'boolean')
        setObj(this.options, options, 'name', 'string')
        setObj(this.options, options, 'returnTypeIDs', 'boolean')
        setObj(this.options, options, 'strictInput', 'boolean')
        setObj(this.options, options, 'strictFunction', 'boolean')
        setObj(this.options, options, 'keepAfterClose', 'boolean')
        setObj(this.options, options, 'onlyWhenConnected', 'boolean')
    }

    /**
     * True if the Client has completed its hello and is connected
     */
    isConnected() {
        return this.connected
    }
    /**
     * True if the client has switched to 2.0
     */
    uses2_0() {
        return this.is2_0
    }
    /**
     * Set and activate the reconnect feature
     *
     *
     * Delay of 20 or less will deactivate this feature
     * @param delay Time in milliseconds before the next reconnect attempt
     */
    setReconnectDelay(delay: number) {

    }
    /**
     * Start the Client
     * @param callback Called on connect or error
     * @param address Address of the Server. Default = "localhost"
     * @param port Port of the Server. Default = 1735
     */
    start(callback?: conCallback, address = 'localhost', port = 1735) {
        this.connect(address, port)
    }
    private connect(address: string, port: number) {
        this.client.connect(port, address)
    }
    /** Attempts to stop the client */
    stop() {
        this.client.end()
    }
    /** Immediately closes the client */
    destroy() {
        this.client.destroy()
        this.connected = false
    }
    /**
     * Adds and returns a Listener to be called on change of an Entry
     * @param callback Listener
     */
    addListener(key: string, callback: Listener, getCurrent?: boolean)
    addListener(callback: Listener, getCurrent?: boolean)
    addListener(arg1: string | Listener, arg2: Listener | Boolean, getCurrent?: boolean) {

    }
    /**
     * Removes a Listener
     * @param listener the Listener to remove
     */
    removeListener(listener: Listener) {

    }
    /**
     * Get the unique ID of a key or the IDs of all keys if called empty
     * @param key name of the key
     */
    getKeyID(): { [key: string]: number };
    getKeyID(key: string): number;
    getKeyID(key?: string) {
        if (typeof key === 'undefined') {
            return this.entryStore.getAllIDs()
        } else {
            return this.entryStore.getID(key)
        }
    }

    hasID(id: number) {
        return this.entryStore.exists(id)
    }
    /**
     * Gets an Entry
     * @param id ID of an Entry
     */
    getEntry(id: number): Entry {
        return { ...this.entryStore.get(id) }
    }
    /**
     * Get an Array of Keys
     */
    getKeys() {
        this.entryStore.getAllNames()
    }
    /**
     * Get All of the Entries
     */
    getEntries() {
        return this.entryStore.getAllEntries()
    }
    /**
     * Add an Entry
     * @param val The Value
     * @param name The Key of the Entry
     * @param persist Whether the Value should persist on the server through a restart
     * @param valType The data type of the value
     */
    Assign(val: any, name: string, persist: boolean | number = 0, valType?: EntryType) {
        if (val == null) {
            throw new Error('Can not assign a null or an undefined value')
        }

        const valueType = typeof valType === 'number' ? valType : getTypeID(val)
        if (!isValidType(valueType)) {
            throw new Error('Unknown type')
        } else if (valueType === EntryType.RPC) {
            throw new Error('Can not Assign RPC')
        }
        const entry: Entry = {
            val: fixTypeID(val, valueType, this.options.strictInput),
            name,
            typeID: valueType,
            flags: +persist,
            sn: -1
        }
        this.entryStore.add(entry)
    }
    /**
     * Updates an Entry
     * @param id The ID of the Entry
     * @param val The value of the Entry
     */
    Update(id: number | string, val: any) {
        if (val == null) {
            throw new Error('Can nor assign a null or an undefined value')
        }
        this.checkID(id)
        const typeID = this.entryStore.getType(id)
        const value = fixTypeID(val, typeID, this.options.strictInput)
        
        this.entryStore.update(id, {val: value})
    }
    /**
     * Updates the Flag of an Entry
     * @param id The ID of the Entry
     * @param flags Whether the Entry should persist through a restart on the server
     */
    Flag(id: number | string, flags?: boolean | number) {
        this.checkID(id)

        const flagsToSend = +flags
        if (Number.isNaN(flagsToSend) || flagsToSend < 0 || flagsToSend > 0xff) {
            throw new Error(`The flags have to be a byte (0-255)`)
        }
        this.entryStore.update(id, { flags: +flags })
    }
    /**
     * Deletes an Entry
     * @param id The ID of the Entry
     */
    Delete(id: number | string) {
        this.entryStore.delete(id)
    }
    /**
     * Deletes All Entries
     */
    DeleteAll() {
        this.entryStore.deleteAll()
        this.sendRequest.DeleteAll()
    }
    /**
     * Executes an RPC
     * @param id The ID of the RPC Entry
     * @param val The Values of the Parameters
     * @param callback To be called with the Results
     */
    RPCExec(id: number | string, val: Object): Promise<{ [key: string]: any }>
    RPCExec(id: number | string, val: Object, callback: (result: Object) => any): void
    RPCExec(id: number | string, val: Object, callback?: (result: Object) => any) {
        const entry: RPC = this.getRPC(id)
        const parameters = entry.par
        let par: RPCPar
        let preparedPars = new Array<{ typeID: number, val: any }>(parameters.length)

        for (let i = 0; i < parameters.length; i++) {
            par = parameters[i]
            if (typeof val[par.name] == 'undefined') {
                preparedPars[i] = { typeID: par.typeId, val: par.default }
            } else {
                preparedPars[i] = { typeID: par.typeId, val: fixTypeID(val, par.typeId, this.options.strictInput) }
            }
        }
        const responseID = Math.floor(Math.random() * 0xffff)
        if(typeof id === 'string'){
            id = this.entryStore.getID(id)
        }
        this.sendRequest.RPCExecute(id, responseID, preparedPars)

        if (typeof callback == 'function') {
            this.RPCCallbacks[responseID] = callback
        } else {
            return new Promise(res => {
                this.RPCCallbacks[responseID] = resVal => {
                    res(resVal)
                }
            })
        }
    }
    /**
     * Direct Write to the Server
     * @param buf The Buffer to be sent
     * @param immediate whether the write should happen right away
     */
    write(buf: Buffer, immediate?: boolean) {

    }
    startDebug(name: string, debugLevel?: debugType) {

    }

    private checkID(id: number | string) {
        if (!this.entryStore.exists(id)) {
            if(typeof id === 'string'){
                throw new Error(`The Entry "${id}" does not exist`)
            }
            throw new Error(`The Entry ${id} does not exist`)
        }
    }
    private getRPC(id: number | string) {
        this.checkID(id)
        const entryVal: RPC = this.entryStore.get(id).val
        if (entryVal != null && typeof entryVal === 'object' && Array.isArray(entryVal.par)) {
            return entryVal
        } else {
            if(typeof id === 'string'){
                id = '"' + id + '"'
            }
            throw new Error(`The Entry ${id} is not an RPC`)
        }
    }
}

export interface IClientOptions {
    /** Do not try to convert types */
    strictInput?: boolean,
    /** The client name given to the server */
    name?: string,
    /** Callbacks return value type id numbers instead of type strings */
    returnTypeIDs?: boolean,
    /** Use Network Tables Version 2.0 */
    force2_0?: boolean,
    /** Assign won't update */
    strictFunction: boolean,
    /** Do not delete entries after socket closes */
    keepAfterClose: boolean,
    /** Throw Error os Assign and Update when not Connected */
    onlyWhenConnected: boolean
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