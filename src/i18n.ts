import streamDeck from "@elgato/streamdeck";

/**
 * Translates a user-facing string into the Stream Deck app language.
 * The English text is the key; locale files (<lang>.json next to the manifest) provide the translations.
 * Missing languages or keys fall back to the English text. `{0}`, `{1}`... are replaced by the extra arguments.
 */
export function t(key: string, ...args: Array<string | number>): string {
	let text = key;
	try {
		text = streamDeck.i18n.t(key);
	} catch {
		// fall back to the English key
	}
	args.forEach((arg, i) => {
		text = text.split(`{${i}}`).join(String(arg));
	});
	return text;
}
