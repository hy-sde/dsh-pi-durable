/**
 * The OpenAI-compatible relay provider registered into the pi-ai model
 * registry. Auth resolves lazily at request time from the configured env
 * variable (or inline key), so rotating the secret needs no remount.
 * @module
 */

import {
  createProvider,
  type Api,
  type ApiKeyAuth,
  type Model,
  type Provider,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import type { ResolvedPiDurableConfig } from './config.ts'

/**
 * An {@link ApiKeyAuth} that resolves from config/env at request time. No
 * credential store is consulted: the row's env var is the single source.
 */
function configApiKeyAuth(name: string, resolve: () => string | undefined): ApiKeyAuth {
  return {
    name,
    async resolve() {
      const key = resolve()
      if (key === undefined || key === '') return undefined
      return { auth: { apiKey: key }, source: name }
    },
  }
}

/** Build the relay provider from resolved config (only called with a `baseUrl`). */
export function createRelayProvider(config: ResolvedPiDurableConfig): Provider<Api> {
  if (config.baseUrl === undefined) {
    throw new Error('[pi-durable-not-configured] createRelayProvider requires a baseUrl')
  }
  const model: Model<Api> = {
    id: config.modelId,
    name: config.modelName,
    api: config.api,
    provider: config.providerId,
    baseUrl: config.baseUrl,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: true,
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
  }
  return createProvider<Api>({
    id: config.providerId,
    name: config.providerName,
    baseUrl: config.baseUrl,
    auth: {
      apiKey: configApiKeyAuth(
        `${config.providerName} API key`,
        () => config.apiKey ?? process.env[config.apiKeyEnv],
      ),
    },
    models: [model],
    api: config.api === 'openai-responses' ? openAIResponsesApi() : openAICompletionsApi(),
  })
}
