/// <reference types="node" />
export declare type Listener = (key: string, value: any, valueType: String, type: "add" | "delete" | "update" | "flagChange", id: number, flags: number) => any;
export declare class Client {
    serverName: String;
    clientName: string;
    private client;
    private connected;
    private entries;
    private oldEntries;
    private keymap;
    private newKeyMap;
    private updatedIDs;
    private reconnect;
    private address;
    private port;
    private known;
    private listeners;
    private RPCExecCallback;
    private lateCallbacks;
    private conCallback;
    private is2_0;
    private reAssign;
    private beingAssigned;
    private continuation;
    /**
     * True if the Client has completed its hello and is connected
     */
    isConnected(): boolean;
    /**
     * True if the client has switched to 2.0
     */
    uses2_0(): boolean;
    /**
     * Start the Client
     * @param callback Called on connect or error
     * @param address Address of the Server. Default = "localhost"
     * @param port Port of the Server. Default = 1735
     */
    start(callback?: (connected: boolean, err: Error, is2_0: boolean) => any, address?: string, port?: number): void;
    /**
     * Adds and returns a Listener to be called on change of an Entry
     * @param callback Listener
     */
    addListener(callback: Listener): Listener;
    /**
     * Removes a Listener
     * @param listener the Listener to remove
     */
    removeListener(listener: Listener): void;
    /**
     * Get the unique ID of a key or the IDs of all keys if called empty
     * @param key name of the key
     */
    getKeyID(): {
        [key: string]: number;
    };
    getKeyID(key: string): number;
    /**
     * Gets an Entry
     * @param id ID of an Entry
     */
    getEntry(id: number): Entry;
    /**
     * Get an Array of Keys
     */
    getKeys(): string[];
    /**
     * Get All of the Entries
     */
    getEntries(): {
        [key: number]: Entry;
    };
    private read(buf, off);
    private readonly recProto;
    private afterConnect();
    private readonly toServer;
    /**
     * Add an Entry
     * @param val The Value
     * @param name The Key of the Entry
     * @param persist Whether the Value should persist on the server through a restart
     */
    Assign(val: any, name: string, persist?: boolean | number): Error;
    /**
     * Updates an Entry
     * @param id The ID of the Entry
     * @param val The value of the Entry
     */
    Update(id: number, val: any): Error;
    /**
     * Updates the Flag of an Entry
     * @param id The ID of the Entry
     * @param flags Whether the Entry should persist through a restart on the server
     */
    Flag(id: number, flags?: boolean | number): Error;
    /**
     * Deletes an Entry
     * @param id The ID of the Entry
     */
    Delete(id: number): Error;
    /**
     * Deletes All Entries
     */
    DeleteAll(): Error;
    /**
     * Executes an RPC
     * @param id The ID of the RPC Entry
     * @param val The Values of the Parameters
     * @param callback To be called with the Results
     */
    RPCExec(id: number, val: Object, callback: (result: Object) => any): Error;
    private keys;
    private readonly keepAlive;
    private aliveTimer;
    private bufferTimer;
    private buffersToSend;
    /**
     * Direct Write to the Server
     * @param buf The Buffer to be sent
     * @param immediate whether the write should happen right away
     */
    write(buf: Buffer, immediate?: boolean): void;
}
export interface Entry {
    typeID: number;
    name: string;
    sn: number;
    flags: number;
    val?: any;
}
/**
 * Error thrown when buffer is too short
 */
export declare class LengthError extends Error {
    buf: Buffer;
    position: number;
    constructor(buf: Buffer, possition: number, length: number);
    constructor(mesg: string);
}
