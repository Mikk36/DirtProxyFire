/**
 * Created by Mikk on 10.09.2016.
 */
"use strict";

require("console-stamp")(console, {
  pattern: "d dddd HH:MM:ss.l"
});
const fs = require("fs-extra");
const jsonFile = require("jsonfile");
// const express = require("express");
// const morgan = require("morgan");
// const http = require("https");
// const schedule = require("node-schedule");
const DirtClient = require("./DirtClient");

class Server {
  constructor() {
    this.config = Server.loadConfig();
    this.dirtClient = new DirtClient();

    // this.dirtClient.fetchData(146716).then(data => {
    //   // console.log(JSON.stringify(data, null, 2));
    //   jsonFile.writeFileSync("sample.json", data, {spaces: 2});
    //   console.log("Data received");
    // }).catch(err => {
    //   console.log(err);
    // });
  }

  /**
   * Retrieves the configuration
   * @return {Object} Configuration object
   */
  static loadConfig() {
    try {
      return jsonFile.readFileSync("config.json");
    } catch (err) {
      if (err.code === "ENOENT") {
        Server.createConfig();
        return Server.loadConfig();
      }
      throw err;
    }
  }

  /**
   * Copy configuration file from the default one
   * @throws Throws an error, if it fails to copy the config
   */
  static createConfig() {
    console.log("Copying config file");
    fs.copySync("config.dist.json", "config.json");
  }
}

module.exports = Server;
