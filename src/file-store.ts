import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const writeFileSafe = async (
	path: string,
	content: string,
): Promise<void> => {
	const destinationDirectory = dirname(path);
	await mkdir(destinationDirectory, { recursive: true });
	const temporaryDirectory = await mkdtemp(
		join(destinationDirectory, ".file-store-"),
	);
	const temporaryPath = join(temporaryDirectory, basename(path));

	try {
		await writeFile(temporaryPath, content, "utf8");
		await rename(temporaryPath, path);
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
};

export const writeJsonSafe = async (
	path: string,
	value: unknown,
): Promise<void> => {
	await writeFileSafe(path, `${JSON.stringify(value, null, 2)}\n`);
};
