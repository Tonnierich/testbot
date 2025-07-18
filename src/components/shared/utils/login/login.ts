import { website_name } from "@/utils/site-config"
import { getAppId, generateOAuthURL as getBaseOAuthURL } from "../config/config" // Import generateOAuthURL as getBaseOAuthURL
import { CookieStorage, isStorageSupported, LocalStore } from "../storage/storage"
import { getStaticUrl } from "../url" // Removed urlForCurrentDomain as it's no longer needed for OAuth URL construction

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

  // If server_url is a QA server, use that directly
  if (server_url && /qa/.test(server_url)) {
    return `https://${server_url}/oauth2/authorize?app_id=${getAppId()}&l=${language}${marketing_queries}&brand=${website_name.toLowerCase()}`
  }

  // Use the centralized generateOAuthURL from config.ts to get the base OAuth server URL
  const baseOAuthUrl = getBaseOAuthURL()
  const url = new URL(baseOAuthUrl)

  // Append all necessary parameters
  url.searchParams.set("app_id", getAppId().toString())
  url.searchParams.set("l", language)
  url.searchParams.set("brand", website_name.toLowerCase())

  // Append marketing queries manually as URLSearchParams doesn't handle raw query strings easily
  const finalUrl = `${url.toString()}${marketing_queries}`
  return finalUrl
}
