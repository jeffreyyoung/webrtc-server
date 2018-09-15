import { getServer } from "./src/Server";

const server = getServer();

//TODO add 0.0.0 thing here
server.listen(process.env.port || 4321);
