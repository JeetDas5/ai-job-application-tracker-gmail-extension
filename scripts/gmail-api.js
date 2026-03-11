/**
 * Gmail API Handler
 * Handles authentication and fetching of emails
 */

export const GmailAPI = {
  /**
   * Gets the OAuth2 token from Chrome Identity API
   */
  getAuthToken: function () {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  },

  /**
   * Searches for relevant job emails
   * Filter: Emails from last 7 days containing job-related phrases
   */
  listMessages: async function (
    token,
    query = 'label:INBOX newer_than:7d (application OR "thank you" OR "received your application")'
  ) {
    const url = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      query
    )}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    return data.messages || [];
  },

  /**
   * Extracts ALL text/plain parts from a multipart Gmail message
   * This is critical for not missing job roles
   */
  extractBody: function (payload) {
    let body = "";

    function walkParts(parts) {
      for (const part of parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          body += atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        } else if (part.parts) {
          walkParts(part.parts);
        }
      }
    }

    if (payload.parts) {
      walkParts(payload.parts);
    } else if (payload.body?.data) {
      body = atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    }

    return body;
  },

  getMessage: async function (token, messageId) {
    const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    if (!data || !data.payload || !data.payload.headers) {
      return { subject: "No Subject", body: "" };
    }

    const headers = data.payload.headers;
    const subjectHeader = headers.find(
      (h) => h.name.toLowerCase() === "subject"
    );
    const subject = subjectHeader ? subjectHeader.value : "No Subject";

    const body = this.extractBody(data.payload);

    return { subject, body };
  },
};
