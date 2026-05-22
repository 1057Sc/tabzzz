/**
 * Estimates tab memory without chrome.processes API.
 * Based on tab type and domain heuristics.
 */

const DOMAIN_ESTIMATES: Record<string, number> = {
  'youtube.com': 600 * 1024 * 1024,
  'twitch.tv': 500 * 1024 * 1024,
  'figma.com': 450 * 1024 * 1024,
  'notion.so': 350 * 1024 * 1024,
  'linear.app': 300 * 1024 * 1024,
  'github.com': 280 * 1024 * 1024,
  'gitlab.com': 250 * 1024 * 1024,
  'docs.google.com': 300 * 1024 * 1024,
  'sheets.google.com': 280 * 1024 * 1024,
  'mail.google.com': 200 * 1024 * 1024,
  'reddit.com': 220 * 1024 * 1024,
  'twitter.com': 200 * 1024 * 1024,
  'x.com': 200 * 1024 * 1024,
  'facebook.com': 250 * 1024 * 1024,
  'instagram.com': 220 * 1024 * 1024,
};

const BASE_MEMORY = 80 * 1024 * 1024; // ~80 MB baseline for most tabs

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function estimateTabMemory(tab: chrome.tabs.Tab): number {
  if (tab.discarded) return 0;

  const url = tab.url ?? '';
  const domain = getDomain(url);

  if (DOMAIN_ESTIMATES[domain]) {
    return DOMAIN_ESTIMATES[domain];
  }

  // Use base estimate with some variance based on URL length (crude proxy)
  const urlComplexity = Math.min(url.length / 100, 2);
  return Math.round(BASE_MEMORY * (1 + urlComplexity * 0.3));
}
