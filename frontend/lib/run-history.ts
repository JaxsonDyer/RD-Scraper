export function getRunErrorSummary(error: string | null): string {
  if (!error?.trim()) return "Run failed";
  const message = error.trim().replace(/\s+/g, " ");
  const accounts = message.match(/^(\d+) account\(s\) could not be scraped\./);
  if (accounts) {
    const count = Number(accounts[1]);
    return `${count} ${count === 1 ? "account" : "accounts"} couldn’t be scraped`;
  }
  const providerError = message.match(/^OpenRouter HTTP \d+:\s*([^.!?]+)[.!?]?/i);
  if (providerError) return `OpenRouter: ${providerError[1].trim()}`;
  const firstSentence = message.split(/\.\s+/)[0];
  return firstSentence.length > 80 ? `${firstSentence.slice(0, 79).trimEnd()}…` : firstSentence;
}
