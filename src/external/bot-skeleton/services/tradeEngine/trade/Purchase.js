import { LogTypes } from "../../../constants/messages"
import { api_base } from "../../api/api-base"
import { contractStatus, info, log } from "../utils/broadcast"
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from "../utils/helpers"
import { purchaseSuccessful } from "./state/actions" // Import purchaseSuccessful
import { BEFORE_PURCHASE, DURING_PURCHASE } from "./state/constants" // Import DURING_PURCHASE

let delayIndex = 0
let purchase_reference

export default (Engine) =>
  class Purchase extends Engine {
    async _performSinglePurchase(contract_type, isBulkPurchase = false) {
      // Added isBulkPurchase parameter
      const onSuccess = (response) => {
        const { buy } = response
        contractStatus({
          id: "contract.purchase_received",
          data: buy.transaction_id,
          buy,
        })
        this.contractId = buy.contract_id
        // Pass the isBulkPurchase flag to the action
        this.store.dispatch(purchaseSuccessful(isBulkPurchase))
        if (this.is_proposal_subscription_required) {
          this.renewProposalsOnPurchase()
        }
        delayIndex = 0
        log(LogTypes.PURCHASE, { longcode: buy.longcode, transaction_id: buy.transaction_id })
        info({
          accountID: this.accountInfo.loginid,
          totalRuns: this.updateAndReturnTotalRuns(),
          transaction_ids: { buy: buy.transaction_id },
          contract_type,
          buy_price: buy.buy_price,
        })
        return buy
      }

      if (this.is_proposal_subscription_required) {
        const { id, askPrice } = this.selectProposal(contract_type)
        const action = () => api_base.api.send({ buy: id, price: askPrice })
        this.isSold = false
        contractStatus({
          id: "contract.purchase_sent",
          data: askPrice,
        })
        if (!this.options.timeMachineEnabled) {
          return doUntilDone(action).then(onSuccess)
        }
        return recoverFromError(
          action,
          (errorCode, makeDelay) => {
            if (errorCode !== "DisconnectError") {
              this.renewProposalsOnPurchase()
            } else {
              this.clearProposals()
            }
            const unsubscribe = this.store.subscribe(() => {
              const { scope, proposalsReady } = this.store.getState()
              if (scope === BEFORE_PURCHASE && proposalsReady) {
                makeDelay().then(() => this.observer.emit("REVERT", "before"))
                unsubscribe()
              }
            })
          },
          ["PriceMoved", "InvalidContractProposal"],
          delayIndex++,
        ).then(onSuccess)
      }

      const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions)
      const action = () => api_base.api.send(trade_option)
      this.isSold = false
      contractStatus({
        id: "contract.purchase_sent",
        data: this.tradeOptions.amount,
      })
      if (!this.options.timeMachineEnabled) {
        return doUntilDone(action).then(onSuccess)
      }
      return recoverFromError(
        action,
        (errorCode, makeDelay) => {
          if (errorCode === "DisconnectError") {
            this.clearProposals()
          }
          const unsubscribe = this.store.subscribe(() => {
            const { scope } = this.store.getState()
            if (scope === BEFORE_PURCHASE) {
              makeDelay().then(() => this.observer.emit("REVERT", "before"))
              unsubscribe()
            }
          })
        },
        ["PriceMoved", "InvalidContractProposal"],
        delayIndex++,
      ).then(onSuccess)
    }

    async purchase(contract_type, options = {}) {
      if (this.store.getState().scope !== BEFORE_PURCHASE) {
        return Promise.resolve()
      }

      const { allowBulk = false, numTrades = 1 } = options

      if (allowBulk && numTrades > 1) {
        log(LogTypes.PURCHASE, { message: `Initiating ${numTrades} bulk purchases for ${contract_type}` })
        const purchaseResults = []
        for (let i = 0; i < numTrades; i++) {
          try {
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500))
            }
            // Pass true to _performSinglePurchase to indicate it's part of a bulk operation
            const result = await this._performSinglePurchase(contract_type, true)
            purchaseResults.push({ status: "fulfilled", value: result })
            log(LogTypes.PURCHASE, { message: `Bulk purchase ${i + 1} successful.` })
          } catch (error) {
            purchaseResults.push({ status: "rejected", reason: error })
            log(LogTypes.PURCHASE, { message: `Bulk purchase ${i + 1} failed: ${error.message || error}` })
          }
        }
        // After all bulk purchases are initiated, explicitly transition to DURING_PURCHASE
        // This assumes that the bot's logic expects to be in DURING_PURCHASE after purchases.
        // If this causes issues, we might need a more nuanced state management.
        this.store.dispatch({ type: DURING_PURCHASE, payload: { isBulk: true } }) // Force transition for the overall state
        return Promise.resolve(purchaseResults)
      } else {
        // For single purchase, _performSinglePurchase will dispatch purchaseSuccessful(false) by default
        return this._performSinglePurchase(contract_type)
      }
    }

    getPurchaseReference = () => purchase_reference
    regeneratePurchaseReference = () => {
      purchase_reference = getUUID()
    }
  }
