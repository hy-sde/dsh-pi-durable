/**
 * The OpenAI-compatible relay provider registered into the pi-ai model
 * registry. Auth resolves lazily at request time — the harness credential
 * store first (when available), then the row's inline key, then the
 * configured env variable — so rotating the secret needs no remount.
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
 * Minimal structural view of the harness credentials service — resolved
 * opportunistically so deployments without it keep working (env fallback).
 */
export interface CredentialStoreView {
  resolve(ref: string): Promise<{ value: string } | undefined>
}

/** Optional wiring for {@link createRelayProvider}. */
export interface RelayProviderOptions {
  /**
   * Resolves a stored credential by reference (the harness credentials
   * service). Consulted before the inline key and the environment, matching
   * the stored-credential precedence of the fork's llm-pi-ai route.
   */
  resolveStoredCredential?: (ref: string) => Promise<string | undefined>
}

/**
 * An {@link ApiKeyAuth} that resolves at request time: stored credential
 * first, then the row's inline key, then the configured env variable — so
 * rotating the secret needs no remount.
 */
function configApiKeyAuth(name: string, resolve: () => Promise<string | undefined>): ApiKeyAuth {
  return {
    name,
    async resolve() {
      const key = await resolve()
      if (key === undefined || key === '') return undefined
      return { auth: { apiKey: key }, source: name }
    },
  }
}

/** Build the relay provider from resolved config (only called with a `baseUrl`). */
export function createRelayProvider(config: ResolvedPiDurableConfig, options: RelayProviderOptions = {}): Provider<Api> {
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
      apiKey: configApiKeyAuth(`${config.providerName} API key`, async () => {
        const stored = await options.resolveStoredCredential?.(config.apiKeyEnv)
        if (stored !== undefined && stored !== '') return stored
        return config.apiKey ?? process.env[config.apiKeyEnv]
      }),
    },
    models: [model],
    api: config.api === 'openai-responses' ? openAIResponsesApi() : openAICompletionsApi(),
  })
}
