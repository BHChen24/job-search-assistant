import { z } from "zod";

const logLevelSchema = z.enum([
	"trace",
	"debug",
	"info",
	"warn",
	"error",
	"silent",
]);

const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash-0731";

const nonblankStringSchema = z.string().trim().min(1);

export const marketConfigSchema = z.object({
	openrouterApiKey: nonblankStringSchema,
	openrouterModel: nonblankStringSchema,
	tavilyApiKey: nonblankStringSchema,
});

export const advisorConfigSchema = marketConfigSchema.extend({
	whoisApiKey: nonblankStringSchema,
});

export type LogLevel = z.infer<typeof logLevelSchema>;
export type MarketConfig = z.infer<typeof marketConfigSchema>;
export type AdvisorConfig = z.infer<typeof advisorConfigSchema>;

export class ConfigurationError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "ConfigurationError";
	}
}

export const readLogLevel = (value: string | undefined): LogLevel => {
	const candidate = value?.trim() || undefined;
	const result = logLevelSchema.safeParse(candidate ?? "info");
	if (!result.success) {
		throw new ConfigurationError(
			"Invalid LOG_LEVEL: expected trace, debug, info, warn, error, or silent",
		);
	}
	return result.data;
};

export const readMarketConfig = (env: NodeJS.ProcessEnv): MarketConfig => {
	const result = marketConfigSchema.safeParse({
		openrouterApiKey: env.OPENROUTER_API_KEY,
		openrouterModel: env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
		tavilyApiKey: env.TAVILY_API_KEY,
	});
	if (!result.success) {
		throw new ConfigurationError(
			"Invalid market configuration: OPENROUTER_API_KEY and TAVILY_API_KEY must be nonblank; OPENROUTER_MODEL must be nonblank when set",
		);
	}
	return result.data;
};

export const readAdvisorConfig = (env: NodeJS.ProcessEnv): AdvisorConfig => {
	const result = advisorConfigSchema.safeParse({
		...readMarketConfig(env),
		whoisApiKey: env.WHOIS_API_KEY,
	});
	if (!result.success) {
		throw new ConfigurationError(
			"Invalid advisor configuration: WHOIS_API_KEY must be nonblank",
		);
	}
	return result.data;
};
