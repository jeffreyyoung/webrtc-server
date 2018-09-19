import { getServer } from "./src/server/getServer";

async function main() {
    const dress = await getServer(1234);
}

main();

