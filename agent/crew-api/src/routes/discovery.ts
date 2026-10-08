import { Router } from 'express'
import {
  agentCard,
  agentDiscoveryJson,
  aiPluginManifest,
  llmsFullTxt,
  llmsTxt,
  openApiSpec,
  robotsTxt,
} from '../lib/agent/discovery.js'

export const discoveryRouter = Router()

function textPlain(res: import('express').Response, body: string) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.send(body)
}

function jsonDoc(res: import('express').Response, body: unknown) {
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json(body)
}

discoveryRouter.get('/llms.txt', (_req, res) => textPlain(res, llmsTxt()))
discoveryRouter.get('/llms-full.txt', (_req, res) => textPlain(res, llmsFullTxt()))
discoveryRouter.get('/robots.txt', (_req, res) => textPlain(res, robotsTxt()))
discoveryRouter.get('/openapi.json', (_req, res) => jsonDoc(res, openApiSpec()))
discoveryRouter.get('/api/openapi.json', (_req, res) => jsonDoc(res, openApiSpec()))

discoveryRouter.get('/.well-known/llms.txt', (_req, res) => textPlain(res, llmsTxt()))
discoveryRouter.get('/.well-known/agent.json', (_req, res) => jsonDoc(res, agentCard()))
discoveryRouter.get('/.well-known/ai-plugin.json', (_req, res) =>
  jsonDoc(res, aiPluginManifest()),
)

/** Alias — some clients probe /api/agent.json */
discoveryRouter.get('/api/agent.json', (_req, res) => jsonDoc(res, agentDiscoveryJson()))
