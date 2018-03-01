/**
 * Created by Mikk on 27.09.2016.
 */

class ResultsManager {
  /**
   * @param {State} state State
   */
  constructor(state) {
    this._state = state;
    this._activeIDList = {};
  }

  /**
   * Calculate points for a rally
   * @param {string} rallyID Rally ID
   * @returns {Object|undefined} Class-separated list of finishers and their scores or false
   */
  calculateRallyResults(rallyID) {
    if (this._activeIDList.hasOwnProperty(rallyID)) {
      return;
    }
    this._activeIDList[rallyID] = true;

    const rally = this._state.rallies[rallyID];
    const season = this._state.seasons[rally.season];
    const stageCount = rally.stages;
    const races = this._state.races[rallyID];

    const totalTimes = this._calculateTotalTimes(races);

    // pointList
    const points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const pointsPower = [3, 2, 1];
    /** @type {Array.<Race>} */
    const finisherList = [];
    for (const i of Object.getOwnPropertyNames(races)) {
      const result = races[i];
      if (result.stage === stageCount && (result.time !== 900 && result.time !== 1800)) {
        finisherList.push(result);
      }
    }
    /** @type {ClassFinishers} */
    const classFinishers = {};
    for (const raceClassID of Object.getOwnPropertyNames(season.classes)) {
      classFinishers[raceClassID] = {drivers: [], teams: []};
    }
    finisherList.forEach(result => {
      const driverName = this._getDriverName(result.userName);

      if (!driverName) {
        // Driver has not registered for EVAL
        return;
      }

      const raceClassID = this.constructor._getClassID(result.car, season);

      if (raceClassID === null) {
        // Car is not listed as allowed
        return;
      }
      if (!this.constructor._checkAssists(result.assists, raceClassID, season)) {
        // Driver is using assists illegally
        return;
      }
      if (this.constructor._checkDQ(driverName, rally)) {
        // Driver is disqualified
        return;
      }
      if (this.constructor._checkRestarts(driverName, rally)) {
        // Driver has restarted
        return;
      }

      const teamID = this.constructor._getDriverTeamID(driverName, raceClassID, rally);
      if (teamID === null) {
        // Driver has not registered a team / private team
        return;
      }
      if (this.constructor._getTeam(teamID, raceClassID, rally).car !== result.car) {
        // Driver is using a car not assigned to him/her
        return;
      }

      classFinishers[raceClassID].drivers.push({
        name: driverName,
        team: teamID,
        time: totalTimes[driverName],
        powerTime: result.time,
        score: 0
      });
    });

    // Let's give out points
    for (const raceClassID of Object.getOwnPropertyNames(classFinishers)) {
      const classDrivers = classFinishers[raceClassID].drivers;
      // Give points for finish time
      classDrivers.sort(this.constructor._totalTimeSorter);
      points.forEach((point, j) => {
        if (j < classDrivers.length) {
          classDrivers[j].score += point;
        }
      });
      // Give points for powerStage time
      classDrivers.sort(this.constructor._powerTimeSorter);
      pointsPower.forEach((point, j) => {
        if (j < classDrivers.length) {
          classDrivers[j].score += point;
        }
      });
      // Just sort the drivers by scores
      classDrivers.sort(this.constructor._scoreSorter);

      classDrivers.forEach(driver => {
        let finisherTeam = classFinishers[raceClassID].teams.find(team => {
          return team.id === driver.team;
        });
        if (typeof finisherTeam === "undefined") {
          // Add team as finisher
          const teamID = this.constructor._getDriverTeamID(driver.name, raceClassID, rally);
          const team = this.constructor._getTeam(teamID, raceClassID, rally);
          // If team isn't set as private, add it to teams list
          if (!team.private) {
            classFinishers[raceClassID].teams.push({
              id: teamID,
              score: driver.score
            });
          }
        } else {
          // Increase team score with drivers score
          finisherTeam.score += driver.score;
        }
      });
      classFinishers[raceClassID].teams.sort(this.constructor._teamScoreSorter);
    }

    this._removeActive(rallyID);

    return classFinishers;
  }

  /**
   * @param {string} name Team name
   * @param {string} raceClassID Race class
   * @param {Rally} rally Rally
   * @returns {string|null} RallyTeam ID or null
   * @private
   */
  static _getDriverTeamID(name, raceClassID, rally) {
    if (!rally.teams[raceClassID]) {
      // No raceClass teams found
      return null;
    }
    const teams = rally.teams[raceClassID];
    for (const team of Object.getOwnPropertyNames(teams)) {
      if (teams[team].drivers.indexOf(name) >= 0) {
        return team;
      }
    }
    return null;
  }

  /**
   * @param {string} id Team ID
   * @param {string} raceClassID Class ID
   * @param {Rally} rally Rally
   * @returns {RallyTeam|null} Team or null
   * @private
   */
  static _getTeam(id, raceClassID, rally) {
    if (
        rally.teams &&
        rally.teams[raceClassID] &&
        rally.teams[raceClassID][id]
    )
      return rally.teams[raceClassID][id];
    return null;
  }

  /**
   * @param {string} nick Nickname
   * @returns {string|null} Driver name or null
   * @private
   */
  _getDriverName(nick) {
    if (this._state.nicks.hasOwnProperty(nick)) {
      return this._state.nicks[nick];
    }
    return null;
  }

  /**
   * Compare results by total time
   * @param {Object} result1 Result 1
   * @param {Object} result2 Result 2
   * @returns {number} Comparison result
   * @private
   */
  static _totalTimeSorter(result1, result2) {
    if (result1.time > result2.time) {
      return 1;
    }
    if (result1.time < result2.time) {
      return -1;
    }
    return 0;
  }

  /**
   * Compare results by powerstage time
   * @param {Object} result1 Result 1
   * @param {Object} result2 Result 2
   * @returns {number} Comparison result
   * @private
   */
  static _powerTimeSorter(result1, result2) {
    if (result1.powerTime > result2.powerTime) {
      return 1;
    }
    if (result1.powerTime < result2.powerTime) {
      return -1;
    }
    return 0;
  }

  /**
   * Compare results by total score and name (if equal scores)
   * @param {Object} result1 Result 1
   * @param {Object} result2 Result 2
   * @returns {number} Comparison result
   * @private
   */
  static _scoreSorter(result1, result2) {
    if (result1.score > result2.score) {
      return -1;
    }
    if (result1.score < result2.score) {
      return 1;
    }
    if (result1.score === result2.score) {
      return this.constructor._totalTimeSorter(result1, result2);
    }
    return 0;
  }

  /**
   * Compare results by total score and name (if equal scores)
   * @param {Object} result1 Result 1
   * @param {Object} result2 Result 2
   * @returns {number} Comparison result
   * @private
   */
  static _teamScoreSorter(result1, result2) {
    if (result1.score > result2.score) {
      return -1;
    }
    if (result1.score < result2.score) {
      return 1;
    }
    return 0;
  }

  /**
   * Sum up total racetimes for registered drivers
   * @param {Object.<string, Race>} races Race results
   * @returns {Object.<string, number>} List of total times by driver
   * @private
   */
  _calculateTotalTimes(races) {
    const totals = {};
    for (const i of Object.getOwnPropertyNames(races)) {
      const race = races[i];
      const driverName = this._getDriverName(race.userName);
      if (driverName) {
        totals[driverName] = (totals[driverName] || 0) + race.time;
      }
    }
    return totals;
  }

  /**
   * Check if a driver is disqualified from a rally
   * @param {string} driverName Driver name
   * @param {Rally} rally Rally to check against
   * @returns {boolean} True, if driver is disqualified
   * @private
   */
  static _checkDQ(driverName, rally) {
    if (!rally.hasOwnProperty("penalties")) {
      return false;
    }
    for (const i of Object.getOwnPropertyNames(rally.penalties)) {
      const penalty = rally.penalties[i];
      if (penalty.driver === driverName && penalty.hasOwnProperty("dq") && penalty.dq === true) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a driver has restarted
   * @param {string} driverName Driver name
   * @param {Rally} rally Rally to check against
   * @returns {boolean} True, if driver has restarted
   * @private
   */
  static _checkRestarts(driverName, rally) {
    if (rally.hasOwnProperty("restarters")) {
      return rally.restarters.indexOf(driverName) >= 0;
    }
    return false;
  }

  /**
   * Check if assists usage is ok
   * @param {boolean} assists Assists used or not
   * @param {string} raceClassID Class the driver drove in
   * @param {Season} season Season to check against
   * @returns {boolean} True, if check is passed
   * @private
   */
  static _checkAssists(assists, raceClassID, season) {
    if (typeof season.classes[raceClassID].assists === "undefined") {
      return true;
    }
    return !(assists === true && season.classes[raceClassID].assists === false);
  }

  /**
   * Gets a car class or null
   * @param {string} car Car name
   * @param {Season} season Season to check against
   * @returns {string|null} Class id or null if not found
   * @private
   */
  static _getClassID(car, season) {
    const classes = season.classes;
    for (const seasonClass of Object.getOwnPropertyNames(classes)) {
      const testClass = classes[seasonClass];
      if (testClass.cars.indexOf(car) >= 0) {
        return seasonClass;
      }
    }
    return null;
  }

  /**
   * Removes ID from the list of active calculation jobs
   * @param {string} id ID
   * @private
   */
  _removeActive(id) {
    delete this._activeIDList[id];
    // console.log(`Removed ${id} from active list`);
  }

  // classFinishers[i] = {drivers: [], teams: []};
  /**
   * Contains keys of race classes
   * @typedef {Object.<string, ClassResults>} ClassFinishers
   */

  /**
   * @typedef {Object} ClassResults
   * @property {Array.<ClassFinisherDriver>} drivers
   * @property {Array.<ClassFinisherTeam>} teams
   */

  /**
   * @typedef {Object} ClassFinisherDriver
   * @property {string} name Driver name
   * @property {string} team Team ID
   * @property {number} time
   * @property {number} powerTime
   * @property {number} score
   */

  /**
   * @typedef {Object} ClassFinisherTeam
   * @property {string} id Team ID
   * @property {number} score Team score
   */
}

module.exports = ResultsManager;
