import { LogTypes } from "../../../constants/messages"
import { api_base } from "../../api/api-base"
import { contractStatus, info, log } from "../utils/broadcast"
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from "../utils/helpers"
import { BEFORE_PURCHASE, DURING_PURCHASE } from "./state/constants"
import { purchaseSuccessful } from "./state/actions"

let delayIndex = 0
let purchase_reference

export default (Engine) =>
  class Purchase extends Engine {
    async _performSinglePurchase(contract_type, isBulkPurchase = false, tradeIndex = 0) {
      const purchaseAttemptId = `BulkTrade-${tradeIndex + 1}-${Date.now()}`
      log(LogTypes.PURCHASE, { message: `[${purchaseAttemptId}] Initiating single purchase for ${contract_type}.` })

      const onSuccess = (response) => {
        const { buy } = response
        log(LogTypes.PURCHASE, {
          message: `[${purchaseAttemptId}] API response received for purchase. Raw buy object: ${JSON.stringify(buy, null, 2)}`,
        })
        return buy
      }

      const purchaseAction = async () => {
        if (this.is_proposal_subscription_required) {
          const { id, askPrice } = this.selectProposal(contract_type)
          contractStatus({
            id: "contract.purchase_request_sent", // CRITICAL CHANGE: New ID for sending status
            data: askPrice,
            message: `[${purchaseAttemptId}] Sending buy request for proposal ID: ${id}, price: ${askPrice}`,
          })
          return api_base.api.send({ buy: id, price: askPrice })
        } else {
          const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions)
          contractStatus({
            id: "contract.purchase_request_sent", // CRITICAL CHANGE: New ID for sending status
            data: this.tradeOptions.amount,
            message: `[${purchaseAttemptId}] Sending buy request for trade option: ${JSON.stringify(trade_option)}`,
          })
          return api_base.api.send(trade_option)
        }
      }

      this.isSold = false

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
      console.log("DEBUG: Purchase method called with options:", options)
      const allowBulk = options?.allowBulk ?? false
      const numTrades = options?.numTrades ?? 1
      console.log(`DEBUG: allowBulk: ${allowBulk}, numTrades: ${numTrades}`)

      if (this.store.getState().scope !== BEFORE_PURCHASE) {
        log(LogTypes.PURCHASE, {
          message: `Purchase called but scope is not BEFORE_PURCHASE. Current scope: ${this.store.getState().scope}`,
        })
        return Promise.resolve()
      }

      if (allowBulk && numTrades > 1) {
        log(LogTypes.PURCHASE, { message: `Initiating ${numTrades} concurrent bulk purchases for ${contract_type}.` })
        const purchasePromises = []

        for (let i = 0; i < numTrades; i++) {
          purchasePromises.push(
            this._performSinglePurchase(contract_type, true, i)
              .then((buyObject) => ({ status: "fulfilled", value: buyObject, index: i }))
              .catch((error) => {
                console.error(`Bulk purchase ${i + 1} failed:`, error)
                return { status: "rejected", reason: error, index: i }
              }),
          )
        }

        log(LogTypes.PURCHASE, {
          message: `All ${numTrades} bulk purchase promises initiated. Waiting for them to settle...`,
        })

        const allSettledResults = await Promise.allSettled(purchasePromises)
        log(LogTypes.PURCHASE, { message: `All bulk purchase promises settled. Processing results.` })

        const successfulBuys = []
        allSettledResults.forEach((result, i) => {
          if (result.status === "fulfilled") {
            const buy = result.value
            successfulBuys.push(buy)
            console.log(
              `DEBUG: Processing fulfilled trade ${i + 1}. Buy object (stringified): ${JSON.stringify(buy, null, 2)}`,
            )

            contractStatus({
              id: "contract.purchase_received",
              data: buy.value.transaction_id,
              buy: buy.value,
              message: `Bought: ${buy.value.longcode || contract_type} (ID: ${buy.value.transaction_id || "N/A"})`,
            })
            log(LogTypes.PURCHASE, {
              longcode: buy.value.longcode,
              transaction_id: buy.value.transaction_id,
              message: `Bulk Trade ${i + 1} successful.`,
            })
            info({
              accountID: this.accountInfo.loginid,
              totalRuns: this.updateAndReturnTotalRuns(),
              transaction_ids: { buy: buy.value.transaction_id },
              contract_type,
              buy_price: buy.value.buy_price,
              message: `Info for Bulk Trade ${i + 1}`,
            })
          } else {
            log(LogTypes.PURCHASE, {
              message: `Bulk Trade ${i + 1} failed: ${result.reason?.message || result.reason}`,
            })
          }
        })

        this.store.dispatch({ type: DURING_PURCHASE, payload: { isBulk: true } })
        this.store.dispatch(purchaseSuccessful(true))
        log(LogTypes.PURCHASE, { message: `Dispatched DURING_PURCHASE after bulk trades.` })

        return Promise.resolve(successfulBuys)
      } else {
        log(LogTypes.PURCHASE, { message: `Initiating single purchase for ${contract_type}.` })
        const buyObject = await this._performSinglePurchase(contract_type, false, 0)
        this.contractId = buyObject.contract_id
        return buyObject
      }
    }

    getPurchaseReference = () => purchase_reference
    regeneratePurchaseReference = () => {
      purchase_reference = getUUID()
    }
  }
