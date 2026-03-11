# Migration Guide: Gemini to OpenRouter

## Overview

This project has been migrated from using Google's Gemini API directly to using OpenRouter, which provides a unified API gateway to access multiple AI models including Gemini.

## What Changed

### Files Modified

1. **`scripts/openrouter-api.js`** (new file, replaces `gemini-api.js`)

   - New API endpoint: `https://openrouter.ai/api/v1/chat/completions`
   - Uses OpenAI-compatible chat completions format
   - Default model: `google/gemini-2.0-flash-exp:free`

2. **`scripts/background.js`**

   - Import changed from `GeminiAPI` to `OpenRouterAPI`
   - Storage key changed from `gemini_key` to `openrouter_key`

3. **`popup/popup.html`**

   - Updated placeholder text to "Enter OpenRouter API Key"

4. **`popup/popup.js`**

   - Storage key changed from `gemini_key` to `openrouter_key`
   - Updated alert message

5. **`manifest.json`**

   - Updated description to mention OpenRouter
   - Changed host_permissions from `generativelanguage.googleapis.com` to `openrouter.ai`

6. **Documentation** (`README.md`, `EXPLANATION.md`)
   - Updated all references to reflect OpenRouter usage

## Migration Steps for Users

### 1. Get an OpenRouter API Key

1. Visit [OpenRouter](https://openrouter.ai/)
2. Sign up for a free account
3. Navigate to **Keys** in your dashboard
4. Create a new API key and copy it

### 2. Update Your Extension

1. Reload the extension in Chrome (`chrome://extensions`)
2. Open the extension popup
3. Enter your new OpenRouter API key
4. Click "Save Key"

### 3. Test the Migration

1. Click "Sync Gmail" to test the integration
2. The extension should now use OpenRouter to analyze your emails

## Benefits of OpenRouter

1. **Multiple Models**: Access to various AI models through a single API
2. **Free Tier**: The `google/gemini-2.0-flash-exp:free` model is free to use
3. **Unified API**: OpenAI-compatible API format
4. **Flexibility**: Easy to switch between different models by changing the model parameter
5. **Better Rate Limits**: OpenRouter often has more generous rate limits

## Model Options

You can change the model in `scripts/openrouter-api.js` by modifying the `model` parameter:

```javascript
// Current default (free)
model: "google/gemini-2.0-flash-exp:free";

// Other options:
// model: "google/gemini-pro-1.5"
// model: "anthropic/claude-3-haiku"
// model: "meta-llama/llama-3-8b-instruct"
```

Visit [OpenRouter Models](https://openrouter.ai/models) for a full list of available models and pricing.

## Troubleshooting

### "Missing OpenRouter API Key" Error

- Make sure you've saved your OpenRouter API key in the extension popup
- Check that the key is valid and hasn't expired

### API Errors

- Check your OpenRouter account for rate limits or quota issues
- Verify that the model you're using is available and accessible with your API key

### Old Gemini Key Still Showing

- The extension now uses a different storage key (`openrouter_key` instead of `gemini_key`)
- Your old Gemini key will remain in storage but won't be used
- You can clear it manually if desired

## Rollback (If Needed)

If you need to revert to the Gemini API:

1. Restore `scripts/gemini-api.js` from git history
2. Update `scripts/background.js` to import `GeminiAPI`
3. Change storage keys back to `gemini_key`
4. Update `manifest.json` host_permissions back to `generativelanguage.googleapis.com`

## Notes

- The old `gemini-api.js` file is no longer used and can be deleted
- All existing job data will remain intact during the migration
- No data migration is needed; only the API key needs to be updated
