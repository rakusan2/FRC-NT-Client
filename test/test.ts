import { Client, debugType } from "../";
const ntClient = new Client();
const ntClient2 = new Client();
ntClient.startDebug("Debug1", debugType.messageType);
ntClient2.startDebug("Debug2", debugType.messageType);
ntClient.start((con, err) => {
    console.log({ con, err });
    if (!con) throw err;
    ntClient.Assign("3", "/SmartDashboard/test");
    ntClient.Assign("4", "/SmartDashboard/test");
    ntClient.Assign("5", "/SmartDashboard/test");
    ntClient.Assign("6", "/SmartDashboard/test");
    setTimeout(() => {
        let id = ntClient.getKeyID("/SmartDashboard/test"),
            entry = ntClient.getEntry(id),
            ids = ntClient.getKeyID();
        console.log({ id, entry, ids });
        ntClient2.start((con, err) => {
            console.log({ con, err, type: "2nd" });
        });
    }, 1000);
});
ntClient.addListener((key, val, valType, type, id, flags) => {
    console.log({ key, val, valType, type, id, flags });
});
ntClient2.addListener((key, val, valType, type, id, flags) => {
    if (key === "/SmartDashboard/test") {
        console.log({ t: "2", key, val, valType, type, id, flags });
    }
});
