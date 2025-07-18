"use client"

import { useState, useEffect } from "react"
import Cookies from "js-cookie"
import type RootStore from "@/stores/root-store" // Keep this import if RootStore is used elsewhere
import { OAuth2Logout, requestOidcAuthentication } from "@deriv-com/auth-client" // Corrected import path
// Assuming 'client' is either a global or imported from a specific file like '@/stores/root-store'
// If 'client' is part of RootStore, it should be accessed via the client prop as before.
// If it's a separate import, please provide its source.
// For now, I'll assume it's passed as a prop or accessed via RootStore.

/** * Provides an object with properties: `oAuthLogout`, `retriggerOAuth2Login`, `isSingleLoggingIn`, and `isOAuth2Enabled`. * * `oAuthLogout` is a function that logs out the user of the OAuth2-enabled app. * * `retriggerOAuth2Login` is a function that retriggers the OAuth2 login flow to get a new token. * * `isSingleLoggingIn` is a boolean that indicates whether the user is currently logging in. *  * `isOAuth2Enabled` is a boolean that indicates whether OAuth2 is enabled (always false now). * * The `handleLogout` argument is an optional function that will be called after logging out the user. * If `handleLogout` is not provided, the function will resolve immediately. * * @param {{ handleLogout?: () => Promise<void> }} [options] - An object with an optional `handleLogout` property. * @returns {{ oAuthLogout: () => Promise<void>; retriggerOAuth2Login: () => Promise<void>; isSingleLoggingIn: boolean; isOAuth2Enabled: boolean }} */
export const useOauth2 = ({
  handleLogout,
  client, // Keep client as a prop
}: {
  handleLogout?: () => Promise<void>
  client?: RootStore["client"]
} = {}) => {
  const [isSingleLoggingIn, setIsSingleLoggingIn] = useState(false)
  const accountsList = JSON.parse(localStorage.getItem("accountsList") ?? "{}")
  const isClientAccountsPopulated = Object.keys(accountsList).length > 0
  const isSilentLoginExcluded =
    window.location.pathname.includes("callback") || window.location.pathname.includes("endpoint")
  const loggedState = Cookies.get("logged_state")

  useEffect(() => {
    window.addEventListener("unhandledrejection", (event) => {
      if (event?.reason?.error?.code === "InvalidToken") {
        setIsSingleLoggingIn(false)
      }
    })
  }, [])

  useEffect(() => {
    const willEventuallySSO = loggedState === "true" && !isClientAccountsPopulated
    const willEventuallySLO = loggedState === "false" && isClientAccountsPopulated
    if (!isSilentLoginExcluded && (willEventuallySSO || willEventuallySLO)) {
      setIsSingleLoggingIn(true)
    } else {
      setIsSingleLoggingIn(false)
    }
  }, [isClientAccountsPopulated, loggedState, isSilentLoginExcluded])

  const logoutHandler = async () => {
    client?.setIsLoggingOut(true)
    try {
      await OAuth2Logout({
        redirectCallbackUri:
          window.location.hostname === "testbot-d45.pages.dev"
            ? "https://testbot-d45.pages.dev/callback"
            : `${window.location.origin}/callback`,
        WSLogoutAndRedirect: handleLogout ?? (() => Promise.resolve()), // Reverted to original handleLogout usage
        postLogoutRedirectUri:
          window.location.hostname === "testbot-d45.pages.dev"
            ? "https://testbot-d45.pages.dev"
            : window.location.origin,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err)
      })
      // Re-added client.logout() based on your working example's useOauth2.ts
      // If client.logout() is part of the handleLogout prop, this might be redundant.
      // Please verify if handleLogout already calls client.logout().
      // If not, this line is necessary.
      if (client && handleLogout === undefined) {
        // Only call if handleLogout is not provided
        await client.logout().catch((err) => {
          // eslint-disable-next-line no-console
          console.error("Error during TMB logout:", err)
        })
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error)
    }
  }

  const retriggerOAuth2Login = async () => {
    try {
      await requestOidcAuthentication({
        redirectCallbackUri:
          window.location.hostname === "testbot-d45.pages.dev"
            ? "https://testbot-d45.pages.dev/callback"
            : `${window.location.origin}/callback`,
        postLogoutRedirectUri:
          window.location.hostname === "testbot-d45.pages.dev"
            ? "https://testbot-d45.pages.dev"
            : window.location.origin,
        clientId: "85653", // Updated to 85653
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Error during OAuth2 login retrigger:", err)
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error during OAuth2 login retrigger:", error)
    }
  }

  // Return isOAuth2Enabled as false to force the app to use the legacy OAuth flow
  return {
    oAuthLogout: logoutHandler,
    retriggerOAuth2Login,
    isSingleLoggingIn,
    isOAuth2Enabled: false, // This is the key change - always return false
  }
}

export default useOauth2 // Ensure it's a default export
