/**
 * OpenRouter API Handler
 * Handles model listing and email analysis via OpenRouter
 */

export const OpenRouterAPI = {
    /**
     * Fetches the list of available models from OpenRouter
     * and returns ONLY text models (both free and paid),
     * with helper properties for cost and limits.
     */
    listModels: async function () {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models");
            const data = await response.json();

            if (data && data.data) {
                // Filter for any model that supports TEXT output
                const textModels = data.data.filter(model => {
                    const isTextModel = (model.output_modalities && model.output_modalities.includes("text")) ||
                        model.has_text_output === true ||
                        model.architecture?.modality?.includes("text");
                    return isTextModel;
                });

                // Map helpers
                return textModels.map(m => {
                    const pPrompt = m.pricing ? parseFloat(m.pricing.prompt) : 0;
                    const pComp = m.pricing ? parseFloat(m.pricing.completion) : 0;
                    const isFree = (pPrompt === 0 && pComp === 0) || m.is_free === true;

                    // Estimate cost for 1 email (approx 1000 prompt tokens + 200 completion tokens)
                    // Pricing is per token on OpenRouter (usually like 0.000001)
                    const estCost = (pPrompt * 1000) + (pComp * 200);

                    return {
                        ...m,
                        _isFree: isFree,
                        _estCost: estCost, // Cost per ~1 email
                        _rpm: m.top_provider?.limit_rpm || null,
                        _rpd: m.top_provider?.limit_rpd || null
                    };
                });
            }
            return [];
        } catch (error) {
            console.error("Failed to fetch OpenRouter models:", error);
            return [];
        }
    },

    /**
     * Analyzes an email using the specified OpenRouter model.
     */
    analyzeEmail: async function (apiKey, emailData, model) {
        console.log("OpenRouter API Request -> Model:", model);

        // Default to a known good free model if none specified
        const targetModel = model || "google/gemini-2.0-flash-exp:free";

        const url = "https://openrouter.ai/api/v1/chat/completions";

        const today = new Date().toISOString().split('T')[0];

        // Reusing the proven prompt from v1
        const prompt = `
      Today's Date: ${today}
      Analyze this email and return a JSON object. 
      IMPORTANT RULES:
        - Job roles may be human-readable OR requisition-style
            (e.g., "Intern-563779", "Software Development Engineer I").
        - Job roles may contain numbers or hyphens.
        - If the company or role is explicitly mentioned, DO NOT return null.
        - Return null ONLY if the information is truly absent.

        STATUS CLASSIFICATION RULES (VERY IMPORTANT):
        - If the email confirms receipt of an application
            (e.g., "thank you for applying", "we have received your application",
            "application received", "we will review your profile"),
            the status MUST be EXACTLY the string "Applied".
        - ONLY set status to "Interviewing" if:
            • an interview is explicitly scheduled, OR
            • the email clearly invites the candidate to an interview.
      If this is a job application, confirmation, or interview request, set is_job_related to true.
      If there is an interview mentioned, extract the date/time.

      EMAIL:
      Subject: ${emailData.subject}
      Body: ${emailData.body}

      RETURN ONLY THIS JSON FORMAT:
      {
        "is_job_related": boolean,
        "company": "string",
        "role": "string",
        "status": "Applied" | "Interviewing" | "Rejected" | "Offer",
        "date": "Today's date in YYYY-MM-DD",
        "interview_details": {
            "is_scheduled": boolean,
            "date": "YYYY-MM-DD or null",
            "time": "HH:MM AM/PM or null"
        }
      }
    `;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "X-Title": "AI Gmail Job Tracker Extension",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": targetModel,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                })
            });

            if (response.status === 429) {
                throw new Error("429 Rate Limit Exceeded");
            }

            const data = await response.json();

            if (data.error) {
                // OpenRouter passes status in error object sometimes too
                if (data.error.code === 429) throw new Error("429 Rate Limit Exceeded");
                throw new Error(data.error.message || "OpenRouter API Error");
            }

            // OpenRouter response structure mimics OpenAI
            if (data.choices && data.choices[0] && data.choices[0].message) {
                let rawText = data.choices[0].message.content;
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);

                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);

                    // --- STATS TRACKING ---
                    try {
                        const today = new Date().toISOString().split('T')[0];
                        const storage = await chrome.storage.local.get("stats");
                        const stats = storage.stats || { ai_daily: {}, emails_daily: {} };

                        // Initialize structure
                        if (!stats.ai_daily[today]) stats.ai_daily[today] = {};
                        if (!stats.ai_daily[today][targetModel]) stats.ai_daily[today][targetModel] = 0;

                        // Increment
                        stats.ai_daily[today][targetModel]++;

                        await chrome.storage.local.set({ stats });
                    } catch (statsErr) {
                        console.error("Failed to update stats:", statsErr);
                        // Don't block main flow
                    }
                    // ----------------------

                    return result;
                }
            }

            return { is_job_related: false };

        } catch (error) {
            console.error("OpenRouter Analysis Error:", error);

            // Handle Rate Limiting (HTTP 429 or specific error message)
            if (error.message.includes("429") || error.message.toLowerCase().includes("rate limit")) {
                try {
                    const store = await chrome.storage.local.get("rate_limit_errors");
                    const errors = store.rate_limit_errors || {};
                    errors[targetModel] = Date.now();
                    await chrome.storage.local.set({ rate_limit_errors: errors });
                    console.log(`Recorded rate limit for ${targetModel}`);
                } catch (storageErr) {
                    console.error("Failed to save rate limit error", storageErr);
                }
            }

            throw error; // Propagate for sync handling
        }
    },

    /**
     * Analyzes an email using a user-provided custom prompt.
     * Returns { is_relevant, summary, ...any extra fields the AI adds }
     */
    analyzeEmailCustom: async function (apiKey, emailData, model, customPrompt) {
        const targetModel = model || "google/gemini-2.0-flash-exp:free";
        const url = "https://openrouter.ai/api/v1/chat/completions";
        const today = new Date().toISOString().split('T')[0];

        const prompt = `
Today's Date: ${today}

USER INSTRUCTION:
${customPrompt}

EMAIL:
Subject: ${emailData.subject}
Body: ${emailData.body}

IMPORTANT: Return ONLY a valid JSON object. At minimum it MUST include:
{
  "is_relevant": boolean,   // true if this email matches the user's criteria
  "summary": "string"       // one-to-two sentence summary of why (or why not)
}
You may include additional fields that the USER INSTRUCTION requests.
Do NOT include any markdown, code fences, or extra text — just the JSON.
`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "X-Title": "AI Gmail Tracker Extension",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": targetModel,
                    "messages": [{ "role": "user", "content": prompt }]
                })
            });

            if (response.status === 429) throw new Error("429 Rate Limit Exceeded");

            const data = await response.json();
            if (data.error) {
                if (data.error.code === 429) throw new Error("429 Rate Limit Exceeded");
                throw new Error(data.error.message || "OpenRouter API Error");
            }

            if (data.choices && data.choices[0] && data.choices[0].message) {
                let rawText = data.choices[0].message.content;
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);

                    // Stats tracking
                    try {
                        const today = new Date().toISOString().split('T')[0];
                        const storage = await chrome.storage.local.get("stats");
                        const stats = storage.stats || { ai_daily: {}, emails_daily: {} };
                        if (!stats.ai_daily[today]) stats.ai_daily[today] = {};
                        if (!stats.ai_daily[today][targetModel]) stats.ai_daily[today][targetModel] = 0;
                        stats.ai_daily[today][targetModel]++;
                        await chrome.storage.local.set({ stats });
                    } catch (statsErr) {
                        console.error("Failed to update stats:", statsErr);
                    }

                    return result;
                }
            }

            return { is_relevant: false, summary: "No response from AI" };

        } catch (error) {
            console.error("OpenRouter Custom Analysis Error:", error);

            if (error.message.includes("429") || error.message.toLowerCase().includes("rate limit")) {
                try {
                    const store = await chrome.storage.local.get("rate_limit_errors");
                    const errors = store.rate_limit_errors || {};
                    errors[targetModel] = Date.now();
                    await chrome.storage.local.set({ rate_limit_errors: errors });
                } catch (storageErr) {
                    console.error("Failed to save rate limit error", storageErr);
                }
            }

            throw error;
        }
    }
};