/**
 * Gemini API Handler
 * Processes email text to extract job application details
 */

export const GeminiAPI = {
    analyzeEmail: async function (apiKey, emailData) {
        // UPDATED: Using the stable 2.5-flash model for 2025/2026
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // Get today's date so the AI can resolve relative dates like "tomorrow" or "next Friday"
        const today = new Date().toISOString().split('T')[0];

        const prompt = `
          Today's Date: ${today}
          Analyze this email and return a JSON object. 
          
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
            "date": "YYYY-MM-DD",
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error.message);

            let rawText = data.candidates[0].content.parts[0].text;
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                return { is_job_related: false };
            }

        } catch (error) {
            console.error("Gemini Error:", error);
            return { is_job_related: false };
        }
    }
};