import { Writable } from "stream";
import {
  NTID,
  TypesTranslator,
  LengthError,
  checkBufLen,
  ITypesTo,
  NTTypeID,
  ITypesFrom,
  RPC,
  numFrom128,
  numTo128Arr,
  toBufRes
} from "./NTTypes";
import BufBuilder from "./bufBuilder";

const KEEP_ALIVE_BUF = Buffer.from([0]);
const HELLO_COMPLETE_BUF = Buffer.from([0x05]);
const HELLO_2_0_BUF = Buffer.from([0x01, 2, 0]);

export class Translator extends Writable {
  private __writeFunc: (buf: Buffer) => any;
  private __is2_0: boolean;

  private __NTTypeTranslator = new TypesTranslator();
  private __interpreter: IInterpreter;
  private __valTobuf = this.__NTTypeTranslator.valToBuf;
  private __readerFuncs: IDFuncs;
  private __callbackFunctions: requirements;
  private __continuationBuffer: Buffer;

  toServer: IToServer;

  constructor(req: requirements, useVersion = "3.0") {
    super();
    this.__writeFunc = req.write;
    this.__callbackFunctions = req;
    this.useVersion(useVersion);
  }
  _write(chunk, encoding: string, next: (error?: Error) => any) {
    if (Buffer.isBuffer(chunk)) {
      this.read(chunk);
    } else if (typeof chunk == "string") {
      this.read(Buffer.from(chunk, encoding));
    }
    next();
  }
  read(buf: Buffer) {
    let offset = 0;
    if (this.__continuationBuffer != null) {
      buf = Buffer.concat([this.__continuationBuffer, buf]);
      this.__continuationBuffer = null;
    }
    try {
      while (buf.length > offset) {
        if (typeof this.__readerFuncs[buf[offset]] == "undefined")
          throw new Error(`NTID ${buf[offset].toString(16)} does not exist`);
        offset = this.__readerFuncs[buf[offset]](buf, offset + 1);
      }
    } catch (error) {
      if (error instanceof LengthError) {
        this.__continuationBuffer = buf.slice(offset);
      } else throw error;
    }
  }
  useVersion(ver: string): boolean {
    switch (ver) {
      case "3.0":
        this.__NTTypeTranslator.setStringEnc(false);
        this.__readerFuncs = get3_0Read(this.__callbackFunctions, this.__NTTypeTranslator.bufToVal);
        this.toServer = get3_0Write(this.__writeFunc, this.__NTTypeTranslator.valToBuf);
        return true;
      case "2.0":
        this.__NTTypeTranslator.setStringEnc(true);
        this.__readerFuncs = get2_0Read(this.__callbackFunctions, this.__NTTypeTranslator.bufToVal);
        this.toServer = get2_0Write(this.__writeFunc, this.__NTTypeTranslator.valToBuf);
        return true;
      default:
        return false;
    }
  }
}

let func3_0Read: IFunc3_0Read = {
  Hello(callback: (name: string, flags: number) => any, translator) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 1);

      let flags = buf[offset++],
        name = translator[NTTypeID.String](buf, offset);

      callback(name.val, flags);
      return name.offset;
    };
  },
  Assign(
    callback: (name: string, type: number, entryID: number, seq: number, val: any, flags: number) => any,
    translator,
    setTypeID
  ) {
    return (buf, offset) => {
      let key = translator[NTTypeID.String](buf, offset);
      offset = key.offset;

      checkBufLen(buf, offset, 6);

      let type = buf[offset++],
        id = get2Bytes(buf, offset),
        seq = get2Bytes(buf, offset + 2),
        flags = buf[offset + 4],
        val = translator[type](buf, offset + 5);

      offset = val.offset;
      if (isRPC(val.val, type)) {
        setTypeID(id, val.val.results.map(a => a.typeId));
      }

      callback(key.val, type, id, seq, val.val, flags);
      return offset;
    };
  },
  Update(callback: (entryID: number, seq: number, val: number, type: number) => any) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 4);

      let id = get2Bytes(buf, offset),
        seq = get2Bytes(buf, offset + 2),
        type = buf[offset + 4],
        val = Translator[type](buf, offset + 5);

      offset = val.offset;

      callback(id, seq, val.val, type);
      return offset;
    };
  },
  FlagsUpdate(callback: (entryID: number, flags: number) => any) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 3);

      let id = get2Bytes(buf, offset),
        flags = buf[offset + 2];

      offset += 3;

      callback(id, flags);
      return offset;
    };
  },
  Delete(callback: (entryID: number) => any) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 2);

      let id = get2Bytes(buf, offset);

      offset + 2;

      callback(id);
      return offset;
    };
  },
  DeleteAll(callback: (secret: number) => any) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 4);

      let val = 0;
      for (let i = 0; i < 4; i++) {
        val = (val << 8) + buf[offset + i];
      }

      callback(val);
      return offset + 4;
    };
  },
  RPCResponse(callback: (id: number, execID: number, result: any[]) => any, translator, getTypeID) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 4);

      let entryID = get2Bytes(buf, offset),
        execID = get2Bytes(buf, offset + 2),
        resultByteLength = numFrom128(buf, offset + 4),
        resulTypes = getTypeID(entryID);

      offset = resultByteLength.offset;
      checkBufLen(buf, offset, resultByteLength.val);
      if (!Array.isArray(resulTypes)) {
        return offset + resultByteLength.val;
      }

      let results = new Array(resulTypes.length),
        res: { val: any; offset: number };

      offset = resultByteLength.offset;
      for (let i = 0; i < resulTypes.length; i++) {
        res = translator[resulTypes[i]](buf, offset);
        results[i] = res.val;
        offset = res.offset;
      }

      callback(entryID, execID, results);
      return offset;
    };
  }
};

let func2_0Read: IFunc2_0Read = {
  KeepAlive(callback: () => any) {
    return (buf, offset) => {
      callback();
      return offset;
    };
  },
  VersionUnsupported(callback: (major: number, minor: number) => any) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 2);

      let maj = buf[offset++],
        min = buf[offset++];

      callback(maj, min);
      return offset;
    };
  },
  HelloComplete(callback: () => any) {
    return (buf, offset) => {
      callback();
      return offset;
    };
  },
  Hello(callback: (name: string) => any, translator) {
    return (buf, offset) => {
      let name = translator[NTTypeID.String](buf, offset);

      callback(name.val);
      return name.offset;
    };
  },
  Assign(callback: (name: string, type: number, entryID: number, seq: number, val: any) => any, translator, setTypeID) {
    return (buf, offset) => {
      let key = translator[NTTypeID.String](buf, offset);
      offset = key.offset;

      checkBufLen(buf, offset, 5);

      let type = buf[offset++],
        id = get2Bytes(buf, offset),
        seq = get2Bytes(buf, offset + 2),
        val = translator[type](buf, offset + 4);

      offset = val.offset;
      setTypeID(id, type);

      callback(key.val, type, id, seq, val.val);
      return offset;
    };
  },
  Update(callback: (entryID: number, seq: number, val: any, type: number) => any, translator, getTypeID) {
    return (buf, offset) => {
      checkBufLen(buf, offset, 4);

      let id = get2Bytes(buf, offset),
        seq = get2Bytes(buf, offset + 2),
        type = getTypeID(id) as number,
        val = translator[type](buf, offset + 4);

      offset = val.offset;

      callback(id, seq, val.val, type);
      return offset;
    };
  }
};
let func3_0Write: IFunc3_0Write = {
  Hello(write, encode) {
    return name => {
      new BufBuilder(NTID.ClientHello)
        .addBytes([3, 0]) // Version being asked for
        .add(encode[NTTypeID.String](name)) // Encoded name
        .write(write);
    };
  },
  Assign(write, encode) {
    return (name, type,val, flags) => {
      if(type == NTTypeID.RPC)throw new Error('Client can not assign an RPC')
      if (typeof encode[type] == "undefined") throw new Error(`Type ${type.toString(16)} does not exist`);

      new BufBuilder(NTID.EntryAssignment)
        .add(encode[NTTypeID.String](name)) // Encoded Entry Key
        .addNumber(0xffff, 2) // Entry ID
        .addNumber(0, 2) // Entry Sequence Number
        .addNumber(flags) // Entry Flags
        .add(encode[type](val)) // Encoded Entry Value
        .write(write);
    };
  },
  Update(write, encode) {
    return (entryID, seq, val, type) => {
      if(type == NTTypeID.RPC) throw new Error('Client can not update an RPC')
      if (typeof encode[type] == "undefined") throw new Error(`Type ${type.toString(16)} does not exist`);

      new BufBuilder(NTID.EntryUpdate)
        .addNumber(entryID, 2) // Entry ID
        .addNumber(seq, 2) // Entry Sequence Number
        .addNumber(type) // Entry Value Type ID
        .add(encode[type](val)) // Encoded Entry Value
        .write(write);
    };
  },
  FlagsUpdate(write) {
    return (entryID, flags) => {
      new BufBuilder(NTID.EntryFlagsUpdate)
        .addNumber(entryID, 2) // Entry ID
        .addNumber(flags) // Entry flags
        .write(write);
    };
  },
  Delete(write) {
    return entryID => {
      new BufBuilder(NTID.EntryDelete)
        .addNumber(entryID, 2) // Entry ID
        .write(write);
    };
  },
  DeleteAll(write) {
    return secret => {
      new BufBuilder(NTID.ClearAllEntries)
        .addNumber(secret, 4) // Secret Key to complete Deletion
        .write(write);
    };
  },
  RPCExecute(write, encode) {
    return (entryID, executeID, parameters) => {
      let totalParByteLength = 0;
      let encParameters: toBufRes[] = new Array(parameters.length);
      for (let i = 0; i < parameters.length; i++) {
        if (typeof encode[parameters[i].type] == "undefined") throw new Error(`Type ${parameters[i].type} is Unknown`);
        let enc = encode[parameters[i].type](parameters[i].val);
        totalParByteLength += enc.length;
        encParameters.push(enc);
      }

      let buf = new BufBuilder(NTID.ExecuteRPC)
        .addNumber(entryID, 2)
        .addNumber(executeID, 2)
        .addBytes(numTo128Arr(totalParByteLength));

      for (let i = 0; i < encParameters.length; i++) {
        buf.add(encParameters[i]);
      }

      buf.write(write);
    };
  }
};
let func2_0Write: IFunc2_0Write = {
  //TODO: Add Debug
  KeepAlive(write) {
    return () => {
      write(KEEP_ALIVE_BUF);
    };
  },
  HelloComplete(write) {
    return () => {
      write(HELLO_COMPLETE_BUF);
    };
  },
  Hello(write) {
    return () => {
      write(HELLO_2_0_BUF);
    };
  },
  Assign(write, encode) {
    return (name, type, val) => {
      if (typeof allowed2_0Types[type] == "undefined") throw new Error("Unknown Type");

      new BufBuilder(NTID.EntryAssignment)
        .add(encode[NTTypeID.String](name)) // Encoded Entry Key
        .addNumber(0xffff, 2) // Entry ID
        .addNumber(0, 2) // Entry Sequence Number
        .add(encode[type](val)) // Encoded Entry Value
        .write(write);
    };
  },
  Update(write, encode) {
    return (entryID, seq, val, type) => {
      if (typeof allowed2_0Types[type] == "undefined") throw new Error("Unknown Type");

      new BufBuilder(NTID.EntryUpdate)
        .addNumber(entryID, 2) // Entry ID
        .addNumber(seq, 2) // Entry Sequence Number
        .add(encode[type](val)) // Encoded Entry Value
        .write(write);
    };
  }
};

export function getTypeID(val: any) {
  if (Array.isArray(val)) {
    if (val.every(a => typeof a == "number")) return NTTypeID.Number;
    else if (val.every(a => typeof a == "string")) return NTTypeID.String;
    else if (val.every(a => typeof a == "boolean")) return NTTypeID.Boolean;
  } else {
    if (typeof val == "number") return NTTypeID.Number;
    else if (typeof val == "string") return NTTypeID.String;
    else if (typeof val == "boolean") return NTTypeID.Boolean;
    else if (Buffer.isBuffer(val)) return NTTypeID.Buffer;
    else if (testRPC(val)) return NTTypeID.RPC;
  }
}
function testRPC(val: any): val is RPC {
  return (
    typeof val == "object" &&
    typeof val.name == "string" &&
    Array.isArray(val.par) &&
    Array.isArray(val.results) &&
    typeof val.par[0] == "object"
  );
}
let allowed2_0Types = {
  [NTTypeID.Boolean]: null,
  [NTTypeID.Number]: null,
  [NTTypeID.String]: null,

  [NTTypeID.BooleanArray]: null,
  [NTTypeID.NumberArray]: null,
  [NTTypeID.StringArray]: null
};

function get3_0Read(req: requirements, typeTranslator: ITypesFrom): IDFuncs {
  let ids = {};
  function getSetTypeID(id: number, val?: number | number[]) {
    if (typeof val == "undefined") {
      return ids[id];
    } else {
      ids[id] = val;
    }
  }
  return {
    [NTID.KeepAlive]: func2_0Read.KeepAlive(req.KeepAlive),
    [NTID.ProtocolVersionUnsupported]: func2_0Read.VersionUnsupported(req.VersionUnsupported),
    [NTID.ServerHelloComplete]: func2_0Read.HelloComplete(req.HelloComplete),
    [NTID.ServerHello]: func3_0Read.Hello(req.Hello, typeTranslator),
    [NTID.EntryAssignment]: func3_0Read.Assign(req.Assign, typeTranslator, getSetTypeID),
    [NTID.EntryUpdate]: func3_0Read.Update(req.Update, typeTranslator, getSetTypeID),
    [NTID.EntryFlagsUpdate]: func3_0Read.FlagsUpdate(req.FlagsUpdate),
    [NTID.EntryDelete]: func3_0Read.Delete(req.Delete),
    [NTID.ClearAllEntries]: func3_0Read.DeleteAll(req.DeleteAll),
    [NTID.RPCResponse]: func3_0Read.RPCResponse(req.RPCResponse, Translator, getSetTypeID)
  };
}

function get2_0Read(req: requirements, typeTranslator: ITypesFrom): IDFuncs {
  let ids = {};
  function getSetTypeID(id: number, val?: number | number[]) {
    if (typeof val == "undefined") {
      return ids[id];
    } else {
      ids[id] = val;
    }
  }
  return {
    [NTID.KeepAlive]: func2_0Read.KeepAlive(req.KeepAlive),
    [NTID.ProtocolVersionUnsupported]: func2_0Read.VersionUnsupported(req.VersionUnsupported),
    [NTID.ServerHelloComplete]: func2_0Read.HelloComplete(req.HelloComplete),
    [NTID.ServerHello]: func2_0Read.Hello(req.Hello, typeTranslator),
    [NTID.EntryAssignment]: func2_0Read.Assign(req.Assign, typeTranslator, getSetTypeID),
    [NTID.EntryUpdate]: func2_0Read.Update(req.Update, typeTranslator, getSetTypeID)
  };
}

function UnsupportedMethod(name: string) {
  return () => {
    return new Error(`Method ${name} is not supported`);
  };
}

function get3_0Write(writeFunc: WriteBuf, encoder: ITypesTo): IToServer {
  return {
    KeepAlive: func2_0Write.KeepAlive(writeFunc),
    HelloComplete: func2_0Write.Hello(writeFunc),
    Hello: func3_0Write.Hello(writeFunc, encoder),
    Assign: func3_0Write.Assign(writeFunc, encoder),
    Update: func3_0Write.Update(writeFunc, encoder),
    FlagsUpdate: func3_0Write.FlagsUpdate(writeFunc),
    Delete: func3_0Write.Delete(writeFunc),
    DeleteAll: func3_0Write.Delete(writeFunc),
    RPCExec: func3_0Write.RPCExecute(writeFunc, encoder)
  };
}
function get2_0Write(writeFunc: WriteBuf, encoder: ITypesTo): IToServer {
  return {
    KeepAlive: func2_0Write.KeepAlive(writeFunc),
    HelloComplete: func2_0Write.Hello(writeFunc),
    Hello: func2_0Write.Hello(writeFunc),
    Assign: func2_0Write.Assign(writeFunc, encoder),
    Update: func2_0Write.Update(writeFunc, encoder),
    FlagsUpdate: UnsupportedMethod("FlagUpdate"),
    Delete: UnsupportedMethod("Delete"),
    DeleteAll: UnsupportedMethod("DeleteAll"),
    RPCExec: UnsupportedMethod("RPCExec")
  };
}

function get2Bytes(buf: Buffer, offset: number) {
  return (buf[offset] << 8) + buf[offset + 1];
}

function isRPC(val: any, type: number): val is RPC {
  if (type == NTTypeID.RPC) return true;
  else return false;
}

// Types and Interfaces
type IInterpreter = { [id: number]: (buf: Buffer, offset: number) => number };

export interface IToServer extends NetworkTablesServerAndClient {
  Assign(name: string, type: number, val: any, flags?: number);
  RPCExec(entryID: number, returnID: number, parameters: any[]);
}

export interface NetworkTablesServerAndClient {
  KeepAlive();
  HelloComplete();
  Hello(name: string, flags?: number);
  Update(entryID: number, seq: number, val: any, type: number);
  FlagsUpdate(entryID: number, flags: number);
  Delete(entryID: number);
  DeleteAll(secret: number);
}

export interface IFromServer extends NetworkTablesServerAndClient {
  VersionUnsupported(major: number, minor: number);
  RPCResponse(id: number, execID: number, result: any[]);
}

export interface requirements extends IFromServer {
  Assign(name: string, type: number, entryID: number, seq: number, val: any, flags?: number);
  write(buf: Buffer);
}

interface IGetSetTypeID {
  (id: number, type: number | number[]): void;
  (id: number): number | number[];
}

type functionBufferReturner = {
  [name: string]: (
    callback: Function,
    translator?: ITypesFrom,
    getSetTypeID?: IGetSetTypeID
  ) => (buf: Buffer, offset: number) => number;
};
type BufferReturner = {
  [name: string]: (write: (buf: Buffer) => any) => (func: Function) => any;
};

interface IFunc3_0Read {
  Hello(
    callback: (name: string, flags: number) => any,
    translator: ITypesFrom
  ): (buf: Buffer, offset: number) => number;
  Assign(
    callback: (name: string, type: number, entryID: number, seq: number, val: any, flags: number) => any,
    translator: ITypesFrom,
    setTypeID: IGetSetTypeID
  ): (buf: Buffer, offset: number) => number;
  Update(
    callback: (entryID: number, seq: number, val: any, type: number) => any,
    translator: ITypesFrom,
    getTypeID: IGetSetTypeID
  ): (buf: Buffer, offset: number) => number;
  FlagsUpdate(callback: (entryID: number, flags: number) => any): (buf: Buffer, offset: number) => number;
  Delete(callback: (entryID: number) => any): (buf: Buffer, offset: number) => number;
  DeleteAll(callback: (secret: number) => any): (buf: Buffer, offset: number) => number;
  RPCResponse(
    callback: (id: number, execID: number, result: any[]) => any,
    translator,
    getTypeID
  ): (buf: Buffer, offset: number) => number;
}
interface IFunc2_0Read {
  KeepAlive(callback: () => any): (buf: Buffer, offset: number) => number;
  VersionUnsupported(callback: (major: number, minor: number) => any): (buf: Buffer, offset: number) => number;
  HelloComplete(callback: () => any): (buf: Buffer, offset: number) => number;
  Hello(callback: (name: string) => any, translator: ITypesFrom): (buf: Buffer, offset: number) => number;
  Assign(
    callback: (name: string, type: number, entryID: number, seq: number, val: any) => any,
    translator: ITypesFrom,
    setTypeID: IGetSetTypeID
  ): (buf: Buffer, offset: number) => number;
  Update(
    callback: (entryID: number, seq: number, val: any, type: number) => any,
    translator: ITypesFrom,
    getTypeID: IGetSetTypeID
  ): (buf: Buffer, offset: number) => number;
}

type IDFuncs = { [key: number]: (buf: Buffer, offset: number) => number };

interface IFunc3_0Write {
  Hello(write: WriteBuf, encoder: ITypesTo): (name: string) => any;
  Assign(
    write: WriteBuf,
    encoder: ITypesTo
  ): (name: string, type: number, val: any, flags: number) => any;
  Update(write: WriteBuf, encoder: ITypesTo): (entryID: number, seq: number, val: any, type: number) => any;
  FlagsUpdate(write: WriteBuf): (entryID: number, flags: number) => any;
  Delete(write: WriteBuf): (entryID: number) => any;
  DeleteAll(write: WriteBuf): (secret: number) => any;
  RPCExecute(
    write: WriteBuf,
    encoder: ITypesTo
  ): (entryID: number, executeID: number, parameters: { val: any; type: number }[]) => any;
}
interface IFunc2_0Write {
  KeepAlive(write: WriteBuf): () => any;
  HelloComplete(write: WriteBuf): () => any;
  Hello(write: WriteBuf): () => any;
  Assign(
    write: WriteBuf,
    encoder: ITypesTo
  ): (name: string, type: number, val: any) => any;
  Update(write: WriteBuf, encoder: ITypesTo): (entryID: number, seq: number, val: any, type: number) => any;
}
type WriteBuf = (buf: Buffer) => any;
