"use strict";
exports.__esModule = true;
var Server_1 = require("./src/Server");
var server = Server_1.getServer();
//TODO add 0.0.0 thing here
server.listen(process.env.port || 4321);
