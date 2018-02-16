import { Client, debugType } from "../";
const ntClient = new Client();
const ntClient2 = new Client();
let args = process.argv.slice(2);
ntClient.startDebug("Debug1", debugType.messages);
ntClient2.startDebug("Debug2", debugType.messageType);
ntClient.start((con, err, is2) => {
    console.log({ con, err,is2 });
    if (err != null) throw err;
    if(!con)return
    ntClient.Assign("3", "/SmartDashboard/test");
    ntClient.Assign("4", "/SmartDashboard/test");
    ntClient.Assign("5", "/SmartDashboard/test");
    ntClient.Assign("6", "/SmartDashboard/test");
    setTimeout(() => {
        let id = ntClient.getKeyID("/SmartDashboard/test"),
            entry = ntClient.getEntry(id),
            ids = ntClient.getKeyID();
        console.log({ id, entry, ids });
        if(entry == null) throw new Error("Non Existant Entry")
        ntClient2.start((con, err) => {
            console.log({ con, err, type: "2nd" });
        },args[0],parseInt(args[1])||undefined);
    }, 1000);
},args[0],parseInt(args[1])||undefined);
ntClient.addListener((key, val, valType, type, id, flags) => {
    console.log({ key, val, valType, type, id, flags });
});
ntClient2.addListener((key, val, valType, type, id, flags) => {
    if (key === "/SmartDashboard/test") {
        console.log({ t: "2", key, val, valType, type, id, flags });
    }
});
ntClient.setReconnectDelay(1000);