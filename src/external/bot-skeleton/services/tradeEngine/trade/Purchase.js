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
    async _performSinglePurchase(contract_type, isBulkPurchase = false, tradeIndex = 0) {
      const purchaseId = `Trade-${tradeIndex + 1}-${Date.now()}` // Unique ID for logging this specific purchase attempt
      log(LogTypes.PURCHASE, { message: `[${purchaseId}] Preparing single purchase for ${contract_type}.` })

      const onSuccess = (response) => {
        const { buy } = response
        contractStatus({
          id: "contract.purchase_received",
          data: buy.transaction_id,
          buy,
        })
        this.contractId = buy.contract_id
        this.store.dispatch(purchaseSuccessful(isBulkPurchase))
        if (this.is_proposal_subscription_required) {
          this.renewProposalsOnPurchase()
        }
        delayIndex = 0
        log(LogTypes.PURCHASE, {
          longcode: buy.longcode,
          transaction_id: buy.transaction_id,
          message: `[${purchaseId}] Purchase successful.`,
        })
        info({
          accountID: this.accountInfo.loginid,
          totalRuns: this.updateAndReturnTotalRuns(),
          transaction_ids: { buy: buy.transaction_id },
          contract_type,
          buy_price: buy.buy_price,
        })
        return buy // Return the buy object for further processing if needed
      }

      const purchaseAction = async () => {
        if (this.is_proposal_subscription_required) {
          const { id, askPrice } = this.selectProposal(contract_type)
          log(LogTypes.PURCHASE, {
            message: `[${purchaseId}] Sending buy request for proposal ID: ${id}, price: ${askPrice}`,
          })
          return api_base.api.send({ buy: id, price: askPrice })
        } else {
          const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions)
          log(LogTypes.PURCHASE, {
            message: `[${purchaseId}] Sending buy request for trade option: ${JSON.stringify(trade_option)}`,
          })
          return api_base.api.send(trade_option)
        }
      }

      this.isSold = false
      contractStatus({
        id: "contract.purchase_sent",
        data: this.tradeOptions.amount, // Or askPrice if proposal-based
      })

      if (!this.options.timeMachineEnabled) {
        log(LogTypes.PURCHASE, { message: `[${purchaseId}] Executing doUntilDone for purchase.` })
        return doUntilDone(purchaseAction).then(onSuccess)
      }

      log(LogTypes.PURCHASE, { message: `[${purchaseId}] Executing recoverFromError for purchase.` })
      return recoverFromError(
        purchaseAction,
        (errorCode, makeDelay) => {
          log(LogTypes.PURCHASE, { message: `[${purchaseId}] Recovering from error: ${errorCode}` })
          if (errorCode === "DisconnectError") {
            this.clearProposals()
          } else if (this.is_proposal_subscription_required && errorCode !== "DisconnectError") {
            this.renewProposalsOnPurchase()
          }
          const unsubscribe = this.store.subscribe(() => {
            const { scope, proposalsReady } = this.store.getState()
            if (scope === BEFORE_PURCHASE && (!this.is_proposal_subscription_required || proposalsReady)) {
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
        log(LogTypes.PURCHASE, {
          message: `Purchase called but scope is not BEFORE_PURCHASE. Current scope: ${this.store.getState().scope}`,
        })
        return Promise.resolve()
      }

      const allowBulk = options?.allowBulk ?? false
      const numTrades = options?.numTrades ?? 1

      if (allowBulk && numTrades > 1) {
        log(LogTypes.PURCHASE, { message: `Initiating ${numTrades} bulk purchases for ${contract_type}.` })
        const purchasePromises = []

        for (let i = 0; i < numTrades; i++) {
          // CRITICAL: No await here. All _performSinglePurchase calls are initiated concurrently.
          purchasePromises.push(
            this._performSinglePurchase(contract_type, true, i) // Pass true for isBulkPurchase and current index
              .then((result) => {
                log(LogTypes.PURCHASE, { message: `Bulk purchase ${i + 1} promise fulfilled.` })
                return { status: "fulfilled", value: result }
              })
              .catch((error) => {
                log(LogTypes.PURCHASE, {
                  message: `Bulk purchase ${i + 1} promise rejected: ${error.message || error}`,
                })
                console.error(`Purchase: _performSinglePurchase failed for iteration ${i + 1}. Error:`, error)
                return { status: "rejected", reason: error }
              }),
          )
        }

        log(LogTypes.PURCHASE, {
          message: `All ${numTrades} bulk purchase promises initiated. Waiting for them to settle...`,
        })
        // Wait for ALL concurrently initiated purchase promises to settle (either fulfilled or rejected).
        const purchaseResults = await Promise.allSettled(purchasePromises)
        log(LogTypes.PURCHASE, { message: `All bulk purchase promises settled. Results:`, results: purchaseResults })

        // After all bulk purchases are initiated, explicitly transition to DURING_PURCHASE.
        this.store.dispatch({ type: DURING_PURCHASE, payload: { isBulk: true } })
        log(LogTypes.PURCHASE, { message: `Dispatched DURING_PURCHASE after bulk trades.` })
        return Promise.resolve(purchaseResults)
      } else {
        log(LogTypes.PURCHASE, { message: `Initiating single purchase for ${contract_type}.` })
        return this._performSinglePurchase(contract_type, false, 0)
      }
    }

    getPurchaseReference = () => purchase_reference
    regeneratePurchaseReference = () => {
      purchase_reference = getUUID()
    }
  }
