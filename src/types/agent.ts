/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AgentState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'UNDERSTANDING'
  | 'THINKING'
  | 'LEARNING'
  | 'PLANNING'
  | 'RESEARCHING'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'SPEAKING'
  | 'WAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECOVERING'
  | 'PAUSED_DEVICE_REMOVED';

export type AvatarPoseMode =
  | 'DASHBOARD_HALF_BODY'
  | 'DESKTOP_COMPANION_TRANSPARENT'
  | 'MINIMIZE_TRANSITION'
  | 'RESTORE_TRANSITION'
  | 'APPLICATION_ATTACHED';

export type CharacterAnimationState =
  | 'HIDDEN'
  | 'SHOWING'
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'PLANNING'
  | 'WORKING'
  | 'SPEAKING'
  | 'WAITING'
  | 'SUCCESS'
  | 'WARNING'
  | 'ERROR'
  | 'MOVING'
  | 'WALKING'
  | 'JUMPING'
  | 'SITTING'
  | 'STANDING'
  | 'ATTACHED_TO_WINDOW'
  | 'DETACHING'
  | 'MINIMIZED'
  | 'DRAGGING'
  | 'RESIZING';

export type AvatarExpression =
  | 'NEUTRAL'
  | 'FRIENDLY'
  | 'ATTENTIVE'
  | 'THINKING'
  | 'LEARNING'
  | 'WORKING'
  | 'VERIFYING'
  | 'SPEAKING'
  | 'SUCCESS'
  | 'CONCERNED'
  | 'WARNING'
  | 'APOLOGY'
  | 'PLAYFUL';

export type AttachmentAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'left-edge'
  | 'right-edge'
  | 'bottom-left'
  | 'bottom-right'
  | 'custom';

export type CharacterPosture = 'standing' | 'sitting' | 'perched' | 'leaning';

export type CharacterGesture =
  | 'wave'
  | 'nod'
  | 'shake_head'
  | 'point'
  | 'look'
  | 'sit'
  | 'stand'
  | 'lean'
  | 'stretch'
  | 'yawn'
  | 'idle_look_around'
  | 'greeting'
  | 'acknowledgement'
  | 'thinking'
  | 'working'
  | 'celebration'
  | 'apology'
  | 'goodbye'
  | 'hand_kiss'
  | 'heart';

export interface WindowSeatConfig {
  applicationId: string;
  processPattern: string; // e.g., 'chrome.exe', 'explorer.exe'
  anchor: AttachmentAnchor;
  offsetX: number;
  offsetY: number;
  scale: 'small' | 'medium' | 'large';
  preferredPose: CharacterPosture;
  preferredAnimation?: CharacterAnimationState;
  zOrder: number;
  enabled: boolean;
}

export type CharacterEventName =
  | 'character.show'
  | 'character.hide'
  | 'character.move'
  | 'character.resize'
  | 'character.attach'
  | 'character.detach'
  | 'character.pose'
  | 'character.expression'
  | 'character.gesture'
  | 'character.speak_start'
  | 'character.speak_audio'
  | 'character.speak_end'
  | 'character.listen_start'
  | 'character.listen_end'
  | 'character.task_start'
  | 'character.task_progress'
  | 'character.task_success'
  | 'character.task_warning'
  | 'character.task_error'
  | 'character.return_home';

export interface CharacterEventPayload {
  eventName: CharacterEventName;
  timestamp: number;
  data?: {
    position?: { x: number; y: number };
    anchor?: AttachmentAnchor;
    targetWindow?: string;
    scale?: 'small' | 'medium' | 'large';
    posture?: CharacterPosture;
    animationState?: CharacterAnimationState;
    expression?: AvatarExpression;
    gesture?: CharacterGesture;
    spokenText?: string;
    audioVolume?: number;
    taskId?: string;
  };
}

export interface CompanionState {
  isFloating: boolean;
  dockPosition: 'side_left' | 'side_right' | 'dock_bottom_right' | 'center' | 'top_right' | 'top_left' | 'hidden';
  scale: 'small' | 'medium' | 'large';
  mood: 'friendly' | 'listening' | 'thinking' | 'speaking' | 'executing' | 'focused' | 'waiting';
  characterPose?: 'full' | 'bust' | 'standing' | 'sitting' | 'perched' | 'leaning';
  visualMode?: AvatarPoseMode;
  posture?: CharacterPosture;
  animationState?: CharacterAnimationState;
  expression?: AvatarExpression;
  currentThought: string;
  lastSpokenPhrase: string;
  assistantName?: string; // Configurable name (e.g., Saba, Khanum, Cutie, NX)
  attachedWindow?: string | null;
  attachedAnchor?: AttachmentAnchor;
  clickThrough?: boolean;
}

export type AutomationHierarchyLevel =
  | 'LEVEL_1_WIN32' // Native Win32 / System APIs (<10ms)
  | 'LEVEL_2_APP_CLI' // Application APIs / CLI Flags (<50ms)
  | 'LEVEL_3_DOM_CDP' // DOM / CDP Automation (<100ms)
  | 'LEVEL_4_WINDOWS_UIA' // Windows UI Automation (UIA Tree) (<200ms)
  | 'LEVEL_5_INPUT_OCR' // Mouse / Keyboard & OCR (<500ms)
  | 'LEVEL_6_VISION_FALLBACK'; // Desktop screenshot analysis fallback

export type ActionCategory =
  | 'INTERNAL_TOOL'
  | 'MOUSE_CLICK'
  | 'MOUSE_MOVE'
  | 'KEYBOARD_TYPE'
  | 'KEYBOARD_HOTKEY'
  | 'FILE_EXPLORER'
  | 'LAUNCH_APP'
  | 'BROWSER_AUTOMATION'
  | 'WINDOW_CONTROL'
  | 'STORAGE_OPERATION'
  | 'MOBILE_BRIDGE';

export interface AutonomousAction {
  id: string;
  category: ActionCategory;
  level?: AutomationHierarchyLevel;
  summary: string;
  target: string;
  status: 'QUEUED' | 'RUNNING' | 'VERIFIED' | 'FAILED';
  startedAt: number;
  completedAt?: number;
  error?: string;
  interactionDetails?: {
    method: 'direct_api' | 'human_emulation';
    coords?: { x: number; y: number };
    keystroke?: string;
    windowTitle?: string;
    targetPath?: string;
    retryCount?: number;
  };
}

export interface TaskLedger {
  goal: string;
  constraints: string[];
  executionBoundaries: string[];
  maxRetries: number;
  riskLevel: 'READ_ONLY' | 'SAFE_REVERSIBLE' | 'DESTRUCTIVE_CONFIRM';
}

export interface ProgressLedger {
  completedSteps: string[];
  currentStep: string;
  pendingSteps: string[];
  progressPercent: number;
  retryAttempts: number;
  isStalled: boolean;
  replanningActive: boolean;
}

export interface TaskQueueItem {
  id: string;
  title: string;
  userPrompt: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED_DEVICE_REMOVED';
  progress: number;
  currentStep: string;
  actions: AutonomousAction[];
  targets: string[]; // e.g., ["D:\\Videos", "USB 1 (F:)", "USB 2 (G:)"]
  taskLedger?: TaskLedger;
  progressLedger?: ProgressLedger;
  startedAt: number;
  completedAt?: number;
  resultSummary?: string;
}

export interface ActiveWindowProcess {
  id: string;
  title: string;
  processName: string;
  isFocused: boolean;
  pid: number;
  cpuPercent: number;
  ramMB: number;
}

export interface PreFlightValidationReport {
  passed: boolean;
  checks: {
    sourceScanned: boolean;
    zeroByteClean: boolean;
    permissionsOk: boolean;
    duplicatesChecked: boolean;
    pathLengthValid: boolean;
    capacityAvailable: boolean;
    fat32Safe: boolean; // checks single file > 4GB limit
    mediaHeadersOk: boolean;
    workspaceAccessible: boolean;
    manifestGenerated: boolean;
  };
  warnings?: string[];
  targetFat32ExceededFiles?: string[];
}

export interface StorageDeviceStatus {
  letter: string;
  label: string;
  type: 'SYSTEM_OS' | 'DATA_DRIVE' | 'USB';
  isProtected: boolean;
  freeGB: number;
  totalGB: number;
  usedGB: number;
  isBusy: boolean;
  filesystem?: 'FAT32' | 'NTFS' | 'exFAT';
  currentAction?: string;
  validationReport?: PreFlightValidationReport;
}

export interface LiveSystemTelemetry {
  cpuLoad: number;
  ramUsedMB: number;
  ramTotalMB: number;
  diskActivity: {
    readSpeedMBs: number;
    writeSpeedMBs: number;
    activeDrive: string;
  };
  networkSpeedKBps: number;
  activeWindows: ActiveWindowProcess[];
  storageDevices: StorageDeviceStatus[];
  lastUpdated: number;
}

export type MemoryLayer =
  | 'WORKING' // Active conversation variables in volatile RAM
  | 'TASK' // Checkpoints, manifests, step histories on persistent disk
  | 'PREFERENCE' // User directives, directory aliases
  | 'LONG_TERM' // Verified shop facts, client operational preferences
  | 'EVENT' // Timestamped operational activities with FTS5
  | 'OPERATIONAL' // Reusable learned workflow paths & tool execution latency
  | 'SEMANTIC'; // Indexed domain knowledge & document search embeddings

export interface SmartMemoryItem {
  id: string;
  content: string;
  layer: MemoryLayer;
  confidence: number;
  learnedFrom: string;
  createdAt: number;
  lastAccessed: number;
  isSensitiveRedacted?: boolean;
}

export interface CustomThemeConfig {
  id: string;
  name: string;
  mode: 'dark' | 'light' | 'oled';
  accentColor: string;
  bgCanvas: string;
  surfaceColor: string;
  surfaceElevated: string;
  textColor: string;
  textMuted: string;
  borderColor: string;
  density: 'compact' | 'comfortable';
  roundedRadius: string;
}

export interface WakeAliasItem {
  id: string;
  alias: string;
  enabled: boolean;
  sensitivity: number; // 1-100
  isCustom: boolean;
}

export interface ProviderProfile {
  id: string;
  displayName: string;
  provider: 'google_gemini';
  projectId: string; // Crucial for Project-Aware Quota Isolation
  apiKeyMasked: string;
  enabled: boolean;
  priority: number;
  assignedRole: 'FAST' | 'BALANCED' | 'REASONING' | 'RESEARCH';
  selectedModel: string;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'QUOTA_BLOCKED' | 'COOLING_DOWN' | 'CHECKING' | 'DISABLED_NEEDS_FIX';
  cooldownUntil?: number;
  latencyMs: number;
  requestCount: number;
}

export interface MobileBridgeStatus {
  isConnected: boolean;
  deviceName: string;
  ipAddress: string;
  batteryLevel: number;
  capabilities: {
    fileTransfer: boolean;
    clipboardSync: boolean;
    screenControl: boolean;
    appLaunching: boolean;
  };
}

export interface SkillManifest {
  skillId: string;
  name: string;
  version: string;
  triggers: string[];
  description: string;
  permissions: {
    filesystem: { read: string[]; write: string[] };
    network: 'none' | 'lan_only' | 'full';
    execution: string[];
    riskLevel: 'READ_ONLY' | 'SAFE_REVERSIBLE' | 'DESTRUCTIVE_CONFIRM';
  };
  resourceBudget: {
    ramMB: number;
    cpuPercent: number;
  };
  isInstalled: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  time: number;
  languageDetected?: 'urdu' | 'roman_urdu' | 'english' | 'mixed';
  spokenAudioPlayed?: boolean;
  actionDetails?: string;
  speechBubbleVisible?: boolean;
}
