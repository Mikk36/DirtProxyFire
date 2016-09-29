/**
 * Created by Mikk on 10.09.2016.
 */
"use strict";

require("console-stamp")(console, {
  pattern: "d dddd HH:MM:ss.l"
});
const fs = require("fs-extra");
const jsonFile = require("jsonfile");
const firebase = require("firebase");
// const express = require("express");
// const morgan = require("morgan");
// const http = require("https");
// const schedule = require("node-schedule");
const DirtClient = require("./DirtClient");
const ResultsManager = require("./ResultsManager");

class Server {
  constructor() {
    this.config = Server._loadConfig();
    Server._createCacheFolder();

    firebase.initializeApp({
      serviceAccount: "./firebase-service-account.json",
      databaseURL: "https://eval-dirt.firebaseio.com/"
    });
    this.db = firebase.database();
    this._state = {
      leagues: {},
      seasons: {},
      rallies: {},
      races: {},
      drivers: {},
      nicks: {},
      activeRallyList: []
    };

    // setInterval(() => {
    //   let asd = "" + this._state;
    // }, 1000);

    this._setupRefList();
    this._fetchState();

    this.dirtClient = new DirtClient();
    this.resultsManager = new ResultsManager(this._state);

    // -KRyJ61EOUJXExtq5MJu
    // setTimeout(() => {
    //   // let scores = this.resultsManager.calculateRallyResults("-KRyJ61EOUJXExtq5MJu");
    //   // this.refList.rallyResults.child("-KRyJ61EOUJXExtq5MJu").set(scores);
    //   jsonFile.readFile("cache/151081.json", (err, data) => {
    //     this._analyzeAPI(data, "-KS0-HNFGTqDRxwS4BTx");
    //   });
    // }, 10000);

    // this.dirtClient.fetchData(149001).then(/** EventData */data => { // eslint-disable-line valid-jsdoc
    //   // console.log(JSON.stringify(data, null, 2));
    //   jsonFile.writeFileSync(`cache/${data.id}.json`, data, {spaces: 2});
    //   console.log("Data received");
    //
    //   this._analyzeAPI(data);
    // }).catch(err => {
    //   console.log(err);
    // });

    // this._addSeason("2016 II", "historic");
    // this._addRally("1. Rallye Monte-Carlo 2016 Historic", "-KRyIYnW-LXxXwalMSFw", [149003]);
  }

  /**
   * Ensure that there is a cache folder to write data to
   * @private
   */
  static _createCacheFolder() {
    let dir = './cache';

    try {
      fs.accessSync(dir, fs.F_OK);
    } catch (e) {
      fs.mkdirSync(dir);
    }
  }

  /**
   * Update times from the Dirt API for active rallies
   */
  updateTimes() {
    setInterval(() => {
      this._state.activeRallyList.forEach(rallyKey => {
        this._updateRallyTimes(rallyKey);
      });
    }, 60 * 1000);
  }

  /**
   * Update times for a single rally
   * @param {string} rallyKey Rally Key
   * @private
   */
  _updateRallyTimes(rallyKey) {
    let rally = this._state.rallies[rallyKey];
    rally.eventIDList.forEach(/** number */ eventID => { // eslint-disable-line valid-jsdoc
      this.dirtClient.fetchData(eventID).then(data => {
        this._analyzeAPI(data, rallyKey);
        if (this.config.writeCache) {
          jsonFile.writeFile(
              `cache/${data.id}.json`,
              data,
              {spaces: 2}, () => { // eslint-disable-line max-nested-callbacks
              }
          );
        }
      });
    });
  }

  /**
   * Creates various references for accessing the DB
   * @private
   */
  _setupRefList() {
    this.refList = {
      leagues: this.db.ref("leagues"), // EVAL Liiga, EVAL Historic
      seasons: this.db.ref("seasons"), // 2016 I, 2016 II, contains info about rallies in a league, classes
      rallies: this.db.ref("rallies"), // Portugal WRC 2016 II, Finland WRC 2016 II, event IDs, contains also
      // punishments
      rallyResults: this.db.ref("rallyResults"),
      races: this.db.ref("races"), // Individual race times
      drivers: this.db.ref("drivers"), // Driver real name, userNames
      rallyTeams: this.db.ref("rallyTeams") // Team name, team drivers
    };
  }

  /**
   * Initial fetch of state from DB
   * @private
   */
  _fetchState() {
    this._fetchLeagues();
    this._fetchSeasons();
    this._fetchRallies();
    this._fetchDrivers();
  }

  /**
   * Fetch leagues from the DB
   * @private
   */
  _fetchLeagues() {
    this.refList.leagues.on("child_added", snap => {
      this._state.leagues[snap.key] = snap.val();
    });
    this.refList.leagues.on("child_changed", snap => {
      this._state.leagues[snap.key] = snap.val();
    });
    this.refList.leagues.on("child_removed", snap => {
      delete this._state.leagues[snap.key];
    });
  }

  /**
   * Fetch seasons from the DB and keep them updated
   * @private
   */
  _fetchSeasons() {
    this.refList.seasons.on("child_added", snap => {
      this._state.seasons[snap.key] = snap.val();
    });
    this.refList.seasons.on("child_changed", snap => {
      this._state.seasons[snap.key] = snap.val();
    });
    this.refList.seasons.on("child_removed", snap => {
      delete this._state.seasons[snap.key];
    });
  }

  _fetchDrivers() {
    let addedChanged = snap => {
      console.log(`Driver ${snap.key} added/changed`);
      this._state.drivers[snap.key] = snap.val();
      this._createNickList();
    };
    this.refList.drivers.on("child_added", addedChanged);
    this.refList.drivers.on("child_removed", snap => {
      console.log(`Driver ${snap.key} removed`);
      delete this._state.drivers[snap.key];
      this._createNickList();
    });
  }

  _createNickList() {
    this._state.nicks = {};
    for (let name in this._state.drivers) {
      if (this._state.drivers.hasOwnProperty(name)) {
        let driver = this._state.drivers[name];
        for (let i in driver.nicks) {
          if (driver.nicks.hasOwnProperty(i)) {
            this._state.nicks[driver.nicks[i]] = name;
          }
        }
      }
    }
  }

  /**
   * Fetch rallies from the DB and keep them updated
   * @private
   */
  _fetchRallies() {
    this.refList.rallies.on("child_added", snap => {
      let value = snap.val();
      value.teams = {};
      console.log(`Rally ${value.name} added`);
      this._state.rallies[snap.key] = value;

      if (value.finished === false) {
        this._state.activeRallyList.push(snap.key);
        console.log(`Added ${value.name} to activeRallyList`);
        this._fetchRaces(snap.key);
      }
      this.refList.rallyTeams.on("child_added", teamSnap => {
        this._state.rallies[teamSnap.key].teams = teamSnap.val();
      });
      this.refList.rallyTeams.on("child_changed", teamSnap => {
        this._state.rallies[teamSnap.key].teams = teamSnap.val();
      });
      this.refList.rallyTeams.on("child_removed", teamSnap => {
        this._state.rallies[teamSnap.key].teams = {};
      });
    });
    this.refList.rallies.on("child_changed", snap => {
      let value = snap.val();
      console.log(`Rally ${value.name} changed`);
      for (let key in value) {
        if (value.hasOwnProperty(key)) {
          this._state.rallies[snap.key][key] = value[key];
        }
      }
      let index = this._state.activeRallyList.indexOf(snap.key);
      if (value.finished === true) {
        if (index >= 0) {
          this._state.activeRallyList.splice(index, 1);
          console.log(`Removed "${value.name}" from activeRallyList`);
        }
      } else if (index < 0) {
        this._state.activeRallyList.push(snap.key);
        console.log(`Added "${value.name}" to activeRallyList`);
        this._fetchRaces(snap.key);
      }
    });
  }

  /**
   * Fetch races for a specific rally and keep them updated
   * @param {string} rallyKey Rally key for which to get races
   * @private
   */
  _fetchRaces(rallyKey) {
    this._state.races[rallyKey] = {};
    this.refList.races.child(rallyKey).on("child_added", snap => {
      this._state.races[rallyKey][snap.key] = snap.val();
    });
    this.refList.races.child(rallyKey).on("child_changed", snap => {
      let race = snap.val();
      this._state.races[rallyKey][snap.key] = race;
      console.log(`Race ${this._state.rallies[rallyKey].name} stage ${race.stage} for driver ${race.userName} changed`);
    });
  }

  /**
   * Insert a race result
   * @param {string} rallyKey Rally DB key
   * @param {string} userName Username of the driver
   * @param {number} stage Stage number
   * @param {number} time Result time
   * @param {string} car Car name
   * @param {boolean} assists Assists enabled or disabled
   * @returns {boolean} Added new time to database
   * @private
   */
  _addRace(rallyKey, userName, stage, time, car, assists) {
    // check if such race result already exists
    for (let key in this._state.races[rallyKey]) {
      if (this._state.races[rallyKey].hasOwnProperty(key)) {
        let race = this._state.races[rallyKey][key];
        if (userName === race.userName &&
            stage === race.stage &&
            time === race.time &&
            car === race.car
        ) {
          if (assists !== race.assists) {
            this.refList.races.child(rallyKey).child(key).child("assists").set(assists);
          }
          return false;
        }
      }
    }

    let result = {
      userName: userName,
      stage: stage,
      time: time,
      car: car,
      assists: assists,
      timestamp: Date.now()
    };
    this.refList.races.child(rallyKey).push(result);
    return true;
  }

  /**
   * Add a season to the DB
   * @param {string} name Season name
   * @param {string} leagueKey League key for which the season belongs to
   * @private
   */
  _addSeason(name, leagueKey) {
    this.refList.seasons.push({
      name: name,
      league: leagueKey
    });
  }

  /**
   * Add a rally
   * @param {string} name Rally name
   * @param {string} seasonKey Season key
   * @param {Array.<number>} eventIDList List of event IDs
   * @private
   */
  _addRally(name, seasonKey, eventIDList) {
    this.refList.rallies.push({
      name: name,
      season: seasonKey,
      eventIDList: eventIDList,
      finished: false
    });
  }

  /**
   * Analyzes the data received from the API
   * @param {EventData} data Data received from the Dirt API
   * @param {string} rallyKey ID of the rally it belongs to
   * @private
   */
  _analyzeAPI(data, rallyKey) {
    let timeList = {};
    data.stages.forEach((stage, i) => {
      if (i + 1 < data.stages.length) {
        if (stage.singlePage.Entries.length < data.stages[i + 1].singlePage.Entries.length) {
          throw new Error("Stage has less entries than the next one after it");
        }
      }
      stage.singlePage.Entries.forEach(entry => {
        if (timeList[entry.Name] === undefined) {
          timeList[entry.Name] = {
            car: entry.VehicleName,
            assists: false,
            times: [],
            originalTimes: []
          };
          if (data.assisted.indexOf(entry.Name) >= 0) {
            timeList[entry.Name].assists = true;
          }
        }
        let times = timeList[entry.Name].times;
        let originalTimes = timeList[entry.Name].originalTimes;
        let time = Server.parseTime(entry.Time);
        originalTimes.push(time);
        if (stage.stage === 1) {
          times.push(time);
        } else {
          times.push(Math.round((time - originalTimes[originalTimes.length - 2]) * 1000) / 1000);
        }
      });
    });

    let amountAdded = 0;
    let namesAdded = [];
    for (let name in timeList) {
      if (timeList.hasOwnProperty(name)) {
        let driver = timeList[name];
        driver.times.forEach((time, stage) => { // eslint-disable-line no-loop-func
          if (this._addRace(rallyKey, name, stage + 1, time, driver.car, driver.assists)) {
            amountAdded++;
            if (namesAdded.indexOf(name) < 0) {
              namesAdded.push(name);
            }
          }
        });
      }
    }
    if (amountAdded > 0) {
      console.log(`Added ${amountAdded} new times to the database: ${namesAdded.join(", ")}`);
      let scores = this.resultsManager.calculateRallyResults(rallyKey);
      this.refList.rallyResults.child(rallyKey).set(scores);
    }
  }

  /**
   * Parse a time string into a number of seconds
   * @param {string} time Time as a string
   * @returns {number} Time as seconds
   */
  static parseTime(time) {
    let split = time.split(":").reverse();
    let timeSeconds = parseFloat(split[0]);
    if (split.length > 1) {
      timeSeconds += parseInt(split[1], 10) * 60;
      if (split.length > 2) {
        timeSeconds += parseInt(split[2], 10) * 3600;
      }
    }
    return timeSeconds;
  }

  /**
   * Retrieves the configuration
   * @returns {Object} Configuration object
   * @private
   */
  static _loadConfig() {
    try {
      return jsonFile.readFileSync("config.json");
    } catch (err) {
      if (err.code === "ENOENT") {
        Server._createConfig();
        return Server._loadConfig();
      }
      throw err;
    }
  }

  /**
   * Copy configuration file from the default one
   * @throws Throws an error, if it fails to copy the config
   * @private
   */
  static _createConfig() {
    console.log("Copying config file");
    fs.copySync("config.dist.json", "config.json");
  }
}

module.exports = Server;
