# 🧠 Technical Logic & Architecture

This document breaks down the internal mechanics of the **AI Job Tracker**, explaining how it bridges Gmail, OpenRouter AI, and the Chrome Extension API.

## 📡 System Architecture
The extension follows a **Service-Oriented Architecture** within a Manifest V3 environment:
1.  **Storage Layer**: Uses `chrome.storage.local` to persist the job database, API keys, user settings, and usage statistics.
2.  **API Layer**: Two specialized modules handle external communications:
    -   `gmail-api.js`: Handles OAuth and email fetching.
    -   `openrouter-api.js`: Handles AI model interactions, rate limits, and cost estimation.
3.  **Background Service**: The Service Worker (`background.js`) acts as the "brain," coordinating data flow between APIs and storage.

---

## 📩 Step 1: Gmail Data Retrieval (`gmail-api.js`)
The extension uses the **OAuth 2.0** protocol to access the user's emails securely.

-   **Authentication**: `chrome.identity.getAuthToken` retrieves a temporary bearer token from the Google account signed into Chrome.
-   **Filtering**: To optimize performance, we use a specific Gmail search query:
    -   Query: `newer_than:7d (application OR "thank you for applying" OR interview)`
-   **Decoding**: Gmail returns email bodies in **Base64URL** format. The script converts this into standard text so the AI can process the content.

---

## 🔐 Security & Privacy
-   **Least Privilege**: The extension requests `gmail.readonly`—it can read your mail but cannot send, delete, or change it.
-   **Local Storage**: Your job data never leaves your computer. It is stored in your local Chrome profile and only sent to Google’s APIs (Gmail) and OpenRouter during the sync process.
-   **No Backend**: There is no external database; you own 100% of your data.

---

## 🛠️ Key Technologies
-   **Manifest V3**: The latest, most secure Chrome Extension standard.
-   **OpenRouter API**: Aggregator for accessing state-of-the-art AI models.
-   **OAuth 2.0**: Standardized secure authorization without password sharing.