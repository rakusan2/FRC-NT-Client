import { Socket } from 'net'
import { getRequests } from './lib/requests';
import { EntryType, fixTypeID, getTypeID } from './lib/types';
import { NewEntry, Entry } from './lib/definitions';
import { ResponseDecoder } from './lib/responses';

export type Listener = (key: string, value: any, valueType: String, eventType: "add" | "delete" | "update" | "flagChange", id: number, flags: number) => any;
type conCallback = (connected: boolean, err: Error, is2_0: boolean) => void
function setObj<T>(opts: T, toSet: T, key: keyof T, type: 'string' | 'number' | 'boolean' | 'object') {
    if (typeof toSet[key] == type) {
        opts[key] = toSet[key]
    } else {
        throw new Error(`${key} option needs to be a ${type}`)
    }
}

export class Client {
    private debug = (level: debugType, val: any) => { }
    private connectionCallback: conCallback
    private options: Required<IClientOptions> = {
        strictInput: false,
        name: "NodeJS_" + Date.now(),
        force2_0: false,
        returnTypeIDs: false
    }
    private client: Socket
    private connected = false
    private socketConnected = false
    private entryIds: { [key: string]: number } = {}
    private entries: { [key: number]: Entry } = {}
    private oldEntries: {[key:number]: Entry}
    private is2_0 = false
    private requesters = getRequests(false, this.options.name)
    private responders = new ResponseDecoder(false, {
        ProtocolUnsupported(major, minor) {

        },
        ServerHello(name, flags) {

        },
        ServerHelloComplete() {

        },
        EntryAssignment(entryID, entry) {

        },
        EntryUpdate(entryID, sn, val, typeID) {

        },
        EntryFlagUpdate(entryID, flags) {

        },
        EntryDelete(entryID) {

        },
        DeleteAll() {

        },
        RPCResponse(entryID, uniqueID, results) {

        },
        GetEntry(entryID) {
            return this.entries[entryID]
        }
    })

    constructor(options?: IClientOptions) {
        if (options != null && typeof options == 'object') {
            this.setOptions(options)
        }
        this.client = new Socket()
        this.client.on('connect', () => {
            this.socketConnected = true
            this.client.setTimeout(1000)
            const buf = this.requesters.ClientHello()
            this.write(buf, true)
        })
            .on('data', data => {
                this.responders.decode(data)
            })
            .on('end', () => {

            })
            .on('error', err => {

            })
            .on('close', had_error => {

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
        if(typeof key === 'undefined'){
            return this.entryIds
        }else{
            return this.entryIds[key]
        }
    }
    /**
     * Gets an Entry
     * @param id ID of an Entry
     */
    getEntry(id: number) {
        return this.entries[id]
    }
    /**
     * Get an Array of Keys
     */
    getKeys() {
        Object.keys(this.entryIds)
    }
    /**
     * Get All of the Entries
     */
    getEntries() {
        return this.entries
    }
    /**
     * Add an Entry
     * @param val The Value
     * @param name The Key of the Entry
     * @param persist Whether the Value should persist on the server through a restart
     * @param valType The data type of the value
     */
    Assign(val: any, name: string, persist: boolean | number = 0, valType?: EntryType) {
        const valueType = typeof valType === 'number' ? valType : getTypeID(val)
        const entry: NewEntry = {
            val: fixTypeID(val, valueType, this.options.strictInput),
            name,
            typeID: valueType,
            flags: +persist
        }
        const buf = this.requesters.EntryAssignment(entry)
        // TODO Send
    }
    /**
     * Updates an Entry
     * @param id The ID of the Entry
     * @param val The value of the Entry
     */
    Update(id: number, val: any) {

    }
    /**
     * Updates the Flag of an Entry
     * @param id The ID of the Entry
     * @param flags Whether the Entry should persist through a restart on the server
     */
    Flag(id: number, flags?: boolean | number) {

    }
    /**
     * Deletes an Entry
     * @param id The ID of the Entry
     */
    Delete(id: number) {

    }
    /**
     * Deletes All Entries
     */
    DeleteAll() {

    }
    /**
     * Executes an RPC
     * @param id The ID of the RPC Entry
     * @param val The Values of the Parameters
     * @param callback To be called with the Results
     */
    RPCExec(id: number, val: Object, callback: (result: Object) => any) {

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
}

export interface IClientOptions {
    /** Do not try to convert types */
    strictInput?: boolean,
    /** The client name given to the server */
    name?: string,
    /** Callbacks return value type id numbers instead of type strings */
    returnTypeIDs?: boolean
    /** Use Network Tables Version 2.0 */
    force2_0?: boolean
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