/**
 * Created by Mikk on 10.09.2016.
 */
"use strict";

const http = require("https");

class DirtClient {
  constructor() {
    this._activeIDList = {};
  }

  /**
   * Fetch data from Dirt API
   * @param {number} id Event ID
   * @returns {Promise.<EventData>|undefined} Event data Promise
   */
  fetchData(id) {
    /**
     * @type {EventData}
     */
    const eventData = {
      id: id,
      stages: [],
      requestCount: 1,
      timeTotal: 0,
      timeReal: 0,
      overallResponse: undefined,
      assisted: [],
      timestamp: undefined
    };
    const start = Date.now();

    return new Promise((resolve, reject) => {
      // fetch overall page
      // then fetch more stages according to TotalStages with delays
      // then combine data

      if (this._activeIDList.hasOwnProperty(String(id))) {
        reject(new Error(`DirtClient already busy with fetching data for ${id}.`));
        return;
      }

      this._activeIDList[String(id)] = true;

      DirtClient._fetchAPI([id]).then(data => {
        eventData.overallResponse = data;
        const stageCount = data.response.TotalStages;
        const stagePromises = [];
        for (let stageNumber = 1; stageNumber <= stageCount; stageNumber++) {
          stagePromises.push(new Promise((stageResolve, stageReject) => {
            DirtClient._fetchAPI([id, stageNumber]).then(stageData => {
              this._processStage(stageResolve, stageReject, stageData);
            }).catch(err => {
              stageReject(err);
            });
          }));
        }
        Promise.all(stagePromises).then(/** Array.<StageData> */results => { // eslint-disable-line valid-jsdoc
          // combine results
          eventData.timeReal = Date.now() - start;
          console.log(`${eventData.id} fetched in ${(eventData.timeReal / 1000).toFixed(1)} seconds`);
          results.forEach(stage => {
            eventData.stages[stage.stage - 1] = stage;
            eventData.requestCount += stage.requestCount;
            eventData.timeTotal += stage.timeTotal;
          });

          if (eventData.overallResponse.response.TotalStages !== eventData.stages.length) {
            reject(new Error(`Stages array length (${eventData.overallResponse.response.TotalStages
                }) does not equal intended length (${eventData.stages.length})`));
          }
        }).then(() => {
          const assistPromise = new Promise((assistsResolve, assistsReject) => {
            DirtClient._fetchAPI([id, 0, 1, true]).then(assistsData => {
              this._processAssists(assistsResolve, assistsReject, assistsData);
            });
          });
          assistPromise.then(assistResponse => {
            eventData.assisted = assistResponse.assistList;
            eventData.requestCount += assistResponse.requestCount;
            eventData.timeTotal += assistResponse.timeTotal;
            eventData.timestamp = (new Date()).toJSON();
            resolve(eventData);
            this._removeActive(id);
          }).catch(err => {
            this._removeActive(id);
            reject(err);
          });
        }).catch(err => {
          // console.log(err);
          this._removeActive(id);
          reject(err);
        });
      }).catch(err => {
        this._removeActive(id);
        reject(err);
      });
    });
  }

  /**
   * Removes event ID from the list of active fetch jobs
   * @param {number} id Event ID
   * @private
   */
  _removeActive(id) {
    delete this._activeIDList[String(id)];
    // console.log(`Removed ${id} from active list`);
  }

  /**
   * Check for people having used assists and return that list
   * @param {ResolveCallback} resolve Resolve callback
   * @param {RejectedCallback} reject Rejected callback
   * @param {APIResponseContainer} data API Response container
   * @private
   */
  _processAssists(resolve, reject, data) {
    const assistResponse = {
      assistList: [],
      timeTotal: data.responseTime,
      requestCount: 1
    };
    data.response.Entries.forEach(entry => {
      assistResponse.assistList.push(entry.Name);
    });

    const pagePromises = [];
    for (let pageNumber = 2; pageNumber <= data.response.Pages; pageNumber++) {
      pagePromises.push(new Promise((pageResolve, pageReject) => {
        DirtClient._fetchAPI([data.id, data.stage, pageNumber, true]).then(pageData => {
          // console.log(`Stage ${pageData.stage} page ${pageData.page} fetched`);
          pageResolve(pageData);
        }).catch(err => {
          pageReject(err);
        });
      }));
    }
    Promise.all(pagePromises).then(/** Array.<APIResponseContainer> */results => { // eslint-disable-line valid-jsdoc
      results.forEach(pageData => {
        assistResponse.requestCount++;
        assistResponse.timeTotal += pageData.responseTime;
        pageData.response.Entries.forEach(entry => {
          assistResponse.assistList.push(entry.Name);
        });
      });
      resolve(assistResponse);
    }).catch(err => {
      reject(err);
    });
  }

  /**
   * Fetch additional pages and return them all at once
   * @param {ResolveCallback} resolve Resolve callback
   * @param {RejectedCallback} reject Rejected callback
   * @param {APIResponseContainer} data API Response container
   * @private
   */
  _processStage(resolve, reject, data) {
    // console.log(`_processStage: ID: ${data.id}, stage: ${data.stage}, page: ${data.page}`);

    /**
     * @type {StageData}
     */
    const stageData = {
      stage: data.stage,
      requestCount: 1,
      pageCount: data.response.Pages,
      timeTotal: data.responseTime,
      pages: [data],
      singlePage: undefined
    };

    const pagePromises = [];
    for (let pageNumber = 2; pageNumber <= stageData.pageCount; pageNumber++) {
      pagePromises.push(new Promise((pageResolve, pageReject) => {
        DirtClient._fetchAPI([data.id, data.stage, pageNumber]).then(pageData => {
          // console.log(`Stage ${pageData.stage} page ${pageData.page} fetched`);
          pageResolve(pageData);
        }).catch(err => {
          pageReject(err);
        });
      }));
    }
    Promise.all(pagePromises).then(/** Array.<APIResponseContainer> */results => { // eslint-disable-line valid-jsdoc
      // console.log(`Stage ${stageData.stage} finished`);
      results.forEach(pageData => {
        stageData.pages[pageData.page - 1] = pageData;
        stageData.requestCount++;
        stageData.timeTotal += pageData.responseTime;
      });

      stageData.pages.forEach(/** APIResponseContainer */page => { // eslint-disable-line valid-jsdoc
        if (page.page === 1) {
          stageData.singlePage = page.response;
        } else {
          stageData.singlePage.Entries = stageData.singlePage.Entries.concat(page.response.Entries);
        }
      });
      delete stageData.pages;

      if (stageData.singlePage.LeaderboardTotal !== stageData.singlePage.Entries.length) {
        reject(new Error("Entries count does not equal LeaderboardTotal"));
        return;
      }

      resolve(stageData);
    }).catch(err => {
      reject(err);
    });
  }

  /**
   * Executes the API call and returns the response
   * @param {number} id Event ID
   * @param {number} stage Stage number
   * @param {number} page Page number
   * @param {boolean} assists Assists check enabled/disabled
   * @returns {Promise.<APIResponseContainer>} JSON response from API
   * @private
   */
  static _fetchAPI([id, stage = 0, page = 1, assists = false]) {
    // console.log(`Values: ID: ${id}, stage: ${stage}, page: ${page}`);
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const req = http.get(`https://www.dirtgame.com/uk/api/event?assists=${assists ? "enabled" : "any"}&eventId=${id
          }&leaderboard=true&noCache=${Date.now()}&stageId=${stage}&page=${page}`, res => {
        let body = "";
        res.on("data", chunk => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            /** @type {APIResponse} */
            const data = JSON.parse(body);
            if (data.EventName === null) {
              reject(new Error("Empty response from RaceNet"));
              return;
            }
            resolve({
              id: id,
              stage: stage,
              page: page,
              responseTime: Date.now() - startTime,
              response: data
            });
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", err => {
          reject(err);
        });
      });

      req.on("error", err => {
        reject(err);
      });
    });
  }

  /**
   * API Response container
   * @typedef {Object} APIResponseContainer
   * @property {number} id Event ID
   * @property {number} stage Stage number
   * @property {number} page Page number
   * @property {number} responseTime Time spent on the request
   * @property {APIResponse} response API Response
   */

  /**
   * API Response
   * @typedef {Object} APIResponse
   * @property {String} EventName
   * @property {number} TotalStages
   * @property {boolean} ShowStageInfo
   * @property {string} LocationName
   * @property {string} LocationImage
   * @property {string} StageName
   * @property {string} StageImage
   * @property {string} TimeOfDay
   * @property {string} WeatherImageUrl
   * @property {string} WeatherImageAltUrl
   * @property {string} WeatherText
   * @property {Object} Restriction
   * @property {boolean} EventRestart
   * @property {boolean} StageRetry
   * @property {boolean} HasServiceArea
   * @property {boolean} AllowCareerEngineers
   * @property {boolean} OnlyOwnedVehicles
   * @property {boolean} AllowVehicleTuning
   * @property {boolean} IsCheckpoint
   * @property {*} PlayerEntry
   * @property {number} Page
   * @property {number} Pages
   * @property {number} LeaderboardTotal
   * @property {Array.<Entries>} Entries
   */

  /**
   * Entry in the API Response
   * @typedef {Object} Entries
   * @property {number} Position
   * @property {string} NationalityImage
   * @property {boolean} IsFounder
   * @property {boolean} IsVIP
   * @property {boolean} HasGhost
   * @property {number} PlayerId
   * @property {string} Name
   * @property {string} VehicleName
   * @property {string} Time
   * @property {string} DiffFirst
   * @property {number} PlayerDiff
   * @property {number} TierID
   * @property {string} ProfileUrl
   */

  /**
   * Stage container
   * @typedef {Object} StageData
   * @property {number} stage
   * @property {number} requestCount
   * @property {number} pageCount
   * @property {number} timeTotal
   * @property {Array.<APIResponseContainer>} pages
   * @property {APIResponse} singlePage
   */

  /**
   * Container for response data before saving
   * @typedef {Object} EventData
   * @property {number} id Event ID
   * @property {Array.<StageData>} stages Array of stages
   * @property {number} requestCount Amount of requests made
   * @property {number} timeTotal Total sum of time taken for each request separately
   * @property {number} timeReal Actual time from first start of first request to finishing the last request
   * @property {APIResponseContainer|undefined} overallResponse API Response for stage 0 (overall) page 1
   * @property {Array.<string>} assisted List of people having assists enabled
   * @property {string|number|undefined} timestamp Response data timestamp
   */

  /**
   * @callback ResolveCallback
   * @param {*} result
   */

  /**
   * @callback RejectedCallback
   * @param {Error} reason - Rejected reason
   */
}

module.exports = DirtClient;
