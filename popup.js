// Constants for elements and API base URL
const messageBox = document.getElementById('message');
const transcriptOutput = document.getElementById('transcript-output');
const transcriptLanguages = document.getElementById('transcript-languages');
const extractButton = document.getElementById('extract-transcript');
const copyButton = document.getElementById('copy-transcript');
const apiBaseUrl = 'https://transcript.andreszenteno.com';

// Global variables for transcript and video data
let transcript = '';
let videoTitle = '';
let videoUrl = '';

// Disable buttons by default
messageBox.style.display = 'none';
extractButton.disabled = true;
copyButton.disabled = true;

// Check if we are on a valid YouTube page or embedded video
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    videoUrl = await getVideoUrl(tab);  // Pass tab.id to get the video URL
    if (videoUrl) {
        extractButton.disabled = false;
    } else {
        messageBox.style.display = 'block';
        messageBox.innerText = 'No YouTube video found on this page.';
    }
});

// Function to extract video URL (either direct or embedded)
// Function to extract video URL (either direct or embedded)
async function getVideoUrl(tab) {
    const url = tab.url || '';  // Ensure `url` is a string
    if (typeof url !== 'string') {
        return null;  // Return null if url is not a string
    }

    if (url.includes('youtube.com/watch?v=') || url.includes('youtube.com/shorts') || url.includes('youtu.be/')) {
        return url;  // Direct YouTube video URL
    } else {
        // Check for embedded video
        const iframeSrc = await getEmbeddedVideoUrl(tab.id);
        if (iframeSrc) {
            const videoId = iframeSrc.split('embed/')[1]?.split('?')[0];
            return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
        }
    }
    return null;
}


// Function to get the embedded video URL (runs within the page)
async function getEmbeddedVideoUrl(tabId) {
    return new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: { tabId: tabId },  // Corrected this line to use tab.id, not the URL
            func: extractEmbeddedVideoUrl
        }, (results) => resolve(results[0]?.result || null));
    });
}

// Function to extract embedded YouTube video URL (runs in the page)
function extractEmbeddedVideoUrl() {
    const iframe = Array.from(document.querySelectorAll('iframe')).find(iframe => iframe.src.includes('youtube.com/embed/'));
    return iframe ? iframe.src : null;
}

// Handle extract transcript click event
extractButton.addEventListener("click", async () => {
    transcriptOutput.innerHTML = '<div class="spinner-container"><div class="spinner"></div><div class="spinner-text">Fetching transcript... This may take a few seconds.</div></div>';
    const data = await fetchTranscript(videoUrl);

    if (data) {
        copyButton.disabled = false;
        transcript = data.transcript;
        videoTitle = data.title;
        const languages = data.languages;
        displayTranscript(languages, data.transcriptLanguageCode);
    } else {
        transcriptOutput.innerHTML = 'Error fetching transcript';
    }
});

// Fetch transcript and languages from API
async function fetchTranscript(url, lang = '') {
    try {
        const response = await fetch(`${apiBaseUrl}/simple-transcript-v3`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, lang })
        });

        if (!response.ok) throw new Error('Failed to fetch transcript');

        return await response.json();
    } catch (error) {
        messageBox.innerText = `Error: ${error.message}`;
        messageBox.style.display = 'block';
        return null;
    }
}

// Display transcript and language dropdown
function displayTranscript(languages, currentLangCode = '') {
    transcriptOutput.innerHTML = `<strong>${videoTitle}</strong><br><br>${transcript}`;
    handleLanguageSelection(languages, currentLangCode);
}


// Handle language selection for transcripts
function handleLanguageSelection(languages, currentLangCode = '') {
    transcriptLanguages.innerHTML = '';  // Clear previous languages
    if (languages && languages.length > 0) {
        const select = document.createElement('select');
        select.innerHTML = '<option value="">Available languages</option>';

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;

            // Select the option if it matches the current transcript language
            if (lang.code === currentLangCode) {
                option.selected = true;
            }

            select.appendChild(option);
        });

        transcriptLanguages.appendChild(select);

        select.addEventListener('change', async (event) => {
            const selectedLanguage = event.target.value;
            if (selectedLanguage) {
                transcriptOutput.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';
                const data = await fetchTranscript(videoUrl, selectedLanguage);
                if (data) {
                    transcript = data.transcript;  // Update the transcript variable
                    displayTranscript(data.languages, data.transcriptLanguageCode);  // Pass the current language code
                }
            }
        });
    }
}

// Handle copy transcript button click
copyButton.addEventListener('click', async () => {
    if (transcript) {
        await navigator.clipboard.writeText(`${videoTitle}\n\n${transcript}`);
        copyButton.innerText = 'Copied!';
        setTimeout(() => {
            copyButton.innerText = 'Copy';
        }, 2000);
    }
});

document.getElementById("summarize").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = '<div class="loading"><div class="loader"></div></div>';

  const summaryType = document.getElementById("summary-type").value;

  // Get API key from storage
  chrome.storage.sync.get(["geminiApiKey"], async (result) => {
    if (!result.geminiApiKey) {
      resultDiv.innerHTML =
        "API key not found. Please set your API key in the extension options.";
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "GET_ARTICLE_TEXT" },
        async (res) => {
          if (!res || !res.text) {
            resultDiv.innerText =
              "Could not extract article text from this page.";
            return;
          }

          try {
            const summary = await getGeminiSummary(
              res.text,
              summaryType,
              result.geminiApiKey
            );
            resultDiv.innerText = summary;
          } catch (error) {
            resultDiv.innerText = `Error: ${
              error.message || "Failed to generate summary."
            }`;
          }
        }
      );
    });
  });
});

document.getElementById("copy-btn").addEventListener("click", () => {
  const summaryText = document.getElementById("result").innerText;

  if (summaryText && summaryText.trim() !== "") {
    navigator.clipboard
      .writeText(summaryText)
      .then(() => {
        const copyBtn = document.getElementById("copy-btn");
        const originalText = copyBtn.innerText;

        copyBtn.innerText = "Copied!";
        setTimeout(() => {
          copyBtn.innerText = originalText;
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  }
});




async function getGeminiSummary(text, summaryType, apiKey) {
  // Truncate very long texts to avoid API limits (typically around 30K tokens)
  const maxLength = 20000;
  const truncatedText =
    text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  let prompt;
  switch (summaryType) {
    case "brief":
      prompt = `Provide a brief summary of the following article in 2-3 sentences:\n\n${truncatedText}`;
      break;
    case "detailed":
      prompt = `Provide a detailed summary of the following article, covering all main points and key details:\n\n${truncatedText}`;
      break;
    case "bullets":
      prompt = `Summarize the following article in 5-7 key points. Format each point as a line starting with "- " (dash followed by a space). Do not use asterisks or other bullet symbols, only use the dash. Keep each point concise and focused on a single key insight from the article:\n\n${truncatedText}`;
      break;
    case "Personalize":
      prompt = `Act as a technical content linker with deep knowledge of programming syntax and frameworks. I will provide an article. You also have my resume containing skills, tools, and technologies I’ve used. Your task is to: Carefully read the article and detect any mentioned technologies, components, functions, tools, or syntax. If any of these are related or conceptually equivalent to something in my resume, then: Explain the relationship clearly and precisely by showing exact equivalents or comparisons in syntax or terminology. For example: "<Article_Term> in <Article_Tech> is similar to <Resume_Term> in <Resume_Tech>." If no such mapping is possible, respond with “Cannot link.” ⚠️ Do not write summaries or general comparisons (e.g., “both are frameworks”). Only produce output if specific function names, syntax, components, or tools can be matched. 📄 My Resume less Copy Edit Lakkoju Vinay +91-9603043375 | vinaylakkoju17@gmail.com B.Tech in Computer Science, CGPA: 9.0 🔹 Experience – Android Intern – Geeks for Geeks – Software Dev Intern – HeyDoc AI 🔹 Projects – CheckMyResume (Flutter, Gemini API) – Prompt GPT (Flutter, Gemini API) 🔹 Skills SQL, Python,  Product Management: Agile, A/B Testing, MVP Design Tools: Jira, Figma, Notion, Postman, Google Analytics 🔹 Position – Android Lead – GDSC AITAM 📰 Article Text: "- \n\n${truncatedText}"`;
      break;
    default:
      prompt = `Summarize the following article:\n\n${truncatedText}`;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || "API request failed");
    }

    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No summary available."
    );
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate summary. Please try again later.");
  }
}



