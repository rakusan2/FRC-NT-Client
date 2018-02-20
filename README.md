# WPILIB Network Tables Client
This client uses version [3.0](https://github.com/wpilibsuite/ntcore/blob/master/doc/networktables3.adoc)
 of the **Network Tables Protocol**. With a failover to [2.0](https://github.com/wpilibsuite/ntcore/blob/master/doc/networktables2.adoc)

## Installation
```
npm install wpilib-nt-client
```

## Usage

```js
// Decleration
const ntClient = require('wpilib-nt-client');

const client = new ntClient.Client()

// Connects the client to the server on team 3571's roborio
client.start((isConnected, err) => {
    // Displays the error and the state of connection
    console.log({ isConnected, err });
}, 'roborio-3571.local');

// Adds a listener to the client
client.addListener((key, val, type, id) => {
    console.log({ key, val, type, id });
})
```
## Constructor
- `Client()`
    - Standard Constructor
- `Client(options)`
    - **options** an object containing is **strictInput** with a boolean value
        - **strictInput** Does not try to correct incorrect types

## Properties
- `.start((connected, err, is2_0) => any, address, port)`
    - Connects the client to a specific address and port
    - **connected** - True if the client has successfully completed its handshake
    - **err** - Contains the error if one has occurred
    - **is2_0** - True if the client had to failover to 2.0 of the Network Tables protocol
    - **address** - The address of the Server. Defaults to loopback
    - **port** - The port of the server
- `.stop()`
    - Tries to stop the client by sending a fin packet
- `.destroy()`
    - Closes the connection forcefully
- `.setReconnectDelay(delay)`
    - **delay** set the delay before trying to reconnect
    - If the dellay is less than 20 than it wll not attempt reconnect
- `.addListener((key, value, valueType, type, id, flags) => any, getCurrent)`
    - Adds a callback to be called when a value has been added, updated, or deleted, and returns the Listener
    - **key** - The Key for the Entry
    - **value** - The value associated with the key
    - **valueType** - The type of the value Possible Types are listed Bellow
    - **type** - The type of the callback. Possible Types are: "add", "update", "delete", "flagChange"
    - **id** - The ID of the Entry
    - **flags** - The flags of the Entry
    - **getCurrent** - immediatly callback if connected with known entries
- `.removeListener(listener)`
    - Removes the specified listener
    - **listener** - The Listener returned from `.addListener()`
- `.isConnected()`
    - Returns true if the client is connected and has completed its handshake
- `.uses2_0()`
    - Returns true if the client has switched to using version 2.0 of the NetworkTables protocol
- `.getKeyID(key)`
    - Returns the ID of a key or All of the keys if **key** is left out
- `.getEntry(id)`
    - Returns an Entry identified with an ID
- `.Assign(val, name, persist)`
    - Sets a new Entry
    - **val** - The Value being added
    - **name** - The Key for the Entry
    - **persist** - An optional boolean value of whether the value shoud stay on the server after a restart
    - Can return an error if type is an RPC
- `.Update(id, val)`
    - **id** - The ID of the Entry to be updated
    - **val** - The new Value
    - Can Return an error if the Entry does not exist ot the value is of the wrong type
- `Flag(id, persist)`
    - Updates the persist flag
    - **id** - The ID of the Entry to be updated
    - **persist** - An optional boolean value of whether the value shoud stay on the server after a restart
    - Can return an error if the Entry does not exist
- `.Delete(id)`
    - Deletes an Entry
    - **id** - The ID of the entry being Deleted
    - Can Return an error if the Entry does not exist
- `.DeleteAll()`
    - Deletes all of the Entries
    - Returns an error if the type is the client is using 2.0
- `.RPCExec(id, val, (result) => any)`
    - Calls a Remote Procedure
    - **id** - The ID of the procedure
    - **val** - The Parameters of the Procedure
    - **result** - The result of the call
    - Can Return an error of parameter type does not corespond to the definition, the Entry is not an RPC, or the Entry does not Exist
- `.write(buf)`
    - Sends a Message dirrectly to the server
    - DO NOT USE unless you know what you are doing

## Types
- valueType
    - Boolean
    - Number
    - String
    - Buffer
    - BooleanArray
    - NumberArray
    - StringArray
    - RPC
- valueID
    - 0x00 : "Boolean"
    - 0x01 : "Number"
    - 0x02 : "String"
    - 0x03 : "Buffer"
    - 0x10 : "BooleanArray"
    - 0x11 : "NumberArray"
    - 0x12 : "StringArray"
    - 0x20 : "RPC"

## In 2.0
- Delete does not work
- Flags do not exist
- RPC does not exist

## RPC Entry Definition
Remote Procedure Call
```js
RPC:{
    // The name of the Call
    name,
    // The parameters of the call
    par:{
        // The Id of the type of the parameter
        typeId,
        // The name of the Type of the parameter
        typeName,
        // Name of the Parameter
        name,
        // Default value for the parameter
        default
    }[],
    // The format of the results
    results:{
        // The Id of the type of the result
        typeId,
        // The name of the Type of the result
        typeName,
        // The name of the result
        name
    }[]
}
```
