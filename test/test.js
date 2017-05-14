"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = require("../");
const ntClient = new _1.Client();
const ntClient2 = new _1.Client();
ntClient.start((con, err) => {
    console.log({ con, err });
    if (!con)
        throw err;
    ntClient.Assign('3', '/SmartDashboard/test');
    ntClient.Assign('4', '/SmartDashboard/test');
    ntClient.Assign('5', '/SmartDashboard/test');
    ntClient.Assign('6', '/SmartDashboard/test');
    setTimeout(() => {
        let id = ntClient.getKeyID('/SmartDashboard/test'), entry = ntClient.getEntry(id), ids = ntClient.getKeyID();
        console.log({ id, entry, ids });
        ntClient2.start((con, err) => {
            console.log({ con, err, type: '2nd' });
        });
    }, 1000);
});
ntClient.addListener((key, val, valType, type, id, flags) => {
    console.log({ key, val, valType, type, id, flags });
});
ntClient2.addListener((key, val, valType, type, id, flags) => {
    if (key === '/SmartDashboard/test') {
        console.log({ t: '2', key, val, valType, type, id, flags });
    }
});
