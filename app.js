/**
 * Created by Mikk on 10.09.2016.
 */
const Server = require("./server");

let server = null;
try {
  server = new Server();
  server.updateTimes();
} catch (err) {
  console.error(err);
}
