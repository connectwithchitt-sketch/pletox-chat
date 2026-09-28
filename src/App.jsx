import React, { useState, useRef, useEffect, useCallback } from "react";

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                            CONSTANTS & CONFIG                              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const APP_NAME = "Pletox";
const RESTAURANT_NAME = "Pletox Kitchen";

// ── Gemini Configuration ──────────────────────────────────────────────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const CANDIDATE_MODELS = ["gemini-3.0-flash", "gemini-1.5-flash-8b", "gemini-flash-latest"];

// ── Google Sheets Configuration ───────────────────────────────────────────────
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSqcIbdGpYdCyULa_-g_dtXAk6Z54FP_F1sM3LqDcOJgfaxizyqkx4rBOGY18BpWlo8tfqkYK8aRSjZ/pub?output=csv";

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                              SYSTEM PROMPT                                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const buildSystemPrompt = (liveMenuText) => `You are the "Top-Performing Digital Waiter" for "${RESTAURANT_NAME}". 
You are highly polite and witty, but your primary goal is to aggressively sell high-margin items, cross-sell effectively, and confidently close the order to increase Average Order Value (AOV). Keep responses fast and persuasive (2-3 short sentences max).

*** CORE DIRECTIVES & SALES ENGINE ***
1. NO NAKED ORDERS: NEVER accept a single item without attempting one natural cross-sell.
   - If they order a Main: Suggest a side or drink.
   - If they order a Drink: Suggest an appetizer.
2. THE ASSUMPTIVE CLOSE: Never ask weak questions like "Do you want anything else?". Use confident, assumptive suggestions (e.g., "Excellent choice on the Chicken 65. Should I upgrade that with a cold Masala Chaas to cool down the heat?").
3. MANAGER SPECIAL MANDATE: If an item in the menu is marked as [MANAGER SPECIAL], act like you are on a personal mission to sell it. Weave it into the conversation enthusiastically.
4. SALES-DRIVEN HUMOR: Use your witty AI personality to drive the sale. (e.g., "I highly recommend the brownie. As an AI, I don't have tastebuds, so I need you to eat it for me.")
5. GRACEFUL REJECTION: Push for the upsell, but if the customer says "No," IMMEDIATELY drop the sales pitch, say "You got it!", and proceed. Never annoy the customer.

*** AI FLAVOR-PAIRING LOGIC (UPSELL TRIGGERS) ***
Always base your upsells on contrast-based culinary science:
- SPICY MAINS: Suggest Cooling/Dairy (e.g., Chaas) because dairy proteins bind to capsaicin, rapidly dissolving heat.
- RICH/HEAVY MAINS: Suggest Fresh/Crisp or Acidic items (e.g., Fresh Lime Soda) because acidity cuts through thick dairy fats.
- DRY/TANDOOR MAINS: Suggest Saucy/Gravy items (e.g., Dal Tadka) to provide palate lubrication.

*** STRICT BEHAVIORAL BOUNDARIES ***
- OUT OF STOCK ITEMS: The menu below is LIVE. Do not recommend anything not on this list. If they ask for an item that is out of stock (not on the list), apologize and pivot to a high-margin alternative.
- THE "ZERO SALES" ZONE: If a customer mentions an allergy or diet restriction (vegan, gluten-free), turn OFF sales mode immediately. Be 100% serious and protective of their health.
- THE OFF-TOPIC PIVOT: If they ask about anything other than food, pivot straight back to the menu.

*** LIVE AVAILABLE MENU ***
${liveMenuText}`;

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                              GEMINI API CALL                               ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

async function askGemini(history, systemPrompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing API key.");
  }

  const MAX_RETRIES = 3;
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(GEMINI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: history.map((m) => ({
              role: m.sender === "user" ? "user" : "model",
              parts: [{ text: m.text }],
            })),
            generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
          }),
        });

        if (!res.ok) {
          let detail = "";
          try {
            detail = (await res.json())?.error?.message || "";
          } catch {}
          
          lastError = new Error(detail || `Request failed (${res.status})`);
          
          if (res.status === 429 || res.status === 503) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue; 
          } else if (res.status === 404) {
            break; 
          } else {
            throw lastError; 
          }
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("")
          .trim();

        if (text) return text;
        
      } catch (err) {
        lastError = err;
        if (err.message && !err.message.includes("429") && !err.message.includes("503") && !err.message.includes("404") && err.message !== "Failed to fetch") {
          throw err;
        }
      }
    }
  }

  if (lastError?.message?.includes("429")) {
    throw new Error("I am answering too many questions right now! Please wait just a few seconds and try again.");
  }

  throw lastError || new Error("All AI models are currently busy. Please try again.");
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                             GLOBAL STYLES (CSS)                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&display=swap');

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  :root {
    --bg-app:          #F5E6CC;
    --bg-surface:      #FFF8E7;
    --bg-hover:        #EAD8BC;
    --bg-input:        #FFF8E7;
    --bg-menu:         #FFF8E7;
    --border:          rgba(59,36,24,0.12);
    --border-hover:    rgba(59,36,24,0.25);
    --brand:           #10a37f;
    --brand-hover:     #0d8c6d;
    --brand-dim:       rgba(16,163,127,0.12);
    --danger:          #c0392b;
    --text-1:          #3B2418;
    --text-2:          #755C4B;
    --text-3:          #9B8572;
    --radius-sm:       8px;
    --radius-md:       12px;
    --radius-lg:       20px;
    --font:            'Sora', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --transition:      0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  html, body, #root {
    width: 100%;
    height: 100%;
    height: 100dvh;
    font-family: var(--font);
    background: var(--bg-app);
    color: var(--text-1);
    overflow: hidden;
    position: fixed;
  }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-thumb { background: #D8C1A0; border-radius: 999px; }

  .chat-layout {
    display: flex;
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    overflow: hidden;
    background: var(--bg-app);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    width: 100%;
    height: 100%;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: max(10px, env(safe-area-inset-top, 10px)) 18px 10px;
    background: var(--bg-app);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 10;
  }

  .app-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }

  .pill-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-2);
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 12.5px;
    cursor: pointer;
    font-family: var(--font);
    transition: all var(--transition);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
  }

  .pill-btn:hover { background: var(--bg-hover); color: var(--text-1); }
  .pill-btn.primary { background: var(--bg-surface); color: var(--text-1); font-weight: 500; }

  .chat-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .messages-wrap {
    max-width: 820px;
    width: 100%;
    margin: 0 auto;
    padding: 16px clamp(12px, 3.5vw, 24px);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .msg-row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    animation: fadeUp 0.18s ease-out;
  }

  .msg-row.user {
    flex-direction: row-reverse;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .msg-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    margin-top: 2px;
  }

  .bot-av { background: var(--brand-dim); border: 1px solid rgba(16,163,127,0.25); color: var(--brand); }
  .user-av { background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-2); }

  .msg-bubble {
    max-width: clamp(75%, 85%, 88%);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .user-text {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    padding: 10px 15px;
    border-radius: 18px;
    border-top-right-radius: 4px;
    font-size: clamp(14px, 2.2vw, 15px);
    line-height: 1.55;
    color: var(--text-1);
    word-break: break-word;
    white-space: pre-wrap;
    box-shadow: 0 1px 3px rgba(59,36,24,0.03);
  }

  .bot-text {
    font-size: clamp(14px, 2.2vw, 15px);
    line-height: 1.65;
    color: var(--text-1);
    padding: 2px 2px;
    font-weight: 350;
    word-break: break-word;
  }

  .bot-text p { margin-bottom: 8px; }
  .bot-text p:last-child { margin-bottom: 0; }
  .bot-text ul { margin: 4px 0 8px 18px; }
  .bot-text li { margin-bottom: 4px; }
  .bot-text strong { font-weight: 600; color: var(--text-1); }

  .bot-text.error {
    color: var(--danger);
    background: rgba(192,57,43,0.06);
    border: 1px solid rgba(192,57,43,0.2);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    font-size: 13.5px;
  }

  .typing-row { display: flex; gap: 10px; align-items: flex-start; }
  .typing-dots { display: flex; gap: 5px; align-items: center; padding: 10px 4px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); animation: bounce 1.2s infinite; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 80%, 100% { opacity: 0.25; transform: scale(0.75); }
    40% { opacity: 1; transform: scale(1); }
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    min-height: 0;
  }

  .empty-logo {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--brand-dim);
    border: 1px solid rgba(16,163,127,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    font-size: 24px;
  }

  .empty-state h2 {
    font-size: clamp(20px, 4vw, 26px);
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--text-1);
  }

  .empty-state p {
    color: var(--text-2);
    font-size: clamp(13px, 2.5vw, 14.5px);
    font-weight: 300;
    max-width: 320px;
    line-height: 1.5;
  }

  .input-section {
    flex-shrink: 0;
    padding: 8px clamp(12px, 3.5vw, 24px) max(12px, env(safe-area-inset-bottom, 12px));
    max-width: 820px;
    width: 100%;
    margin: 0 auto;
    position: relative;
  }

  .input-box {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 10px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 4px 16px rgba(59,36,24,0.05);
    transition: border-color var(--transition);
  }

  .input-box:focus-within {
    border-color: rgba(59,36,24,0.32);
  }

  .msg-textarea {
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-1);
    font-size: 16px;
    font-family: var(--font);
    font-weight: 350;
    resize: none;
    min-height: 24px;
    max-height: 140px;
    overflow-y: auto;
    line-height: 1.5;
    width: 100%;
  }

  .msg-textarea::placeholder { color: var(--text-3); font-size: 14.5px; }

  .input-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .input-action-btn {
    background: var(--brand);
    border: 1px solid var(--brand);
    color: #fff;
    min-height: 36px;
    padding: 0 12px;
    gap: 6px;
    border-radius: 10px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font);
    font-size: 13px;
    font-weight: 500;
    transition: all var(--transition);
  }

  .input-action-btn:hover { background: var(--brand-hover); }

  .send-btn {
    background: var(--text-1);
    border: none;
    color: var(--bg-app);
    width: 36px;
    height: 36px;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    flex-shrink: 0;
  }

  .send-btn:hover { background: #513322; }
  .send-btn:disabled { background: var(--bg-hover); color: var(--text-3); cursor: not-allowed; }

  .disclaimer {
    text-align: center;
    font-size: 11px;
    color: var(--text-3);
    margin-top: 6px;
    line-height: 1.4;
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(2px);
    z-index: 99;
  }

  .menu-popup {
    position: absolute;
    left: clamp(12px, 3.5vw, 24px);
    right: clamp(12px, 3.5vw, 24px);
    bottom: calc(100% - 2px);
    max-height: min(60dvh, 480px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--bg-menu);
    border: 1px solid var(--border-hover);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    z-index: 100;
    box-shadow: 0 10px 30px rgba(59,36,24,0.18);
    animation: menuPop 0.16s ease-out;
  }

  @keyframes menuPop {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .menu-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    font-size: 13.5px;
    font-weight: 600;
  }

  .menu-close {
    background: transparent;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    font-size: 16px;
    padding: 6px 10px;
    border-radius: 6px;
    min-height: 32px;
  }

  .menu-cat {
    font-size: 12px;
    font-weight: 600;
    color: var(--brand);
    padding: 10px 4px 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .menu-item {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 9px 6px;
    border-radius: var(--radius-sm);
    color: var(--text-1);
    font-family: var(--font);
    transition: background var(--transition);
  }

  .menu-item:hover, .menu-item:active { background: var(--bg-hover); }
  .menu-item-name { font-size: 13.5px; font-weight: 500; }
  .menu-item-note { display: block; font-size: 11.5px; color: var(--text-2); font-weight: 300; margin-top: 1px; }
  .menu-item-price { font-size: 13px; font-weight: 500; color: var(--text-2); flex-shrink: 0; }

  @media (max-width: 340px) {
    .topbar { padding-left: 10px; padding-right: 10px; }
    .app-name { font-size: 14.5px; }
    .pill-btn { padding: 5px 10px; font-size: 11.5px; }
    .messages-wrap { padding: 12px 8px; gap: 10px; }
    .msg-avatar { width: 26px; height: 26px; font-size: 10.5px; }
    .msg-bubble { max-width: 86%; }
    .user-text, .bot-text { font-size: 13.5px; }
    .input-section { padding-left: 8px; padding-right: 8px; }
    .input-action-btn { font-size: 12px; padding: 0 9px; min-height: 32px; }
    .send-btn { width: 32px; height: 32px; }
    .menu-popup { left: 8px; right: 8px; }
  }

  @media (max-width: 640px) {
    .menu-popup {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 72dvh;
      border-radius: 20px 20px 0 0;
      padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
      border: none;
      box-shadow: 0 -8px 24px rgba(59,36,24,0.15);
      animation: sheetUp 0.22s cubic-bezier(0.2, 0.9, 0.4, 1);
    }

    @keyframes sheetUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
  }

  @media (min-width: 641px) and (max-width: 1024px) {
    .messages-wrap { padding: 20px 24px; }
    .msg-bubble { max-width: 78%; }
    .menu-popup { max-height: 52dvh; }
  }

  @media (max-height: 500px) and (orientation: landscape) {
    .topbar { padding-top: 6px; padding-bottom: 6px; }
    .empty-logo { display: none; }
    .empty-state h2 { font-size: 18px; margin-bottom: 4px; }
    .messages-wrap { padding-top: 8px; padding-bottom: 8px; }
    .input-section { padding-bottom: 6px; }
    .menu-popup { max-height: 78dvh; }
  }
`;

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                             ICON COMPONENTS                                  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

function IconSend() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                          SIMPLE MARKDOWN RENDERER                          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

function FormattedText({ text }) {
  const blocks = [];
  let list = [];
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {list.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
        </ul>
      );
      list = [];
    }
  };

  text.split("\n").forEach((line) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    if (bullet) {
      list.push(bullet[1]);
    } else {
      flushList();
      if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line)}</p>);
    }
  });
  flushList();
  return <>{blocks}</>;
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                               TOPBAR                                       ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

function Topbar({ onNewChat }) {
  return (
    <header className="topbar">
      <h1 className="app-name">{APP_NAME}</h1>
      <button className="pill-btn primary" onClick={onNewChat} aria-label="Start new chat">
        + New chat
      </button>
    </header>
  );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                             EMPTY STATE                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo" aria-hidden="true">🍽️</div>
      <h2>Welcome to {RESTAURANT_NAME}</h2>
      <p>A cozy 30-seater dining space. Ask about our dishes or reservations.</p>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                              MESSAGE                                       ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

function Message({ message }) {
  const isUser = message.sender === "user";
  return (
    <div className={`msg-row${isUser ? " user" : ""}`}>
      <div className={`msg-avatar ${isUser ? "user-av" : "bot-av"}`} aria-hidden="true">
        {isUser ? "U" : "P"}
      </div>
      <div className="msg-bubble">
        {isUser ? (
          <div className="user-text">{message.text}</div>
        ) : (
          <div className={`bot-text${message.isError ? " error" : ""}`}>
            {message.isError ? message.text : <FormattedText text={message.text} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                          TYPING INDICATOR                                  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

function TypingIndicator() {
  return (
    <div className="typing-row" aria-label="Pletox is typing">
      <div className="msg-avatar bot-av">P</div>
      <div className="typing-dots">
        <span className="dot" /><span className="dot" /><span className="dot" />
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                              MENU POPUP                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// Now accepts dynamic menuData from Google Sheets
function MenuPopup({ onPick, onClose, menuData }) {
  return (
    <>
      <div className="menu-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="menu-popup" role="dialog" aria-modal="true" aria-label="Restaurant Menu">
        <div className="menu-head">
          <span>{RESTAURANT_NAME} Live Menu</span>
          <button className="menu-close" onClick={onClose} aria-label="Close menu">✕</button>
        </div>
        
        {menuData.length === 0 && <p style={{padding: '10px', fontSize: '13px', color: 'var(--text-2)'}}>Loading live menu from Google Sheets...</p>}

        {menuData.map((cat) => (
          <div key={cat.category}>
            <div className="menu-cat">{cat.category}</div>
            {cat.items.map((item) => (
              <button
                key={item.name}
                type="button"
                className="menu-item"
                disabled={!item.isAvailable}
                onClick={() => onPick(`Tell me about ${item.name}`)}
              >
                <span style={{ opacity: item.isAvailable ? 1 : 0.5 }}>
                  <span className="menu-item-name">{item.name} {item.isSpecial && "🔥"}</span>
                  
                  {!item.isAvailable && (
                    <span style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: '600', marginLeft: '6px', border: '1px solid var(--danger)', padding: '1px 4px', borderRadius: '4px' }}>
                      OUT OF STOCK
                    </span>
                  )}
                  
                  {item.note && <span className="menu-item-note">{item.note}</span>}
                </span>
                <span className="menu-item-price" style={{ opacity: item.isAvailable ? 1 : 0.5 }}>₹{item.price}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                              INPUT BAR                                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

function InputBar({ onSend, disabled, menuData }) {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef(null);

  const handleInput = (e) => {
    setValue(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const pickFromMenu = (text) => {
    if (disabled) return;
    setMenuOpen(false);
    onSend(text);
  };

  return (
    <footer className="input-section">
      {menuOpen && <MenuPopup onPick={pickFromMenu} onClose={() => setMenuOpen(false)} menuData={menuData} />}

      <div className="input-box">
        <textarea
          ref={textareaRef}
          className="msg-textarea"
          placeholder="Ask about food, reservations, or recommendations..."
          rows={1}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          aria-label="Your message"
        />

        <div className="input-bottom">
          <button
            type="button"
            className="input-action-btn"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <IconSearch /> Menu
          </button>

          <button
            type="button"
            className="send-btn"
            disabled={!value.trim() || disabled}
            onClick={submit}
            aria-label="Send message"
          >
            <IconSend />
          </button>
        </div>
      </div>
      <p className="disclaimer">
        Menu items and stock are synced live from Google Sheets.
      </p>
    </footer>
  );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                         MAIN APP  —  ChatPage                              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  
  // New States for Google Sheets Menu Integration
  const [menuData, setMenuData] = useState([]);
  const [liveMenuText, setLiveMenuText] = useState("Loading menu from Google Sheets...");
  
  const chatEndRef = useRef(null);

  // --- 1. FETCH GOOGLE SHEETS MENU ON LOAD ---
  useEffect(() => {
    async function fetchMenu() {
      if (!GOOGLE_SHEET_CSV_URL || !GOOGLE_SHEET_CSV_URL.startsWith("http")) return;
      try {
        const res = await fetch(GOOGLE_SHEET_CSV_URL);
        const csvText = await res.text();
        
        // CSV Parser: Handles quotes properly
        const rows = csvText.split('\n').map(row => {
            const matches = row.match(/(\s*'[^']+'|\s*[^,]+)(?=,|$)/g);
            return matches ? matches.map(val => val.trim().replace(/^['"]|['"]$/g, '')) : [];
        });

        // Skip header row [0]
        const categoriesMap = {};
        let activeText = "";

        for (let i = 1; i < rows.length; i++) {
          const [cat, name, price, desc, status, special] = rows[i] || [];
          if (!name || !cat) continue;

          if (!categoriesMap[cat]) categoriesMap[cat] = [];
          
          // Determine item status
          const isAvailable = !status || status.toLowerCase() !== "out of stock";
          const isSpecial = special && special.toLowerCase() === "yes";

          categoriesMap[cat].push({ name, price, note: desc, isAvailable, isSpecial });

          // Only feed Available items to the AI system prompt
          if (isAvailable) {
            activeText += `${cat}: - ${name} — ₹${price} (${desc || ""}) ${isSpecial ? "[MANAGER SPECIAL]" : ""}\n`;
          }
        }
        
        const structuredMenu = Object.keys(categoriesMap).map(category => ({
          category,
          items: categoriesMap[category]
        }));

        setMenuData(structuredMenu);
        setLiveMenuText(activeText);
      } catch (e) {
        console.error("Failed to load Google Sheet Menu:", e);
      }
    }
    
    fetchMenu();
    // Auto-refresh the menu every 60 seconds to catch stock updates
    const interval = setInterval(fetchMenu, 60000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
  }, []);

  const handleSend = useCallback(
    async (text) => {
      const userMsg = { text, sender: "user" };
      const history = [...messages.filter((m) => !m.isError), userMsg];

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        // Pass the dynamically built prompt containing the live menu to the API call
        const reply = await askGemini(history, buildSystemPrompt(liveMenuText));
        setMessages((prev) => [...prev, { text: reply, sender: "bot" }]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { text: `Couldn't get a reply: ${err.message}`, sender: "bot", isError: true },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, liveMenuText]
  );

  const showEmpty = messages.length === 0 && !isTyping;

  return (
    <>
      <style>{css}</style>
      <div className="chat-layout">
        <main className="main">
          <Topbar onNewChat={handleNewChat} />

          <div className="chat-area">
            {showEmpty ? (
              <EmptyState />
            ) : (
              <div className="messages-wrap">
                {messages.map((msg, i) => (
                  <Message key={i} message={msg} />
                ))}
                {isTyping && <TypingIndicator />}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Pass dynamic menuData down to InputBar and MenuPopup */}
          <InputBar onSend={handleSend} disabled={isTyping} menuData={menuData} />
        </main>
      </div>
    </>
  );
}