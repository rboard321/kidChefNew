import { envLog } from './environment';

export const logger = {
  debug: envLog.debug,
  info: envLog.info,
  warn: envLog.warn,
  error: envLog.error,
};
