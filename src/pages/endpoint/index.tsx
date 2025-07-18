"use client"
import { useFormik } from "formik"
import { getAppId, getDefaultAppIdAndUrl, getSocketURL } from "@/components/shared"
import { Button, Input, Text } from "@deriv-com/ui"
import { LocalStorageConstants } from "@deriv-com/utils"
import "./endpoint.scss"

const Endpoint = () => {
  // Get the current domain to suggest appropriate app ID
  const currentDomain = window.location.hostname

  // Function to get recommended app ID based on domain
  const getRecommendedAppId = () => {
    // If this is your domain, recommend your app ID (85653)
    if (currentDomain.includes("testbot-d45.pages.dev")) {
      return "85653"
    }
    return getAppId().toString()
  }

  const formik = useFormik({
    initialValues: {
      appId: localStorage.getItem(LocalStorageConstants.configAppId) ?? getRecommendedAppId(),
      serverUrl: localStorage.getItem(LocalStorageConstants.configServerURL) ?? getSocketURL(),
    },
    onSubmit: (values) => {
      localStorage.setItem(LocalStorageConstants.configServerURL, values.serverUrl)
      localStorage.setItem(LocalStorageConstants.configAppId, values.appId.toString())
      formik.resetForm({ values })

      // Reload the page to apply changes
      window.location.reload()
    },
    validate: (values) => {
      const errors: { [key: string]: string } = {}
      if (!values.serverUrl) {
        errors.serverUrl = "This field is required"
      }
      if (!values.appId) {
        errors.appId = "This field is required"
      } else if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(values.appId.toString())) {
        errors.appId = "Please enter a valid app ID"
      }
      return errors
    },
  })

  // Function to test OAuth URL with current app ID
  const testOAuthUrl = () => {
    const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${formik.values.appId}`
    window.open(oauthUrl, "_blank")
  }

  return (
    <div className="endpoint">
      <Text weight="bold" className="endpoint__title">
        Change API endpoint
      </Text>
      <form onSubmit={formik.handleSubmit} className="endpoint__form">
        <Input
          data-testid="dt_endpoint_server_url_input"
          label="Server"
          name="serverUrl"
          message={formik.errors.serverUrl as string}
          onBlur={formik.handleBlur}
          onChange={formik.handleChange}
          value={formik.values.serverUrl}
          hint="Example: green.derivws.com"
        />
        <Input
          data-testid="dt_endpoint_app_id_input"
          label="OAuth App ID"
          name="appId"
          message={formik.errors.appId as string}
          onBlur={formik.handleBlur}
          onChange={formik.handleChange}
          value={formik.values.appId}
          hint={
            currentDomain.includes("testbot-d45.pages.dev")
              ? "Recommended: 85653 for this domain"
              : "Enter your registered Deriv OAuth App ID"
          }
        />
        <div>
          <Button className="endpoint__button" disabled={!formik.dirty || !formik.isValid} type="submit">
            Submit
          </Button>
          <Button
            className="endpoint__button"
            color="black"
            onClick={() => {
              const { server_url, app_id } = getDefaultAppIdAndUrl()
              localStorage.setItem(LocalStorageConstants.configServerURL, server_url)
              localStorage.setItem(LocalStorageConstants.configAppId, app_id.toString())
              formik.resetForm({
                values: {
                  appId: app_id,
                  serverUrl: server_url,
                },
              })
              window.location.reload()
            }}
            variant="outlined"
            type="button"
          >
            Reset to original settings
          </Button>
          <Button className="endpoint__button" color="primary" onClick={testOAuthUrl} variant="outlined" type="button">
            Test OAuth URL
          </Button>
        </div>
      </form>
    </div>
  )
}

export default Endpoint
