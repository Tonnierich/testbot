import { LogTypes } from "../../../constants/messages"
import { api_base } from "../../api/api-base"
import { contractStatus, info, log } from "../utils/broadcast"
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from "../utils/helpers"
import { BEFORE_PURCHASE, DURING_PURCHASE } from "./state/constants"
import { purchaseSuccessful } from "./state/actions" // Ensure this is imported

let delayIndex = 0
let purchase_reference

export default (Engine) =>
  class Purchase extends Engine {
    async _performSinglePurchase(contract_type, isBulkPurchase = false, tradeIndex = 0) {
      const purchaseAttemptId = `BulkTrade-${tradeIndex + 1}-${Date.now()}` // Unique ID for this specific purchase attempt
      log(LogTypes.PURCHASE, { message: `[${purchaseAttemptId}] Initiating single purchase for ${contract_type}.` })

      // This onSuccess will now only return the buy object, not dispatch state changes directly
      const onSuccess = (response) => {
        const { buy } = response
        log(LogTypes.PURCHASE, {
          message: `[${purchaseAttemptId}] API response received for purchase. Transaction ID: ${buy.transaction_id}`,
        })
        return buy // Return the buy object for collection in the main purchase method
      }

      const purchaseAction = async () => {
        if (this.is_proposal_subscription_required) {
          const { id, askPrice } = this.selectProposal(contract_type)
          contractStatus({
            id: "contract.purchase_sent",
            data: askPrice,
            message: `[${purchaseAttemptId}] Sending buy request for proposal ID: ${id}, price: ${askPrice}`,
          })
          return api_base.api.send({ buy: id, price: askPrice })
        } else {
          const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions)
          contractStatus({
            id: "contract.purchase_sent",
            data: this.tradeOptions.amount,
            message: `[${purchaseAttemptId}] Sending buy request for trade option: ${JSON.stringify(trade_option)}`,
          })
          return api_base.api.send(trade_option)
        }
      }

      this.isSold = false // This flag might need re-evaluation for bulk trades if it's meant to be per-trade

      if (!this.options.timeMachineEnabled) {
        return doUntilDone(purchaseAction).then(onSuccess)
      }

      return recoverFromError(
        purchaseAction,
        (errorCode, makeDelay) => {
          log(LogTypes.PURCHASE, { message: `[${purchaseAttemptId}] Recovering from error: ${errorCode}` })
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
        log(LogTypes.PURCHASE, { message: `Initiating ${numTrades} concurrent bulk purchases for ${contract_type}.` })
        const purchasePromises = []

        for (let i = 0; i < numTrades; i++) {
          // Initiate all _performSinglePurchase calls concurrently
          purchasePromises.push(
            this._performSinglePurchase(contract_type, true, i) // Pass true for isBulkPurchase and current index
              .then((buyObject) => ({ status: "fulfilled", value: buyObject, index: i })) // Return buy object on success
              .catch((error) => {
                console.error(`Bulk purchase ${i + 1} failed:`, error)
                return { status: "rejected", reason: error, index: i }
              }),
          )
        }

        log(LogTypes.PURCHASE, {
          message: `All ${numTrades} bulk purchase promises initiated. Waiting for them to settle...`,
        })

        // Wait for ALL concurrently initiated purchase promises to settle
        const allSettledResults = await Promise.allSettled(purchasePromises)
        log(LogTypes.PURCHASE, { message: `All bulk purchase promises settled. Processing results.` })

        const successfulBuys = []
        allSettledResults.forEach((result, i) => {
          if (result.status === "fulfilled") {
            const buy = result.value
            successfulBuys.push(buy)
            // Now, log and update status for each successful trade distinctly
            contractStatus({
              id: "contract.purchase_received",
              data: buy.transaction_id,
              buy,
              message: `Bulk Trade ${i + 1} (ID: ${buy.transaction_id}) received.`,
            })
            log(LogTypes.PURCHASE, {
              longcode: buy.longcode,
              transaction_id: buy.transaction_id,
              message: `Bulk Trade ${i + 1} successful.`,
            })
            info({
              accountID: this.accountInfo.loginid,
              totalRuns: this.updateAndReturnTotalRuns(), // This might need to be updated per successful trade or once per bulk operation
              transaction_ids: { buy: buy.transaction_id },
              contract_type,
              buy_price: buy.buy_price,
              message: `Info for Bulk Trade ${i + 1}`,
            })
          } else {
            log(LogTypes.PURCHASE, {
              message: `Bulk Trade ${i + 1} failed: ${result.reason?.message || result.reason}`,
            })
          }
        })

        // After all bulk purchases are processed, explicitly transition to DURING_PURCHASE.
        // This ensures the bot moves to the next phase only after all intended bulk trades are sent and processed.
        this.store.dispatch({ type: DURING_PURCHASE, payload: { isBulk: true } })
        // Also dispatch purchaseSuccessful for the overall bulk operation, if needed for other parts of the bot
        this.store.dispatch(purchaseSuccessful(true)) // Signal that a bulk purchase operation completed
        log(LogTypes.PURCHASE, { message: `Dispatched DURING_PURCHASE after bulk trades.` })

        return Promise.resolve(successfulBuys) // Return array of successful buy objects
      } else {
        log(LogTypes.PURCHASE, { message: `Initiating single purchase for ${contract_type}.` })
        // For single purchase, _performSinglePurchase will dispatch purchaseSuccessful(false) by default
        const buyObject = await this._performSinglePurchase(contract_type, false, 0)
        // For single trade, we still set contractId for backward compatibility if other parts of bot rely on it
        this.contractId = buyObject.contract_id
        return buyObject
      }
    }

    getPurchaseReference = () => purchase_reference
    regeneratePurchaseReference = () => {
      purchase_reference = getUUID()
    }
  }
