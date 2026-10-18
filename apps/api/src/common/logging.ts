import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import { config } from '../config';

const REQUEST_ID = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Structured JSON logs to stdout (nodebestpractices 2.7, 5.18), one request id per
 * request on every line and in the `x-request-id` response header (5.14).
 * Secrets never reach the log (6.20).
 */
export function loggerParams(): Params {
  const { env, logLevel } = config();
  return {
    pinoHttp: {
      level: logLevel,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', '*.password', '*.passwordHash'],
        censor: '[redacted]',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      ...(env === 'development'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } } }
        : {}),
    },
  };
}
