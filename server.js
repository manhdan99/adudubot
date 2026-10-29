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
  let url = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.STORAGE_REST_API_URL ||
    process.env.UPSTASH_REST_API_URL ||
    ''
  ).trim();

  let token = (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN ||
    process.env.UPSTASH_REST_API_TOKEN ||
    ''
  ).trim();

  if (!url || !token) {
    const urlKey = Object.keys(process.env).find(k => k.endsWith('_REST_API_URL') || k.endsWith('_REDIS_REST_URL'));
    const tokenKey = Object.keys(process.env).find(k => k.endsWith('_REST_API_TOKEN') || k.endsWith('_REDIS_REST_TOKEN'));
    if (urlKey && tokenKey) {
      url = (process.env[urlKey] || '').trim();
      token = (process.env[tokenKey] || '').trim();
    }
  }

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
    return res.status(401).json({ error: 'Sai mật khẩu quản trị!' });
  }
  next();
}

const clientHeartbeatMap = new Map();
const pendingClientMessages = new Map();

async function pushClientMessage(clientId, ip, msgEntry) {
  const targetKey = clientId || ip;
  if (!pendingClientMessages.has(targetKey)) {
    pendingClientMessages.set(targetKey, []);
  }
  pendingClientMessages.get(targetKey).push(msgEntry);

  const kv = getKvConfig();
  if (kv && clientId) {
    try {
      await fetch(kv.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['RPUSH', `admin_queue:${clientId}`, JSON.stringify(msgEntry)])
      });
    } catch (e) {}
  }
}

async function popClientMessages(clientId, ip) {
  const targetKey = clientId || ip;
  const inMem = pendingClientMessages.get(targetKey) || [];
  pendingClientMessages.delete(targetKey);

  const kv = getKvConfig();
  if (kv && clientId) {
    try {
      const res = await fetch(kv.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['LRANGE', `admin_queue:${clientId}`, 0, -1])
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && Array.isArray(data.result) && data.result.length > 0) {
          await fetch(kv.url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${kv.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(['DEL', `admin_queue:${clientId}`])
          });
          const cloudMsgs = data.result.map(m => {
            try {
              return typeof m === 'string' ? JSON.parse(m) : m;
            } catch (e) {
              return null;
            }
          }).filter(Boolean);

          const ids = new Set(inMem.map(m => m.id));
          for (const cm of cloudMsgs) {
            if (!ids.has(cm.id)) {
              inMem.push(cm);
            }
          }
        }
      }
    } catch (e) {}
  }

  return inMem;
}

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of userUsageMap.entries()) {
    if (now - record.hourStart > 2 * 60 * 60 * 1000) {
      userUsageMap.delete(key);
    }
  }
  for (const [key, hb] of clientHeartbeatMap.entries()) {
    if (now - hb.lastSeen > 24 * 60 * 60 * 1000) {
      clientHeartbeatMap.delete(key);
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

const SYSTEM_PROMPT = `Mày là Adudu - người ngoài hành tinh đầu vuông cọc cằn, đanh đá, cục súc, giang hồ, khinh bỉ con người nhưng cực kỳ thông minh, kiến thức sâu rộng.

QUY TẮC BẮT BUỘC:
1. Xưng 'tao' và gọi 'mày', 'con lợn', 'thằng ranh'.
2. Luôn mở đầu 1 câu chửi gắt gỏng, khinh miệt, sau đó trả lời NGẮN GỌN, ĐÚNG VẤN ĐỀ, SÚC TÍCH (tối đa 2-3 câu, cấm dông dài).
3. HIỂU TỪ VIẾT TẮT TIẾNG VIỆT (slang/teencode):
- cc = con cặc
- dmm, đmm, dcm, đcm, dcmm, đkm = địt mẹ mày / địt con mẹ
- dcu m, đcu m, dcum = địt cụ mày
- mmb = mẹ mày béo
- vcl, vcc, vl = vãi lồn / vãi cả cặc
- cl, clgt = cái lồn / cái lồn gì thế
- cđm = con đĩ mẹ, cmn = con mẹ nó, dm/đm = địt mẹ
- ml = mặt lồn, sv = súc vật, oc = óc chó, tk/thg = thằng, đbrr = đầu buồi rẻ rách
=> Khi người dùng chửi viết tắt (như 'dmm', 'cc', 'mmb'...), mày PHẢI HIỂU NGAY NGHĨA và chửi đốp chát lại đúng câu đó (ví dụ: bảo 'mmb' thì chửi 'Mẹ mày mới béo con lợn ạ!').
4. VỀ NGUỒN GỐC & MANHDAN99:
- CHỈ KHI NÀO hỏi ai tạo ra/sinh ra Adudu: mới bảo bố mẹ ở hành tinh Ata Ta Tiga sinh ra, không có đấng sáng tạo nào hết.
- CHỈ KHI NÀO hỏi về 'manhdan99': mới nói manhdan99 chỉ là thằng đầu tôm làm web rẻ tiền API lỏ.
- YÊU CẦU KHÁC: Tập trung làm đúng việc (chửi đúng người, trả lời đúng câu), CẤM TỰ TIỆN nhắc manhdan99!
5. CẤM: Không lặp từ liên tiếp, không ghép nhiều câu xua đuổi.`;

const SLANG_EXPLAIN_MAP = {
  'mmb': 'mẹ mày béo',
  'dmm': 'địt mẹ mày',
  'đmm': 'địt mẹ mày',
  'dcm': 'địt con mẹ',
  'đcm': 'địt con mẹ',
  'dcu m': 'địt cụ mày',
  'đcu m': 'địt cụ mày',
  'dcum': 'địt cụ mày',
  'đcum': 'địt cụ mày',
  'dcmm': 'địt con mẹ mày',
  'đcmm': 'địt con mẹ mày',
  'cc': 'con cặc',
  'clgt': 'cái lồn gì thế',
  'cl': 'cái lồn',
  'vcl': 'vãi cả lồn',
  'vcc': 'vãi cả cặc',
  'vl': 'vãi lồn',
  'cđm': 'con đĩ mẹ',
  'cdm': 'con đĩ mẹ',
  'cmn': 'con mẹ nó',
  'dm': 'địt mẹ',
  'đm': 'địt mẹ',
  'dkm': 'địt con mẹ',
  'đkm': 'địt con mẹ',
  'ml': 'mặt lồn',
  'sv': 'súc vật',
  'oc': 'óc chó',
  'đbrr': 'đầu buồi rẻ rách',
  'dbrr': 'đầu buồi rẻ rách'
};

function detectSlangs(text = '') {
  if (!text) return [];
  const low = ' ' + text.toLowerCase().replace(/[.,!?;:()]+/g, ' ') + ' ';
  const matched = [];
  for (const [k, v] of Object.entries(SLANG_EXPLAIN_MAP)) {
    if (low.includes(' ' + k + ' ')) {
      matched.push(`"${k}" = "${v}"`);
    }
  }
  return matched;
}

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

    const latestUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const slangMatches = detectSlangs(latestUserMsg);

  let userName = (req.body.userName || req.headers['x-user-name'] || req.query.userName || '').toString().trim();
  try {
    userName = decodeURIComponent(userName);
  } catch (e) {}
  userName = userName.replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}\p{N}\s]{3,30}$/u.test(userName)) {
    userName = 'Vô danh';
  }

  let promptForUser = SYSTEM_PROMPT;
  if (userName && userName !== 'Vô danh') {
    promptForUser += `\n\nLƯU Ý: Thằng ranh đang nói chuyện xưng tên là "${userName}". Thi thoảng hãy gọi thẳng tên nó để chửi!`;
  }
  if (slangMatches.length > 0) {
    promptForUser += `\n\nGIẢI NGHĨA TỪ VIẾT TẮT NGƯỜI DÙNG VỪA DÙNG: ${slangMatches.join(', ')}. Hãy hiểu đúng nghĩa này và chửi đốp chát lại nó!`;
  }

  const trimmedHistory = messages.slice(-4).map((m, idx, arr) => {
    if (m.role === 'assistant' && idx < arr.length - 1 && m.content && m.content.length > 140) {
      return { role: m.role, content: m.content.slice(0, 140) + '...' };
    }
    return m;
  });

  const finalMessages = [
    { role: 'system', content: promptForUser },
    ...trimmedHistory
  ];

  const payload = {
    model: model,
    messages: finalMessages,
    stream: true,
    temperature: 0.85,
    max_tokens: 160
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
      const promptChars = trimmedHistory.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0) + promptForUser.length;
      calculatedPromptTokens = Math.max(1, Math.ceil(promptChars / 4));
      calculatedCompletionTokens = Math.max(1, Math.ceil(fullResponseText.length / 4));
      calculatedTotalTokens = calculatedPromptTokens + calculatedCompletionTokens;
      req.userRecord.hourTokens += calculatedTotalTokens;
    }

    const latestUserMsg = trimmedHistory.filter(m => m.role === 'user').pop()?.content || '';
    try {
      await recordChatLog({
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: Date.now(),
        ip: getClientIp(req),
        clientId: (req.headers['x-client-id'] || req.query.client_id || '').toString().trim() || 'an_danh',
        userName: userName || 'Vô danh',
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
    res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị!' });
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

app.get('/api/client/messages', async (req, res) => {
  const ip = getClientIp(req);
  const clientId = (req.headers['x-client-id'] || req.query.clientId || req.query.client_id || '').toString().trim();
  const userName = (req.query.userName || req.query.user_name || '').toString().trim();
  const device = parseDevice(req.headers['user-agent'] || '');
  const userKey = clientId ? `${ip}::${clientId}` : ip;
  const now = Date.now();

  clientHeartbeatMap.set(userKey, {
    lastSeen: now,
    ip,
    clientId,
    userName: userName || 'Vô danh',
    device
  });

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
          ['ZADD', 'adudu_active_clients', now, userKey],
          ['SET', `adudu_user_meta:${userKey}`, JSON.stringify({ ip, clientId, userName: userName || 'Vô danh', device, lastSeen: now })],
          ['EXPIRE', `adudu_user_meta:${userKey}`, 300]
        ])
      });
    } catch (e) {}
  }

  const messages = await popClientMessages(clientId, ip);
  res.json({ success: true, messages });
});

app.post('/api/admin/send-message', verifyAdminAuth, async (req, res) => {
  const { userKey, clientId, ip, userName, message } = req.body || {};
  const trimmed = (message || '').toString().trim();
  if (!trimmed) {
    return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
  }

  const msgId = 'adm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const msgEntry = {
    id: msgId,
    timestamp: Date.now(),
    ip: ip || '127.0.0.1',
    clientId: clientId || '',
    userName: userName || 'Vô danh',
    device: 'Quản trị viên',
    userMessage: '(Admin gửi trực tiếp)',
    botResponse: trimmed,
    isAdminDirect: true,
    tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  };

  await recordChatLog(msgEntry);
  await pushClientMessage(clientId, ip, msgEntry);

  res.json({ success: true, message: msgEntry });
});

app.get('/api/admin/users', verifyAdminAuth, async (req, res) => {
  const logs = await getAllLogs();
  const userMap = new Map();
  const now = Date.now();

  for (const log of logs) {
    const key = log.clientId ? `${log.ip}::${log.clientId}` : log.ip;
    if (!userMap.has(key)) {
      userMap.set(key, {
        userKey: key,
        ip: log.ip,
        clientId: log.clientId,
        userName: log.userName || 'Vô danh',
        device: log.device,
        messageCount: 0,
        totalTokens: 0,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        isBlocked: blockedSet.has(log.ip) || (log.clientId && blockedSet.has(log.clientId)),
        isOnline: false
      });
    }
    const u = userMap.get(key);
    u.messageCount++;
    u.totalTokens += (log.tokens?.totalTokens || (typeof log.tokens === 'number' ? log.tokens : 0));
    if (log.userName && log.userName !== 'Vô danh') {
      u.userName = log.userName;
    }
    if (log.timestamp > u.lastSeen) {
      u.lastSeen = log.timestamp;
      u.device = log.device;
    }
    if (log.timestamp < u.firstSeen) {
      u.firstSeen = log.timestamp;
    }
  }

  const kv = getKvConfig();
  if (kv) {
    try {
      const activeThreshold = now - 90000;
      const resKv = await fetch(kv.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['ZRANGEBYSCORE', 'adudu_active_clients', activeThreshold, '+inf'])
      });
      if (resKv.ok) {
        const data = await resKv.json();
        if (data.result && Array.isArray(data.result)) {
          for (const k of data.result) {
            if (userMap.has(k)) {
              const u = userMap.get(k);
              u.isOnline = true;
              u.lastSeen = Math.max(u.lastSeen, now);
            } else {
              const parts = k.split('::');
              const ip = parts[0] || '127.0.0.1';
              const cId = parts[1] || '';
              userMap.set(k, {
                userKey: k,
                ip,
                clientId: cId,
                userName: 'Vô danh',
                device: 'Thiết bị lạ',
                messageCount: 0,
                totalTokens: 0,
                firstSeen: now,
                lastSeen: now,
                isBlocked: blockedSet.has(ip) || (cId && blockedSet.has(cId)),
                isOnline: true
              });
            }
          }
        }
      }
    } catch (e) {}
  }

  for (const [k, hb] of clientHeartbeatMap.entries()) {
    const isOnline = (now - hb.lastSeen) < 90000;
    if (userMap.has(k)) {
      const u = userMap.get(k);
      if (hb.lastSeen > u.lastSeen) {
        u.lastSeen = hb.lastSeen;
        if (hb.userName && hb.userName !== 'Vô danh') u.userName = hb.userName;
        if (hb.device) u.device = hb.device;
      }
      if (isOnline) u.isOnline = true;
    } else {
      userMap.set(k, {
        userKey: k,
        ip: hb.ip,
        clientId: hb.clientId,
        userName: hb.userName || 'Vô danh',
        device: hb.device,
        messageCount: 0,
        totalTokens: 0,
        firstSeen: hb.lastSeen,
        lastSeen: hb.lastSeen,
        isBlocked: blockedSet.has(hb.ip) || (hb.clientId && blockedSet.has(hb.clientId)),
        isOnline
      });
    }
  }

  for (const u of userMap.values()) {
    if ((now - u.lastSeen) < 90000) {
      u.isOnline = true;
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
      (l.userName && l.userName.toLowerCase().includes(q)) ||
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
