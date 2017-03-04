# WPILIB Network Tables Client
This client uses version 3.0 of the [Network Tables Protocol](https://github.com/wpilibsuite/ntcore/blob/master/doc/networktables3.adoc)

## Installation
```
npm install wpilib-nt-client
```

## Usage

```js
// Decleration
const ntClient = require('wpilib-nt-client')

// Connects the client to the server on team 3571's roborio
ntClient.start(err=>{
    // Displays the error
    console.log({err})
},'roborio-3571.local')

// Adds a listener to the client
ntClient.addListener((key, val, type, id) => {
    console.log({ key, val, type, id })
})
```
## Properties
- `.start(callback, address, port)`
    - Connects the client to a specific address and port
    - **callback** - Is called when an error occurs
    - **address** - The address of the Server. Defaults to loopback
    - **port** - The port of the server
- `.addListener((key, value, valueType, type, id) => any)`
    - Adds a callback to be called when a value has been added, updated, or deleted
    - **key** - The Key for the value
    - **value** - The value associated with the key
    - **valueType** - The type of the value Possible Types are listed Bellow
    - **type** - The type of the callback. Possible Types are: "add", "update", "delete"
- `.getKeyID(key)`
    - Returns the ID of a key or All of the keys if key if left out
- `.getEntry(id)`
    - Returns an Entry identified with an ID
- `.Assign(type, val, name, persist)`
    - Sets a new Entry
    - **type** - A number representing the type
    - **val** - The Value being added
    - **name** - The Key for the Entry
    - **persist** - An optional boolean value of whether the value shoud stay on the server after a restart
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
        default,
        // The format of the results
        result:{
            // The Id of the type of the result
            typeId,
            // The name of the Type of the result
            typeName,
            // The name of the result
            name
        }[]
    }[]
}
```