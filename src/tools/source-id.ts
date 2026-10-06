import { createHash } from "node:crypto";

const MAX_SLUG_LENGTH = 80;
const FALLBACK_SLUG = "job-posting";
const COLLISION_HASH_LENGTH = 8;

type SourceIdentityRecord = {
	readonly slug: string;
	readonly fingerprint: string;
};

export const slugifyPostingStem = (stem: string): string => {
	const normalized = stem
		.normalize("NFKD")
		.replace(/\p{M}+/gu, "")
		.replace(/[^\p{ASCII}]+/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return (normalized || FALLBACK_SLUG).slice(0, MAX_SLUG_LENGTH);
};

export const fingerprintPdf = (bytes: Uint8Array): string =>
	createHash("sha256").update(bytes).digest("hex");

export const resolveOutputSlug = (
	stem: string,
	fingerprint: string,
	occupiedSlugs: ReadonlySet<string>,
): string => {
	const baseSlug = slugifyPostingStem(stem);
	if (!occupiedSlugs.has(baseSlug)) {
		return baseSlug;
	}

	const hashedSlug = `${baseSlug}-${fingerprint.slice(0, COLLISION_HASH_LENGTH).toLowerCase()}`;
	if (!occupiedSlugs.has(hashedSlug)) {
		return hashedSlug;
	}

	for (let suffix = 2; suffix <= occupiedSlugs.size + 1; suffix += 1) {
		const candidate = `${hashedSlug}-${suffix}`;
		if (!occupiedSlugs.has(candidate)) {
			return candidate;
		}
	}

	throw new RangeError("Posting output identities could not be made unique.");
};

export const aggregateFingerprint = (
	records: readonly SourceIdentityRecord[],
): string => {
	const orderedIdentities = [...records]
		.sort((left, right) => {
			if (left.slug < right.slug) {
				return -1;
			}
			if (left.slug > right.slug) {
				return 1;
			}
			return 0;
		})
		.map(({ slug, fingerprint }) => [slug, fingerprint]);

	return createHash("sha256")
		.update(JSON.stringify(orderedIdentities))
		.digest("hex");
};
