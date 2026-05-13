import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const URL_DOWNLOAD_TIMEOUT = 15000; // 15 seconds per URL

/**
 * Extract all URLs from text
 * @param {string} text - Text containing URLs
 * @returns {string[]} - Array of unique URLs found
 */
export function extractUrls(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const matches = text.match(URL_REGEX);
  if (!matches) {
    return [];
  }

  // Return unique URLs
  return [...new Set(matches)];
}

/**
 * Download a URL and convert it to Markdown
 * @param {string} url - The URL to download
 * @returns {Promise<{url: string, markdown: string, error?: string}>}
 */
async function downloadUrlAsMarkdown(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), URL_DOWNLOAD_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Hydra-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url,
        markdown: '',
        error: `Failed to fetch: ${response.status} ${response.statusText}`
      };
    }

    const html = await response.text();
    const markdown = turndownService.turndown(html);

    return { url, markdown: markdown || '(No content extracted)' };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { url, markdown: '', error: 'Download timeout' };
    }
    return { url, markdown: '', error: err.message };
  }
}

/**
 * Process URLs in text and prepend their content
 * @param {string} text - Original user text that may contain URLs
 * @returns {Promise<{processedText: string, urlsFound: string[], urlsProcessed: number}>}
 */
export async function processUrlsInText(text) {
  let processedText = text;
  let urlsProcessed = 0;
  const urls = extractUrls(text);
  
  // Support only the first URL found
  if (urls.length === 0) {
    return { processedText: text, urlsFound: [], urlsProcessed: 0 };
  }
  
  // Take only the first URL
  const firstUrl = urls[0];
  
  const result = await downloadUrlAsMarkdown(firstUrl);
  
  if (result.markdown && !result.error) {
    // Prepend the markdown content with URL reference
    const urlContent = `\n\n---\n# Content from ${firstUrl}\n\n${result.markdown}\n---\n`;
    processedText = urlContent + text;
    urlsProcessed = 1;
  } else {
    processedText = text;
    urlsProcessed = 0;
  }
  
  return {
    processedText,
    urlsFound: [firstUrl],
    urlsProcessed
  };
}