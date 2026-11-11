import fs from 'fs';
import path from 'path';
import { scrubSecrets } from './security.ts';

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
  category: 'ORCHESTRATOR' | 'STORAGE' | 'AI_PROVIDER' | 'VOICE' | 'SYSTEM';
  taskId?: string;
  message: string;
  metadata?: Record<string, any>;
}

const LOG_FILE = path.resolve(process.cwd(), '.nx_storage', 'system_audit.log');

export class SafeLogger {
  private static buffer: LogEntry[] = [];

  public static log(
    level: LogEntry['level'],
    category: LogEntry['category'],
    message: string,
    taskId?: string,
    metadata?: Record<string, any>
  ): LogEntry {
    const { cleanText } = scrubSecrets(message);
    let sanitizedMeta: Record<string, any> | undefined = undefined;

    if (metadata) {
      try {
        const metaStr = JSON.stringify(metadata);
        const { cleanText: cleanMeta } = scrubSecrets(metaStr);
        sanitizedMeta = JSON.parse(cleanMeta);
      } catch {
        sanitizedMeta = { note: '[Meta serialization scrubbed]' };
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      taskId,
      message: cleanText,
      metadata: sanitizedMeta,
    };

    this.buffer.unshift(entry);
    if (this.buffer.length > 100) this.buffer.pop();

    try {
      const line = `[${entry.timestamp}] [${entry.level}] [${entry.category}]${entry.taskId ? ` [${entry.taskId}]` : ''}: ${entry.message}\n`;
      fs.appendFileSync(LOG_FILE, line, 'utf-8');
    } catch {
      // Storage directory may be initializing
    }

    return entry;
  }

  public static info(category: LogEntry['category'], msg: string, taskId?: string, meta?: any): LogEntry {
    return this.log('INFO', category, msg, taskId, meta);
  }

  public static warn(category: LogEntry['category'], msg: string, taskId?: string, meta?: any): LogEntry {
    return this.log('WARN', category, msg, taskId, meta);
  }

  public static error(category: LogEntry['category'], msg: string, taskId?: string, meta?: any): LogEntry {
    return this.log('ERROR', category, msg, taskId, meta);
  }

  public static security(category: LogEntry['category'], msg: string, taskId?: string, meta?: any): LogEntry {
    return this.log('SECURITY', category, msg, taskId, meta);
  }

  public static getRecentLogs(limit: number = 50): LogEntry[] {
    return this.buffer.slice(0, limit);
  }
}
