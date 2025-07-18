import { website_name } from "@/utils/site-config"
import { domain_app_ids, getAppId } from "../config/config"
import { CookieStorage, isStorageSupported, LocalStore } from "../storage/storage"
import { getStaticUrl, urlForCurrentDomain } from "../url"
import { deriv_urls } from "../url/constants"

export const redirectToLogin = (is_logged_in: boolean, language: string, has_params = true, redirect_delay = 0) => {
  if (!is_logged_in && isStorageSupported(sessionStorage)) {
    const l = window.location
    const redirect_url = has_params ? window.location.href : `${l.protocol}//${l.host}${l.pathname}`
    sessionStorage.setItem("redirect_url", redirect_url)
    setTimeout(() => {
      const new_href = loginUrl({ language })
      window.location.href = new_href
    }, redirect_delay)
  }
}

export const redirectToSignUp = () => {
  window.open(getStaticUrl("/signup/"))
}

type TLoginUrl = {
  language: string
}

export const loginUrl = ({ language }: TLoginUrl) => {
  const server_url = LocalStore.get("config.server_url")
  const signup_device_cookie = new (CookieStorage as any)("signup_device")
  const signup_device = signup_device_cookie.get("signup_device")
  const date_first_contact_cookie = new (CookieStorage as any)("date_first_contact")
  const date_first_contact = date_first_contact_cookie.get("date_first_contact")
  const marketing_queries = `${signup_device ? `&signup_device=${signup_device}` : ""}${
    date_first_contact ? `&date_first_contact=${date_first_contact}` : ""
  }`

  // Use your app ID directly for the OAuth URL
  const getOAuthUrl = () => {
    // Use 85653 as the app ID for testbot-d45.pages.dev
    return `https://oauth.${
      deriv_urls.DERIV_HOST_NAME
    }/oauth2/authorize?app_id=85653&l=${language}${marketing_queries}&brand=${website_name.toLowerCase()}`
  }

  // For QA environments
  if (server_url && /qa/.test(server_url)) {
    // Use 85653 as the app ID for QA as well
    return `https://${server_url}/oauth2/authorize?app_id=85653&l=${language}${marketing_queries}&brand=${website_name.toLowerCase()}`
  }

  // For your deployed site (testbot-d45.pages.dev)
  if (window.location.hostname === "testbot-d45.pages.dev") {
    // Use 85653 for your deployed site
    return `https://oauth.${
      deriv_urls.DERIV_HOST_NAME
    }/oauth2/authorize?app_id=85653&l=${language}${marketing_queries}&brand=${website_name.toLowerCase()}`
  }

  // For other domains, use the dynamic approach
  if (getAppId() === domain_app_ids[window.location.hostname as keyof typeof domain_app_ids]) {
    return getOAuthUrl()
  }

  return urlForCurrentDomain(getOAuthUrl())
}
