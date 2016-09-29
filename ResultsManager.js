/**
 * Created by Mikk on 27.09.2016.
 */

class ResultsManager {
  constructor(state) {
    this._state = state;
    this._activeIDList = {};
  }

  /**
   * Calculate points for a rally
   * @param {string} id Rally ID
   * @returns {Object} Class-separated list of finishers and their scores
   */
  calculateRallyResults(id) {
    if (this._activeIDList.hasOwnProperty(id)) {
      return;
    }
    this._activeIDList[id] = true;

    let rally = this._state.rallies[id];
    let season = this._state.seasons[rally.season];
    let stageCount = season.stages;
    let races = this._state.races[id];

    // let test = [];
    // for (let i in races) {
    //   if (races.hasOwnProperty(i)) {
    //     let result = races[i];
    //     if (result.userName === "KeryX") {
    //       test.push(result);
    //     }
    //   }
    // }

    let totalTimes = this._calculateTotalTimes(races);

    // pointList
    let points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    let pointsPower = [3, 2, 1];
    let finisherList = [];
    for (let i in races) {
      if (races.hasOwnProperty(i)) {
        let result = races[i];
        if (result.stage === stageCount && (result.time !== 900 && result.time !== 1800)) {
          finisherList.push(result);
        }
      }
    }
    let classFinishers = {};
    for (let i in season.classes) {
      if (season.classes.hasOwnProperty(i)) {
        classFinishers[i] = {drivers: [], teams: []};
      }
    }
    finisherList.forEach(result => {
      if (!this._state.nicks.hasOwnProperty(result.userName)) {
        // Driver has not registered
        return;
      }

      let driver = this._state.nicks[result.userName];
      let raceClass = ResultsManager._getClass(result.car, season);

      if (raceClass === null) {
        // Car is not listed as allowed
        return;
      }
      if (!ResultsManager._checkAssists(result.assists, raceClass, season)) {
        // Driver is using assists illegally
        return;
      }
      if (ResultsManager._checkDQ(driver, rally)) {
        // Driver is disqualified
        return;
      }

      let team = ResultsManager._getDriverTeam(driver, raceClass, rally);
      if (team === null) {
        // Driver has not registered a team
        return;
      }
      if (team.car !== result.car) {
        // Driver is using a car not assigned to the team
        return;
      }

      classFinishers[raceClass].drivers.push({
        name: driver,
        team: team,
        time: totalTimes[driver],
        powerTime: result.time,
        score: 0
      });
    });

    // Let's give out points
    for (let i in classFinishers) {
      if (classFinishers.hasOwnProperty(i)) {
        let raceClass = classFinishers[i].drivers;
        // Give points for finish time
        raceClass.sort(ResultsManager._totalTimeSorter);
        points.forEach((point, j) => {
          if (j < raceClass.length) {
            raceClass[j].score += point;
          }
        });
        // Give points for powerStage time
        raceClass.sort(ResultsManager._powerTimeSorter);
        pointsPower.forEach((point, j) => {
          if (j < raceClass.length) {
            raceClass[j].score += point;
          }
        });
        // Just sort the drivers by scores
        raceClass.sort(ResultsManager._scoreSorter);

        raceClass.forEach(driver => {
          let driverTeam = classFinishers[i].teams.find(team => {
            return team.name === driver.team.name;
          });
          if (typeof driverTeam === "undefined") {
            driverTeam = ResultsManager._getDriverTeam(driver.name, i, rally);
            classFinishers[i].teams.push({
              name: driverTeam.name,
              score: driver.score
            });
          } else {
            driverTeam.score += driver.score;
          }
        });
        classFinishers[i].teams.sort(ResultsManager._teamScoreSorter);
      }
    }

    this._removeActive(id);

    return classFinishers;
  }

  static _getDriverTeam(name, raceClass, rally) {
    let teams = rally.teams[raceClass];
    for (let team in teams) {
      if (teams.hasOwnProperty(team)) {
        if (teams[team].drivers.indexOf(name) >= 0) {
          let teamCopy = JSON.parse(JSON.stringify(teams[team]));
          teamCopy.name = team;
          return teamCopy;
        }
      }
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
      return ResultsManager._totalTimeSorter(result1, result2);
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
   * @param {Object} races Race results
   * @returns {Object} List of total times by driver
   * @private
   */
  _calculateTotalTimes(races) {
    let totals = {};
    for (let i in races) {
      if (races.hasOwnProperty(i)) {
        let race = races[i];
        if (this._state.nicks.hasOwnProperty(race.userName)) {
          totals[this._state.nicks[race.userName]] = (totals[this._state.nicks[race.userName]] || 0) + race.time;
        }
      }
    }
    return totals;
  }

  /**
   * Check if a driver is disqualified from a rally
   * @param {string} driver Driver name
   * @param {Object} rally Rally to check for
   * @returns {boolean} True, if driver is disqualified
   * @private
   */
  static _checkDQ(driver, rally) {
    for (let i in rally.penalties) {
      if (rally.penalties.hasOwnProperty(i)) {
        let penalty = rally.penalties[i];
        if (penalty.driver === driver && penalty.hasOwnProperty("dq") && penalty.dq === true) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if assists usage is ok
   * @param {boolean} assists Assists used or not
   * @param {string} className Class the driver drove in
   * @param {Object} season Season to check against
   * @returns {boolean} True, if check is passed
   * @private
   */
  static _checkAssists(assists, className, season) {
    if (typeof season.classes[className].assists === "undefined") {
      return true;
    }
    return !(assists === true && season.classes[className].assists === false);
  }

  /**
   * Gets a car class or null
   * @param {string} car Car name
   * @param {Object} season Season to check against
   * @returns {string|null} Class id or null if not found
   * @private
   */
  static _getClass(car, season) {
    let raceClass = null;
    let classes = season.classes;
    for (let seasonClass in classes) {
      if (classes.hasOwnProperty(seasonClass)) {
        let testClass = classes[seasonClass];
        if (testClass.cars.indexOf(car) >= 0) {
          raceClass = seasonClass;
        }
      }
    }
    return raceClass;
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
}

module.exports = ResultsManager;
