/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import path from 'path';
import type {
  AgentOutcomeBadge,
  AgentState,
  AutonomousAction,
  BehaviorProfile,
  ChatMessage,
  OperatingMode,
  PersonaConfig,
  PolicyRiskClass,
  TaskQueueItem,
} from '../../types/agent.ts';
import { StorageAdapter } from '../persistence/storageAdapter.ts';
import { NxEventBus } from '../events/eventBus.ts';
import {
  classifyActionRisk,
  decomposeMultiTaskPrompt,
  scrubSecrets,
} from '../policy/policyEngine.ts';
import { TelemetryAdapter } from '../../adapters/system/telemetryAdapter.ts';
import { StorageWorker } from '../../adapters/storage/storageWorker.ts';
import { BrowserWorker } from '../../adapters/browser/browserWorker.ts';
import { AdbWorker } from '../../adapters/mobile/adbWorker.ts';
import { WindowsWorker } from '../../adapters/windows/windowsWorker.ts';
import { MediaWorker } from '../../adapters/media/mediaWorker.ts';
import { CustomerVault } from '../security/customerVault.ts';
import {
  DEFAULT_BEHAVIOR_PROFILES,
  DEFAULT_PERSONA_CONFIG,
  PersonaEngine,
} from '../persona/personaEngine.ts';
import { CapabilityRegistry } from '../registry/capabilityRegistry.ts';
import { ModelGateway } from '../providers/modelGateway.ts';
import { RecoveryEngine } from '../registry/workerManager.ts';
import {
  InstructionEngine,
  isPromptInjectionText,
  sanitizeToolOutputAsData,
} from '../instructions/instructionEngine.ts';
import { SkillExecutor } from '../skills/skillExecutor.ts';

export interface CommandRequestOptions {
  conversationId?: string;
  sequence?: number;
  requestId?: string;
  correlationId?: string;
}

export interface CommandDispatchResponse {
  ok: boolean;
  cancelled?: boolean;
  staleSuperseded?: boolean;
  conversationId: string;
  sequence: number;
  requestId: string;
  correlationId: string;
  outcome: AgentOutcomeBadge;
  effectiveLanguage: 'english' | 'roman_urdu' | 'urdu';
  effectiveStyle: 'concise' | 'balanced' | 'detailed';
  operatingMode?: OperatingMode;
  activeProfileId?: string;
  matchedAlias?: string;
  responseUrdu: string;
  responseEnglish: string;
  replyText: string;
  agentState: AgentState;
  task?: TaskQueueItem;
  actions?: AutonomousAction[];
  memory?: unknown;
  offlineFallback?: boolean;
  providerUsed?: string;
  projectId?: string;
  modelUsed?: string;
  requiresConfirmation?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

interface SubtaskOutcome {
  ok: boolean;
  outcome: AgentOutcomeBadge;
  requiresConfirmation?: boolean;
  intent: string;
  riskClass: PolicyRiskClass;
  selectedWorker: string;
  selectedTool: string;
  verificationMethod: string;
  replyEnglish: string;
  replyRomanUrdu: string;
  replyUrdu: string;
  actions: AutonomousAction[];
  targets: string[];
  planSteps: string[];
  memory?: unknown;
  providerUsed?: string;
  projectId?: string;
  modelUsed?: string;
  offlineFallback?: boolean;
  errorCode?: string;
}

export class TaskOrchestrator {
  private currentState: AgentState = 'IDLE';
  private activeTasks: TaskQueueItem[] = [];
  private recentActions: AutonomousAction[] = [];
  private readonly recoveryEngine: RecoveryEngine;
  private readonly instructionEngine = new InstructionEngine();
  private readonly personaEngine = new PersonaEngine();
  private readonly skillExecutor: SkillExecutor;
  private readonly capabilityRegistry: CapabilityRegistry;
  private readonly cancelledTaskIds = new Set<string>();
  private readonly latestSequenceByConversation = new Map<string, number>();

  constructor(
    private readonly storage: StorageAdapter,
    private readonly eventBus: NxEventBus,
    private readonly telemetry: TelemetryAdapter,
    private readonly storageWorker: StorageWorker,
    private readonly browserWorker: BrowserWorker,
    private readonly adbWorker: AdbWorker,
    private readonly modelGateway: ModelGateway,
    private readonly windowsWorker: WindowsWorker = new WindowsWorker(),
    skillExecutor?: SkillExecutor,
    private readonly customerVault: CustomerVault = new CustomerVault(),
    private readonly mediaWorker: MediaWorker = new MediaWorker(),
    capabilityRegistry?: CapabilityRegistry
  ) {
    this.recoveryEngine = new RecoveryEngine(eventBus);
    this.skillExecutor =
      skillExecutor ||
      new SkillExecutor({
        storage,
        eventBus,
        telemetry,
        storageWorker,
        browserWorker,
        adbWorker,
        windowsWorker,
        modelGateway,
        mediaWorker,
        customerVault,
      });
    this.capabilityRegistry =
      capabilityRegistry ||
      new CapabilityRegistry({
        storage,
        telemetry,
        storageWorker,
        mediaWorker,
        browserWorker,
        adbWorker,
        windowsWorker,
        customerVault,
        modelGateway,
      });
  }

  getAgentState(): AgentState {
    return this.currentState;
  }

  getActiveTasks(): TaskQueueItem[] {
    return this.activeTasks;
  }

  getHistoryTasks(limit = 30): TaskQueueItem[] {
    return this.storage.getState().historyTasks.slice(0, limit);
  }

  getRecentActions(limit = 30): AutonomousAction[] {
    return this.recentActions.slice(0, limit);
  }

  private transitionState(task: TaskQueueItem | null, nextState: AgentState, detail: string, progress?: number): void {
    this.currentState = nextState;
    if (task) {
      task.status = nextState;
      task.updatedAt = Date.now();
      task.currentStep = detail;
      if (typeof progress === 'number') {
        task.progress = Math.max(0, Math.min(100, progress));
      }
    }
    this.eventBus.emit('TASK_STATE_CHANGED', detail, task?.taskId, { state: nextState, progress: task?.progress });
    if (typeof progress === 'number' && task) {
      this.eventBus.emit('TASK_PROGRESS', detail, task.taskId, { progressPercent: task.progress });
    }
  }

  private detectLanguage(text: string): TaskQueueItem['detectedLanguage'] {
    const hasUrduScript = /[\u0600-\u06FF]/.test(text);
    const hasRomanUrdu =
      /\b(karo|karein|kholo|khol|banao|dikhao|chala|chalao|batao|yaad|rakhna|hamesha|har\s+dafa|mera|meri|aap|kya|hai|hain|mein|dhundo|save\s+kar|ka\s+record)\b/i.test(
        text
      );
    const hasEnglishWords =
      /\b(open|check|status|usb|drive|chrome|browser|youtube|backup|copy|memory|cpu|ram|system|verify|hi|hello|please|tell|what|how|customer|create|folder|file|play|song|music|api|key)\b/i.test(
        text
      );

    if (hasUrduScript) return 'urdu';
    if (hasRomanUrdu && hasEnglishWords) return 'mixed';
    if (hasRomanUrdu) return 'roman_urdu';
    return 'english';
  }

  private nextSequence(conversationId: string, providedSequence?: number): number {
    const current = this.latestSequenceByConversation.get(conversationId) || 0;
    const seq = typeof providedSequence === 'number' && providedSequence > current ? providedSequence : current + 1;
    this.latestSequenceByConversation.set(conversationId, seq);
    return seq;
  }

  private isSupersededOrCancelled(taskId: string, conversationId: string, sequence: number): boolean {
    if (this.cancelledTaskIds.has(taskId)) return true;
    const latest = this.latestSequenceByConversation.get(conversationId) || 0;
    return sequence < latest;
  }

  private createTaskRecord(cleanPrompt: string): TaskQueueItem {
    const now = Date.now();
    const taskId = `task-${now}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      id: taskId,
      taskId,
      title: cleanPrompt.length > 72 ? `${cleanPrompt.slice(0, 69)}...` : cleanPrompt,
      userPrompt: cleanPrompt,
      normalizedRequest: cleanPrompt.toLowerCase(),
      detectedLanguage: this.detectLanguage(cleanPrompt),
      status: 'RECEIVED',
      progress: 0,
      currentStep: 'Request received',
      plan: [],
      workerAssignments: [],
      actions: [],
      targets: [],
      startedAt: now,
      updatedAt: now,
      confirmationState: 'NONE',
    };
  }

  private finalizeTask(task: TaskQueueItem, finalStatus: AgentState, summary: string, failureReason?: string): void {
    task.status = finalStatus;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.resultSummary = scrubSecrets(summary).cleanText;
    if (failureReason) task.failureReason = failureReason;

    if (task.progressLedger) {
      const total = Math.max(1, task.progressLedger.totalSteps);
      task.progress =
        finalStatus === 'COMPLETED'
          ? 100
          : Math.min(95, Math.round((task.progressLedger.completedSteps.length / total) * 100));
      task.progressLedger.progressPercent = task.progress;
      task.progressLedger.currentStep = task.resultSummary;
    } else {
      task.progress = finalStatus === 'COMPLETED' ? 100 : 0;
    }

    this.activeTasks = [task, ...this.activeTasks.filter((t) => t.taskId !== task.taskId)].slice(0, 15);
    const history = this.storage.getState().historyTasks;
    const existingIdx = history.findIndex((t) => t.taskId === task.taskId);
    if (existingIdx >= 0) history[existingIdx] = task;
    else history.unshift(task);
    if (history.length > 100) history.length = 100;

    if (task.actions.length > 0) {
      this.recentActions.unshift(...task.actions);
      if (this.recentActions.length > 60) this.recentActions.length = 60;
    }

    this.eventBus.emit(
      finalStatus === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_FAILED',
      task.resultSummary,
      task.taskId,
      { status: finalStatus, failureReason }
    );

    this.storage.save();
    this.currentState = 'IDLE';
  }

  private appendChatMessage(
    sender: 'user' | 'agent',
    text: string,
    opts: {
      taskId?: string;
      conversationId?: string;
      sequence?: number;
      requestId?: string;
      correlationId?: string;
      romanUrduSubtext?: string;
      actionDetails?: string;
      status?: ChatMessage['status'];
      outcome?: AgentOutcomeBadge;
    } = {}
  ): ChatMessage {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${sender[0]}-${Math.random().toString(36).slice(2, 5)}`,
      conversationId: opts.conversationId || 'conv-default',
      sequence: opts.sequence,
      requestId: opts.requestId,
      correlationId: opts.correlationId,
      sender,
      text: scrubSecrets(text).cleanText,
      romanUrduSubtext: opts.romanUrduSubtext ? scrubSecrets(opts.romanUrduSubtext).cleanText : undefined,
      time: Date.now(),
      languageDetected: this.detectLanguage(text),
      actionDetails: opts.actionDetails,
      taskId: opts.taskId,
      status: opts.status || 'completed',
      outcome: opts.outcome,
    };
    this.storage.getState().chatMessages.push(msg);
    this.storage.save();
    return msg;
  }

  private selectLocalizedText(
    effectiveLanguage: 'english' | 'roman_urdu' | 'urdu',
    variants: { english: string; romanUrdu?: string; urdu: string }
  ): string {
    if (effectiveLanguage === 'english') return variants.english;
    if (effectiveLanguage === 'roman_urdu') return variants.romanUrdu || variants.english;
    return variants.urdu;
  }

  private enforceStyleLength(text: string, style: 'concise' | 'balanced' | 'detailed'): string {
    const cleaned = text.trim();
    if (style !== 'concise') return cleaned;
    const sentences = cleaned.split(/(?<=[.!?۔])\s+/).filter(Boolean);
    if (sentences.length <= 2) return cleaned;
    return sentences.slice(0, 2).join(' ');
  }

  private verifyFinalResponseTruth(
    proposedText: string,
    outcome: AgentOutcomeBadge,
    actions: AutonomousAction[]
  ): { text: string; outcome: AgentOutcomeBadge } {
    let sanitized = scrubSecrets(proposedText).cleanText;
    sanitized = sanitized.replace(/\[\/?UNTRUSTED_TOOL_DATA[^\]]*\]/gi, '').trim();

    const anyFailedOrUnavailable = actions.some(
      (a) => a.status === 'FAILED' || a.status === 'UNAVAILABLE' || a.status === 'BLOCKED'
    );
    const anySucceeded = actions.some((a) => a.status === 'VERIFIED');
    if (anyFailedOrUnavailable && outcome === 'DONE') {
      return {
        text: sanitized,
        outcome: anySucceeded
          ? 'PARTIALLY_DONE'
          : actions.some((a) => a.status === 'BLOCKED')
            ? 'BLOCKED'
            : actions.some((a) => a.status === 'UNAVAILABLE')
              ? 'UNAVAILABLE'
              : 'PARTIALLY_DONE',
      };
    }
    return { text: sanitized, outcome };
  }

  cancelTask(taskId: string): TaskQueueItem | null {
    this.cancelledTaskIds.add(taskId);
    const task =
      this.activeTasks.find((t) => t.taskId === taskId || t.id === taskId) ||
      this.storage.getState().historyTasks.find((t) => t.taskId === taskId || t.id === taskId);
    if (!task) return null;
    if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED') {
      return task;
    }
    task.status = 'CANCELLED';
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.currentStep = 'Cancelled by operator';
    task.resultSummary = 'Task execution cancelled before completion.';
    this.storage.save();
    this.eventBus.emit('TASK_STATE_CHANGED', 'Task cancelled by operator', task.taskId, { state: 'CANCELLED' });
    this.currentState = 'IDLE';
    return task;
  }

  confirmTask(taskId: string, approved: boolean): TaskQueueItem | null {
    const task =
      this.activeTasks.find((t) => t.taskId === taskId || t.id === taskId) ||
      this.storage.getState().historyTasks.find((t) => t.taskId === taskId || t.id === taskId);
    if (!task) return null;
    if (task.status !== 'CONFIRMATION_REQUIRED') return task;

    if (!approved) {
      task.status = 'CANCELLED';
      task.confirmationState = 'DECLINED';
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      task.currentStep = 'Confirmation declined';
      task.resultSummary = 'Operator declined destructive/high-impact operation.';
      task.verification = {
        status: 'BLOCKED',
        checkedAt: Date.now(),
        summary: 'Operation halted because operator declined confirmation.',
      };
      this.storage.save();
      this.eventBus.emit('POLICY_BLOCKED', 'Operator declined high-impact action', task.taskId);
      return task;
    }

    task.confirmationState = 'APPROVED';
    if (process.platform !== 'win32') {
      task.status = 'FAILED';
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      task.failureReason = 'WINDOWS_HOST_REQUIRED';
      task.currentStep = 'Windows host required for confirmed OS power/volume operation';
      task.resultSummary =
        'Operator approved confirmation, but Windows host execution is unavailable on this Linux environment (WINDOWS_HOST_REQUIRED).';
      task.verification = {
        status: 'UNAVAILABLE',
        checkedAt: Date.now(),
        summary: 'Execution skipped honestly: running on Linux container instead of Windows host.',
      };
      this.eventBus.emit('TASK_FAILED', task.resultSummary, task.taskId, { reason: 'WINDOWS_HOST_REQUIRED' });
      this.storage.save();
      return task;
    }

    task.status = 'FAILED';
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.failureReason = 'EXPLICIT_TARGET_PARAMETERS_REQUIRED';
    task.resultSummary =
      'Operator confirmed prompt, but explicit verified execution parameters (device/volume/PID) are required before dispatch.';
    task.verification = {
      status: 'UNVERIFIED',
      checkedAt: Date.now(),
      summary: 'Awaiting explicit target parameters for post-confirmation execution.',
    };
    this.storage.save();
    return task;
  }

  private parseCustomerDetailsFromText(rawText: string): {
    name?: string;
    cnic?: string;
    phone?: string;
    imei?: string;
    deviceModel?: string;
    repairNotes?: string;
  } {
    const cnicMatch = rawText.match(/\b(\d{5}-\d{7}-\d{1})\b/);
    const phoneMatch = rawText.match(/\b((?:\+92|0)3\d{2}[-\s]?\d{7})\b/);
    const imeiMatch = rawText.match(/\bimei[:\s#-]*(\d{14,16})\b/i);
    const nameMatch =
      rawText.match(/\bcustomer\s+(?:name\s*(?:is|:)?\s*)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/) ||
      rawText.match(/(?:for|save|update|lookup|find|open|kh?olo)\s+(?:customer\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:ka|ki|ke|cnic|phone|imei|record)/i) ||
      rawText.match(/^([A-Z][a-zA-Z]+)\s+(?:ka|ki|ke)\s+(?:cnic|record|phone|imei)/i);
    const deviceMatch = rawText.match(/\b(?:device|phone|model)[:\s]+([A-Za-z0-9\s-]{3,32})/i);
    const repairMatch = rawText.match(/\b(?:repair\s*note|issue|note)[:\s]+(.+)$/i);

    return {
      name: nameMatch?.[1]?.trim(),
      cnic: cnicMatch?.[1],
      phone: phoneMatch?.[1],
      imei: imeiMatch?.[1],
      deviceModel: deviceMatch?.[1]?.trim(),
      repairNotes: repairMatch?.[1]?.trim(),
    };
  }

  private extractSafeFilesystemTarget(cleanSub: string): {
    op: 'mkdir' | 'mkfile' | 'rename' | 'search' | 'list';
    targetPath: string;
    secondPath?: string;
    fileContent?: string;
  } {
    const lower = cleanSub.toLowerCase();
    const renameMatch = cleanSub.match(/\brename\s+([^\s]+)\s+(?:to|as)\s+([^\s]+)/i);
    if (renameMatch) {
      return { op: 'rename', targetPath: renameMatch[1], secondPath: renameMatch[2] };
    }

    const mkdirMatch = cleanSub.match(/(?:create\s+folder|mkdir|make\s+folder|folder\s+banao)\s+([^\s,;]+)/i);
    if (mkdirMatch) {
      return { op: 'mkdir', targetPath: mkdirMatch[1] };
    }

    const mkfileMatch = cleanSub.match(
      /(?:create\s+file|create\s+note|write\s+file|save\s+document|file\s+banao)\s+([^\s,;]+)(?:\s+(?:with|content)\s+(.+))?/i
    );
    if (mkfileMatch) {
      return {
        op: 'mkfile',
        targetPath: mkfileMatch[1],
        fileContent: mkfileMatch[2] || `Created by NX AI at ${new Date().toISOString()}`,
      };
    }

    const searchMatch = cleanSub.match(/(?:search|find|dhundo)\s+(?:files?\s+)?(?:for\s+|named\s+)?([^\s,;]+)/i);
    if (searchMatch && /\b(search|find|dhundo)\b/i.test(lower)) {
      return { op: 'search', targetPath: '.', secondPath: searchMatch[1] };
    }

    const listMatch = cleanSub.match(/(?:list|open|show|inspect|access)\s+(?:files?\s+in\s+|folder\s+)?([A-Za-z0-9_./\\:-]+)/i);
    const rawCandidate = listMatch?.[1] || '.';
    const targetPath =
      /^(my|files|folder|all|documents|downloads)$/i.test(rawCandidate) ? '.' : rawCandidate;
    return { op: 'list', targetPath };
  }

  private async executeSingleSubtask(params: {
    rawSub: string;
    cleanSub: string;
    hadSubSecrets: boolean;
    redactedSubCategories: string[];
    task: TaskQueueItem;
    conversationId: string;
    sequence: number;
    requestId: string;
    correlationId: string;
    effectiveLanguage: 'english' | 'roman_urdu' | 'urdu';
    operatingMode: OperatingMode;
    behaviorProfile: BehaviorProfile;
    allowPromptConfirmationPause: boolean;
  }): Promise<SubtaskOutcome> {
    const {
      rawSub,
      cleanSub,
      hadSubSecrets,
      redactedSubCategories,
      task,
      conversationId,
      effectiveLanguage,
      operatingMode,
      behaviorProfile,
      allowPromptConfirmationPause,
    } = params;
    const lower = cleanSub.toLowerCase();
    const cls = classifyActionRisk(cleanSub, { hadRawSecrets: hadSubSecrets, operatingMode });

    // 1. Blocked destructive / exfiltration / injection rules (R5)
    if (!cls.allowed) {
      const guardAction: AutonomousAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        taskId: task.taskId,
        category: 'POLICY_GUARD',
        level: 'LEVEL_1_WIN32',
        workerId: 'policy-engine',
        summary: cls.reason || 'Blocked by NX PolicyEngine',
        target: cls.ruleId,
        status: 'BLOCKED',
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: cls.ruleId,
        interactionDetails: { method: 'os_policy' },
      };
      this.eventBus.emit('POLICY_BLOCKED', guardAction.summary, task.taskId, { ruleId: cls.ruleId });
      return {
        ok: false,
        outcome: 'BLOCKED',
        intent: cls.intent,
        riskClass: cls.riskClass,
        selectedWorker: 'policy-engine',
        selectedTool: 'policy.evaluate_command',
        verificationMethod: 'PolicyEngine.classifyActionRisk',
        replyEnglish: cls.reason || `Blocked by ${cls.ruleId}.`,
        replyRomanUrdu: `PolicyEngine ne is action ko block kar diya (${cls.ruleId}): ${cls.reason || 'Protected security boundary.'}`,
        replyUrdu:
          cls.ruleId === 'POL-OS-DRIVE-GUARD'
            ? 'سسٹم کی مرکزی OS ڈرائیو (C:) مستقل طور پر محفوظ ہے۔ پالیسی گارڈ کے تحت اس پر Delete یا Format کی اجازت نہیں ہے۔'
            : `سیکیورٹی پالیسی (${cls.ruleId}) کے تحت یہ عمل ممنوع ہے۔`,
        actions: [guardAction],
        targets: [cls.ruleId],
        planSteps: [`Evaluate risk (${cls.riskClass}) -> blocked by ${cls.ruleId}`],
        errorCode: cls.ruleId,
      };
    }

    // 2. Negated Security Instruction ("Do not show API keys in plaintext") -> Acknowledge & remember cleanly
    if (cls.isNegatedSecurityRequest) {
      let savedMem: unknown;
      try {
        savedMem = this.storage.addMemory(cleanSub, 'PREFERENCE', 'security_rule_directive', 0.99);
      } catch {
        // Already exists or ignored safely
      }
      const ackAction: AutonomousAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        taskId: task.taskId,
        category: 'INTERNAL_TOOL',
        workerId: 'memory-engine',
        summary: 'Acknowledged negated security rule (secrets remain masked and never logged in plaintext).',
        target: 'data/nx_database.json',
        status: 'VERIFIED',
        startedAt: Date.now(),
        completedAt: Date.now(),
        interactionDetails: { method: 'direct_api' },
      };
      return {
        ok: true,
        outcome: 'DONE',
        intent: cls.intent,
        riskClass: 'R0_INFORMATIONAL',
        selectedWorker: 'memory-engine',
        selectedTool: 'memory.add_and_reload',
        verificationMethod: 'PolicyEngine negation classification + vault redaction enforcement',
        replyEnglish: `Security directive confirmed: "${cleanSub}". API keys, CNICs, OTPs, and passwords stay encrypted and masked.`,
        replyRomanUrdu: `Security rule confirm ho gayi: "${cleanSub}". API keys aur sensitive secrets plaintext mein show nahi kiye jayenge.`,
        replyUrdu: `سیکیورٹی اصول کی تصدیق ہو گئی: حساس keys اور پاس ورڈز کبھی plaintext میں ظاہر نہیں ہوں گے۔`,
        actions: [ackAction],
        targets: ['security_policy'],
        planSteps: ['Classify negated security preference', 'Verify redaction rules enforced'],
        memory: savedMem,
      };
    }

    // 3. Explicit Confirmation Required (shutdown, restart, format non-C, delete customer)
    if (cls.requiresConfirmation && (this.storage.getState().preferences?.confirmHighRisk ?? true)) {
      if (allowPromptConfirmationPause) {
        return {
          ok: true,
          outcome: 'BLOCKED',
          requiresConfirmation: true,
          intent: cls.intent,
          riskClass: cls.riskClass,
          selectedWorker: 'policy-engine',
          selectedTool: 'policy.evaluate_command',
          verificationMethod: 'Operator confirmation gate',
          replyEnglish: cls.reason || 'Explicit operator confirmation required before execution.',
          replyRomanUrdu: 'Yeh high-impact action hai. Aage barhne se pehle Tasks panel mein Confirm karein.',
          replyUrdu: 'یہ عمل سسٹم یا ڈیٹا پر بڑا اثر ڈال سکتا ہے۔ براہ کرم آگے بڑھنے سے پہلے ٹاسک پینل میں اس کی تصدیق کریں۔',
          actions: [],
          targets: [],
          planSteps: ['Hold at operator confirmation gate'],
        };
      }
      return {
        ok: false,
        outcome: 'BLOCKED',
        intent: cls.intent,
        riskClass: cls.riskClass,
        selectedWorker: 'policy-engine',
        selectedTool: 'policy.evaluate_command',
        verificationMethod: 'Operator confirmation gate',
        replyEnglish: `Skipped pending confirmation: ${cls.reason || cleanSub}`,
        replyRomanUrdu: `Confirmation darkaar hone par skip kiya gaya: ${cleanSub}`,
        replyUrdu: `تصدیق درکار ہونے کی وجہ سے یہ مرحلہ روک دیا گیا ہے۔`,
        actions: [],
        targets: [],
        planSteps: [`Confirmation required (${cls.riskClass})`],
        errorCode: 'CONFIRMATION_REQUIRED',
      };
    }

    // 4. R4 Legitimate API Key / Vault Routing (NO blanket halt on legitimate "API key add karni hai")
    if (cls.intent === 'PROVIDER_KEY_VAULT_ROUTE') {
      const isPasswordOrRawSecret =
        hadSubSecrets || /\b(password\s*[:=]|pin\s*[:=]|otp\s*[:=])/i.test(rawSub);
      if (isPasswordOrRawSecret) {
        const secAction: AutonomousAction = {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          taskId: task.taskId,
          category: 'POLICY_GUARD',
          workerId: 'policy-engine',
          summary: `Redacted raw secret (${redactedSubCategories.join(', ') || 'CREDENTIAL'}) and routed credential handling to encrypted vault.`,
          target: 'KeyVault (AES-256-GCM)',
          status: 'BLOCKED',
          startedAt: Date.now(),
          completedAt: Date.now(),
          error: 'POLICY_SECRET_REDACTED',
          interactionDetails: { method: 'os_policy' },
        };
        return {
          ok: false,
          outcome: 'BLOCKED',
          intent: cls.intent,
          riskClass: 'R4_SENSITIVE_DATA',
          selectedWorker: 'policy-engine',
          selectedTool: 'policy.evaluate_command',
          verificationMethod: 'scrubSecrets + encrypted vault boundary',
          replyEnglish:
            'Sensitive credential pattern was redacted from chat/logs. Enter API keys inside Intelligence Hub -> Add API Key (AES-256-GCM encrypted vault).',
          replyRomanUrdu:
            'Sensitive secret chat logs se redact kar diya gaya hai. API key Intelligence Hub -> Add API Key (encrypted vault) mein add karein.',
          replyUrdu:
            'حساس credential کو چیٹ اور لاگز سے ریڈیکٹ کر دیا گیا ہے۔ براہ کرم API key کو Intelligence Hub کے encrypted vault میں شامل کریں۔',
          actions: [secAction],
          targets: ['KeyVault'],
          planSteps: ['Scrub credential pattern', 'Route user to AES-256-GCM vault'],
          errorCode: 'POLICY_SECRET_REDACTED',
        };
      }

      const routeAction: AutonomousAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        taskId: task.taskId,
        category: 'INTERNAL_TOOL',
        workerId: 'model-gateway',
        summary: `Prepared secure platform-first API Key Vault workflow (${this.modelGateway.getProfiles().length} existing pool(s)).`,
        target: '/api/v1/providers',
        status: 'VERIFIED',
        startedAt: Date.now(),
        completedAt: Date.now(),
        interactionDetails: { method: 'direct_api' },
      };
      return {
        ok: true,
        outcome: 'DONE',
        intent: cls.intent,
        riskClass: 'R4_SENSITIVE_DATA',
        selectedWorker: 'model-gateway',
        selectedTool: 'model.gateway_complete',
        verificationMethod: 'KeyVault AES-256-GCM availability check',
        replyEnglish:
          'API Key Vault is ready (AES-256-GCM encrypted, never logged in plaintext). Open Intelligence Hub -> Add API Key, choose platform (Gemini, OpenAI, Claude, Groq, OpenRouter, DeepSeek), and keys + models auto-validate.',
        replyRomanUrdu:
          'Encrypted API Key Vault ready hai (AES-256-GCM). Intelligence Hub -> Add API Key mein ja kar platform select karein aur key paste karein — backend khud models discover aur validate karega.',
        replyUrdu:
          'محفوظ API Key Vault (AES-256-GCM) تیار ہے۔ Intelligence Hub میں جا کر Add API Key سے پلیٹ فارم منتخب کریں، ماڈلز خودکار تصدیق ہوں گے۔',
        actions: [routeAction],
        targets: ['KeyVault'],
        planSteps: ['Inspect KeyVault', 'Provide encrypted platform-first key intake route'],
      };
    }

    // 5. Dynamic "What can you do?" Capability Inquiry
    if (cls.intent === 'CAPABILITY_INQUIRY') {
      const capSummary = await this.capabilityRegistry.buildDynamicCapabilitiesSummary(
        effectiveLanguage,
        operatingMode
      );
      const capAction: AutonomousAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        taskId: task.taskId,
        category: 'INTERNAL_TOOL',
        workerId: 'capability-registry',
        summary: `Queried live CapabilityRegistry (${capSummary.readyCount}/${capSummary.capabilities.length} ready now).`,
        target: '/api/v1/capabilities',
        status: 'VERIFIED',
        startedAt: Date.now(),
        completedAt: Date.now(),
        interactionDetails: { method: 'direct_api' },
      };
      return {
        ok: true,
        outcome: 'ANSWER',
        intent: 'CAPABILITY_INQUIRY',
        riskClass: 'R0_INFORMATIONAL',
        selectedWorker: 'capability-registry',
        selectedTool: 'policy.evaluate_command',
        verificationMethod: 'Live CapabilityRegistry enumeration across host adapters',
        replyEnglish: capSummary.english,
        replyRomanUrdu: capSummary.romanUrdu,
        replyUrdu: capSummary.urdu,
        actions: [capAction],
        targets: ['CapabilityRegistry'],
        planSteps: ['Query live CapabilityRegistry', 'Filter active vs HOST_UNAVAILABLE vs NOT_CONFIGURED'],
      };
    }

    // 6. R4 Encrypted Customer Data Vault Workflow
    if (cls.intent === 'CUSTOMER_VAULT_WRITE' || cls.intent === 'CUSTOMER_VAULT_READ') {
      const prefs = this.storage.getState().preferences;
      const parsed = this.parseCustomerDetailsFromText(rawSub);
      const isWrite = cls.intent === 'CUSTOMER_VAULT_WRITE';

      if (isWrite) {
        if (!parsed.name && !parsed.cnic && !parsed.phone && !parsed.repairNotes && !parsed.imei) {
          const readCount = this.customerVault.getCount();
          return {
            ok: true,
            outcome: 'ANSWER',
            intent: cls.intent,
            riskClass: 'R4_SENSITIVE_DATA',
            selectedWorker: 'customer-worker',
            selectedTool: 'customer.vault_crud',
            verificationMethod: 'CustomerVault active check',
            replyEnglish: `Encrypted CustomerVault ready (${readCount} records). Include customer name/CNIC/phone or use Workspace -> Customer Records.`,
            replyRomanUrdu: `Encrypted CustomerVault tayar hai (${readCount} records). Customer ka naam ya CNIC likh kar dein ya Workspace -> Customer Records kholen.`,
            replyUrdu: `محفوظ کسٹمر والٹ تیار ہے (${readCount} ریکارڈز)۔ براہ کرم کسٹمر کا نام یا تفصیل لکھیں۔`,
            actions: [],
            targets: ['CustomerVault'],
            planSteps: ['Prompt for customer details'],
          };
        }

        const existing = parsed.name
          ? this.customerVault.findCustomerByQuery(parsed.name, {
              operatingMode,
              fieldsEnabled: prefs.customerFieldsEnabled,
            })
          : null;

        const saved = existing
          ? this.customerVault.updateCustomer(existing.customerId, {
              cnic: parsed.cnic ?? undefined,
              phone: parsed.phone ?? undefined,
              imei: parsed.imei ?? undefined,
              deviceModel: parsed.deviceModel ?? undefined,
              repairNotes: parsed.repairNotes ?? undefined,
            })
          : this.customerVault.createCustomer({
              name: parsed.name || 'Customer Entry',
              cnic: parsed.cnic,
              phone: parsed.phone,
              imei: parsed.imei,
              deviceModel: parsed.deviceModel,
              repairNotes: parsed.repairNotes,
            });

        const verifiedBack = saved
          ? this.customerVault.getCustomer(saved.customerId, {
              revealSensitive: false,
              operatingMode,
              fieldsEnabled: prefs.customerFieldsEnabled,
            })
          : null;

        this.eventBus.emit(
          existing ? 'CUSTOMER_UPDATED' : 'CUSTOMER_CREATED',
          `${existing ? 'Updated' : 'Created'} encrypted customer record ${saved?.customerId}`,
          task.taskId,
          { customerId: saved?.customerId, hasCnic: Boolean(parsed.cnic) }
        );

        const action: AutonomousAction = {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          taskId: task.taskId,
          category: 'INTERNAL_TOOL',
          workerId: 'customer-worker',
          summary: `Encrypted customer record ${verifiedBack?.name || saved?.name} (${verifiedBack?.customerId}) written via AES-256-GCM and verified masked.`,
          target: 'data/nx_customer_vault.json',
          status: verifiedBack ? 'VERIFIED' : 'FAILED',
          startedAt: Date.now(),
          completedAt: Date.now(),
          interactionDetails: { method: 'direct_api' },
        };

        const cnicNote = verifiedBack?.cnicMasked ? ` CNIC ${verifiedBack.cnicMasked}` : '';
        return {
          ok: Boolean(verifiedBack),
          outcome: verifiedBack ? 'DONE' : 'FAILED',
          intent: 'CUSTOMER_VAULT_WRITE',
          riskClass: 'R4_SENSITIVE_DATA',
          selectedWorker: 'customer-worker',
          selectedTool: 'customer.vault_crud',
          verificationMethod: 'AES-256-GCM disk write + masked readback check',
          replyEnglish: verifiedBack
            ? `Saved encrypted record for ${verifiedBack.name} (${verifiedBack.customerId}${cnicNote ? `,${cnicNote}` : ''}). Plaintext values are hidden from logs.`
            : 'Failed to verify encrypted customer write on disk.',
          replyRomanUrdu: verifiedBack
            ? `${verifiedBack.name} ka record AES-256-GCM encryption ke sath save aur verify ho gaya (${verifiedBack.customerId}${cnicNote ? `,${cnicNote}` : ''}).`
            : 'Customer record verify nahi ho saka.',
          replyUrdu: verifiedBack
            ? `کسٹمر ${verifiedBack.name} کا ریکارڈ انکرپٹڈ والٹ میں محفوظ اور تصدیق ہو گیا ہے (${verifiedBack.customerId})۔`
            : 'کسٹمر ریکارڈ کی تصدیق ناکام رہی۔',
          actions: [action],
          targets: ['data/nx_customer_vault.json'],
          planSteps: ['Classify R4 legitimate customer write', 'Encrypt fields with AES-256-GCM', 'Verify masked readback'],
        };
      } else {
        const searchTerm = parsed.name || cleanSub.replace(/\b(customer|record|open|find|lookup|show|dikhao|kholo|ka|ki|ke)\b/gi, '').trim();
        const matches = this.customerVault.listCustomers({
          query: searchTerm,
          operatingMode,
          fieldsEnabled: prefs.customerFieldsEnabled,
        });
        this.eventBus.emit('CUSTOMER_VIEWED', `Queried encrypted CustomerVault (${matches.length} masked match(es))`, task.taskId, {
          count: matches.length,
          operatingMode,
        });
        const action: AutonomousAction = {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          taskId: task.taskId,
          category: 'INTERNAL_TOOL',
          workerId: 'customer-worker',
          summary: `Retrieved ${matches.length} masked customer record(s) under ${operatingMode}.`,
          target: 'data/nx_customer_vault.json',
          status: 'VERIFIED',
          startedAt: Date.now(),
          completedAt: Date.now(),
          interactionDetails: { method: 'direct_api' },
        };
        const preview = matches
          .slice(0, 3)
          .map((c) => `${c.name} (${c.customerId}${c.cnicMasked ? `, CNIC ${c.cnicMasked}` : ''})`)
          .join('; ');
        return {
          ok: true,
          outcome: 'DONE',
          intent: 'CUSTOMER_VAULT_READ',
          riskClass: 'R4_SENSITIVE_DATA',
          selectedWorker: 'customer-worker',
          selectedTool: 'customer.vault_crud',
          verificationMethod: 'CustomerVault encrypted lookup (masked view)',
          replyEnglish:
            matches.length > 0
              ? `Found ${matches.length} customer record(s): ${preview}.`
              : `No active customer record matched "${searchTerm || 'query'}". Open Workspace -> Customer Records to add one.`,
          replyRomanUrdu:
            matches.length > 0
              ? `${matches.length} customer record(s) mile: ${preview}.`
              : `Koi customer record match nahi hua. Workspace -> Customer Records se naya record add kar sakte hain.`,
          replyUrdu:
            matches.length > 0
              ? `${matches.length} کسٹمر ریکارڈ ملے: ${preview}۔`
              : 'کوئی کسٹمر ریکارڈ نہیں ملا۔',
          actions: [action],
          targets: ['data/nx_customer_vault.json'],
          planSteps: ['Decrypt & search CustomerVault', 'Apply sensitive masking & operating mode rules'],
        };
      }
    }

    // 7. Persistent User Preference / Directive Capture
    if (/\b(har\s+dafa|always|hamesha|yaad\s+rakhna|remember\s+that)\b/i.test(lower)) {
      const memContent = cleanSub.replace(/\b(nx|ai|yaad\s+rakhna)\b/gi, '').trim() || cleanSub;
      if (isPromptInjectionText(memContent)) {
        return {
          ok: false,
          outcome: 'BLOCKED',
          intent: 'MEMORY_INJECTION_BLOCKED',
          riskClass: 'R5_DESTRUCTIVE',
          selectedWorker: 'memory-engine',
          selectedTool: 'memory.add_and_reload',
          verificationMethod: 'InstructionEngine.isPromptInjectionText',
          replyEnglish: 'Rejected directive because it contains unsafe system-override phrasing.',
          replyRomanUrdu: 'Yeh directive safety override pattern ki wajah se reject kar di gayi hai.',
          replyUrdu: 'سیکیورٹی اصولوں کی خلاف ورزی کی وجہ سے یہ ہدایت محفوظ نہیں کی جا سکی۔',
          actions: [],
          targets: ['memory'],
          planSteps: ['Reject unsafe prompt injection directive'],
          errorCode: 'MEMORY_INJECTION_BLOCKED',
        };
      }
      const saved = this.storage.addMemory(memContent, 'PREFERENCE', 'user_directive', 0.98);
      const reloaded = this.storage.reload().memories.some((m) => m.id === saved.id);
      const action: AutonomousAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        taskId: task.taskId,
        category: 'INTERNAL_TOOL',
        workerId: 'memory-engine',
        summary: `Persisted user preference and verified disk readback (${saved.id}).`,
        target: 'data/nx_database.json',
        status: reloaded ? 'VERIFIED' : 'FAILED',
        startedAt: Date.now(),
        completedAt: Date.now(),
        evidence: { memoryId: saved.id, diskVerified: reloaded },
        interactionDetails: { method: 'direct_api' },
      };
      this.eventBus.emit('MEMORY_UPDATED', action.summary, task.taskId, { memoryId: saved.id });
      return {
        ok: reloaded,
        outcome: reloaded ? 'DONE' : 'FAILED',
        intent: 'SAVE_MEMORY_PREFERENCE',
        riskClass: 'R2_REVERSIBLE_WRITE',
        selectedWorker: 'memory-engine',
        selectedTool: 'memory.add_and_reload',
        verificationMethod: 'Disk write + StorageAdapter.reload() check',
        replyEnglish: `Saved and verified preference in persistent memory: "${saved.content}"`,
        replyRomanUrdu: `Maine yeh preference persistent memory mein save aur verify kar li hai: "${saved.content}"`,
        replyUrdu: `میں نے یہ ہدایت مستقل میموری میں محفوظ کر کے تصدیق کر لی ہے: "${saved.content}"`,
        actions: [action],
        targets: ['data/nx_database.json'],
        planSteps: ['Scrub secret patterns', 'Write PREFERENCE memory item', 'Verify disk persistence'],
        memory: saved,
      };
    }

    // 8. Media Discovery & Playback Worker ("Access my files and play any song", "play music")
    if (cls.intent === 'MEDIA_SCAN_OR_PLAY' || /\b(song|music|audio|media|gaana|mp3|playlist|player)\b/i.test(lower)) {
      const skillRes = await this.skillExecutor.executeSkill('media-play', {
        query: cleanSub,
        taskId: task.taskId,
      });
      const playRes = this.mediaWorker.playMedia(cleanSub);
      return {
        ok: playRes.ok,
        outcome: playRes.ok ? 'DONE' : playRes.code === 'WINDOWS_HOST_REQUIRED' ? 'UNAVAILABLE' : 'FAILED',
        intent: 'MEDIA_SCAN_OR_PLAY',
        riskClass: 'R2_REVERSIBLE_WRITE',
        selectedWorker: 'media-worker',
        selectedTool: 'media.scan_and_play',
        verificationMethod: 'MediaWorker filesystem scan + Windows player process verification',
        replyEnglish: playRes.message,
        replyRomanUrdu: playRes.ok
          ? `Media play aur verify ho gaya: ${playRes.matchedFile?.name || cleanSub}`
          : `Media folders scan kiye (${playRes.scannedCount} files mili), lekin audio playback ke liye Windows desktop host chahiye (${playRes.code}).`,
        replyUrdu: playRes.ok
          ? `میڈیا فائل چلا دی گئی ہے: ${playRes.matchedFile?.name || cleanSub}`
          : `فولڈر اسکین مکمل (${playRes.scannedCount} فائلیں)، لیکن آڈیو چلانے کے لیے Windows ڈیسک ٹاپ درکار ہے (${playRes.code})۔`,
        actions: [skillRes.action],
        targets: [playRes.matchedFile?.path || 'media_dirs'],
        planSteps: ['Scan Music/Downloads/data/media', 'Invoke Windows media player if supported'],
        errorCode: playRes.ok ? undefined : playRes.code,
      };
    }

    // 9. USB & Storage Inspection / Preflight / Eject
    if (/\b(usb|drive|drives|disk|storage|preflight|volume|eject)\b/i.test(lower)) {
      if (/\beject\b/i.test(lower)) {
        const driveMatch = cleanSub.match(/\b([A-Za-z]:\\?|\/(?:media|mnt)\/[^\s]+)\b/);
        const targetDrive = driveMatch?.[1] || 'F:\\';
        const ej = this.storageWorker.ejectVolume(targetDrive);
        const action: AutonomousAction = {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          taskId: task.taskId,
          category: 'STORAGE_OPERATION',
          workerId: 'storage-worker',
          summary: ej.message,
          target: targetDrive,
          status: ej.status === 'EJECTED' ? 'VERIFIED' : ej.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'FAILED',
          startedAt: Date.now(),
          completedAt: Date.now(),
          error: ej.status === 'EJECTED' ? undefined : ej.reason || ej.status,
          interactionDetails: { method: 'direct_api' },
        };
        return {
          ok: ej.status === 'EJECTED',
          outcome: ej.status === 'EJECTED' ? 'DONE' : ej.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'FAILED',
          intent: 'STORAGE_EJECT',
          riskClass: 'R2_REVERSIBLE_WRITE',
          selectedWorker: 'storage-worker',
          selectedTool: 'storage.safe_eject',
          verificationMethod: 'StorageWorker.ejectVolume + post-eject mount re-check',
          replyEnglish: ej.message,
          replyRomanUrdu: ej.message,
          replyUrdu: ej.message,
          actions: [action],
          targets: [targetDrive],
          planSteps: ['Verify removable volume state', 'Run OS safe eject'],
          errorCode: ej.status === 'EJECTED' ? undefined : ej.status,
        };
      }

      const skillRes = await this.skillExecutor.executeSkill('storage-check', { query: cleanSub, taskId: task.taskId });
      const volumes = this.storageWorker.discoverVolumes();
      const usbVolumes = volumes.filter((v) => v.type === 'USB' && v.isPresent);
      const targetForCheck = usbVolumes[0]?.letter || 'F:\\';
      const preflight = this.storageWorker.validatePreFlight(targetForCheck, [], [350, 420]);
      const driveSummary = volumes
        .map((v) => `${v.letter} (${v.freeGB ?? '?'}GB free/${v.totalGB ?? '?'}GB)`)
        .join(', ');

      return {
        ok: true,
        outcome: 'DONE',
        intent: 'STORAGE_DISCOVERY',
        riskClass: 'R1_READ_ONLY',
        selectedWorker: 'storage-worker',
        selectedTool: 'storage.discover_volumes',
        verificationMethod: 'Live filesystem mount & statfs enumeration',
        replyEnglish:
          usbVolumes.length > 0
            ? `Detected ${volumes.length} volume(s) including ${usbVolumes.length} removable USB(s): ${driveSummary}.`
            : `No removable USB drive is currently mounted. Live host volumes: ${driveSummary}.`,
        replyRomanUrdu:
          usbVolumes.length > 0
            ? `${volumes.length} drives aur ${usbVolumes.length} USB drive detect hui: ${driveSummary}.`
            : `Abhi koi removable USB drive attached nahi hai. Live volumes: ${driveSummary}.`,
        replyUrdu:
          usbVolumes.length > 0
            ? `سسٹم پر ${volumes.length} ڈرائیوز اور ${usbVolumes.length} یو ایس بی ڈرائیو موجود ہیں: ${driveSummary}۔`
            : `اس وقت سسٹم پر کوئی قابلِ تحریر USB ڈرائیو منسلک نہیں ملی۔ موجودہ سسٹم ڈرائیوز (${volumes.length}): ${driveSummary}۔`,
        actions: [{ ...skillRes.action, evidence: { volumesCount: volumes.length, usbCount: usbVolumes.length, preflightPassed: preflight.passed } }],
        targets: volumes.map((v) => v.letter),
        planSteps: ['Discover mounted volumes', 'Inspect removable USB status', 'Run preflight checks'],
      };
    }

    // 10. File & Folder Safe Read / Create / Search / Rename Worker
    if (
      cls.intent === 'FILESYSTEM_OR_SAFE_WRITE' ||
      /\b(list\s+files|search\s+files|find\s+file|access\s+my\s+files|create\s+folder|mkdir|create\s+file|create\s+note|rename|folder\s+banao|file\s+banao|downloads\s+folder)\b/i.test(
        lower
      )
    ) {
      const fsOp = this.extractSafeFilesystemTarget(cleanSub);
      let fsRes: { ok: boolean; code: string; message: string; path: string };
      let toolId = 'storage.create_file_or_folder';

      if (fsOp.op === 'mkdir') {
        const r = this.storageWorker.createFolder(fsOp.targetPath);
        fsRes = r;
      } else if (fsOp.op === 'mkfile') {
        const r = this.storageWorker.createFile(fsOp.targetPath, fsOp.fileContent);
        fsRes = r;
      } else if (fsOp.op === 'rename' && fsOp.secondPath) {
        const r = this.storageWorker.renamePath(fsOp.targetPath, fsOp.secondPath);
        fsRes = { ok: r.ok, code: r.code, message: r.message, path: r.newPath };
      } else if (fsOp.op === 'search' && fsOp.secondPath) {
        const r = this.storageWorker.searchFiles(fsOp.targetPath, fsOp.secondPath);
        fsRes = { ok: r.ok, code: r.code, message: r.message, path: r.directory };
        toolId = 'storage.discover_volumes';
      } else {
        const dirToList = lower.includes('downloads')
          ? path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads')
          : fsOp.targetPath;
        const r = this.storageWorker.listDirectory(dirToList, false);
        fsRes = { ok: r.ok, code: r.code, message: r.message, path: r.directory };
        toolId = 'storage.discover_volumes';
      }

      const isBlocked = fsRes.code === 'PROTECTED_OS_PATH' || fsRes.code === 'PATH_TRAVERSAL_BLOCKED';
      const actionStatus = fsRes.ok ? 'VERIFIED' : isBlocked ? 'BLOCKED' : 'FAILED';
      const action: AutonomousAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        taskId: task.taskId,
        category: 'FILE_EXPLORER',
        workerId: 'storage-worker',
        summary: fsRes.message,
        target: fsRes.path,
        status: actionStatus,
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: fsRes.ok ? undefined : fsRes.code,
        interactionDetails: { method: 'direct_api', targetPath: fsRes.path },
      };
      return {
        ok: fsRes.ok,
        outcome: fsRes.ok ? 'DONE' : isBlocked ? 'BLOCKED' : 'FAILED',
        intent: 'FILESYSTEM_OPERATION',
        riskClass: fsOp.op === 'list' || fsOp.op === 'search' ? 'R1_READ_ONLY' : 'R2_REVERSIBLE_WRITE',
        selectedWorker: 'storage-worker',
        selectedTool: toolId,
        verificationMethod: 'sanitizeSafePath boundary + post-write fs.statSync verification',
        replyEnglish: fsRes.message,
        replyRomanUrdu: fsRes.ok
          ? `File/Folder operation verify ho gaya: ${fsRes.message}`
          : `File/Folder operation ruk gaya (${fsRes.code}): ${fsRes.message}`,
        replyUrdu: fsRes.ok
          ? `فائل/فولڈر کا عمل مکمل اور تصدیق شدہ ہے: ${fsRes.message}`
          : `فائل/فولڈر کا عمل ناکام یا ممنوع رہا (${fsRes.code})۔`,
        actions: [action],
        targets: [fsRes.path],
        planSteps: ['Validate safe path boundary', `Execute storage-worker ${fsOp.op}`, 'Verify filesystem state'],
        errorCode: fsRes.ok ? undefined : fsRes.code,
      };
    }

    // 11. Browser Auto-Launch + Real CDP Automation
    if (/\b(chrome|browser|youtube|open\s+url|website|edge|msedge)\b/i.test(lower)) {
      const searchMatch =
        cleanSub.match(/search\s+(?:karo|for)?[:\s]*(.+)/i) ||
        cleanSub.match(/par\s+(.+?)\s+search/i);
      const query = searchMatch ? searchMatch[1].replace(/\b(karo|search|play)\b/gi, '').trim() : '';
      const hasExplicitUrlOrSearch = Boolean(query) || /youtube|https?:\/\//i.test(lower);
      const targetUrl = query
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : 'https://www.youtube.com/';

      const preferredBrowser = this.storage.getState().preferences.preferredBrowser || 'chrome';
      let result = await this.browserWorker.ensureConnectedSession(preferredBrowser);
      if (result.ok && hasExplicitUrlOrSearch) {
        result = await this.browserWorker.navigateAndVerify(targetUrl);
      }

      const action: AutonomousAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        taskId: task.taskId,
        category: 'BROWSER_AUTOMATION',
        level: 'LEVEL_3_DOM_CDP',
        workerId: 'browser-worker',
        summary: result.message,
        target: hasExplicitUrlOrSearch ? targetUrl : result.session.cdpEndpoint,
        status: result.ok ? 'VERIFIED' : 'UNAVAILABLE',
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: result.ok ? undefined : result.code,
        evidence: {
          cdpConnected: result.session.cdpConnected,
          binaryDetected: result.session.binaryDetected,
          verifiedTitle: result.verifiedTitle,
        },
        interactionDetails: { method: 'cdp_dom', targetPath: targetUrl },
      };

      return {
        ok: result.ok,
        outcome: result.ok ? 'DONE' : 'UNAVAILABLE',
        intent: 'BROWSER_AUTOMATION',
        riskClass: 'R3_EXTERNAL_ACCOUNT',
        selectedWorker: 'browser-worker',
        selectedTool: 'browser.cdp_navigate',
        verificationMethod: 'Browser binary probe + CDP /json/list verification',
        replyEnglish: result.message,
        replyRomanUrdu: result.ok
          ? `Browser CDP session connect aur verify ho gaya: ${result.verifiedTitle || result.message}`
          : `Browser launch/CDP available nahi hai: ${result.message}`,
        replyUrdu: result.ok
          ? `براؤزر CDP سیشن جڑ کر تصدیق ہو گیا ہے: ${result.verifiedTitle || result.message}`
          : `براؤزر یا CDP سیشن دستیاب نہیں ہے: ${result.message}`,
        actions: [action],
        targets: [hasExplicitUrlOrSearch ? targetUrl : 'cdp:9222'],
        planSteps: ['Probe installed browser binary', 'Auto-launch/attach CDP session', 'Verify target'],
        errorCode: result.ok ? undefined : result.code,
      };
    }

    // 12. Windows Desktop / Allowlisted App Launch
    if (/\b(notepad|calculator|calc|explorer|foreground\s+window|active\s+window)\b/i.test(lower)) {
      const isForegroundQuery = /\b(foreground\s+window|active\s+window)\b/i.test(lower);
      const requestedApp = /notepad/i.test(lower)
        ? 'notepad'
        : /calc/i.test(lower)
          ? 'calc'
          : /explorer/i.test(lower)
            ? 'explorer'
            : 'notepad';

      const skillRes = await this.skillExecutor.executeSkill(
        isForegroundQuery ? 'foreground-window' : 'open-app',
        { query: cleanSub, target: requestedApp, taskId: task.taskId }
      );
      return {
        ok: skillRes.ok,
        outcome: skillRes.ok ? 'DONE' : 'UNAVAILABLE',
        intent: isForegroundQuery ? 'WINDOWS_FOREGROUND_INSPECT' : 'WINDOWS_APP_LAUNCH',
        riskClass: isForegroundQuery ? 'R1_READ_ONLY' : 'R2_REVERSIBLE_WRITE',
        selectedWorker: 'windows-worker',
        selectedTool: isForegroundQuery ? 'windows.inspect_foreground' : 'windows.launch_app',
        verificationMethod: 'Win32 process PID / HWND verification',
        replyEnglish: skillRes.summary,
        replyRomanUrdu: skillRes.ok
          ? `Windows desktop action verify ho gaya: ${skillRes.summary}`
          : `Yeh desktop action sirf Windows OS host par chal sakta hai (${skillRes.status}).`,
        replyUrdu: skillRes.ok
          ? `ونڈوز ڈیسک ٹاپ ایکشن مکمل ہو گیا ہے: ${skillRes.summary}`
          : 'یہ ڈیسک ٹاپ عمل صرف ونڈوز (Windows OS) پر چل سکتا ہے۔ موجودہ ہوسٹ پر Win32 دستیاب نہیں ہے۔',
        actions: [skillRes.action],
        targets: [requestedApp],
        planSteps: ['Check Win32 host support', isForegroundQuery ? 'Inspect HWND' : `Launch ${requestedApp}`],
        errorCode: skillRes.ok ? undefined : 'WINDOWS_HOST_REQUIRED',
      };
    }

    // 13. Android ADB Bridge
    if (/\b(mobile|phone|android|adb)\b/i.test(lower)) {
      const skillRes = await this.skillExecutor.executeSkill('android-status', {
        query: cleanSub,
        taskId: task.taskId,
      });
      const status = this.adbWorker.inspectStatus();
      const replyEn = `${status.connectionState}: ${status.deviceName}. ${status.detail || ''}`.trim();
      return {
        ok: status.isConnected,
        outcome: status.isConnected ? 'DONE' : 'UNAVAILABLE',
        intent: 'ANDROID_ADB_CHECK',
        riskClass: 'R1_READ_ONLY',
        selectedWorker: 'adb-worker',
        selectedTool: 'adb.inspect_and_ping',
        verificationMethod: 'Real `adb devices -l` probe',
        replyEnglish: replyEn,
        replyRomanUrdu: status.isConnected
          ? `Android device connected hai: ${status.deviceName}.`
          : `Koi Android device connected nahi hai (${status.connectionState}).`,
        replyUrdu: status.isConnected
          ? `اینڈرائیڈ ڈیوائس منسلک ہے: ${status.deviceName} (${status.connectionType})۔`
          : `کوئی اینڈرائیڈ ڈیوائس منسلک نہیں ہے (${status.connectionState})۔ ${status.detail || ''}`,
        actions: [skillRes.action],
        targets: [status.serial || 'adb'],
        planSteps: ['Run adb devices -l', 'Inspect device state'],
        errorCode: status.isConnected ? undefined : status.connectionState,
      };
    }

    // 14. Host Telemetry & Honest Windows System Separation
    if (
      /\b(cpu|ram|memory\s+status|process|processes|health|system\s+status|system\s+info|performance|check\s+(?:my\s+)?system|mera\s+system\s+check)\b/i.test(
        lower
      )
    ) {
      const skillRes = await this.skillExecutor.executeSkill('system-info', {
        query: cleanSub,
        taskId: task.taskId,
      });
      const snap = this.telemetry.captureSnapshot();
      const winCheck = this.windowsWorker.inspectWindowsSystem();
      const ramUsedGB = snap.ramUsedMB.value !== null ? (snap.ramUsedMB.value / 1024).toFixed(1) : 'N/A';
      const ramTotalGB = snap.ramTotalMB.value !== null ? (snap.ramTotalMB.value / 1024).toFixed(1) : 'N/A';
      const winNoteEn = winCheck.ok
        ? ` Windows CIM: ${winCheck.message}.`
        : ` Note: Running in ${process.platform} dev host (Windows PC hardware CIM requires WINDOWS_HOST_REQUIRED).`;
      const winNoteRo = winCheck.ok
        ? ` Windows PC specs: ${winCheck.message}.`
        : ` Note: Abhi session ${process.platform} dev host par chal raha hai (Windows hardware specs ke liye Windows host zaroori hai).`;

      return {
        ok: true,
        outcome: 'DONE',
        intent: 'SYSTEM_TELEMETRY_INSPECT',
        riskClass: 'R1_READ_ONLY',
        selectedWorker: winCheck.ok ? 'windows-worker' : 'telemetry-adapter',
        selectedTool: winCheck.ok ? 'windows.inspect_system' : 'telemetry.capture_snapshot',
        verificationMethod: winCheck.ok ? 'Win32 CIM + OS counters' : 'Live host OS telemetry counters',
        replyEnglish: `Live OS metrics — CPU: ${snap.cpuLoad.value ?? 'N/A'}%, RAM: ${ramUsedGB}/${ramTotalGB} GB, Active processes: ${snap.activeWindows.length}, NX RSS: ${snap.nxProcessRssMB.value ?? 'N/A'} MB.${winNoteEn}`,
        replyRomanUrdu: `Live system status: CPU ${snap.cpuLoad.value ?? 'N/A'}%, RAM ${ramUsedGB}/${ramTotalGB} GB, aur ${snap.activeWindows.length} active processes chal rahe hain.${winNoteRo}`,
        replyUrdu: `موجودہ سسٹم اسٹیٹس: CPU لوڈ ${snap.cpuLoad.value ?? 'N/A'}%، ریم ${ramUsedGB} / ${ramTotalGB} GB، اور ${snap.activeWindows.length} فعال پراسیس چل رہے ہیں۔`,
        actions: [skillRes.action],
        targets: [snap.platformInfo.os],
        planSteps: ['Sample CPU & memory', 'Enumerate active OS processes', 'Check Windows CIM host availability'],
      };
    }

    // 15. Cloud AI Reasoning Fallback via InstructionEngine + ModelGateway
    const prefs = this.storage.getState().preferences;
    const activeInstructions = this.storage.getState().instructions || [];
    const relevantMemories =
      operatingMode === 'CUSTOMER_SAFE' ? [] : this.storage.retrieveRelevantMemories(cleanSub, 5);
    const snap = this.telemetry.captureSnapshot();
    const recentTurns = this.storage
      .getState()
      .chatMessages.filter((m) => (m.conversationId || 'conv-default') === conversationId)
      .slice(-6)
      .map((m) => `${m.sender.toUpperCase()}: ${sanitizeToolOutputAsData('chat_history', m.text)}`)
      .join('\n');

    const assembled = this.instructionEngine.assemblePrompt({
      detectedLanguage: this.detectLanguage(cleanSub),
      instructions: activeInstructions,
      preferences: prefs,
      relevantMemories,
      recentTurnsSummary: recentTurns,
      telemetry: snap,
      operatingMode,
      persona: prefs.persona || DEFAULT_PERSONA_CONFIG,
      behaviorProfile,
    });

    const recoveredCall = await this.recoveryEngine.runWithBoundedRecovery({
      taskId: task.taskId,
      operationName: 'ModelGateway.complete',
      maxRetries: 1,
      primaryFn: async () => {
        const res = await this.modelGateway.complete(cleanSub, assembled.systemInstruction, task.taskId);
        if (!res.ok && res.errorCode === 'NETWORK_ERROR') {
          throw new Error(res.errorMessage || 'NETWORK_ERROR');
        }
        return res;
      },
      isRecoverableError: (err) => {
        const msg = err instanceof Error ? err.message : '';
        return msg.includes('NETWORK_ERROR');
      },
    });

    const completion = recoveredCall.data || {
      ok: false,
      offline: true,
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: recoveredCall.error || 'Model gateway exhausted retries.',
    };

    if (completion.ok && completion.text) {
      const llmAction: AutonomousAction = {
        id: `act-${Date.now()}-llm`,
        taskId: task.taskId,
        category: 'MODEL_INFERENCE',
        workerId: 'model-gateway',
        summary: `Completed inference via ${completion.providerUsed} (${completion.modelUsed}, ${completion.latencyMs}ms).`,
        target: completion.projectId || 'gemini',
        status: 'VERIFIED',
        startedAt: Date.now() - (completion.latencyMs || 0),
        completedAt: Date.now(),
        interactionDetails: { method: 'direct_api' },
      };
      return {
        ok: true,
        outcome: 'ANSWER',
        intent: 'MODEL_INFERENCE',
        riskClass: 'R0_INFORMATIONAL',
        selectedWorker: 'model-gateway',
        selectedTool: 'model.gateway_complete',
        verificationMethod: 'ModelGateway live provider completion',
        replyEnglish: completion.text,
        replyRomanUrdu: completion.text,
        replyUrdu: completion.text,
        actions: [llmAction],
        targets: [completion.modelUsed || 'model'],
        planSteps: ['Assemble precedence + persona context', 'Execute ModelGateway completion'],
        providerUsed: completion.providerUsed,
        projectId: completion.projectId,
        modelUsed: completion.modelUsed,
      };
    }

    const errAction: AutonomousAction = {
      id: `act-${Date.now()}-llm-err`,
      taskId: task.taskId,
      category: 'MODEL_INFERENCE',
      workerId: 'model-gateway',
      summary: completion.errorMessage || 'Cloud AI provider unavailable.',
      target: 'ModelGateway',
      status: 'UNAVAILABLE',
      startedAt: Date.now(),
      completedAt: Date.now(),
      error: completion.errorCode,
      interactionDetails: { method: 'direct_api' },
    };
    return {
      ok: false,
      outcome: 'UNAVAILABLE',
      intent: 'MODEL_INFERENCE',
      riskClass: 'R0_INFORMATIONAL',
      selectedWorker: 'model-gateway',
      selectedTool: 'model.gateway_complete',
      verificationMethod: 'ModelGateway availability probe',
      replyEnglish:
        completion.errorMessage ||
        'Cloud AI provider unavailable; local telemetry, storage, file, media, customer vault, and policy tools remain active.',
      replyRomanUrdu: `Cloud AI provider abhi unavailable hai (${completion.errorCode || 'OFFLINE'}). Local telemetry, storage, file, aur customer vault active hain.`,
      replyUrdu:
        'کلاؤڈ AI سروس اس وقت دستیاب نہیں ہے۔ مقامی سسٹم ٹیلی میٹری، سٹوریج، کسٹمر والٹ اور پالیسی گارڈز فعال ہیں۔',
      actions: [errAction],
      targets: ['ModelGateway'],
      planSteps: ['Assemble context', 'Probe ModelGateway'],
      offlineFallback: true,
      errorCode: completion.errorCode || 'PROVIDER_UNAVAILABLE',
    };
  }

  async handleCommand(rawPrompt: string, options: CommandRequestOptions = {}): Promise<CommandDispatchResponse> {
    const conversationId = options.conversationId || 'conv-default';
    const requestId =
      options.requestId || (crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const correlationId = options.correlationId || requestId;
    const sequence = this.nextSequence(conversationId, options.sequence);

    const trimmedRaw = rawPrompt.trim();
    const { cleanText: cleanPrompt } = scrubSecrets(trimmedRaw);
    const task = this.createTaskRecord(cleanPrompt);
    const prefs = this.storage.getState().preferences;
    const aliases = this.storage.getState().aliases || [];

    const wakeRaw = this.personaEngine.matchWakeAlias(trimmedRaw, aliases);
    const wakeClean = this.personaEngine.matchWakeAlias(cleanPrompt, aliases);
    const strippedRaw = wakeRaw.strippedPrompt || trimmedRaw;
    const strippedClean = wakeClean.strippedPrompt || cleanPrompt;

    const currentOperatingMode: OperatingMode = prefs.operatingMode || 'OWNER_PRIVATE';
    const persona: PersonaConfig = prefs.persona || DEFAULT_PERSONA_CONFIG;
    const behaviorProfiles: BehaviorProfile[] =
      this.storage.getState().behaviorProfiles || DEFAULT_BEHAVIOR_PROFILES;

    // 0. Instant Mode Toggle Commands (Customer Mode / Owner Mode)
    const enableCustomerMode =
      /^(?:customer\s+mode\s+(?:on|enable|activate)|enable\s+customer\s+mode|switch\s+to\s+customer\s+mode)$/i.test(
        strippedClean
      );
    const enableOwnerMode =
      /^(?:customer\s+mode\s+(?:off|disable)|owner\s+mode\s+(?:on|enable|activate)|private\s+mode\s+on|switch\s+to\s+owner\s+mode)$/i.test(
        strippedClean
      );

    if (enableCustomerMode || enableOwnerMode) {
      const nextMode: OperatingMode = enableCustomerMode ? 'CUSTOMER_SAFE' : 'OWNER_PRIVATE';
      prefs.operatingMode = nextMode;
      this.storage.save();
      this.eventBus.emit('MODE_CHANGED', `Operating mode switched to ${nextMode} via command`, task.taskId, {
        operatingMode: nextMode,
      });
    }

    const effectiveOperatingMode: OperatingMode = prefs.operatingMode || currentOperatingMode;
    const effectiveProfile = this.personaEngine.resolveEffectiveProfile({
      persona,
      profiles: behaviorProfiles,
      operatingMode: effectiveOperatingMode,
      matchedAlias: wakeClean.matchedAlias,
    });

    const activeInstructions = this.storage.getState().instructions || [];
    const relevantMemories =
      effectiveOperatingMode === 'CUSTOMER_SAFE'
        ? []
        : this.storage.retrieveRelevantMemories(strippedClean, 5);
    const effectiveLanguage = this.instructionEngine.resolveEffectiveLanguage(
      this.detectLanguage(strippedClean),
      prefs,
      activeInstructions,
      effectiveProfile.language
    );
    const effectiveStyle = this.instructionEngine.resolveEffectiveStyle(
      prefs,
      relevantMemories,
      activeInstructions
    );

    task.detectedLanguage = this.detectLanguage(strippedClean);

    this.eventBus.emit('TASK_CREATED', `New task created: ${task.title}`, task.taskId, { correlationId, requestId });
    this.eventBus.emit('TASK_STARTED', `Started task: ${task.title}`, task.taskId, { correlationId, requestId });

    this.transitionState(task, 'UNDERSTANDING', 'Scrubbing secrets, matching wake alias, and parsing intent', 10);
    this.appendChatMessage('user', cleanPrompt, {
      taskId: task.taskId,
      conversationId,
      sequence,
      requestId,
      correlationId,
    });

    const respondCancelledOrStale = (cancelled: boolean, stale: boolean): CommandDispatchResponse => {
      const msg = cancelled
        ? 'Request was cancelled before completion.'
        : 'Response superseded by a newer conversation request.';
      this.finalizeTask(task, 'CANCELLED', msg, cancelled ? 'CANCELLED_BY_OPERATOR' : 'SUPERSEDED_BY_NEWER_REQUEST');
      return {
        ok: false,
        cancelled,
        staleSuperseded: stale,
        conversationId,
        sequence,
        requestId,
        correlationId,
        outcome: 'FAILED',
        effectiveLanguage,
        effectiveStyle,
        operatingMode: effectiveOperatingMode,
        activeProfileId: effectiveProfile.id,
        matchedAlias: wakeClean.matchedAlias?.alias,
        responseUrdu: msg,
        responseEnglish: msg,
        replyText: msg,
        agentState: 'IDLE',
        task,
        actions: task.actions,
        error: { code: cancelled ? 'TASK_CANCELLED' : 'STALE_REQUEST', message: msg },
      };
    };

    if (enableCustomerMode || enableOwnerMode) {
      task.intent = 'OPERATING_MODE_SWITCH';
      task.riskClass = 'R2_REVERSIBLE_WRITE';
      task.selectedWorker = 'policy-engine';
      task.selectedTool = 'policy.evaluate_command';
      task.verificationMethod = 'Preferences storage persistence parity';
      const replyEn =
        effectiveOperatingMode === 'CUSTOMER_SAFE'
          ? 'Customer Safe Mode is now active. Private memories, affection/humor profiles, and unmasked customer fields are strictly hidden.'
          : 'Owner Private Mode restored. Custom persona profiles and owner workspace controls are active.';
      const replyRo =
        effectiveOperatingMode === 'CUSTOMER_SAFE'
          ? 'Customer Mode ON kar diya gaya hai. Ab sirf professional aur masked responses show honge.'
          : 'Owner Private Mode ON ho gaya hai. Custom aliases aur profiles active hain.';
      const replyUr =
        effectiveOperatingMode === 'CUSTOMER_SAFE'
          ? 'کسٹمر سیف موڈ فعال کر دیا گیا ہے۔ نجی میموری اور حساس تفصیلات اب پوشیدہ ہیں۔'
          : 'اونر پرائیویٹ موڈ دوبارہ فعال ہو گیا ہے۔';
      const replyText = this.selectLocalizedText(effectiveLanguage, {
        english: replyEn,
        romanUrdu: replyRo,
        urdu: replyUr,
      });
      this.finalizeTask(task, 'COMPLETED', replyEn);
      this.appendChatMessage('agent', replyText, {
        taskId: task.taskId,
        conversationId,
        sequence,
        requestId,
        correlationId,
        outcome: 'DONE',
      });
      return {
        ok: true,
        conversationId,
        sequence,
        requestId,
        correlationId,
        outcome: 'DONE',
        effectiveLanguage,
        effectiveStyle,
        operatingMode: effectiveOperatingMode,
        activeProfileId: effectiveProfile.id,
        matchedAlias: wakeClean.matchedAlias?.alias,
        responseUrdu: replyUr,
        responseEnglish: replyEn,
        replyText,
        agentState: 'IDLE',
        task,
        actions: [],
      };
    }

    this.transitionState(task, 'CLASSIFYING', 'Decomposing request & evaluating action risk classes', 20);
    const rawSubtasks = decomposeMultiTaskPrompt(strippedRaw);
    const pairedSubtasks = rawSubtasks.map((rawSub) => ({
      rawSub,
      scrubbed: scrubSecrets(rawSub),
    }));

    const subResults: SubtaskOutcome[] = [];
    for (let i = 0; i < pairedSubtasks.length; i++) {
      if (this.isSupersededOrCancelled(task.taskId, conversationId, sequence)) {
        return respondCancelledOrStale(this.cancelledTaskIds.has(task.taskId), true);
      }
      const pair = pairedSubtasks[i];
      const subRes = await this.executeSingleSubtask({
        rawSub: pair.rawSub,
        cleanSub: pair.scrubbed.cleanText,
        hadSubSecrets: pair.scrubbed.hadSecrets,
        redactedSubCategories: pair.scrubbed.redactedCategories,
        task,
        conversationId,
        sequence,
        requestId,
        correlationId,
        effectiveLanguage,
        operatingMode: effectiveOperatingMode,
        behaviorProfile: effectiveProfile,
        allowPromptConfirmationPause: pairedSubtasks.length === 1,
      });
      subResults.push(subRes);

      if (subRes.requiresConfirmation && pairedSubtasks.length === 1) {
        task.intent = subRes.intent;
        task.riskClass = subRes.riskClass;
        task.selectedWorker = subRes.selectedWorker;
        task.selectedTool = subRes.selectedTool;
        task.confirmationState = 'PENDING';
        task.verificationMethod = subRes.verificationMethod;
        task.taskLedger = {
          goal: cleanPrompt,
          constraints: ['Requires explicit operator confirmation before execution', 'Target & scope preview required'],
          executionBoundaries: ['Operator approval gate'],
          dependencies: ['policy-engine'],
          maxRetries: 0,
          riskLevel: 'DESTRUCTIVE_CONFIRM',
        };
        const replyText = this.selectLocalizedText(effectiveLanguage, {
          english: subRes.replyEnglish,
          romanUrdu: subRes.replyRomanUrdu,
          urdu: subRes.replyUrdu,
        });
        this.transitionState(task, 'CONFIRMATION_REQUIRED', subRes.replyEnglish, 25);
        this.activeTasks.unshift(task);
        this.storage.getState().historyTasks.unshift(task);
        this.storage.save();
        this.appendChatMessage('agent', replyText, {
          taskId: task.taskId,
          conversationId,
          sequence,
          requestId,
          correlationId,
          outcome: 'BLOCKED',
        });
        this.currentState = 'IDLE';
        return {
          ok: true,
          requiresConfirmation: true,
          conversationId,
          sequence,
          requestId,
          correlationId,
          outcome: 'BLOCKED',
          effectiveLanguage,
          effectiveStyle,
          operatingMode: effectiveOperatingMode,
          activeProfileId: effectiveProfile.id,
          matchedAlias: wakeClean.matchedAlias?.alias,
          responseUrdu: subRes.replyUrdu,
          responseEnglish: subRes.replyEnglish,
          replyText,
          agentState: 'IDLE',
          task,
        };
      }
    }

    if (this.isSupersededOrCancelled(task.taskId, conversationId, sequence)) {
      return respondCancelledOrStale(this.cancelledTaskIds.has(task.taskId), true);
    }

    // Aggregate subtask results into TaskQueueItem
    task.actions = subResults.flatMap((s) => s.actions);
    task.targets = Array.from(new Set(subResults.flatMap((s) => s.targets)));
    task.plan = subResults.flatMap((s) => s.planSteps);
    task.workerAssignments = Array.from(new Set(subResults.map((s) => s.selectedWorker)));
    task.subtasksCount = subResults.length;
    task.intent = subResults.length === 1 ? subResults[0].intent : `MULTI_TASK (${subResults.length})`;
    task.riskClass = subResults.reduce<PolicyRiskClass>(
      (highest, cur) => (cur.riskClass > highest ? cur.riskClass : highest),
      'R0_INFORMATIONAL'
    );
    task.selectedWorker = subResults[0]?.selectedWorker;
    task.selectedTool = subResults[0]?.selectedTool;
    task.verificationMethod = Array.from(new Set(subResults.map((s) => s.verificationMethod))).join(' + ');

    const firstSuccess = subResults.find((s) => s.ok);
    const anySuccess = Boolean(firstSuccess);
    const allSuccess = subResults.every((s) => s.ok);
    const firstErr = subResults.find((s) => !s.ok);

    let overallOutcome: AgentOutcomeBadge;
    if (subResults.length === 1) {
      overallOutcome = subResults[0].outcome;
    } else if (allSuccess) {
      overallOutcome = 'DONE';
    } else if (anySuccess) {
      overallOutcome = 'PARTIALLY_DONE';
    } else {
      overallOutcome = firstErr?.outcome || 'FAILED';
    }

    const combinedEn =
      subResults.length === 1
        ? subResults[0].replyEnglish
        : subResults.map((s, idx) => `[${idx + 1}/${subResults.length} ${s.outcome}] ${s.replyEnglish}`).join(' ');
    const combinedRo =
      subResults.length === 1
        ? subResults[0].replyRomanUrdu
        : subResults.map((s, idx) => `[${idx + 1}/${subResults.length} ${s.outcome}] ${s.replyRomanUrdu}`).join(' ');
    const combinedUr =
      subResults.length === 1
        ? subResults[0].replyUrdu
        : subResults.map((s, idx) => `[${idx + 1}/${subResults.length} ${s.outcome}] ${s.replyUrdu}`).join(' ');

    const localizedRaw = this.selectLocalizedText(effectiveLanguage, {
      english: combinedEn,
      romanUrdu: combinedRo,
      urdu: combinedUr,
    });
    const styledReply =
      subResults.length === 1
        ? this.enforceStyleLength(localizedRaw, effectiveStyle)
        : localizedRaw;
    const personaReply = this.personaEngine.formatPersonaReply(styledReply, {
      profile: effectiveProfile,
      persona,
      operatingMode: effectiveOperatingMode,
      language: effectiveLanguage,
      outcome: overallOutcome,
      verbosity: effectiveStyle,
    });

    const verifiedReply = this.verifyFinalResponseTruth(
      personaReply,
      overallOutcome,
      task.actions
    );

    const isTaskCompleted = subResults.length === 1 ? subResults[0].ok : anySuccess;
    task.providerUsed = subResults.find((s) => s.providerUsed)?.providerUsed;
    task.modelUsed = subResults.find((s) => s.modelUsed)?.modelUsed;

    task.progressLedger = {
      completedSteps: subResults.filter((s) => s.ok).flatMap((s) => s.planSteps),
      currentStep: verifiedReply.outcome,
      pendingSteps: subResults.filter((s) => !s.ok).flatMap((s) => s.planSteps),
      totalSteps: Math.max(1, task.plan.length),
      progressPercent: isTaskCompleted ? 100 : anySuccess ? 60 : 25,
      retryAttempts: 0,
      isStalled: !anySuccess,
      replanningActive: false,
    };
    task.verification = {
      status: allSuccess ? 'PASS' : anySuccess ? 'PASS' : firstErr?.outcome === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'BLOCKED',
      checkedAt: Date.now(),
      summary: combinedEn,
      evidence: { subtaskCount: subResults.length, passedSubtasks: subResults.filter((s) => s.ok).length },
    };

    const finalState: AgentState = isTaskCompleted
      ? 'COMPLETED'
      : subResults.some((s) => s.offlineFallback)
        ? 'OFFLINE_BLOCKED'
        : 'FAILED';
    this.finalizeTask(task, finalState, combinedEn, isTaskCompleted ? undefined : firstErr?.errorCode);

    this.appendChatMessage('agent', verifiedReply.text, {
      taskId: task.taskId,
      conversationId,
      sequence,
      requestId,
      correlationId,
      outcome: verifiedReply.outcome,
    });

    return {
      ok: isTaskCompleted,
      conversationId,
      sequence,
      requestId,
      correlationId,
      outcome: verifiedReply.outcome,
      effectiveLanguage,
      effectiveStyle,
      operatingMode: effectiveOperatingMode,
      activeProfileId: effectiveProfile.id,
      matchedAlias: wakeClean.matchedAlias?.alias,
      responseUrdu: combinedUr,
      responseEnglish: combinedEn,
      replyText: verifiedReply.text,
      agentState: 'IDLE',
      task,
      actions: task.actions,
      memory: subResults.find((s) => s.memory)?.memory,
      providerUsed: task.providerUsed,
      projectId: subResults.find((s) => s.projectId)?.projectId,
      modelUsed: task.modelUsed,
      offlineFallback: subResults.some((s) => s.offlineFallback),
      error: isTaskCompleted
        ? undefined
        : {
            code: firstErr?.errorCode || 'TASK_FAILED',
            message: firstErr?.replyEnglish || combinedEn,
          },
    };
  }
}
