"use client"

import { useState, useEffect } from "react"
import Cookies from "js-cookie"
import { client, OAuth2Logout, requestOidcAuthentication } from "@/auth-client"

const useOauth2 = () => {
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
        WSLogoutAndRedirect: () => Promise.resolve(),
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

export default useOauth2
