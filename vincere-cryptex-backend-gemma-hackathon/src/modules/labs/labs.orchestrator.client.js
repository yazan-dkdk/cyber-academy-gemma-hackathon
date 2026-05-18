import http from 'http';
import https from 'https';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';

const buildBaseUrl = () => (
  env.labOrchestratorBaseUrl.endsWith('/')
    ? env.labOrchestratorBaseUrl
    : `${env.labOrchestratorBaseUrl}/`
);

const buildUrl = (path) => new URL(path.replace(/^\/+/, ''), buildBaseUrl());

const requestOrchestrator = (path, payload) => new Promise((resolve, reject) => {
  const url = buildUrl(path);
  const transport = url.protocol === 'https:' ? https : http;
  const body = JSON.stringify(payload);

  const req = transport.request(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...(env.labOrchestratorApiKey
          ? { 'x-lab-orchestrator-key': env.labOrchestratorApiKey }
          : {})
      }
    },
    (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let parsedBody = {};

        if (rawBody) {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            parsedBody = { rawBody };
          }
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsedBody);
          return;
        }

        reject(
          new AppError('Lab orchestrator request failed', 502, {
            statusCode: res.statusCode,
            response: parsedBody
          })
        );
      });
    }
  );

  req.setTimeout(env.labOrchestratorTimeoutMs, () => {
    req.destroy(new Error('timeout'));
  });

  req.on('error', (error) => {
    reject(
      new AppError('Lab orchestrator is unavailable', 502, {
        reason: error.message
      })
    );
  });

  req.write(body);
  req.end();
});

export const labsOrchestratorClient = {
  spawn: async (payload) => requestOrchestrator('/spawn', payload),
  reset: async (payload) => requestOrchestrator('/reset', payload),
  terminate: async (payload) => requestOrchestrator('/terminate', payload)
};
