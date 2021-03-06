/**
 * Created by Mikk on 10.09.2016.
 */
"use strict";

require("console-stamp")(console, {
  pattern: "d dddd HH:MM:ss.l"
});
const fs = require("fs-extra");
const jsonFile = require("jsonfile");
const firebase = require("firebase-admin");
const DirtClient = require("./DirtClient");
const ResultsManager = require("./ResultsManager");

class Server {
  /**
   * @typedef {Object} Config
   * @property {number} updateInterval
   * @property {boolean} writeCache
   * @property {string} databaseURL
   */

  /**
   * State
   * @typedef {Object} State
   * @property {Object.<string, Rally>} rallies
   * @property {Object.<string, Season>} seasons
   * @property {Object.<string, Object.<string, Race>>} races
   * @property {Object.<string, League>} leagues
   * @property {Object.<string, Driver>} drivers
   * @property {Object.<string, string>} nicks
   * @property {Array.<string>} activeRallyList List of active Rally IDs
   * @property {Object.<string, EventData> apiCache
   */

  /**
   * @typedef {Object} Driver
   * @property {Object.<string, string>} nicks
   */

  /**
   * @typedef {Object} League
   * @property {string} name
   * @property {number} order Sorting order
   * @property {Array.<string>} seasons List of Season IDs
   */

  /**
   * @typedef {Object} Race
   * @property {boolean} assists
   * @property {string} car
   * @property {number} stage
   * @property {number} time
   * @property {string} timestamp
   * @property {string} userName
   */

  /**
   * @typedef {Object} RallyTeam
   * @property {string} car
   * @property {string} name
   * @property {Array.<string>} drivers
   * @property {boolean} private Private drivers team
   */

  /**
   * @typedef {Object} Season
   * @property {Object.<string, Class>} classes Classes
   * @property {string} league League ID
   * @property {string} name League name
   * @property {Array.<string>} rallies List of rally IDs
   */

  /**
   * @typedef {Object} Class
   * @property {Array.<string>} cars List of car names
   * @property {string} name Class name
   */

  /**
   * @typedef {Object} Rally
   * @property {string} league League ID
   * @property {string} name Rally name
   * @property {string} season Season ID
   * @property {number} stages Stage count
   * @property {boolean} finished Is rally finished
   * @property {Array.<number>} eventIDList List of eventIDs
   * @property {Array.<string>} restarters List of restarting drivers
   * @property {Object.<string, Penalty>} penalties List of penalties
   * @property {Object.<string, RallyTeam>} teams
   */

  /**
   * @typedef {Object} Penalty
   * @property {Boolean} dq Is driver disqualified
   * @property {string} driver Driver name
   * @property {string} message Penalty reason
   */

  constructor() {
    this.config = Server._loadConfig();
    if (this.config.writeCache) {
      Server._createCacheFolder();
    }

    firebase.initializeApp({
      credential: firebase.credential.cert(require("./firebase-service-account.json")),
      databaseURL: this.config.databaseURL
    });
    this.db = firebase.database();
    /** @type {State} */
    this._state = {
      leagues: {},
      seasons: {},
      rallies: {},
      races: {},
      drivers: {},
      nicks: {},
      activeRallyList: [],
      apiCache: {}
    };

    // setInterval(() => {
    //   let asd = "" + this._state;
    // }, 1000);

    this._setupRefList();
    this._fetchState();

    this.dirtClient = new DirtClient();
    this.resultsManager = new ResultsManager(this._state);

    // -KRyJ61EOUJXExtq5MJu <-- wrc 1
    // -KRzKPDdmSxQq_EdUbzU <-- wrc 2
    // -KS0-HNFGTqDRxwS4BTx <-- historic 1
    // setTimeout(() => {
    //   // jsonFile.readFile("cache/149001.json", (err, data) => {
    //   //   this._analyzeAPI(data, "-KRyJ61EOUJXExtq5MJu");
    //   // });
    //   // jsonFile.readFile("cache/151081.json", (err, data) => {
    //   //   this._analyzeAPI(data, "-KS0-HNFGTqDRxwS4BTx");
    //   // });
    //   jsonFile.readFile("cache/149001.json", (oldErr, oldData) => {
    //     jsonFile.readFile("cache/149001 - Copy.json", (newErr, newData) => {
    //       let list = this._checkRestartedDrivers(oldData, newData);
    //       this._mergeRestarterLists("-KRyJ61EOUJXExtq5MJu", list);
    //     });
    //   });
    // this._analyzeAPI(this._state.apiCache["149002"], "-KRzKPDdmSxQq_EdUbzU");
    //   this.refList.rallyTeams.child("-KS0-HNFGTqDRxwS4BTx").once("value", snap => {
    //     this.refList.rallyTeams.child("historic_2016_II_2_sweden").set(snap.val());
    //   });
    // Recalculate rally results for a rally
    // setTimeout(() => {
    //   let scores = this.resultsManager.calculateRallyResults("historic_2018_2_sweden");
    //   this.refList.rallyResults.child("historic_2018_2_sweden").set(scores).then(() => {
    //     console.log(`Scores set`);
    //   });
    //   // console.log(typeof scores);
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

    // Fill eventData with data
    // setTimeout(() => {
    //   Object.keys(this._state.rallies).forEach(key => this._fetchApiCache(key));
    //   setTimeout(() => {
    //     Object.keys(this._state.apiCache).forEach(key => this._saveStageData(this._state.apiCache[key]));
    //   }, 10000);
    // }, 10000);
  }

  /**
   * Ensure that there is a cache folder to write data to
   * @private
   */
  static _createCacheFolder() {
    const dir = './cache';

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
    }, this.config.updateInterval * 1000);
  }

  /**
   * Update times for a single rally
   * @param {string} rallyKey Rally Key
   * @private
   */
  _updateRallyTimes(rallyKey) {
    const rally = this._state.rallies[rallyKey];
    rally.eventIDList.forEach(/** number */eventID => { // eslint-disable-line valid-jsdoc
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
      }).catch(err => {
        console.log(err);
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
      rallyTeams: this.db.ref("rallyTeams"), // Team name, team drivers
      apiCache: this.db.ref("apiCache"),
      eventData: this.db.ref("eventData")
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
    const addedChanged = snap => {
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
    for (const name of Object.getOwnPropertyNames(this._state.drivers)) {
      const driver = this._state.drivers[name];
      for (const i of Object.getOwnPropertyNames(driver.nicks)) {
        this._state.nicks[driver.nicks[i]] = name;
      }
    }
  }

  /**
   * Fetch rallies from the DB and keep them updated
   * @private
   */
  _fetchRallies() {
    this.refList.rallies.on("child_added", snap => {
      const value = snap.val();
      value.teams = {};
      console.log(`Rally ${value.name} added`);
      this._state.rallies[snap.key] = value;

      if (value.finished === false) {
        this._state.activeRallyList.push(snap.key);
        console.log(`Added ${value.name} to activeRallyList`);
        this._fetchRaces(snap.key);
        this._fetchApiCache(snap.key);
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
      const value = snap.val();
      console.log(`Rally ${value.name} changed`);
      for (const key of Object.getOwnPropertyNames(value)) {
        this._state.rallies[snap.key][key] = value[key];
      }
      const index = this._state.activeRallyList.indexOf(snap.key);
      if (value.finished === true) {
        if (index >= 0) {
          this._state.activeRallyList.splice(index, 1);
          console.log(`Removed "${value.name}" from activeRallyList`);
        }
      } else if (index < 0) {
        this._state.activeRallyList.push(snap.key);
        console.log(`Added "${value.name}" to activeRallyList`);
        this._fetchRaces(snap.key);
        this._fetchApiCache(snap.key);
      }
    });
  }

  _fetchApiCache(rallyKey) {
    this._state.rallies[rallyKey].eventIDList.forEach(id => {
      this.refList.apiCache.child(id.toString()).once("value", snap => {
        const val = snap.val();
        if (val !== null) {
          this._state.apiCache[id] = val;
        }
      }).then();
    });
  }

  /**
   *  Store the API cache in the database
   * @param {EventData} data Event data
   * @private
   */
  _storeApiCache(data) {
    this._state.apiCache[data.id] = data;
    this.refList.apiCache.child(data.id.toString()).set(data).then();

    this._saveStageData(data);
  }

  /**
   * Save stage data from Event data
   * @param {EventData} data Event data
   * @private
   */
  _saveStageData(data) {
    const event = {
      timestamp: data.timestamp
    };
    event.stages = data.stages.map(stage => {
      const page = stage.singlePage;
      return {
        HasServiceArea: page.HasServiceArea,
        LocationImage: page.LocationImage,
        LocationName: page.LocationName,
        StageImage: page.StageImage,
        StageName: page.StageName,
        TimeOfDay: page.TimeOfDay,
        WeatherImageAltUrl: page.WeatherImageAltUrl,
        WeatherImageUrl: page.WeatherImageUrl,
        WeatherText: page.WeatherText
      };
    });
    this.refList.eventData.child(data.id.toString()).set(event).then();
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
      const race = snap.val();
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
    for (const key of Object.getOwnPropertyNames(this._state.races[rallyKey])) {
      const race = this._state.races[rallyKey][key];
      if (userName === race.userName &&
          stage === race.stage &&
          time === race.time &&
          car === race.car
      ) {
        if (assists !== race.assists) {
          this.refList.races.child(rallyKey).child(key).child("assists").set(assists).then();
        }
        return false;
      }
    }

    const result = {
      userName: userName,
      stage: stage,
      time: time,
      car: car,
      assists: assists,
      timestamp: (new Date()).toJSON()
    };
    this.refList.races.child(rallyKey).push(result).then();
    return true;
  }

  // noinspection JSUnusedGlobalSymbols
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
    }).then(() => {
      console.log(`Season ${name} added`);
    });
  }

  // noinspection JSUnusedGlobalSymbols
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
    }).then(() => {
      console.log(`Rally ${name} added`);
    });
  }

  /**
   * Analyzes the data received from the API
   * @param {EventData} data Data received from the Dirt API
   * @param {string} rallyKey ID of the rally it belongs to
   * @private
   */
  _analyzeAPI(data, rallyKey) {
    const timeList = {};
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
          if (data.hasOwnProperty("assisted")) {
            if (data.assisted.indexOf(entry.Name) >= 0) {
              timeList[entry.Name].assists = true;
            }
          }
        }
        const times = timeList[entry.Name].times;
        const originalTimes = timeList[entry.Name].originalTimes;
        const time = Server.parseTime(entry.Time);
        originalTimes.push(time);
        if (stage.stage === 1) {
          times.push(time);
        } else {
          times.push(Math.round((time - originalTimes[originalTimes.length - 2]) * 1000) / 1000);
        }
      });
    });

    if (this._state.races.hasOwnProperty(rallyKey)) {
      const restarterList = this._checkRestartedDrivers(timeList, rallyKey);
      if (restarterList.length > 0) {
        this._mergeRestarterLists(rallyKey, restarterList);
      }
    }

    let amountAdded = 0;
    const namesAdded = [];
    for (const name of Object.getOwnPropertyNames(timeList)) {
      const driver = timeList[name];
      driver.times.forEach((time, stage) => { // eslint-disable-line no-loop-func
        if (this._addRace(rallyKey, name, stage + 1, time, driver.car, driver.assists)) {
          amountAdded++;
          if (namesAdded.indexOf(name) < 0) {
            namesAdded.push(name);
          }
        }
      });
    }
    if (amountAdded > 0) {
      console.log(`Added ${amountAdded} new times to the database: ${namesAdded.join(", ")}`);
      const scores = this.resultsManager.calculateRallyResults(rallyKey);
      if (scores) {
        this.refList.rallyResults.child(rallyKey).set(scores).then();
      }
    }

    this._storeApiCache(data);
  }

  /**
   * Merge new restarters list with the existing one for a rally
   * @param {string} rallyKey Rally ID
   * @param {Array.<string>} list Restarters list
   * @private
   */
  _mergeRestarterLists(rallyKey, list) {
    const rally = this._state.rallies[rallyKey];
    if (!rally.hasOwnProperty("restarters")) {
      rally.restarters = [];
    }
    list.forEach(name => {
      if (rally.restarters.indexOf(name) < 0) {
        rally.restarters.push(name);
      }
    });
    this.refList.rallies.child(rallyKey).child("restarters").set(rally.restarters).then();
  }

  /**
   * Check for restarted drivers
   * @param {Object} data List of times by driver
   * @param {string} rallyKey Rally ID
   * @returns {Array.<string>} List of restarters
   * @private
   */
  _checkRestartedDrivers(data, rallyKey) {
    const restarters = [];
    for (const name of Object.getOwnPropertyNames(data)) {
      const driver = data[name];
      let matches = 0;
      for (const stage of Object.getOwnPropertyNames(driver.times)) {
        const time = driver.times[stage];
        const match = this._checkTimeNameMatch(rallyKey, parseInt(stage, 10) + 1, time, name);
        if (match) {
          matches++;
        }
      }
      if (matches < driver.times.length) {
        restarters.push(name);
      }
    }
    return restarters;
  }

  /**
   * Check if there has been a restart for a specific time entry
   * @param {string} rallyKey Rally ID
   * @param {number} stage Stage number
   * @param {number} time Stage time
   * @param {string} name Driver name
   * @returns {boolean} False, if a restart was found
   * @private
   */
  _checkTimeNameMatch(rallyKey, stage, time, name) {
    const races = this._state.races[rallyKey];
    for (const raceKey in races) {
      if (!races.hasOwnProperty(raceKey)) {
        continue;
      }
      const race = races[raceKey];

      if (race.stage === stage && race.userName === name && race.time !== time) {
        return false;
      }
    }
    return true;
  }

  /**
   * Parse a time string into a number of seconds
   * @param {string} time Time as a string
   * @returns {number} Time as seconds
   */
  static parseTime(time) {
    const split = time.split(":").reverse();
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
   * @returns {Config} Configuration object
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
