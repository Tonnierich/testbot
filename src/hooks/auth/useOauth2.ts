"use client"

import { useState } from "react"
import { useEffect } from "react"
import Cookies from "js-cookie"
import type RootStore from "@/stores/root-store"
import { OAuth2Logout, requestOidcAuthentication } from "@deriv-com/auth-client"

/** * Provides an object with properties: `oAuthLogout`, `retriggerOAuth2Login`, `isSingleLoggingIn`, and `isOAuth2Enabled`. * * `oAuthLogout` is a function that logs out the user of the OAuth2-enabled app. * * `retriggerOAuth2Login` is a function that retriggers the OAuth2 login flow to get a new token. * * `isSingleLoggingIn` is a boolean that indicates whether the user is currently logging in. *  * `isOAuth2Enabled` is a boolean that indicates whether OAuth2 is enabled (always false now). * * The `handleLogout` argument is an optional function that will be called after logging out the user. * If `handleLogout` is not provided, the function will resolve immediately. * * @param {{ handleLogout?: () => Promise<void> }} [options] - An object with an optional `handleLogout` property. * @returns {{ oAuthLogout: () => Promise<void>; retriggerOAuth2Login: () => Promise<void>; isSingleLoggingIn: boolean; isOAuth2Enabled: boolean }} */
export const useOauth2 = ({
  handleLogout,
  client,
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
        WSLogoutAndRedirect: handleLogout ?? (() => Promise.resolve()),
        postLogoutRedirectUri:
          window.location.hostname === "testbot-d45.pages.dev"
            ? "https://testbot-d45.pages.dev"
            : window.location.origin,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err)
      })
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
        // Note: clientId parameter doesn't seem to be working with the auth-client library
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
