/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Response } from 'express';
import type { AuditLogEntry, EventBusEvent, EventType, LogLevel } from '../../types/agent.ts';
import { scrubSecrets } from '../policy/policyEngine.ts';
import type { StorageAdapter } from '../persistence/storageAdapter.ts';

type EventSubscriber = (event: EventBusEvent) => void;

export class NxEventBus {
  private events: EventBusEvent[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private subscribers = new Set<EventSubscriber>();
  private sseClients = new Set<Response>();
  private readonly maxEvents = 250;
  private readonly maxAuditLogs = 400;
  private readonly storage?: StorageAdapter;

  constructor(storage?: StorageAdapter) {
    this.storage = storage;
    if (storage) {
      this.auditLogs = [...storage.getState().auditLogs];
    }
  }

  emit(type: EventType, summary: string, taskId?: string, payload?: Record<string, unknown>): EventBusEvent {
    const { cleanText } = scrubSecrets(summary);
    const event: EventBusEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      timestamp: Date.now(),
      taskId,
      summary: cleanText,
      payload,
    };

    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }

    if (
      type === 'POLICY_BLOCKED' ||
      type === 'TASK_FAILED' ||
      type === 'PROVIDER_FAILED' ||
      type === 'PROVIDER_SWITCHED' ||
      type === 'RECOVERY_STARTED' ||
      type === 'RECOVERY_FINISHED' ||
      type === 'VERIFICATION_FINISHED'
    ) {
      this.log(
        type === 'POLICY_BLOCKED' ? 'SECURITY' : type === 'TASK_FAILED' || type === 'PROVIDER_FAILED' ? 'WARN' : 'AUDIT',
        'EventBus',
        `${type}: ${cleanText}`,
        taskId,
        payload
      );
    }

    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {
        // Ignore subscriber listener faults
      }
    }

    const serialized = `event: nx\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(serialized);
      } catch {
        this.sseClients.delete(client);
      }
    }

    return event;
  }

  log(
    level: LogLevel,
    subsystem: string,
    message: string,
    correlationId?: string,
    metadata?: Record<string, unknown>
  ): AuditLogEntry {
    const { cleanText } = scrubSecrets(message);
    const entry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      level,
      correlationId,
      subsystem,
      message: cleanText,
      metadata,
    };

    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > this.maxAuditLogs) {
      this.auditLogs.length = this.maxAuditLogs;
    }

    if (this.storage) {
      const storeLogs = this.storage.getState().auditLogs;
      storeLogs.unshift(entry);
      if (storeLogs.length > 200) storeLogs.length = 200;
      this.storage.save();
    }

    return entry;
  }

  subscribe(listener: EventSubscriber): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  attachSseClient(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    this.sseClients.add(res);
    res.write(
      `event: nx\ndata: ${JSON.stringify({
        id: `evt-connect-${Date.now()}`,
        type: 'SYSTEM_BOOT',
        timestamp: Date.now(),
        summary: 'SSE event stream attached',
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        this.sseClients.delete(res);
      }
    }, 20000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.sseClients.delete(res);
    });
  }

  getRecentEvents(limit = 60): EventBusEvent[] {
    return this.events.slice(0, limit);
  }

  getAuditLogs(limit = 100): AuditLogEntry[] {
    return this.auditLogs.slice(0, limit);
  }
}
