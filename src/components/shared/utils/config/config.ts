import { LocalStorageConstants, LocalStorageUtils } from "@deriv-com/utils"
import { isStaging } from "../url/helpers"

const configured_server_url = "ws.derivws.com" // Declare configured_server_url
const valid_server_urls = ["ws.derivws.com", "ws.deriv.dev"] // Declare valid_server_urls

export const APP_IDS = {
  LOCALHOST: 85653, // Updated to 85653 for testbot-d45.pages.dev
  TMP_STAGING: 64584,
  STAGING: 29934,
  STAGING_BE: 29934,
  STAGING_ME: 29934,
  PRODUCTION: 65555,
  PRODUCTION_BE: 65556,
  PRODUCTION_ME: 65557,
}

export const livechat_license_id = 12049137
export const livechat_client_id = "66aa088aad5a414484c1fd1fa8a5ace7"

export const domain_app_ids = {
  "master.bot-standalone.pages.dev": APP_IDS.TMP_STAGING,
  "staging-dbot.deriv.com": APP_IDS.STAGING,
  "staging-dbot.deriv.be": APP_IDS.STAGING_BE,
  "staging-dbot.deriv.me": APP_IDS.STAGING_ME,
  "dbot.deriv.com": APP_IDS.PRODUCTION,
  "dbot.deriv.be": APP_IDS.PRODUCTION_BE,
  "dbot.deriv.me": APP_IDS.PRODUCTION_ME,
  "testbot-d45.pages.dev": APP_IDS.LOCALHOST, // Mapped to LOCALHOST (85653)
}

export const getCurrentProductionDomain = () =>
  !/^staging\./.test(window.location.hostname) &&
  Object.keys(domain_app_ids).find((domain) => window.location.hostname === domain)

export const isProduction = () => {
  const all_domains = Object.keys(domain_app_ids).map((domain) => `(www\\.)?${domain.replace(".", "\\.")}`)
  return new RegExp(`^(${all_domains.join("|")})$`, "i").test(window.location.hostname)
}

export const isTestLink = () => {
  return (
    window.location.origin?.includes(".binary.sx") ||
    window.location.origin?.includes("bot-65f.pages.dev") ||
    window.location.origin?.includes("testbot-d45.pages.dev") || // Added new test domain
    isLocal()
  )
}

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname)

const getDefaultServerURL = () => {
  if (isTestLink()) {
    return "ws.derivws.com"
  }
  let active_loginid_from_url
  const search = window.location.search
  if (search) {
    const params = new URLSearchParams(document.location.search.substring(1))
    active_loginid_from_url = params.get("acct1")
  }
  const loginid = window.localStorage.getItem("active_loginid") ?? active_loginid_from_url
  const is_real = loginid && !/^(VRT|VRW)/.test(loginid)
  const server = is_real ? "green" : "blue"
  const server_url = `${server}.derivws.com`
  return server_url
}

export const getDefaultAppIdAndUrl = () => {
  const server_url = getDefaultServerURL()
  if (window.location.origin?.includes("testbot-d45.pages.dev")) {
    // Specific check for the new test domain
    return { app_id: APP_IDS.LOCALHOST, server_url }
  }
  if (isTestLink()) {
    return { app_id: APP_IDS.LOCALHOST, server_url }
  }
  const current_domain = getCurrentProductionDomain() ?? ""
  const app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION
  return { app_id, server_url }
}

export const getAppId = () => {
  let app_id = null
  const config_app_id = window.localStorage.getItem("config.app_id")
  const current_domain = getCurrentProductionDomain() ?? ""

  // Always use 85653 for testbot-d45.pages.dev
  if (window.location.hostname === "testbot-d45.pages.dev") {
    return APP_IDS.LOCALHOST // 85653
  }

  if (config_app_id) {
    app_id = config_app_id
  } else if (isStaging()) {
    app_id = APP_IDS.STAGING
  } else if (isTestLink()) {
    app_id = APP_IDS.LOCALHOST
  } else {
    app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION
  }
  return app_id
}

export const getSocketURL = () => {
  const local_storage_server_url = window.localStorage.getItem("config.server_url")
  if (local_storage_server_url) return local_storage_server_url
  const server_url = getDefaultServerURL()
  return server_url
}

export const checkAndSetEndpointFromUrl = () => {
  if (isTestLink()) {
    const url_params = new URLSearchParams(location.search.slice(1))
    if (url_params.has("qa_server") && url_params.has("app_id")) {
      const qa_server = url_params.get("qa_server") || ""
      const app_id = url_params.get("app_id") || ""
      url_params.delete("qa_server")
      url_params.delete("app_id")
      if (/^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[0-9]+$/.test(app_id)) {
        localStorage.setItem("config.app_id", app_id)
        localStorage.setItem("config.server_url", qa_server.replace(/"/g, ""))
      }
      const params = url_params.toString()
      const hash = location.hash
      location.href = `${location.protocol}//${location.hostname}${location.pathname}${
        params ? `?${params}` : ""
      }${hash || ""}`
      return true
    }
  }
  return false
}

export const getDebugServiceWorker = () => {
  const debug_service_worker_flag = window.localStorage.getItem("debug_service_worker")
  if (debug_service_worker_flag) return !!Number.parseInt(debug_service_worker_flag)
  return false
}

export const generateOAuthURL = () => {
  // Use your registered app ID for testbot-d45.pages.dev
  const oauth_app_id = 85653

  // Get the current hostname for the redirect URI
  const hostname = window.location.hostname

  // Construct the redirect URI - make sure this matches what you registered with Deriv
  const redirect_uri = `https://${hostname}/callback`

  // Get the server URL from config
  const server_url =
    LocalStorageUtils.getValue(LocalStorageConstants.configServerURL) ||
    localStorage.getItem("config.server_url") ||
    getSocketURL()

  // Construct the base OAuth URL with all required parameters
  const base_url = "https://oauth.deriv.com/oauth2/authorize"
  const params = new URLSearchParams({
    app_id: oauth_app_id.toString(),
    l: "EN",
    redirect_uri: redirect_uri,
    response_type: "code",
    brand: "deriv",
  })

  // Create the full OAuth URL
  const oauth_url = `${base_url}?${params.toString()}`

  // Create URL object for potential hostname modifications
  const url_object = new URL(oauth_url)

  // Check if we need to modify the hostname based on server configuration
  const valid_server_urls = ["green.derivws.com", "red.derivws.com", "blue.derivws.com"]
  if (typeof server_url === "string" && !valid_server_urls.includes(server_url) && server_url !== url_object.hostname) {
    url_object.hostname = server_url
  }

  // Debug output
  console.log("Generated OAuth URL:", url_object.toString())

  // Return the final URL
  return url_object.toString()
}
