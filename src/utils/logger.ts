type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogContext {
  executionId?: string;
  taskId?: string;
  jobId?: string;
  proofId?: string;
  receiptHash?: string;
  escrowId?: string;
  milestoneId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: LogContext;
}

const SECRET_KEY_PATTERN = /(secret|token|api.?key|private.?key|password|authorization)/i;
const MAX_RECENT_LOGS = 200;

const globalForLogger = globalThis as unknown as {
  __verixRecentLogs?: LogEntry[];
};

function recentLogs(): LogEntry[] {
  if (!globalForLogger.__verixRecentLogs) {
    globalForLogger.__verixRecentLogs = [];
  }
  return globalForLogger.__verixRecentLogs;
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(val);
  }
  return output;
}

const LOG_COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[90m",
};

const RESET = "\x1b[0m";

function log(level: LogLevel, service: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const context = redact(data) as LogContext | undefined;
  const entry: LogEntry = { timestamp, level, service, message, context };

  const buffer = recentLogs();
  buffer.push(entry);
  if (buffer.length > MAX_RECENT_LOGS) buffer.splice(0, buffer.length - MAX_RECENT_LOGS);

  const color = LOG_COLORS[level];
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}] [${service}]${RESET}`;

  if (context) {
    console.log(`${prefix} ${message}`, context);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export function createLogger(service: string) {
  return {
    info: (message: string, data?: unknown) => log("info", service, message, data),
    warn: (message: string, data?: unknown) => log("warn", service, message, data),
    error: (message: string, data?: unknown) => log("error", service, message, data),
    debug: (message: string, data?: unknown) => log("debug", service, message, data),
  };
}

export function getRecentLogs(limit = 100): LogEntry[] {
  return recentLogs().slice(-limit).reverse();
}
