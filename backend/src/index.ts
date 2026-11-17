import { app } from "./app";
import { config } from "./shared/config";
app.listen(config.port);
console.log(`BandFindr API listening on port ${config.port}`);
