"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = require("../");
const ntClient = new _1.Client();
ntClient.start((con, err) => {
    console.log({ con, err });
    if (!con)
        throw err;
});
ntClient.addListener((key, val, type, id) => {
    console.log({ key, val, type, id });
});
