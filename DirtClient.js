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
   * @return {Promise.<EventData>|undefined} Event data Promise
   */
  fetchData(id) {
    if (this._activeIDList.hasOwnProperty(String(id))) {
      return;
    }

    this._activeIDList[String(id)] = true;

    /**
     * @type {EventData}
     */
    let eventData = {
      id: id,
      totalTime: 0,
      startTime: Date.now(),
      stages: [],
      requestCount: 1,
      timeTotal: 0,
      timeReal: 0,
      stageCount: null,
      ssFinished: null
    };
    let start = Date.now();

    return new Promise((resolve, reject) => {
      // fetch overall page
      // then fetch more stages according to TotalStages with delays
      // then combine data

      DirtClient._fetchAPI([id]).then(data => {
        let stageCount = data.response.TotalStages;
        let stagePromises = [];
        for (let stageNumber = 1; stageNumber <= stageCount; stageNumber++) {
          stagePromises.push(new Promise((stageResolve, stageReject) => {
            eventData.requestCount++;
            DirtClient._fetchAPI([id, stageNumber]).then(stageData => {
              this._processStage(stageResolve, stageReject, stageData);
            }).catch(err => {
              stageReject(err);
            });
          }));
        }
        Promise.all(stagePromises).then(/** Array.<StageData> */ results => {
          // combine results
          console.log("All stages fetched");
          eventData.timeReal = Date.now() - start;
          results.forEach(stage => {
            eventData.stages[stage.stage - 1] = stage;
            eventData.requestCount += stage.requestCount;
            eventData.timeTotal += stage.timeTotal;
          });
          resolve(eventData);
        }).catch(err => {
          console.log(err);
        });
      }, err => {
        reject(err);
      });
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
    let stageData = {
      stage: data.stage,
      requestCount: 1,
      pageCount: data.response.Pages,
      timeTotal: 0,
      timeReal: 0,
      pages: [data]
    };
    let start = Date.now();

    let pagePromises = [];
    for (let pageNumber = 2; pageNumber <= stageData.pageCount; pageNumber++) {
      pagePromises.push(new Promise((pageResolve, pageReject) => {
        stageData.requestCount++;
        DirtClient._fetchAPI([data.id, data.stage, pageNumber]).then(pageData => {
          console.log(`Stage ${pageData.stage} page ${pageData.page} fetched`);
          pageResolve(pageData);
        }).catch(err => {
          pageReject(err);
        });
      }));
    }
    Promise.all(pagePromises).then(/** Array.<APIResponseContainer> */ results => {
      console.log(`Stage ${stageData.stage} finished`);
      stageData.timeReal = Date.now() - start;
      results.forEach(pageData => {
        stageData.pages[pageData.page - 1] = pageData;
        stageData.timeTotal += pageData.responseTime;
      });

      stageData.pages.forEach(/** APIResponseContainer */ page => {
        if (page.page === 1) {
          stageData.singlePage = page.response;
        } else {
          stageData.singlePage.Entries = stageData.singlePage.Entries.concat(page.response.Entries);
        }
      });
      delete stageData.pages;

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
   * @return {Promise.<APIResponseContainer>} JSON response from API
   * @private
   */
  static _fetchAPI([id, stage = 0, page = 1]) {
    // console.log(`Values: ID: ${id}, stage: ${stage}, page: ${page}`);
    return new Promise((resolve, reject) => {
      let startTime = Date.now();
      http.get(`https://www.dirtgame.com/uk/api/event?assists=any&eventId=${id
          }&leaderboard=true&noCache=${Date.now()}&stageId=${stage}&page=${page}`, res => {
        let body = "";
        res.on("data", chunk => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            let data = JSON.parse(body);
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
   * @property {string} EventName
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
   * @property {number} timeReal
   * @property {Array.<APIResponseContainer>|undefined} pages
   * @property {APIResponse|undefined} singlePage
   */

  /**
   * Container for response data before saving
   * @typedef {Object} EventData
   * @property {number} id - Event ID
   * @property {number} totalTime - Total cumulative time taken for each request
   * @property {number} startTime - Time of beginning the update
   * @property {Array.<StageData>} stages - Array of stages
   * @property {number} requestCount - Amount of requests made
   * @property {number} timeTotal
   * @property {number} timeReal
   * @property {number|null} stageCount - Amount of stages
   * @property {number|null} ssFinished - Amount of processed stages
   */

  /**
   * @callback ResolveCallback
   * @param {T} result
   * @template T
   */

  /**
   * @callback RejectedCallback
   * @param {Error} reason - Rejected reason
   * @returns {S}
   * @template S
   */
}

module.exports = DirtClient;
