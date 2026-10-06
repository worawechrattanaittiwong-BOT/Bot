export type AiAssistantSettings = {
  enabled: boolean;
  provider: string;
  model: string;
  dailyMessageLimit: number;
  maxHistoryMessages: number;
  maxOutputTokens: number;
  systemNote: string;
};

export type AiSupportChannel = {
  id: string;
  type: string;
  label: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
};

export type AiConversationMessage = {
  role: "USER" | "ASSISTANT";
  content: string;
};

export type AiSlotContext = {
  slotId: string | null;
  slotMode: string | null;
  slotNumber: number | null;
  accountLabel: string | null;
  accountMasked: string | null;
  broker: string | null;
  brokerServer: string | null;
  runtimeMode: string | null;
  runtimeState: string;
  eaOnline: boolean;
  lastHeartbeatAt: string | null;
  symbol: string | null;
  currency: string | null;
  balance: number;
  equity: number;
  floating: number;
  positions: number;
  pending: number;
  spreadPoints: number;
  pingMs: number;
  drawdownPercent: number;
  marginLevel: number;
  dailyProfit: number;
  controlMode: string | null;
  settings: Record<string, unknown>;
};
