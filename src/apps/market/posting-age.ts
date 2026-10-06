const MILLISECONDS_PER_DAY = 86_400_000;

type PostingDateEvidence =
	| { readonly kind: "absolute"; readonly date: Date; readonly text: string }
	| {
			readonly kind: "relative";
			readonly ageDays: number;
			readonly text: string;
	  }
	| { readonly kind: "missing" }
	| { readonly kind: "unsupported"; readonly text: string };

type PostingAgeResolution = {
	readonly postingAgeDays: number | null;
	readonly evidence: string | null;
	readonly limitation: string | null;
};

const utcCalendarDay = (date: Date): number =>
	Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const utcDateText = (date: Date): string => date.toISOString().slice(0, 10);

export const calculatePostingAgeDays = (
	postedDate: Date,
	referenceDate: Date,
): number | null => {
	if (
		Number.isNaN(postedDate.getTime()) ||
		Number.isNaN(referenceDate.getTime())
	) {
		return null;
	}

	const ageDays =
		(utcCalendarDay(referenceDate) - utcCalendarDay(postedDate)) /
		MILLISECONDS_PER_DAY;
	return ageDays >= 0 ? ageDays : null;
};

export const resolvePostingAge = (
	evidence: PostingDateEvidence,
	captureDate: Date | null,
	extractionDate: Date,
): PostingAgeResolution => {
	switch (evidence.kind) {
		case "absolute": {
			const postingAgeDays = calculatePostingAgeDays(
				evidence.date,
				extractionDate,
			);
			return postingAgeDays === null
				? {
						postingAgeDays: null,
						evidence: evidence.text,
						limitation: "Posting date is later than the extraction date.",
					}
				: { postingAgeDays, evidence: evidence.text, limitation: null };
		}
		case "relative": {
			if (!Number.isInteger(evidence.ageDays) || evidence.ageDays < 0) {
				return {
					postingAgeDays: null,
					evidence: evidence.text,
					limitation: "Posting date evidence could not be resolved.",
				};
			}
			if (captureDate !== null && !Number.isNaN(captureDate.getTime())) {
				const sinceCapture =
					(utcCalendarDay(extractionDate) - utcCalendarDay(captureDate)) /
					MILLISECONDS_PER_DAY;
				const elapsed = sinceCapture > 0 ? sinceCapture : 0;
				return {
					postingAgeDays: evidence.ageDays + elapsed,
					evidence: `${evidence.text} (capture date: ${utcDateText(captureDate)}, ${elapsed} day(s) before extraction)`,
					limitation: null,
				};
			}
			return {
				postingAgeDays: evidence.ageDays,
				evidence: `${evidence.text} (reference date: ${utcDateText(extractionDate)})`,
				limitation:
					"PDF capture date unavailable; extraction date used as an approximation.",
			};
		}
		case "missing":
			return {
				postingAgeDays: null,
				evidence: null,
				limitation: "No posting date evidence was present.",
			};
		case "unsupported":
			return {
				postingAgeDays: null,
				evidence: evidence.text,
				limitation: "Posting date evidence could not be resolved.",
			};
	}
};
