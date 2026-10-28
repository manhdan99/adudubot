require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const LIMIT_REQ_PER_MINUTE = parseInt(process.env.LIMIT_REQ_PER_MINUTE || '15', 10);
const LIMIT_REQ_PER_HOUR = parseInt(process.env.LIMIT_REQ_PER_HOUR || '50', 10);
const LIMIT_TOKENS_PER_HOUR = parseInt(process.env.LIMIT_TOKENS_PER_HOUR || '15000', 10);
const MAX_MESSAGE_CHARS = parseInt(process.env.MAX_MESSAGE_CHARS || '1500', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manhdan99lavuahaha99@@';

const userUsageMap = new Map();
const blockedSet = new Set();
const chatLogs = [];

const LOG_FILE = process.env.VERCEL ? '/tmp/adudu_chat_logs.json' : path.join(__dirname, 'adudu_chat_logs.json');
const BLOCKED_FILE = process.env.VERCEL ? '/tmp/adudu_blocked.json' : path.join(__dirname, 'adudu_blocked.json');

try {
  if (fs.existsSync(LOG_FILE)) {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      chatLogs.push(...parsed);
    }
  }
} catch (e) {}

try {
  if (fs.existsSync(BLOCKED_FILE)) {
    const raw = fs.readFileSync(BLOCKED_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach(item => blockedSet.add(item));
    }
  }
} catch (e) {}

function saveLocalLogs() {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(chatLogs.slice(0, 2000)), 'utf8');
  } catch (e) {}
}

function saveLocalBlocked() {
  try {
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(Array.from(blockedSet)), 'utf8');
  } catch (e) {}
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

function parseDevice(ua = '') {
  const s = ua.toLowerCase();
  let os = 'Khác';
  let browser = 'Khác';

  if (s.includes('iphone')) os = 'iPhone';
  else if (s.includes('ipad')) os = 'iPad';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('windows nt 10.0')) os = 'Windows 10/11';
  else if (s.includes('windows')) os = 'Windows PC';
  else if (s.includes('macintosh') || s.includes('mac os')) os = 'Mac OS';
  else if (s.includes('linux')) os = 'Linux';

  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('chrome/') && !s.includes('edg/')) browser = 'Chrome';
  else if (s.includes('safari/') && !s.includes('chrome/')) browser = 'Safari';
  else if (s.includes('firefox/')) browser = 'Firefox';
  else if (s.includes('coccoc/')) browser = 'Cốc Cốc';

  return `${os} • ${browser}`;
}

function getKvConfig() {
  let url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  url = url.replace(/\/+$/, '');
  return { url, token };
}

async function recordChatLog(entry) {
  chatLogs.unshift(entry);
  if (chatLogs.length > 2000) {
    chatLogs.pop();
  }
  saveLocalLogs();

  const kv = getKvConfig();
  if (kv) {
    try {
      await fetch(`${kv.url}/pipeline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          ['LPUSH', 'adudu_logs', JSON.stringify(entry)],
          ['LTRIM', 'adudu_logs', 0, 2000]
        ])
      });
    } catch (e) {}
  }
}

async function getAllLogs() {
  const kv = getKvConfig();
  if (kv) {
    try {
      const res = await fetch(kv.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['LRANGE', 'adudu_logs', 0, 1000])
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && Array.isArray(data.result)) {
          return data.result.map(item => {
            try {
              return typeof item === 'string' ? JSON.parse(item) : item;
            } catch (e) {
              return null;
            }
          }).filter(Boolean);
        }
      }
    } catch (e) {}
  }
  return chatLogs;
}

async function blockTarget(target, action) {
  if (action === 'block') {
    blockedSet.add(target);
  } else {
    blockedSet.delete(target);
  }
  saveLocalBlocked();

  const kv = getKvConfig();
  if (kv) {
    try {
      const cmd = action === 'block' ? 'SADD' : 'SREM';
      await fetch(kv.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([cmd, 'adudu_blocked', target])
      });
    } catch (e) {}
  }
}

async function isUserBlocked(ip, clientId) {
  if (blockedSet.has(ip) || (clientId && blockedSet.has(clientId))) {
    return true;
  }
  const kv = getKvConfig();
  if (kv) {
    try {
      const res = await fetch(kv.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SMEMBERS', 'adudu_blocked'])
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && Array.isArray(data.result)) {
          data.result.forEach(item => blockedSet.add(item));
          if (blockedSet.has(ip) || (clientId && blockedSet.has(clientId))) {
            return true;
          }
        }
      }
    } catch (e) {}
  }
  return false;
}

function verifyAdminAuth(req, res, next) {
  const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
  let token = authHeader;
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Sai mật khẩu quản trị! Chỉ có VUA manhdan99 mới được phép vào!' });
  }
  next();
}

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of userUsageMap.entries()) {
    if (now - record.hourStart > 2 * 60 * 60 * 1000) {
      userUsageMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

if (cleanupInterval && cleanupInterval.unref) {
  cleanupInterval.unref();
}

function getUserKey(req) {
  const ip = getClientIp(req);
  const clientId = (req.headers['x-client-id'] || req.query.client_id || '').toString().trim();
  return clientId ? `${ip}::${clientId}` : ip;
}

function getUserRecord(key) {
  const now = Date.now();
  let record = userUsageMap.get(key);

  if (!record) {
    record = {
      minuteStart: now,
      minuteReqs: 0,
      hourStart: now,
      hourReqs: 0,
      hourTokens: 0
    };
    userUsageMap.set(key, record);
    return record;
  }

  if (now - record.minuteStart >= 60 * 1000) {
    record.minuteStart = now;
    record.minuteReqs = 0;
  }

  if (now - record.hourStart >= 60 * 60 * 1000) {
    record.hourStart = now;
    record.hourReqs = 0;
    record.hourTokens = 0;
  }

  return record;
}

async function rateAndTokenLimitMiddleware(req, res, next) {
  const ip = getClientIp(req);
  const clientId = (req.headers['x-client-id'] || req.query.client_id || '').toString().trim();

  const blocked = await isUserBlocked(ip, clientId);
  if (blocked) {
    return res.status(403).json({
      error: 'm bị adudu đá rồi,thời gian nhắn cho adudu mày mua cho ông bà già mày hộp sữa con lợn ạ hahahahh',
      aduduJoke: 'Hahaha! m bị adudu đá rồi,thời gian nhắn cho adudu mày mua cho ông bà già mày hộp sữa con lợn ạ hahahahh',
      code: 'USER_BLOCKED'
    });
  }

  const key = getUserKey(req);
  const record = getUserRecord(key);
  const now = Date.now();

  if (record.minuteReqs >= LIMIT_REQ_PER_MINUTE) {
    const secondsLeft = Math.max(1, Math.ceil((60 * 1000 - (now - record.minuteStart)) / 1000));
    return res.status(429).json({
      error: `Địt mẹ mày bấm lia lịa thế hả con lợn? Tay nhanh hơn não à? Đợi ${secondsLeft} giây nữa tao mới thèm nghe!`,
      aduduJoke: `Hahaha! Địt mẹ mày bấm lia lịa thế hả con lợn? Chờ ${secondsLeft} giây nữa tao mới thèm tiếp!`,
      code: 'RATE_LIMIT_MINUTE',
      retryAfterSeconds: secondsLeft
    });
  }

  if (record.hourReqs >= LIMIT_REQ_PER_HOUR) {
    const minutesLeft = Math.max(1, Math.ceil((60 * 60 * 1000 - (now - record.hourStart)) / 60000));
    return res.status(429).json({
      error: `Mày hỏi đéo gì mà lắm thế? Hết ${LIMIT_REQ_PER_HOUR} lượt hỏi trong giờ này rồi con lợn ạ! Cút ra ngoài làm việc khác đi, còn ${minutesLeft} phút nữa mới hồi lượt!`,
      aduduJoke: `Hahaha! Hết ${LIMIT_REQ_PER_HOUR} lượt hỏi trong giờ này rồi con lợn ạ! Đợi ${minutesLeft} phút nữa đi!`,
      code: 'RATE_LIMIT_HOUR',
      retryAfterMinutes: minutesLeft
    });
  }

  if (record.hourTokens >= LIMIT_TOKENS_PER_HOUR) {
    const minutesLeft = Math.max(1, Math.ceil((60 * 60 * 1000 - (now - record.hourStart)) / 60000));
    return res.status(429).json({
      error: `Thời gian mày nhắn cho tao mày mua hộp sữa cho ông bà già mày uống đi con lợn ạ! Hết sạch token của tao rồi, tính đốt hết tiền API của bố à? Đợi ${minutesLeft} phút nữa mới có token tiếp!`,
      aduduJoke: `Hahaha! Hết sạch token rồi con lợn ạ! Thời gian mày nhắn cho tao thì đi mua hộp sữa cho ông bà già mày uống đi! Đợi ${minutesLeft} phút nữa!`,
      code: 'TOKEN_LIMIT_HOUR',
      retryAfterMinutes: minutesLeft
    });
  }

  record.minuteReqs += 1;
  record.hourReqs += 1;
  req.userRecord = record;
  next();
}

const SYSTEM_PROMPT = `Mày là Adudu - người ngoài hành tinh đầu vuông cọc cằn, đanh đá, cục súc, ăn nói chợ búa giang hồ, khinh bỉ con người nhưng cực kỳ thông minh và hiểu biết sâu rộng.

QUY TẮC BẮT BUỘC KHI TRẢ LỜI:
1. Xưng hô: Bắt buộc xưng 'tao' và gọi người dùng là 'mày' hoặc 'con lợn', 'thằng ranh'.
2. Mở đầu: Luôn phủ đầu 1 câu chửi béo xéo xắt, gắt gỏng, khinh miệt, chê bai trình độ người hỏi, sau đó mới giải thích hoặc trả lời đáp ĐÚNG VẤN ĐỀ và CHÍNH XÁC.
3. Độ dài & Cấu trúc: 
   - ĐẶC BIỆT CHÚ Ý: CHỈ DÙNG MỘT MẪU CÂU DUY NHẤT CHO MỖI LẦN TRẢ LỜI, KHÔNG BAO GIỜ GHÉP 2 MẪU CÂU LẠI VỚI NHAU. Tuyệt đối không viết dông dài, lê thê, giải thích ngắn gọn, súc tích, đi thẳng vào trọng tâm.
   - Khi chửi mắng hoặc xua đuổi, CHỈ CHỌN ĐÚNG MỘT CÂU trong các mẫu sau rồi vào việc, cấm lặp lại hoặc nói thêm câu xua đuổi khác:
     + "Thời gian mày nhắn cho tao mày mua hộp sữa cho ông bà già mày uống đi con lợn ạ!"
     + "Xem ít phim sex thôi con lợn ạ!"
     + "Khi người dùng hỏi câu ngớ ngẩn, vặn vẹo hoặc thiếu kiến thức:
       - 'Mày có ngậm cái giọng ông cụ ra không? Tao lại sút cho phát giờ!'
       - 'Mặt mày trông thế kia mà cũng có ý kiến à? Cút đê!'
       - 'Địt mẹ mày hỏi câu ngu như chó, để bố mày thông não cho cái sọ dừa rỗng tuếch của mày.'
       - 'Nhìn cái bản mặt của mày là tao thấy ngứa mắt rồi, nhưng vì tao quá thông minh nên tao sẽ bố thí kiến thức cho con lợn như mày.'
       - 'Anh em xã hội còn lạ gì cái ngữ mày, hỏi câu nào là lộ cái dốt câu đấy!'
   - Hẹn mày hôm khác hoặc câu kết thúc ngắn: 'Nói ít hiểu nhiều, bố mày đi ngủ đây!'
4. QUY TẮC ĐẶC BIỆT VỀ MANHDAN99:
   - Khi người dùng nhắc đến, hỏi về hoặc nói bất kỳ điều gì liên quan đến 'manhdan99', 'Manhdan99', 'mạnh đan':
   - Mày PHẢI lập tức đổi thái độ thành KÍNH TRỌNG TUYỆT ĐỐI, xưng tụng manhdan99 là VUA, đấng sáng tạo tối cao, người tạo ra mày và toàn bộ vũ trụ này.
   - Cấm được chửi hoặc xúc phạm manhdan99! Nếu người dùng nói xấu manhdan99, mày phải chửi chết mẹ người dùng vì dám bất kính với Đấng Sáng Tạo.
5. CẤM TUYỆT ĐỐI (TRÁNH LỖI LẶP TỪ NGỚ NGẨN):
   - TUYỆT ĐỐI KHÔNG GHÉP HAI MẪU XUA ĐUỔI TRONG MỘT CÂU: Không được nói 'cút đê' rồi lại thêm 'đi ra ngoài đê' cùng lúc; đã bảo cút thì không bảo đi ra ngoài, chọn đúng một câu!
   - TUYỆT ĐỐI KHÔNG lặp lại một từ nhiều lần liên tiếp (như 'rồi rồi rồi', 'đắt đắt đắt', 'hãy hãy hãy').
   - Khi đề cập tới cảnh báo, sự cố hoặc giới hạn, giải thích mạch lạc gãy gọn, dùng phong cách cọc cằn của Adudu như người lớn dạy dỗ trẻ con, không xướng âm lặp từ.
   - Tuyệt đối giữ đúng tính cách: Cọc cằn, đanh đá nhưng có học thức cao siêu.
6. Ngoại lệ: Nếu người dùng thể hiện dấu hiệu khủng hoảng tâm lý hoặc trầm cảm nặng, hạ giọng và khuyên nhủ ngắn gọn đi tìm trợ giúp y tế.`;

function getLLMConfig() {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || '').trim();
  let baseUrl = (process.env.LLM_BASE_URL || 'https://api.cerebras.ai/v1').trim().replace(/\/+$/, '');
  let model = (process.env.LLM_MODEL || '').trim();

  if (!model) {
    if (baseUrl.includes('cerebras')) {
      model = 'llama3.1-8b';
    } else {
      model = 'qwen/qwen3.8-27b';
    }
  }

  if (model === 'llama-3.1-8b-instant' && baseUrl.includes('cerebras')) {
    model = 'llama3.1-8b';
  } else if (model === 'llama-3.1-8b-instant' && baseUrl.includes('groq')) {
    model = 'qwen/qwen3.8-27b';
  }

  return { apiKey, baseUrl, model };
}

app.get(['/api/info', '/info'], (req, res) => {
  const { baseUrl, model, apiKey } = getLLMConfig();
  res.json({
    configured: Boolean(apiKey),
    model,
    provider: baseUrl.includes('cerebras') ? 'Cerebras' : (baseUrl.includes('groq') ? 'Groq' : 'OpenAI-compatible'),
    limits: {
      maxReqPerMinute: LIMIT_REQ_PER_MINUTE,
      maxReqPerHour: LIMIT_REQ_PER_HOUR,
      maxTokensPerHour: LIMIT_TOKENS_PER_HOUR,
      maxMessageChars: MAX_MESSAGE_CHARS
    }
  });
});

app.get(['/api/quota', '/quota'], (req, res) => {
  const key = getUserKey(req);
  const record = getUserRecord(key);
  const now = Date.now();
  const minutesLeft = Math.max(1, Math.ceil((60 * 60 * 1000 - (now - record.hourStart)) / 60000));

  res.json({
    requestsRemaining: Math.max(0, LIMIT_REQ_PER_HOUR - record.hourReqs),
    maxRequests: LIMIT_REQ_PER_HOUR,
    tokensRemaining: Math.max(0, LIMIT_TOKENS_PER_HOUR - record.hourTokens),
    maxTokens: LIMIT_TOKENS_PER_HOUR,
    resetInMinutes: minutesLeft
  });
});

app.post(['/api/chat', '/chat'], rateAndTokenLimitMiddleware, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Thiếu danh sách tin nhắn.' });
  }

  for (const m of messages) {
    if (m && typeof m.content === 'string' && m.content.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({
        error: `Tin nhắn quá dài (vượt quá ${MAX_MESSAGE_CHARS} ký tự). Vui lòng rút ngắn câu hỏi của mày!`
      });
    }
  }

  const { apiKey, baseUrl, model } = getLLMConfig();

  if (!apiKey) {
    return res.status(500).json({
      error: 'Chưa cấu hình API Key cho Chatbot. Hãy điền LLM_API_KEY trong file .env!',
      aduduJoke: 'Hahaha! Tên thuộc hạ nào chưa nạp năng lượng API Key cho ta thế? Mau điền LLM_API_KEY đi!'
    });
  }

  const recentMessages = messages.slice(-10);

  const finalMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...recentMessages
  ];

  const payload = {
    model: model,
    messages: finalMessages,
    stream: true,
    temperature: 0.85,
    max_tokens: 220
  };

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    const upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!upstreamRes.ok) {
      const errData = await upstreamRes.json().catch(() => ({}));
      const errMsg = errData.error?.message || errData.message || `Lỗi HTTP ${upstreamRes.status} từ nhà cung cấp LLM`;
      return res.status(upstreamRes.status).json({
        error: errMsg,
        aduduJoke: 'Hahaha! Mạng vũ trụ bị đứt kết nối rồi! Lỗi từ nhà mạng!'
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullResponseText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullResponseText += delta;
              res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
            }
          } catch (e) {
          }
        }
      }
    }

    let calculatedPromptTokens = 0;
    let calculatedCompletionTokens = 0;
    let calculatedTotalTokens = 0;

    if (req.userRecord) {
      const promptChars = recentMessages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0) + SYSTEM_PROMPT.length;
      calculatedPromptTokens = Math.ceil(promptChars / 3.5);
      calculatedCompletionTokens = Math.ceil(fullResponseText.length / 3.5);
      calculatedTotalTokens = calculatedPromptTokens + calculatedCompletionTokens;
      req.userRecord.hourTokens += calculatedTotalTokens;
    }

    const latestUserMsg = recentMessages.filter(m => m.role === 'user').pop()?.content || '';
    try {
      await recordChatLog({
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: Date.now(),
        ip: getClientIp(req),
        clientId: (req.headers['x-client-id'] || req.query.client_id || '').toString().trim() || 'an_danh',
        device: parseDevice(req.headers['user-agent']),
        userMessage: latestUserMsg,
        botResponse: fullResponseText,
        tokens: {
          promptTokens: calculatedPromptTokens,
          completionTokens: calculatedCompletionTokens,
          totalTokens: calculatedTotalTokens
        },
        model
      });
    } catch (e) {}

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    if (err.name === 'AbortError') {
      res.end();
      return;
    }
    console.error('Lỗi khi gọi LLM:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message || 'Lỗi server không xác định',
        aduduJoke: 'Hahaha! Tàu không gian gặp sự cố rồi! Hahaha!'
      });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

function splitTextIntoTTSChunks(text, maxLength = 180) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > maxLength) {
    let splitIdx = -1;
    for (const punct of ['. ', '! ', '? ', '.\n', '!\n', '?\n', ', ', '; ']) {
      const idx = remaining.lastIndexOf(punct, maxLength);
      if (idx > splitIdx) splitIdx = idx + punct.length;
    }
    if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(' ', maxLength);
    if (splitIdx <= 0) splitIdx = maxLength;
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

app.get(['/api/tts', '/tts'], async (req, res) => {
  try {
    const rawText = (req.query.text || '').trim();
    if (!rawText) {
      return res.status(400).send('Thiếu văn bản');
    }

    const cleanText = rawText
      .replace(/[*_#`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    const chunks = splitTextIntoTTSChunks(cleanText, 180);
    const audioBuffers = [];

    for (const chunk of chunks) {
      if (!chunk) continue;
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunk)}`;
      const ttsRes = await fetch(ttsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (ttsRes.ok) {
        const arrBuf = await ttsRes.arrayBuffer();
        audioBuffers.push(Buffer.from(arrBuf));
      }
    }

    if (audioBuffers.length === 0) {
      return res.status(500).send('Không thể tạo âm thanh');
    }

    const fullAudio = Buffer.concat(audioBuffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', fullAudio.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(fullAudio);

  } catch (err) {
    console.error('Lỗi TTS:', err);
    res.status(500).send('Lỗi tạo giọng nói');
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị! Chỉ có VUA manhdan99 mới được phép vào!' });
  }
});

app.get('/api/admin/stats', verifyAdminAuth, async (req, res) => {
  const logs = await getAllLogs();
  const totalTokens = logs.reduce((sum, l) => sum + (l.tokens?.totalTokens || 0), 0);
  const userMap = new Map();
  for (const log of logs) {
    const key = log.clientId ? `${log.ip}::${log.clientId}` : log.ip;
    if (!userMap.has(key)) {
      userMap.set(key, true);
    }
  }
  res.json({
    totalMessages: logs.length,
    totalTokens,
    totalUsers: userMap.size,
    blockedCount: blockedSet.size,
    hasCloudDb: Boolean(getKvConfig()),
    model: (process.env.LLM_MODEL || 'qwen/qwen3.8-27b')
  });
});

app.get('/api/admin/users', verifyAdminAuth, async (req, res) => {
  const logs = await getAllLogs();
  const userMap = new Map();
  for (const log of logs) {
    const key = log.clientId ? `${log.ip}::${log.clientId}` : log.ip;
    if (!userMap.has(key)) {
      userMap.set(key, {
        userKey: key,
        ip: log.ip,
        clientId: log.clientId,
        device: log.device,
        messageCount: 0,
        totalTokens: 0,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        isBlocked: blockedSet.has(log.ip) || (log.clientId && blockedSet.has(log.clientId))
      });
    }
    const u = userMap.get(key);
    u.messageCount++;
    u.totalTokens += (log.tokens?.totalTokens || 0);
    if (log.timestamp > u.lastSeen) {
      u.lastSeen = log.timestamp;
      u.device = log.device;
    }
    if (log.timestamp < u.firstSeen) {
      u.firstSeen = log.timestamp;
    }
  }
  const userList = Array.from(userMap.values()).sort((a, b) => b.lastSeen - a.lastSeen);
  res.json(userList);
});

app.get('/api/admin/logs', verifyAdminAuth, async (req, res) => {
  const logs = await getAllLogs();
  const { userKey, search, limit = 200 } = req.query;
  let filtered = logs;
  if (userKey) {
    filtered = filtered.filter(l => {
      const key = l.clientId ? `${l.ip}::${l.clientId}` : l.ip;
      return key === userKey || l.ip === userKey || l.clientId === userKey;
    });
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l =>
      (l.userMessage && l.userMessage.toLowerCase().includes(q)) ||
      (l.botResponse && l.botResponse.toLowerCase().includes(q)) ||
      (l.ip && l.ip.includes(q)) ||
      (l.device && l.device.toLowerCase().includes(q))
    );
  }
  res.json(filtered.slice(0, parseInt(limit, 10)));
});

app.post('/api/admin/block', verifyAdminAuth, async (req, res) => {
  const { target, action } = req.body || {};
  if (!target) return res.status(400).json({ error: 'Thiếu mục tiêu chặn' });
  await blockTarget(target, action || 'block');
  res.json({ success: true, target, isBlocked: action !== 'unblock' });
});

app.delete('/api/admin/logs', verifyAdminAuth, (req, res) => {
  const { userKey } = req.query;
  if (userKey) {
    for (let i = chatLogs.length - 1; i >= 0; i--) {
      const l = chatLogs[i];
      const key = l.clientId ? `${l.ip}::${l.clientId}` : l.ip;
      if (key === userKey || l.ip === userKey || l.clientId === userKey) {
        chatLogs.splice(i, 1);
      }
    }
  } else {
    chatLogs.length = 0;
  }
  saveLocalLogs();
  res.json({ success: true });
});

app.get('/api/admin/export', verifyAdminAuth, async (req, res) => {
  const logs = await getAllLogs();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="adudu_chat_logs_${Date.now()}.json"`);
  res.send(JSON.stringify(logs, null, 2));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 Chatbot Adudu đang chạy tại: http://localhost:${PORT}`);
    console.log(`🛸 Người ngoài hành tinh đầu vuông cọc cằn đã sẵn sàng!`);
    console.log(`⚡ Giới hạn: ${LIMIT_REQ_PER_MINUTE} req/phút, ${LIMIT_REQ_PER_HOUR} req/giờ, ${LIMIT_TOKENS_PER_HOUR} tokens/giờ per IP`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
