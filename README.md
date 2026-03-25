# AI Job Application Tracker

A Chrome Extension that automatically syncs job application emails from your Gmail, analyzes them using **OpenRouter AI Models** (including Gemini, GPT-4, Claude, and free models), and organizes them into a clean dashboard with interview tracking.

## Setup Instructions

### 1. Load the Extension into Chrome
1. Download or clone this repository.
2. Open Chrome and invoke `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. **Copy the Extension ID** from the card (you'll need it for Google Cloud).

### 2. Configure Google Cloud (OAuth 2.0)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable **Gmail API**.
4. Configure **OAuth consent screen** (User Type: External, add your email as Test User).
5. Create **Credentials > OAuth client ID** (Application type: Chrome extension).
6. Paste your **Extension ID**.
7. Copy the generated **Client ID**.

### 3. Update Manifest
1. Open `manifest.json`.
2. Replace `YOUR_GOOGLE_CLIENT_ID_HERE` with your generic Client ID.
3. Reload the extension in `chrome://extensions`.

### 4. Get an OpenRouter API Key
1. Visit [OpenRouter.ai](https://openrouter.ai/).
2. Create an account and get a free Key.
3. In the extension dashboard, go to **Settings**.
4. Paste your key and click **Save**.
5. Select a model from the dropdown (default: Gemini models, sorted by price).

---

## Usage Guide
1. **Sync**: Click "Sync Gmail" in the popup. Authorize with Google if prompted.
2. **Dashboard**:
   - **Applications**: View your tracked jobs. Sorting puts interviews at the top!
   - **Stats**: Monitor how many AI calls you make daily to avoid rate limits.
   - **Compare**: Check which models are cheapest or have the highest limits.
3. **Filtering**: Use the sidebar to show only "Interviewing" or "Offers".
4. **Rate Limits**: If a model hits a rate limit (429), it will be marked with a red cross (❌) in the dropdown.

---

## Project Structure
- `scripts/`: 
  - `openrouter-api.js`: Handles AI model fetching and email analysis.
  - `gmail-api.js`: interacting with Gmail API.
  - `background.js`: Core sync logic and stats tracking.
- `dashboard/`:
  - `dashboard.html`: Main UI.
  - `dashboard.js`: Frontend logic, routing, and rendering.
  - `dashboard.css`: Styles including dark mode.
- `popup/`: Extension entry point.

## Developers
Jeet Das ([JeetDas5](https://github.com/JeetDas5))

Poushali Patra([PoushaliPatra](https://github.com/patrapoushali))

Manoranjan Mahapatra([ManoranjanMahapatra](https://github.com/Manoranjan-Mahapatra))