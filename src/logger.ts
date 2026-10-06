import loglevel from "loglevel";

import type { LogLevel } from "./config.js";

export const configureLogger = (level: LogLevel): typeof loglevel => {
	loglevel.methodFactory = (methodName) => {
		return (...messages: unknown[]) => {
			const label = methodName.toUpperCase();
			process.stderr.write(`[${label}] ${messages.map(String).join(" ")}\n`);
		};
	};
	loglevel.setLevel(level);
	loglevel.rebuild();
	return loglevel;
};
