import * as constants from "../constants"

const initialState = {
  scope: constants.STOP,
  proposalsReady: false,
}

// eslint-disable-next-line default-param-last
const signal = (state = initialState, action) => {
  switch (action.type) {
    case constants.START:
      return {
        scope: constants.BEFORE_PURCHASE,
        proposalsReady: state.proposalsReady,
      }
    case constants.PROPOSALS_READY:
      return {
        ...state,
        proposalsReady: true,
      }
    case constants.CLEAR_PROPOSALS:
      return {
        ...state,
        proposalsReady: false,
      }
    case constants.PURCHASE_SUCCESSFUL:
      // Modified: Only change scope to DURING_PURCHASE if it's not a bulk purchase.
      // For bulk purchases, the scope remains BEFORE_PURCHASE until all trades are initiated
      // and the Purchase service explicitly dispatches DURING_PURCHASE.
      return {
        scope: action.payload?.isBulk ? state.scope : constants.DURING_PURCHASE,
        openContract: false,
        proposalsReady: state.proposalsReady,
      }
    case constants.OPEN_CONTRACT:
      return {
        scope: constants.DURING_PURCHASE,
        openContract: true,
        proposalsReady: state.proposalsReady,
      }
    case constants.SELL:
      return {
        scope: constants.STOP,
        proposalsReady: state.proposalsReady,
      }
    case constants.NEW_TICK:
      return {
        ...state,
        newTick: action.payload,
      }
    default:
      return state
  }
}

export default signal
