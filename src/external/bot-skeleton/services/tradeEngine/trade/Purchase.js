import { LogTypes } from "../../../constants/messages"
import { api_base } from "../../api/api-base"
import { contractStatus, info, log } from "../utils/broadcast"
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from "../utils/helpers"
import { purchaseSuccessful } from "./state/actions"
import { BEFORE_PURCHASE, DURING_PURCHASE } from "./state/constants"

let delayIndex = 0
let purchase_reference

export default (Engine) =>
  class Purchase extends Engine {
    async _performSinglePurchase(contract_type, isBulkPurchase = false) {
      console.log(`_performSinglePurchase: Starting for ${contract_type}, isBulkPurchase: ${isBulkPurchase}`)
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
        console.log(
          `_performSinglePurchase: Dispatched purchaseSuccessful(${isBulkPurchase}). Current scope after dispatch:`,
          this.store.getState().scope,
        )

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
        console.log(`_performSinglePurchase: Completed for ${contract_type}`)
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

    async purchase(contract_type, options = {}) {
      console.log("Purchase: Method called. Initial scope:", this.store.getState().scope)
      console.log("Purchase: Received options:", options) // New log
      console.log("Purchase: Type of options:", typeof options) // New log
      console.log("Purchase: Is options an object?", options && typeof options === "object" && !Array.isArray(options)) // New log

      if (this.store.getState().scope !== BEFORE_PURCHASE) {
        console.log("Purchase: Initial scope check failed. Exiting. Current scope:", this.store.getState().scope)
        return Promise.resolve()
      }

      // Changed from destructuring to direct property access with nullish coalescing
      const allowBulk = options?.allowBulk ?? false
      const numTrades = options?.numTrades ?? 1

      console.log("Purchase: Extracted allowBulk:", allowBulk, "numTrades:", numTrades) // New log

      if (allowBulk && numTrades > 1) {
        log(LogTypes.PURCHASE, { message: `Initiating ${numTrades} bulk purchases for ${contract_type}` })
        const purchaseResults = []

        for (let i = 0; i < numTrades; i++) {
          console.log(
            `Purchase: Loop iteration ${i + 1}/${numTrades}. Current scope before _performSinglePurchase:`,
            this.store.getState().scope,
          )
          try {
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500))
              console.log(
                `Purchase: Delay finished for iteration ${i + 1}. Current scope:`,
                this.store.getState().scope,
              )
            }
            const result = await this._performSinglePurchase(contract_type, true) // Pass true for isBulkPurchase
            purchaseResults.push({ status: "fulfilled", value: result })
            log(LogTypes.PURCHASE, { message: `Bulk purchase ${i + 1} successful.` })
            console.log(
              `Purchase: _performSinglePurchase completed for iteration ${i + 1}. Current scope:`,
              this.store.getState().scope,
            )
          } catch (error) {
            purchaseResults.push({ status: "rejected", reason: error })
            log(LogTypes.PURCHASE, { message: `Bulk purchase ${i + 1} failed: ${error.message || error}` })
            console.error(`Purchase: _performSinglePurchase failed for iteration ${i + 1}. Error:`, error)
            // Decide if you want to stop all further purchases on first error
            // For now, it will continue trying remaining trades.
          }
        }
        // After all bulk purchases are initiated, explicitly transition to DURING_PURCHASE
        this.store.dispatch({ type: DURING_PURCHASE, payload: { isBulk: true } })
        console.log("Purchase: All bulk purchases attempted. Final scope set to DURING_PURCHASE.")
        return Promise.resolve(purchaseResults)
      } else {
        console.log("Purchase: Performing single trade.")
        // For single purchase, _performSinglePurchase will dispatch purchaseSuccessful(false) by default
        return this._performSinglePurchase(contract_type)
      }
    }

    getPurchaseReference = () => purchase_reference
    regeneratePurchaseReference = () => {
      purchase_reference = getUUID()
    }
  }
