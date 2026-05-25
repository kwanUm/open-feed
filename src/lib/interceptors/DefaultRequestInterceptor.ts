import { InternalAxiosRequestConfig } from 'axios'
import { API_ENDPOINT } from 'src/config'
import { isProduction } from 'src/utils/Environment'

export async function DefaultRequestInterceptor(config: InternalAxiosRequestConfig) {
  if (config) {
    config.baseURL = isProduction() ? API_ENDPOINT : '/api'
    if (config.headers) {
      config.headers.Accept = 'application/json'
    }
  }

  return config
}
