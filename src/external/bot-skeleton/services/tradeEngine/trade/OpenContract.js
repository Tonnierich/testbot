import { getRoundedNumber } from "@/components/shared"
import { api_base } from "../../api/api-base"
import { contractStatus } from "../utils/broadcast" // Keep the import, but we won't use broadcastContract here for initial purchase
import { openContractReceived, sell } from "./state/actions"

export default (Engine) =>
  class OpenContract extends Engine {
    observeOpenContract() {
      if (!api_base.api) return
      const subscription = api_base.api.onMessage().subscribe(({ data }) => {
        if (data.msg_type === "proposal_open_contract") {
          const contract = data.proposal_open_contract
          if (!contract || !this.expectedContractId(contract?.contract_id)) {
            // For bulk trades, this check will need to be updated to check against a list of expected contract IDs.
            // For now, we're focusing on removing the redundant log.
            return
          }
          this.setContractFlags(contract)
          this.data.contract = contract
          // CRITICAL FIX: REMOVED THE FOLLOWING LINE.
          // This line was causing redundant and incomplete "Bought: (ID: )" messages
          // because the 'contract' object from 'proposal_open_contract' might not
          // have the 'longcode' immediately, and the initial 'Bought' message
          // is already handled by Purchase.js.
          // broadcastContract({ accountID: api_base.account_info.loginid, ...contract });
          if (this.isSold) {
            this.contractId = ""
            clearTimeout(this.transaction_recovery_timeout)
            this.updateTotals(contract)
            contractStatus({
              id: "contract.sold",
              data: contract.transaction_ids.sell,
              contract,
            })
            if (this.afterPromise) {
              this.afterPromise()
            }
            this.store.dispatch(sell())
          } else {
            this.store.dispatch(openContractReceived())
          }
        }
      })
      api_base.pushSubscription(subscription)
    }
    waitForAfter() {
      return new Promise((resolve) => {
        this.afterPromise = resolve
      })
    }
    setContractFlags(contract) {
      const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract
      this.isSold = Boolean(is_sold)
      this.isSellAvailable = !this.isSold && Boolean(is_valid_to_sell)
      this.isExpired = Boolean(is_expired)
      this.hasEntryTick = Boolean(entry_tick)
    }
    expectedContractId(contractId) {
      // This method currently only checks against a single contractId.
      // For bulk trades, this will need to be updated to check against a list of active contract IDs.
      return this.contractId && contractId === this.contractId
    }
    getSellPrice() {
      const { bid_price: bidPrice, buy_price: buyPrice, currency } = this.data.contract
      return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency)
    }
  }
