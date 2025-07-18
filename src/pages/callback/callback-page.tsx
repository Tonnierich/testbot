"use client"

import { useEffect } from "react"
import Cookies from "js-cookie"
import { crypto_currencies_display_order, fiat_currencies_display_order } from "@/components/shared"
import { generateDerivApiInstance } from "@/external/bot-skeleton/services/api/appId"
import { observer as globalObserver } from "@/external/bot-skeleton/utils/observer"
import useTMB from "@/hooks/useTMB"
import { clearAuthData } from "@/utils/auth-utils"

/**
 * Gets the selected currency or falls back to appropriate defaults
 */
const getSelectedCurrency = (
  tokens: Record<string, string>,
  clientAccounts: Record<string, any>,
  state: any,
): string => {
  const getQueryParams = new URLSearchParams(window.location.search)
  const currency =
    (state && state?.account) || getQueryParams.get("account") || sessionStorage.getItem("query_param_currency") || ""
  const firstAccountKey = tokens.acct1
  const firstAccountCurrency = clientAccounts[firstAccountKey]?.currency
  const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order]
  if (tokens.acct1?.startsWith("VR") || currency === "demo") return "demo"
  if (currency && validCurrencies.includes(currency.toUpperCase())) return currency
  return firstAccountCurrency || "USD"
}

const CallbackPage = () => {
  const { is_tmb_enabled = false } = useTMB() // Call useTMB unconditionally

  useEffect(() => {
    const processOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const tokens: Record<string, string> = {}
      const rawState = urlParams.get("state") // Assuming state is passed as a query param
      let state: { account?: string } | null = null
      if (rawState) {
        try {
          state = JSON.parse(rawState)
        } catch (e) {
          console.error("Failed to parse state from URL:", e)
        }
      }

      // Extract tokens from URL parameters
      for (const [key, value] of urlParams.entries()) {
        if (key.startsWith("acct") || key.startsWith("token") || key.startsWith("cur")) {
          tokens[key] = value
        }
      }

      const accountsList: Record<string, string> = {}
      const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {}

      for (const [key, value] of Object.entries(tokens)) {
        if (key.startsWith("acct")) {
          const tokenKey = key.replace("acct", "token")
          if (tokens[tokenKey]) {
            accountsList[value] = tokens[tokenKey]
            clientAccounts[value] = {
              loginid: value,
              token: tokens[tokenKey],
              currency: "",
            }
          }
        } else if (key.startsWith("cur")) {
          const accKey = key.replace("cur", "acct")
          if (tokens[accKey]) {
            clientAccounts[tokens[accKey]].currency = value
          }
        }
      }

      localStorage.setItem("accountsList", JSON.stringify(accountsList))
      localStorage.setItem("clientAccounts", JSON.stringify(clientAccounts))

      let is_token_set = false
      const api = await generateDerivApiInstance()

      if (api) {
        const { authorize, error } = await api.authorize(tokens.token1)
        api.disconnect()

        if (error) {
          // Check if the error is due to an invalid token
          if (error.code === "InvalidToken") {
            // Set is_token_set to true to prevent the app from getting stuck in loading state
            is_token_set = true
            // Only emit the InvalidToken event if logged_state is true
            if (Cookies.get("logged_state") === "true" && !is_tmb_enabled) {
              // Emit an event that can be caught by the application to retrigger OIDC authentication
              globalObserver.emit("InvalidToken", { error })
            }
            if (Cookies.get("logged_state") === "false") {
              // If the user is not logged out, we need to clear the local storage
              clearAuthData()
            }
          }
        } else {
          localStorage.setItem("callback_token", authorize.toString())
          const clientAccountsArray = Object.values(clientAccounts)
          const firstId = authorize?.account_list[0]?.loginid
          const filteredTokens = clientAccountsArray.filter((account) => account.loginid === firstId)
          if (filteredTokens.length) {
            localStorage.setItem("authToken", filteredTokens[0].token)
            localStorage.setItem("active_loginid", filteredTokens[0].loginid)
            is_token_set = true
          }
        }
      }

      if (!is_token_set) {
        localStorage.setItem("authToken", tokens.token1)
        localStorage.setItem("active_loginid", tokens.acct1)
      }

      // Determine the appropriate currency to use
      const selected_currency = getSelectedCurrency(tokens, clientAccounts, state)
      window.location.replace(window.location.origin + `/?account=${selected_currency}`)
    }

    processOAuthCallback()
  }, [is_tmb_enabled]) // Depend on is_tmb_enabled if it affects the logic

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
      {/* Loading animation matching the provided image hint */}
      <div className="flex space-x-2">
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce delay-150" />
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce delay-300" />
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce delay-450" />
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce delay-600" />
      </div>
      <p className="mt-4 text-gray-600">Please wait while we connect to the server...</p>
    </div>
  )
}

export default CallbackPage
