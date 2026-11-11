import type {
  AgentState,
  CompanionState,
  TaskQueueItem,
  AutonomousAction,
  TaskLedger,
  ProgressLedger,
} from '../src/types/agent.ts';
import { StorageEngine } from './storage.ts';

export class Orchestrator {
  private agentState: AgentState = 'IDLE';
  private companion: CompanionState;
  private activeTasks: TaskQueueItem[] = [];
  private taskHistory: TaskQueueItem[] = [];
  private recentActions: AutonomousAction[] = [];

  constructor() {
    this.companion = StorageEngine.getCompanion();
    this.taskHistory = StorageEngine.getTaskHistory();
  }

  public getState(): AgentState {
    return this.agentState;
  }

  public setState(state: AgentState): void {
    this.agentState = state;
    // Mirror agent state into companion mood & expression
    switch (state) {
      case 'LISTENING':
        this.companion.mood = 'listening';
        this.companion.expression = 'ATTENTIVE';
        break;
      case 'THINKING':
      case 'PLANNING':
        this.companion.mood = 'thinking';
        this.companion.expression = 'THINKING';
        break;
      case 'EXECUTING':
        this.companion.mood = 'executing';
        this.companion.expression = 'WORKING';
        break;
      case 'VERIFYING':
        this.companion.mood = 'focused';
        this.companion.expression = 'VERIFYING';
        break;
      case 'SPEAKING':
        this.companion.mood = 'speaking';
        this.companion.expression = 'SPEAKING';
        break;
      case 'COMPLETED':
        this.companion.mood = 'friendly';
        this.companion.expression = 'SUCCESS';
        break;
      case 'WAITING_CONFIRMATION':
        this.companion.mood = 'focused';
        this.companion.expression = 'CONCERNED';
        break;
      case 'FAILED':
        this.companion.mood = 'focused';
        this.companion.expression = 'CONCERNED';
        break;
      default:
        this.companion.mood = 'friendly';
        this.companion.expression = 'FRIENDLY';
        break;
    }
  }

  public getCompanion(): CompanionState {
    return this.companion;
  }

  public updateCompanion(updates: Partial<CompanionState>): CompanionState {
    this.companion = { ...this.companion, ...updates };
    StorageEngine.saveCompanion(this.companion);
    return this.companion;
  }

  public getActiveTasks(): TaskQueueItem[] {
    return this.activeTasks;
  }

  public getTaskHistory(): TaskQueueItem[] {
    return this.taskHistory;
  }

  public getRecentActions(): AutonomousAction[] {
    return this.recentActions;
  }

  public recordAction(action: AutonomousAction): void {
    this.recentActions.unshift(action);
    if (this.recentActions.length > 50) {
      this.recentActions.pop();
    }
  }

  public createTask(
    title: string,
    prompt: string,
    targets: string[],
    ledger: TaskLedger
  ): TaskQueueItem {
    const task: TaskQueueItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      userPrompt: prompt,
      status: 'RUNNING',
      progress: 0,
      currentStep: 'Initialized',
      actions: [],
      targets,
      taskLedger: ledger,
      progressLedger: {
        completedSteps: [],
        currentStep: 'Starting execution',
        pendingSteps: ['Validation', 'Execution', 'Verification'],
        progressPercent: 0,
        retryAttempts: 0,
        isStalled: false,
        replanningActive: false,
      },
      startedAt: Date.now(),
    };
    this.activeTasks.unshift(task);
    this.setState('EXECUTING');
    return task;
  }

  public updateTaskProgress(
    taskId: string,
    progress: number,
    currentStep: string,
    completedStep?: string
  ): void {
    const task = this.activeTasks.find((t) => t.id === taskId);
    if (!task) return;

    task.progress = Math.min(100, Math.max(0, progress));
    task.currentStep = currentStep;
    if (task.progressLedger) {
      task.progressLedger.currentStep = currentStep;
      task.progressLedger.progressPercent = task.progress;
      if (completedStep && !task.progressLedger.completedSteps.includes(completedStep)) {
        task.progressLedger.completedSteps.push(completedStep);
        task.progressLedger.pendingSteps = task.progressLedger.pendingSteps.filter((s) => s !== completedStep);
      }
    }
  }

  public completeTask(
    taskId: string,
    resultSummary: string,
    actions: AutonomousAction[] = []
  ): TaskQueueItem | null {
    const idx = this.activeTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;

    const [task] = this.activeTasks.splice(idx, 1);
    task.status = 'COMPLETED';
    task.progress = 100;
    task.completedAt = Date.now();
    task.resultSummary = resultSummary;
    if (actions.length > 0) {
      task.actions.push(...actions);
      actions.forEach((a) => this.recordAction(a));
    }

    this.taskHistory.unshift(task);
    StorageEngine.saveTaskHistory(this.taskHistory);
    this.setState('COMPLETED');
    return task;
  }

  public failTask(taskId: string, errorReason: string): TaskQueueItem | null {
    const idx = this.activeTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;

    const [task] = this.activeTasks.splice(idx, 1);
    task.status = 'FAILED';
    task.completedAt = Date.now();
    task.resultSummary = `Failed: ${errorReason}`;
    this.taskHistory.unshift(task);
    StorageEngine.saveTaskHistory(this.taskHistory);
    this.setState('FAILED');
    return task;
  }
}

export const orchestrator = new Orchestrator();
