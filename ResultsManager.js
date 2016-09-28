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
   */
  calculateRallyResults(id) {
    if (this._activeIDList.hasOwnProperty(id)) {
      return;
    }
    this._activeIDList[id] = true;

    this._removeActive(id);
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
