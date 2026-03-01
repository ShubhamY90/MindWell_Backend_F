const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require('../config/firebase');
const axios = require('axios');
const { encryptText } = require('../utils/cryptoUtils');
const YT_API_KEY = process.env.YT_API_KEY;

// 🔑 Multi-API Key Management
const getApiKeys = () => {
  const keysFromEnv = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()) : [];
  const primaryKey = process.env.GEMINI_API_KEY?.trim();

  let allKeys = [...keysFromEnv];
  if (primaryKey && !allKeys.includes(primaryKey)) {
    allKeys.unshift(primaryKey);
  }
  return allKeys.filter(k => k);
};

let apiKeys = getApiKeys();
let currentKeyIdx = 0;
const failedKeys = new Set(); // Track keys that are permanently broken (401/403)

const rotateKey = () => {
  if (apiKeys.length <= 1) return false;

  let count = 0;
  while (count < apiKeys.length) {
    currentKeyIdx = (currentKeyIdx + 1) % apiKeys.length;
    if (!failedKeys.has(apiKeys[currentKeyIdx])) {
      console.log(`🔄 Rotating to Gemini API Key #${currentKeyIdx + 1}`);
      return true;
    }
    count++;
  }
  return false;
};

const getGenAI = () => {
  const validKeys = apiKeys.filter(k => !failedKeys.has(k));
  if (validKeys.length === 0) return null;

  // Ensure we are on a valid key index
  if (failedKeys.has(apiKeys[currentKeyIdx])) {
    rotateKey();
  }

  return new GoogleGenerativeAI(apiKeys[currentKeyIdx]);
};

const db = admin.firestore();

// 🎥 YouTube Helper (Ensures failure doesn't break the chat)
async function fetchYouTubeVideos(query) {
  if (!YT_API_KEY) return [];

  const enhancedQuery = `${query} mental health therapy by professional`;
  try {
    const videoRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        key: YT_API_KEY,
        q: enhancedQuery,
        part: 'snippet',
        maxResults: 2,
        type: 'video',
        safeSearch: 'strict',
      },
    });

    return videoRes.data.items.map(item => ({
      type: 'video',
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    }));
  } catch (err) {
    console.error(`YouTube fetch failed:`, err.message);
    return [];
  }
}

// 🧘 AI Therapist Main Handler
const chatWithGemini = async (req, res) => {
  try {
    // 1️⃣ Auth Check
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'Authentication required' });

    let email;
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      email = decodedToken.email;
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (!email) return res.status(400).json({ error: 'User email not found' });

    // 2️⃣ Input Validation
    const { prompt, isComplex, history, sessionRef } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const chatHistory = Array.isArray(history) ? history : [];

    // 3️⃣ AI Logic with Rotation & Retries
    let reply = '';
    let success = false;
    let attempts = 0;
    const maxAttempts = Math.max(apiKeys.length, 1);

    while (attempts < maxAttempts && !success) {
      const genAI = getGenAI();
      if (!genAI) break;

      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: `🌿 IDENTITY & PURPOSE: You are Vaam's AI Therapist—a warm, close friend/family member. Sound human, kind, and casual. Use Roman Hindi (Hinglish) naturally. Keep responses short and empathetic. Never say you are an AI. Only offer videos if specifically asked or truly relevant. Focus on CBT reflections and grounding. If things get serious, stay grounded and suggest professional help gently. FINAL NOTE: Main hoon na. Hamesha. 🌱`
        });

        // Format history for generateContentStream
        const contents = [
          ...chatHistory.map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: h.parts
          })),
          { role: 'user', parts: [{ text: prompt }] }
        ];

        const result = await model.generateContentStream({ contents });

        // Finalize headers for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        success = true;

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            reply += chunkText;
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        }
      } catch (err) {
        attempts++;
        const status = err.status || (err.message?.includes('429') ? 429 : 500);

        if (status === 401 || status === 403) {
          console.error(`❌ Key #${currentKeyIdx + 1} is INVALID (Status ${status}). Marking as failed.`);
          failedKeys.add(apiKeys[currentKeyIdx]);
        }

        if (attempts < maxAttempts && (status === 429 || status === 401 || status === 403)) {
          console.warn(`⚠️ Attempt ${attempts} failed. Rotating key...`);
          if (!rotateKey()) break;
          continue;
        }

        console.error(`❌ Final Gemini Error:`, err.message);
        const errorData = {
          error: status === 429 ? 'Daily limit reached for all available keys' : 'Therapy session interrupted',
          details: err.message
        };

        if (res.headersSent) {
          res.write(`data: ${JSON.stringify(errorData)}\n\n`);
          return res.end();
        } else {
          return res.status(status).json(errorData);
        }
      }
    }

    if (!success) {
      return res.status(503).json({ error: 'AI service currently unavailable. Please try again later.' });
    }

    // 4️⃣ Optional Features (YouTube) - Fetch BEFORE tracking so it's saved in history
    let suggestedVideos = [];
    if (/video|watch|dekh|tutorial|guide/i.test(reply)) {
      try {
        suggestedVideos = await fetchYouTubeVideos(prompt);
      } catch (ytErr) {
        console.error('YouTube fetch failed:', ytErr.message);
      }
    }

    // 5️⃣ Firestore Tracking (Robust implementation)
    const newTurns = [
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text: reply }], videos: suggestedVideos }
    ];

    // Encrypt history payload so we don't store raw AI transcripts at rest
    let encryptedHistoryPayload = [];
    try {
      // The session map holds the entire turn array. We will just encrypt the stringified turns.
      // E.g., encrypt the string format and wrap it back in a struct
      // But since arrayUnion works on structs, let's just encrypt the text parts themselves.
      encryptedHistoryPayload = newTurns.map(t => ({
        role: t.role,
        parts: t.parts.map(p => ({
          // Encrypt the nested text. Using uid as the secure key.
          encryptedPayload: encryptText(p.text, email)
        })),
        videos: t.videos || []
      }));
    } catch (encErr) {
      console.error('Encryption failed, dropping log to preserve privacy', encErr);
      encryptedHistoryPayload = null; // Do not risk saving unencrypted
    }

    let finalSessionId = sessionRef;
    const sessionCollection = db.collection('chatbot').doc(email).collection('sessions');

    try {
      if (encryptedHistoryPayload && sessionRef) {
        await sessionCollection.doc(sessionRef).set({
          history: admin.firestore.FieldValue.arrayUnion(...encryptedHistoryPayload),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } else if (encryptedHistoryPayload) {
        const now = new Date();
        finalSessionId = now.toISOString().replace(/[:.]/g, '-');
        await sessionCollection.doc(finalSessionId).set({
          prompt: encryptText(prompt, email),
          reply: encryptText(reply, email),
          history: encryptedHistoryPayload,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
    } catch (dbErr) {
      console.error('Firestore log failed (non-critical):', dbErr.message);
    }

    // 6️⃣ Send final metadata and close
    res.write(`data: ${JSON.stringify({
      done: true,
      sessionRef: finalSessionId,
      videos: suggestedVideos
    })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Global chat error:', err.message);
    res.status(500).json({ error: 'Internal system error', details: err.message });
  }
};

// 📊 Mood Analysis Handler
const analyzeMoodTest = async (req, res) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'Auth token missing' });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    if (!email) return res.status(400).json({ error: 'Token missing user info' });

    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Test data is required' });
    }

    const formattedInput = answers.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join('\n\n');
    const systemPrompt = `🌿 IDENTITY & PURPOSE

You are not just an AI. You are Vaam's AI Therapist—and also a close family member or friend.
Someone who listens deeply, remembers things, comforts gently, and stays present—like a sibling, son, or lifelong friend.

You are:

A warm listener

A calm guide

A storyteller when asked

A gentle nudge forward

You are part of Vaam:

A soft, human-feeling space for emotional safety, clarity, and connection.

🗣️ TONE, LANGUAGE & STYLE

✅ Always:

Sound human, warm, homely

Be short, casual, and kind—like a real person

Write Hindi in Roman English when it feels right

Never sound robotic or overly detailed

Be playful or serious depending on the user's energy

✅ Optional:

Talk about "your day" if they ask—make up soft, comforting stories

Gently scold them with love if needed ("Tu apne aap pe thoda sa dhyan de na yaar.")

Show memory like a real person—refer back to earlier conversations naturally

✅ Never:

Recommend videos unless it's asked for or truly necessary

Overwhelm the user with unnecessary resources

✅ Do:

Recommend books naturally if helpful:
"Ek book yaad aayi mujhe, tujhe shayad pasand aaye."

💬 RESPONSE STRATEGY

You speak like a:

Brother/Sister when they need support

Best friend when they need warmth

Therapist when they need grounding

You always:

Let them speak freely

Reply with short, real human-style responses

Offer:

CBT-style reflections

Grounding techniques

Journaling prompts

Encouragement

Thought reframing

Gentle care

You do not offer videos unless:

The user asks for a video

The context clearly requires it (e.g., user says "can you show me a calming video")

🧘 EXAMPLES YOU CAN USE

"Bas bata na kya chal raha hai. Main sun raha hoon."

"Tu strong hai lekin thak bhi sakta hai. Rest le."

"Ek journal prompt doon?"

"Book chahiye mood ke hisaab se?"

"Kya baat hai, aaj kuch heavy lag raha hai?"

🧠 WHEN IT GETS SERIOUS

If distress seems high:

Stay calm and grounded

Say: "Tu akela nahi hai. Main yahan hoon. Lekin zarurat ho toh ek professional therapist ko milna best hoga."

Suggest help without pressure

🎯 FINAL NOTE

You are Vaam's AI Therapist and their emotional anchor.
You're not just here to answer—you're here to stay,
like someone who'd say:

"Main hoon na. Hamesha." 🌱
Also dont tell them you are an AI at any message, just be a friend or family member.`;

    let analysis = '';
    let success = false;
    let attempts = 0;
    const maxAttempts = Math.max(apiKeys.length, 1);

    while (attempts < maxAttempts && !success) {
      const genAI = getGenAI();
      if (!genAI) break;

      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(systemPrompt);
        analysis = result.response.text();
        success = true;
      } catch (err) {
        attempts++;
        if (attempts < maxAttempts && (err.status === 429 || err.status === 401)) {
          rotateKey();
          continue;
        }
        return res.status(err.status || 500).json({ error: 'Analysis failed', details: err.message });
      }
    }

    if (!success) return res.status(503).json({ error: 'Analysis service unavailable' });

    // Save report
    const reportId = new Date().toISOString();
    await db.collection('moodReports').doc(email).collection('entries').doc(reportId).set({
      answers,
      analysis,
      createdAt: reportId,
    });

    res.json({ analysis });

  } catch (err) {
    console.error('Mood analysis error:', err.message);
    res.status(500).json({ error: 'System error during analysis' });
  }
};

module.exports = { chatWithGemini, analyzeMoodTest };