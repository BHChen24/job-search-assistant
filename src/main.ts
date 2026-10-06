import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Command, CommanderError } from "commander";
import {
	createProductionAdvisorDependencies,
	executeAdvisorCommand,
	registerAdvisorCommand,
} from "./cli/advisor-command.js";
import {
	executeCleanCommand,
	registerCleanCommand,
} from "./cli/clean-command.js";
import {
	createProductionGapDependencies,
	executeGapCommand,
	registerGapCommand,
} from "./cli/gap-command.js";
import {
	createProductionMarketDependencies,
	executeMarketCommand,
	registerMarketCommand,
} from "./cli/market-command.js";
import {
	ConfigurationError,
	readAdvisorConfig,
	readLogLevel,
	readMarketConfig,
} from "./config.js";
import { configureLogger } from "./logger.js";
import {
	ANALYSIS_DATA_DIR,
	APPLICATION_REPORT_PATH,
	DEFAULT_JOBS_INPUT_DIR,
	GAP_ANALYSIS_JSON_PATH,
	GAP_REPORT_PATH,
	JOBS_DATA_DIR,
	MARKET_ANALYSIS_JSON_PATH,
	MARKET_REPORT_PATH,
	PROJECT_ROOT,
	REPORTS_DIR,
} from "./paths.js";

type RootOptions = {
	readonly clean?: boolean;
	readonly market?: boolean;
	readonly gap?: boolean;
	readonly advisor?: string;
	readonly verbose?: boolean;
};

const run = async (): Promise<void> => {
	const program = new Command();
	program
		.name("job-search-assistant")
		.description(
			"Analyze a job market, find resume gaps, and assess new job postings",
		)
		.option("--verbose", "Enable debug diagnostics")
		.exitOverride();
	registerCleanCommand(program);
	registerMarketCommand(program);
	registerGapCommand(program);
	registerAdvisorCommand(program);
	await program.parseAsync();
	const options = program.opts<RootOptions>();
	const io = {
		writeOut: (text: string) => process.stdout.write(text),
		writeErr: (text: string) => process.stderr.write(text),
	};
	const setupLogger = (): ReturnType<typeof configureLogger> => {
		const logger = configureLogger(readLogLevel(process.env.LOG_LEVEL));
		if (options.verbose === true) {
			logger.setLevel("debug");
			logger.debug("CLI running in verbose mode");
		}
		return logger;
	};

	if (options.market !== true) {
		setupLogger();
	}
	if (process.argv.length === 2) {
		program.outputHelp();
	}
	const cleanExitCode = await executeCleanCommand(
		{ clean: options.clean === true },
		{
			directories: [
				{ dir: JOBS_DATA_DIR, match: (name) => name.endsWith(".json") },
				{
					dir: ANALYSIS_DATA_DIR,
					match: (name) =>
						name.startsWith("application-") && name.endsWith(".json"),
				},
				{
					dir: REPORTS_DIR,
					match: (name) =>
						name.startsWith("application-") && name.endsWith(".html"),
				},
			],
			filePaths: [
				MARKET_ANALYSIS_JSON_PATH,
				MARKET_REPORT_PATH,
				GAP_ANALYSIS_JSON_PATH,
				GAP_REPORT_PATH,
				APPLICATION_REPORT_PATH,
			],
		},
		io,
	);
	if (cleanExitCode === 1) {
		process.exitCode = 1;
		return;
	}
	const marketExitCode = await executeMarketCommand(
		{ market: options.market === true, inputDir: DEFAULT_JOBS_INPUT_DIR },
		async () => {
			const envFilePath = resolve(PROJECT_ROOT, ".env");
			if (existsSync(envFilePath)) {
				process.loadEnvFile(envFilePath);
			}
			const logger = setupLogger();
			return createProductionMarketDependencies(
				readMarketConfig(process.env),
				logger,
			);
		},
		io,
	);
	if (marketExitCode !== null) {
		process.exitCode = marketExitCode;
		if (marketExitCode === 1) {
			return;
		}
	}
	const gapExitCode = await executeGapCommand(
		{ gap: options.gap === true },
		async () => {
			const envFilePath = resolve(PROJECT_ROOT, ".env");
			if (existsSync(envFilePath)) {
				process.loadEnvFile(envFilePath);
			}
			const logger = setupLogger();
			return createProductionGapDependencies(
				readMarketConfig(process.env),
				logger,
			);
		},
		io,
	);
	if (gapExitCode !== null) {
		process.exitCode = gapExitCode;
		if (gapExitCode === 1) {
			return;
		}
	}
	const advisorExitCode = await executeAdvisorCommand(
		{
			advisor: typeof options.advisor === "string",
			postingPath:
				typeof options.advisor === "string" ? options.advisor : undefined,
		},
		async () => {
			const envFilePath = resolve(PROJECT_ROOT, ".env");
			if (existsSync(envFilePath)) {
				process.loadEnvFile(envFilePath);
			}
			const logger = setupLogger();
			return createProductionAdvisorDependencies(
				readAdvisorConfig(process.env),
				logger,
			);
		},
		io,
	);
	if (advisorExitCode !== null) {
		process.exitCode = advisorExitCode;
	}
};

try {
	await run();
} catch (error: unknown) {
	if (
		error instanceof CommanderError &&
		error.code === "commander.helpDisplayed"
	) {
		process.exitCode = 0;
	} else if (error instanceof CommanderError) {
		process.exitCode = error.exitCode;
	} else if (error instanceof ConfigurationError) {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	} else if (error instanceof Error) {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	} else {
		process.stderr.write("CLI failed\n");
		process.exitCode = 1;
	}
}
