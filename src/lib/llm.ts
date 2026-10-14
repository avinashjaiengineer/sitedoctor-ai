import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import AnthropicFoundry from "@anthropic-ai/foundry-sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";
import { AzureOpenAI } from "openai";

export type ClaudeProvider = "anthropic" | "vertex" | "bedrock" | "foundry";
export type Provider = ClaudeProvider | "gemini" | "azure-openai";
const PROVIDERS: Provider[] = ["anthropic", "vertex", "bedrock", "foundry", "gemini", "azure-openai"];

const env = (name: string) => process.env[name]?.trim() || undefined;

/**
 * Which model platform writes the treatment plan. Set LLM_PROVIDER explicitly, or let it be inferred
 * from the credentials present. Returns null when nothing is configured (the rules-based plan is used).
 */
export function llmProvider(): Provider | null {
  const explicit = env("LLM_PROVIDER")?.toLowerCase();
  if (explicit) return PROVIDERS.includes(explicit as Provider) ? (explicit as Provider) : null;
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  if (env("ANTHROPIC_VERTEX_PROJECT_ID")) return "vertex";
  if (env("ANTHROPIC_FOUNDRY_RESOURCE") || env("ANTHROPIC_FOUNDRY_BASE_URL")) return "foundry";
  if (env("AWS_BEARER_TOKEN_BEDROCK") || env("BEDROCK_AWS_ACCESS_KEY_ID")) return "bedrock";
  if (env("AZURE_OPENAI_ENDPOINT")) return "azure-openai";
  if (env("GOOGLE_CLOUD_PROJECT")) return "gemini";
  return null;
}

export const isClaude = (p: Provider): p is ClaudeProvider => p !== "gemini" && p !== "azure-openai";

/** Model ID as each platform names it. Bedrock IDs carry an `anthropic.` prefix; Azure uses your deployment name. */
export function modelFor(provider: Provider): string {
  if (provider === "gemini") return env("GEMINI_MODEL") ?? "gemini-2.5-pro";
  if (provider === "azure-openai") return env("AZURE_OPENAI_DEPLOYMENT") ?? "gpt-5-mini";
  const override = env("ANTHROPIC_MODEL");
  if (override) return override;
  return provider === "bedrock" ? "anthropic.claude-opus-5-5" : "claude-opus-5-5";
}

const shared = { timeout: 50_000, maxRetries: 1 };

/** A service-account key from env (needed on Vercel); without it, local Application Default Credentials are used. */
function googleCredentials() {
  const json = env("GOOGLE_CREDENTIALS_JSON");
  return json ? { credentials: JSON.parse(json), scopes: "https://www.googleapis.com/auth/cloud-platform" } : undefined;
}

/**
 * Every Claude client exposes the same Messages surface; the cast lets callers use one type.
 * Credentials use non-reserved names where Vercel reserves the standard ones (AWS_*).
 */
export function createClaudeClient(provider: ClaudeProvider): Anthropic {
  switch (provider) {
    case "vertex": {
      const auth = googleCredentials();
      return new AnthropicVertex({
        ...shared,
        region: env("CLOUD_ML_REGION") ?? "global",
        projectId: env("ANTHROPIC_VERTEX_PROJECT_ID"),
        googleAuth: auth ? new GoogleAuth(auth) : undefined,
      }) as unknown as Anthropic;
    }
    case "bedrock":
      return new AnthropicBedrockMantle({
        ...shared,
        awsRegion: env("BEDROCK_AWS_REGION") ?? env("AWS_REGION") ?? "us-east-1",
        apiKey: env("AWS_BEARER_TOKEN_BEDROCK"),
        awsAccessKey: env("BEDROCK_AWS_ACCESS_KEY_ID"),
        awsSecretAccessKey: env("BEDROCK_AWS_SECRET_ACCESS_KEY"),
      }) as unknown as Anthropic;
    case "foundry":
      return new AnthropicFoundry({ ...shared }) as unknown as Anthropic;
    default:
      return new Anthropic(shared);
  }
}

export function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: env("GOOGLE_CLOUD_PROJECT"),
    location: env("GOOGLE_CLOUD_LOCATION") ?? "global",
    googleAuthOptions: googleCredentials(),
  });
}

export function createAzureOpenAIClient(): AzureOpenAI {
  return new AzureOpenAI({
    ...shared,
    endpoint: env("AZURE_OPENAI_ENDPOINT"),
    apiKey: env("AZURE_OPENAI_API_KEY"),
    apiVersion: env("AZURE_OPENAI_API_VERSION") ?? "2025-04-01-preview",
    deployment: modelFor("azure-openai"),
  });
}

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gpt-5-mini": "GPT-5 mini",
};

/** Name shown on the report, e.g. "Gemini 2.5 Pro". Falls back to the raw model or deployment ID. */
export function modelLabel(provider: Provider): string {
  const id = modelFor(provider).replace(/^anthropic\./, "");
  return MODEL_LABELS[id] ?? id;
}
