"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedRequestService = exports.EnhancedRequestService = void 0;
const axios_1 = require("axios");
class EnhancedRequestService {
    constructor() {
        this.lastRequestTime = 0;
        this.minRequestInterval = 1000; // Minimum 1 second between requests
        this.userAgents = {
            chrome: [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
            firefox: [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
                'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
            ],
            safari: [
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
            ]
        };
    }
    async fetchWithRetry(url, options = {}) {
        const { timeout = 15000, retries = 3, delay = 2000, userAgent = 'random' } = options;
        let lastError;
        let attempts = 0;
        for (let attempt = 0; attempt < retries; attempt++) {
            attempts++;
            try {
                // Rate limiting: ensure minimum time between requests
                await this.enforceRateLimit();
                const selectedUserAgent = this.selectUserAgent(userAgent, attempt);
                const headers = this.generateHeaders(selectedUserAgent, url, attempt);
                console.log(`Attempt ${attempt + 1}/${retries} for ${url}`, {
                    userAgent: selectedUserAgent.substring(0, 50) + '...',
                    hasReferer: !!headers['Referer'],
                    timeSinceLastRequest: Date.now() - this.lastRequestTime
                });
                const response = await axios_1.default.get(url, {
                    timeout,
                    headers,
                    maxRedirects: 5,
                    validateStatus: (status) => status < 500, // Accept 4xx as valid (might be content)
                });
                // Update last request time for rate limiting
                this.lastRequestTime = Date.now();
                // Check if we got blocked
                if (this.isBlockedResponse(response)) {
                    throw new Error(`Blocked by bot detection (attempt ${attempt + 1})`);
                }
                console.log(`✅ Successfully fetched ${url}`, {
                    status: response.status,
                    contentLength: response.data.length,
                    attempts
                });
                return {
                    data: response.data,
                    status: response.status,
                    headers: response.headers,
                    url: response.config.url || url,
                    attempts,
                    finalUserAgent: selectedUserAgent
                };
            }
            catch (error) {
                lastError = error;
                console.warn(`Attempt ${attempt + 1} failed:`, {
                    error: error instanceof Error ? error.message : String(error),
                    url
                });
                // If it's the last attempt, don't wait
                if (attempt < retries - 1) {
                    // Progressive delay: 2s, 4s, 6s
                    const waitTime = delay * (attempt + 1);
                    await this.sleep(waitTime);
                }
            }
        }
        throw new Error(`Failed to fetch ${url} after ${attempts} attempts. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
    selectUserAgent(type, attempt) {
        if (type === 'random') {
            const browsers = ['chrome', 'firefox', 'safari'];
            const browser = browsers[attempt % browsers.length];
            const agents = this.userAgents[browser];
            return agents[attempt % agents.length];
        }
        if (type in this.userAgents) {
            const agents = this.userAgents[type];
            return agents[attempt % agents.length];
        }
        // Fallback to Chrome
        return this.userAgents.chrome[0];
    }
    generateHeaders(userAgent, url, attempt) {
        const baseHeaders = {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Upgrade-Insecure-Requests': '1',
            'Connection': 'keep-alive',
        };
        // Add a realistic referer for better bot detection bypass (only if not first attempt)
        if (attempt > 0) {
            baseHeaders['Referer'] = this.generateReferer(url);
        }
        // Add browser-specific headers
        if (userAgent.includes('Chrome')) {
            return Object.assign(Object.assign({}, baseHeaders), { 'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"macOS"', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': attempt === 0 ? 'none' : 'cross-site', 'Sec-Fetch-User': '?1' });
        }
        if (userAgent.includes('Firefox')) {
            return Object.assign(Object.assign({}, baseHeaders), { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'DNT': '1', 'Connection': 'keep-alive' });
        }
        if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
            return Object.assign(Object.assign({}, baseHeaders), { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Connection': 'keep-alive' });
        }
        return baseHeaders;
    }
    isBlockedResponse(response) {
        const body = String(response.data).toLowerCase();
        const status = response.status;
        // Common bot detection patterns
        const blockPatterns = [
            'access denied',
            'blocked',
            'captcha',
            'cloudflare',
            'bot detection',
            'please enable javascript',
            'checking your browser',
            'ddos protection',
            'security check',
            'ray id',
            'error 1020',
            'error 1015',
            'please wait while we',
            'human verification',
            'unusual traffic',
            'automated requests',
            'suspicious activity'
        ];
        // Check status codes
        if (status === 403 || status === 429 || status === 503 || status === 1020) {
            console.warn(`🚫 Blocked by status code: ${status}`);
            return true;
        }
        // Check for very short responses (often indicate blocking)
        if (body.length < 500 && blockPatterns.some(pattern => body.includes(pattern))) {
            console.warn(`🚫 Blocked by content pattern in short response (${body.length} chars)`);
            return true;
        }
        // Check body content for block patterns
        if (typeof body === 'string') {
            for (const pattern of blockPatterns) {
                if (body.includes(pattern)) {
                    console.warn(`🚫 Blocked by content pattern: "${pattern}"`);
                    return true;
                }
            }
        }
        return false;
    }
    async enforceRateLimit() {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`⏱️ Rate limiting: waiting ${waitTime}ms`);
            await this.sleep(waitTime);
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Generate realistic referer based on the URL
    generateReferer(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            // Common referer patterns
            const referers = [
                `https://${domain}`,
                `https://www.google.com/search?q=${encodeURIComponent(domain)}`,
                `https://www.bing.com/search?q=${encodeURIComponent(domain)}`,
                `https://duckduckgo.com/?q=${encodeURIComponent(domain)}`
            ];
            return referers[Math.floor(Math.random() * referers.length)];
        }
        catch (_a) {
            return 'https://www.google.com/';
        }
    }
}
exports.EnhancedRequestService = EnhancedRequestService;
// Singleton instance
exports.enhancedRequestService = new EnhancedRequestService();
//# sourceMappingURL=enhancedRequestService.js.map