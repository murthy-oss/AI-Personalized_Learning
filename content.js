function getArticleText() {
  const article = document.querySelector("article");
  if (article) return article.innerText;

  // fallback
  const paragraphs = Array.from(document.querySelectorAll("p"));
  return paragraphs.map((p) => p.innerText).join("\n");
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "GET_ARTICLE_TEXT") {
    const text = getArticleText();
    sendResponse({ text });
  }
});

// Example: Detect the YouTube video page load and interact with it
if (window.location.host === 'www.youtube.com' && window.location.pathname.includes('watch')) {
    console.log('YouTube Video Page Loaded');
    // You can trigger transcript extraction logic here.
}
