import * as net from "net";
import { Translator, getTypeID } from "./translator";
import * as url from "url";
import { NTTypeID, RPC } from "./NTTypes";

const DELETE_ALL_SECRET = 0xd06cb27a;
const KEEP_ALLIVE = Buffer.from([0]);

export class Client {
  clientName = "NodeJS" + Date.now();
  private __serverName: string;
  private __client: net.Socket;
  private __translator: Translator;
  private __entries: { [id: number]: TEntry } = {};
  private __oldEntries: { [id: number]: TEntry };
  private __keymap: { [key: string]: number } = {};
  private __oldKeymap: { [key: string]: number };
  private __toAddEntries: { [id: number]: TEntry } = {};
  private __toAddKeymap: { [key: string]: number } = {};
  private __listeners: ListenerArray = [];
  private __is2_0 = false;
  private __reconnect = false;
  private __socketConnected = false;
  private __connected = false;
  private __RPCExecIDs: { [id: number]: (results: Object) => any } = {};
  private __bufferedbuffers: Buffer[] = [];
  private __delayedWrite: NodeJS.Timer;
  private __beingAssigned: { [name: string]: any };
  private __KeepAliveTimer: NodeJS.Timer;
  private __setReconnectTimeout: (address: string, port: number) => NodeJS.Timer;
  private __reconnectTimer: NodeJS.Timer;

  private __write(buf: Buffer) {
    if (!this.__socketConnected) return;
    this.__bufferedbuffers.push(buf);
    let writeFunc = () => {
      this.__client.write(Buffer.concat(this.__bufferedbuffers));
      this.__delayedWrite = null;
    };
    if (this.__delayedWrite == null) {
      this.__delayedWrite = setTimeout(writeFunc, 10);
    }

    clearTimeout(this.__KeepAliveTimer);
    this.__KeepAliveTimer = setTimeout(() => {
      this.__write(KEEP_ALLIVE);
    }, 1000);
  }

  setReconnectDelay(delay: number) {
    clearTimeout(this.__reconnectTimer);
    if (delay > 10) {
      this.__setReconnectTimeout = (address, port) =>
        (this.__reconnectTimer = setTimeout(() => this.__connect(address, port), delay));
    } else {
      this.__setReconnectTimeout = undefined;
    }
  }

  constructor(options?: createOptions) {
    this.__translator = new Translator({
      write: this.__write,
      KeepAlive: () => {},
      VersionUnsupported: (major, minor) => {
        this.__reconnect = this.__is2_0 = this.__translator.useVersion(`${major},${minor}`) && major == 2 && minor == 0;
        if (!this.__is2_0)
          this.callListener(listenerTypes.error, new Error(`Version ${major}.${minor} is not supported`));
      },
      Hello: (name, flags) => {
        this.__serverName = name;
        if (flags & 1) {
          this.__entries = this.__oldEntries;
          this.__keymap = this.__oldKeymap;
        }
      },
      HelloComplete: () => {
        for (let entryID in this.__toAddEntries) {
          let entry = this.__toAddEntries[entryID];
          if (typeof this.__entries[entryID] == "undefined") {
            this.__translator.toServer.Assign(entry.name, entry.typeID, entry.val, entry.flags);
            delete this.__toAddEntries[entryID];
          } else if (!compareEntry(entry, this.__entries[entryID])) {
            delete this.__toAddEntries[entryID];
          }
        }
        this.__connected = true;
        this.__translator.toServer.HelloComplete();
        for (let entryID in this.__toAddEntries) {
          let entry = this.__toAddEntries[entryID];
          this.Update(entry.name, entry.val);
        }
        this.__toAddEntries = {};
        this.__toAddKeymap = {};
        this.callListener(listenerTypes.connect, true);
      },
      Assign: (name, type, entryID, seq, val, flags) => {
        this.__entries[entryID] = {
          name,
          typeID: type,
          seq,
          val,
          flags
        };
        this.callListener(listenerTypes.add, entryID);
      },
      Update: (entryID, seq, val, type) => {
        if (typeof this.__entries[entryID] != "undefined") {
          let entry = this.__entries[entryID];
          entry.seq = seq;
          entry.val = val;
          entry.typeID = type;
          this.callListener(listenerTypes.update, entryID);
        }
      },
      FlagsUpdate: (entryID, flags) => {
        if (typeof this.__entries[entryID] != "undefined") {
          this.__entries[entryID].flags = flags;
          this.callListener(listenerTypes.flagUpdate, entryID);
        }
      },
      Delete: entryID => {
        delete this.__entries[entryID];
        this.callListener(listenerTypes.delete, entryID);
      },
      DeleteAll: secret => {
        if (secret == DELETE_ALL_SECRET) {
          this.__entries = {};
          this.callListener(listenerTypes.deleteAll);
        }
      },
      RPCResponse: (entryID, execID, result) => {
        let entry = this.__entries[entryID];
        if (typeof this.__RPCExecIDs[execID] != "undefined" && entry.typeID == NTTypeID.RPC) {
          let res = {};
          let resDef = entry.val.results;
          for (let i = 0; i < resDef.length; i++) {
            res[resDef[i].name] = result[i];
          }
          this.__RPCExecIDs[execID](res);
        }
      }
    });
  }
  start(callback, address = "127.0.0.1", port = 1735) {
    let parsedAddress = url.parse((/:\/\/\w/.test(address) ? "" : "tcp://") + address);
    address = parsedAddress.hostname;
    port = parseInt(parsedAddress.port) || port;
    this.__connect(address, port);
  }
  private __connect(address: string, port: number) {
    this.__client = net.connect(port, address, () => {
      this.__bufferedbuffers = [];
      this.__socketConnected = true;
      this.__translator.toServer.Hello(this.clientName);
    });
    this.__client.pipe(this.__translator);
    this.__client
      .on("close", hadError => {
        if (this.__connected) this.callListener(listenerTypes.connect, false);
        this.__connected = false;
        this.__oldEntries = this.__entries;
        this.__oldKeymap = this.__keymap;
        this.__entries = {};
        this.__keymap = {};
        if (this.__setReconnectTimeout != null) {
          this.__setReconnectTimeout(address, port);
        }
        if (this.__reconnect) {
          this.__connect(address, port);
        }
      })
      .on("error", error => {
        let mesgPar = error.message.split(" ");
        if (mesgPar.length < 2 || mesgPar[1] != "ECONNREFUSED" || this.__setReconnectTimeout == null)
          this.callListener(listenerTypes.error, error);
      })
      .on("end", () => {
        this.__socketConnected = false;
      });
  }
  private __keyToID(key: string) {
    if (typeof this.__keymap[key] != "undefined") {
      return this.__keymap[key];
    } else if (typeof this.__toAddKeymap[key] != "undefined") {
      return -this.__toAddKeymap[key] - 1;
    } else throw new Error(`Key "${key}" does not exist`);
  }
  private callListener(type: listenerTypes.error, details: Error);
  private callListener(type: listenerTypes.connect, details: boolean);
  private callListener(type: listenerTypes.reconnect);
  private callListener(type: listenerTypes.add | listenerTypes.update, details: number);
  private callListener(type: listenerTypes.flagUpdate, details: number);
  private callListener(type: listenerTypes.delete, details: number);
  private callListener(type: listenerTypes.deleteAll);
  private callListener(type: listenerTypes, details?) {
    if (typeof this.__listeners[listenerTypes.entry] != "undefined") {
      let entryType: string;
      if (type == listenerTypes.add) entryType = "add";
      else if (type == listenerTypes.delete) entryType = "delete";
      else if (type == listenerTypes.update) entryType = "update";
      else if (type == listenerTypes.flagUpdate) entryType = "flagChange";
      if (typeof entryType != "undefined") {
        let entryArr = this.__listeners[listenerTypes.entry];
        let entry = this.__entries[details];
        entryArr.map(a => a(entry.name, entry.val, entry.typeID, details, entry.flags));
      }
    }
    if (typeof this.__listeners[type] == "undefined") return;
    let entry = typeof details == "number" ? this.__entries[details] : undefined;
    switch (type) {
      case listenerTypes.error:
        this.__listeners[type].map(a => a(details));
        break;
      case listenerTypes.connect:
        this.__listeners[type].map(a => a(details));
        break;
      case listenerTypes.reconnect:
        this.__listeners[type].map(a => a());
        break;
      case listenerTypes.add:
        this.__listeners[type].map(a => a(entry.name, entry.val, entry.typeID, details, entry.flags));
        break;
      case listenerTypes.update:
        this.__listeners[type].map(a => a(entry.name, entry.val, entry.typeID, details, entry.flags));
        break;
      case listenerTypes.flagUpdate:
        this.__listeners[type].map(a => a(details, entry.flags));
        break;
      case listenerTypes.delete:
        this.__listeners[type].map(a => a(details));
        break;
      case listenerTypes.deleteAll:
        this.__listeners[type].map(a => a());
    }
  }

  addListener(name: "error", Listener: Listeners.Error);
  addListener(name: "connect", Listener: Listeners.Connect);
  addListener(name: "reconnect", Listener: Function);
  addListener(name: "entry", Listener: Listeners.Entry);
  addListener(name: "add", Listener: Listeners.EntryChange);
  addListener(name: "update", Listener: Listeners.EntryChange);
  addListener(name: "flagUpdate", Listener: Listeners.Flag);
  addListener(name: "delete", Listener: Listeners.Delete);
  addListener(name: "deleteAll", Listener: Function);
  addListener(Listener: Listeners.Entry);
  addListener(name: string | Listeners.Entry, Listener?: Function) {
    if (typeof name == "function") {
      if (typeof this.__listeners[listenerTypes.entry] == "undefined") {
        this.__listeners[listenerTypes.entry] = [name];
      }
      this.__listeners[listenerTypes.entry].push(name);
      return;
    }
    if (typeof listenerTypes[name] == "undefined") {
      throw new Error(`Listener "${name}" does not exist`);
    } else {
      if (typeof this.__listeners[listenerTypes[name]] == "undefined") {
        this.__listeners[listenerTypes[name]] = [Listener];
      } else {
        this.__listeners[listenerTypes[name]].push(Listener);
      }
    }
  }
  removeListener(Listener: Listeners.Entry);
  removeListener(name: string | Listeners.Entry, Listener?: Function) {
    if (typeof name == "function") {
      Listener = name;
      name = "entry";
    }
    if (typeof listenerTypes[name] == "undefined") return false;
    let lisArr = this.__listeners[listenerTypes[name]];
    if (typeof lisArr == "undefined") return false;
    for (let i = 0; i < lisArr.length; i++) {
      if (lisArr[i] == Listener) {
        lisArr.splice(i, 1);
        return true;
      }
    }
    return false;
  }
  /**
   * Add an Entry
   * @param val The Value
   * @param name The Key of the Entry
   * @param flags The Flags of the entry or its persist value
   */
  Assign(val: any, name: string, flags: number | boolean = 0) {
    if (typeof flags == "boolean") flags = +flags;
    if (!this.__connected) {
      if (typeof this.__toAddKeymap[name] != "undefined") return this.Update(name, val);
      let randID = 0;
      do {
        randID = Math.floor(Math.random() * 0xffff);
      } while (typeof this.__entries[randID] != "undefined" || typeof this.__toAddEntries[randID] != "undefined");

      this.__toAddEntries[randID] = { name, seq: 0, flags, val, typeID: getTypeID(val) } as TEntry;
      this.__toAddKeymap[name] = randID;
      this.callListener(listenerTypes.add, -randID - 1);
      return;
    }
    if (typeof this.__keymap[name] != "undefined") return this.Update(name, val);
    if (typeof this.__beingAssigned[name] != "undefined") return this.Update(name, val);
    this.__beingAssigned[name] = null;
    this.__translator.toServer.Assign(name, getTypeID(name), val, flags);
  }
  /**
   * Update an Entry
   * @param name The Key or the ID of an Entry
   * @param val The new Value
   */
  Update(name: number | string, val: any) {
    let id = 0;
    if (typeof name == "string") {
      if (typeof this.__beingAssigned[name] != "undefined") {
        this.__beingAssigned[name] = val;
        return;
      }
      try {
        id = this.__keyToID(name);
      } catch (e) {
        return this.Assign(val, name);
      }
    } else id = name;
    if (id < 0) {
      if (typeof this.__toAddEntries[-id - 1] == "undefined") {
        throw new Error(`${name} has not been assigned`);
      }
      this.__toAddEntries[-id - 1].val = fixType(val, this.__toAddEntries[-id - 1].typeID);
      return;
    } else if (typeof this.__entries[id] == "undefined") throw new Error(`${name} has not meen assigned`);
    let entry = this.__entries[id];
    entry.seq++;
    if (id >= 0) this.__translator.toServer.Update(id, entry.seq, fixType(val, entry.typeID), entry.typeID);
  }
  /**
   * Update the flags of an entry
   * @param id The Key on The ID of an Entry
   * @param flags The new Flags or the persist value
   */
  Flag(id: number | string, flags: boolean | number) {
    if (typeof id == "string") id = this.__keyToID(id);
    if (typeof flags == "boolean") flags = +flags;
    if (typeof this.__entries[id] == "undefined") throw new Error(`Entry ${id} does not Exist`);
    this.__translator.toServer.FlagsUpdate(id, flags);
    this.__entries[id].flags = flags;
  }
  /**
   * Delete an Entry
   * @param id The Key or the ID of an Entry
   */
  Delete(id: number | string) {
    if (typeof id == "string") id = this.__keyToID(id);
    if (typeof this.__entries[id] == "undefined") throw new Error(`Entry ${id} does not Exist`);
    this.__translator.toServer.Delete(id);
    delete this.__entries[id];
  }
  /**
   * Delete All Entries
   */
  DeleteAll() {
    this.__translator.toServer.DeleteAll(DELETE_ALL_SECRET);
    this.__entries = {};
    this.__keymap = {};
  }
  RPCExec(id: number | string, val: Object, callback: (results: Object) => any) {
    if (!this.__connected) throw new Error("Client is not connected");
    if (typeof id == "string") id = this.__keyToID(id);
    if (typeof this.__entries[id] == "undefined") {
      throw new Error(`Entry ${id} does not exist`);
    }
    let entry = this.__entries[id];
    if (entry.typeID != NTTypeID.RPC) throw new Error(`Entry ${id} is not an RPC`);
    let parDeffinition = entry.val.par;
    let parArr = new Array(parDeffinition.length);
    for (let i = 0; i < parDeffinition.length; i++) {
      parArr[i] = fixType(val[parDeffinition[i].name], parDeffinition[i].typeId);
    }
    let randID = Math.floor(Math.random() * 0xffff);
    this.__translator.toServer.RPCExec(id, randID, parArr);
    this.__RPCExecIDs[randID] = callback;
  }
}
function compareEntry(entry1: TEntry, entry2: TEntry) {
  return entry1.typeID == entry2.typeID && entry1.name == entry2.name;
}
function fixType(val: any, expectedType: NTTypeID, strict = false) {
  if (val == null) throw new Error("Unusebale type");
  let isType = getTypeID(val);
  if (typeof isType == "undefined") throw new Error("unknown type");
  if (isType == expectedType) return val;
  if (strict) throw new Error("Incorrect Type");

  if (expectedType == NTTypeID.Boolean) {
    if (isType == NTTypeID.String && (val == "true" || val == "false")) return val == "true";
    if (isType == NTTypeID.Number) return val > 0;
  } else if (expectedType == NTTypeID.Number) {
    if (isType == NTTypeID.String) {
      let tryNumber = parseFloat(val);
      if (!Number.isNaN(tryNumber)) return tryNumber;
    } else if (isType == NTTypeID.Boolean) return +val;
  } else if (expectedType == NTTypeID.String) {
    if (typeof val == "number" || typeof val == "boolean" || Buffer.isBuffer(val)) return val.toString();
  } else if ((expectedType & 0x10) == 0x10) {
    if ((isType & 0x10) == 0x10) return (<any[]>val).map(a => fixType(a, expectedType & 0x0f));
    else if (expectedType == isType + 0x10) return [val];
    else if (isType > 0x10) return [fixType(val, expectedType & 0x0f)];
  }
  throw new Error("Incorrect and Unfixable type");
}
const TypeNames = {
  0: "Boolean",
  0x01: "number",
  0x02: "String",
  0x03: "Buffer",
  0x10: "BooleanArray",
  0x11: "NumberArray",
  0x12: "StringArray",
  0x20: "RPC"
};
interface ListenerArray extends Array<Function[]> {
  0?: Listeners.Connect[];
  1?: Function[];
  2?: Listeners.Entry[];
  3?: Listeners.EntryChange[];
  4?: Listeners.EntryChange[];
  5?: Listeners.Flag[];
  6?: Listeners.Delete[];
  7?: Function[];
  8?: Listeners.Error[];
}

interface IEntry<G = number, T = any> {
  typeID: G;
  name: string;
  seq: number;
  flags: number;
  val: T;
}

type TEntry =
  | IEntry<NTTypeID.Boolean, boolean>
  | IEntry<NTTypeID.BooleanArray, boolean[]>
  | IEntry<NTTypeID.Buffer, Buffer>
  | IEntry<NTTypeID.Number, number>
  | IEntry<NTTypeID.NumberArray, number[]>
  | IEntry<NTTypeID.RPC, RPC>
  | IEntry<NTTypeID.String, string>
  | IEntry<NTTypeID.StringArray, string[]>;

interface IEntryDetails extends IEntry {
  entryID: number;
}
interface IEntryFlagUpdateDetails {
  entryID: number;
  flags: number;
}
interface IAddDetails extends IEntry {
  type: "add";
}
export interface createOptions {
  // TODO: Implement these options
  /** Convert typeIDs to String */
  stringValueType?: boolean;
  /** Do jump between Assign and Update*/
  strictAssignUpdate?: boolean;
  /** Do not Fix Value Types */
  strictType?: boolean;
  /** Override the name of the client */
  clientName?: string;
  /** Keep Entries upon disconnect */
  persistantEntries?: boolean;
}
enum listenerTypes {
  connect,
  reconnect,
  entry,
  add,
  update,
  flagUpdate,
  delete,
  deleteAll,
  error
}
export namespace Listeners {
  export type Connect = (connected: boolean) => any;
  export type Entry = (key: string, value: any, valueType: number, id: number, flags: number) => any;
  export type EntryChange = (key: string, value: any, type: number, id: number, flags: number) => any;
  export type Flag = (id: number, flag: number) => any;
  export type Delete = (id: number) => any;
  export type Error = (error: Error) => any;
}
