import { LogTypes } from "../../../constants/messages"
import { api_base } from "../../api/api-base"
import { contractStatus, info, log } from "../utils/broadcast"
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from "../utils/helpers"
import { purchaseSuccessful } from "./state/actions"
import { BEFORE_PURCHASE } from "./state/constants"

let delayIndex = 0
let purchase_reference

export default (Engine) =>
  class Purchase extends Engine {
    // New helper method to encapsulate the logic for a single purchase
    async _performSinglePurchase(contract_type) {
      const onSuccess = (response) => {
        const { buy } = response
        contractStatus({
          id: "contract.purchase_received",
          data: buy.transaction_id,
          buy,
        })
        this.contractId = buy.contract_id
        this.store.dispatch(purchaseSuccessful())
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
        return buy // Return the buy object for further processing if needed
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

    // Modified purchase method to handle bulk options
    async purchase(contract_type, options = {}) {
      // Prevent calling purchase twice
      if (this.store.getState().scope !== BEFORE_PURCHASE) {
        return Promise.resolve()
      }

      const { allowBulk = false, numTrades = 1 } = options

      if (allowBulk && numTrades > 1) {
        log(LogTypes.PURCHASE, { message: `Initiating ${numTrades} bulk purchases for ${contract_type}` })
        const purchaseResults = []
        for (let i = 0; i < numTrades; i++) {
          try {
            // Add a small delay between purchases to avoid potential rate limits
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500)) // 500ms delay
            }
            const result = await this._performSinglePurchase(contract_type)
            purchaseResults.push({ status: "fulfilled", value: result })
            log(LogTypes.PURCHASE, { message: `Bulk purchase ${i + 1} successful.` })
          } catch (error) {
            purchaseResults.push({ status: "rejected", reason: error })
            log(LogTypes.PURCHASE, { message: `Bulk purchase ${i + 1} failed: ${error.message || error}` })
            // Decide if you want to stop all further purchases on first error
            // For now, it will continue trying remaining trades.
          }
        }
        // You might want to return a summary of all purchases or the first successful one
        // For simplicity, we'll just resolve after all attempts.
        return Promise.resolve(purchaseResults)
      } else {
        // If not bulk, perform a single purchase using the refactored method
        return this._performSinglePurchase(contract_type)
      }
    }

    getPurchaseReference = () => purchase_reference
    regeneratePurchaseReference = () => {
      purchase_reference = getUUID()
    }
  }
