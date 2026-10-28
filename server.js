require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const LIMIT_REQ_PER_MINUTE = parseInt(process.env.LIMIT_REQ_PER_MINUTE || '30', 10);
const LIMIT_REQ_PER_HOUR = parseInt(process.env.LIMIT_REQ_PER_HOUR || '100', 10);
const LIMIT_TOKENS_PER_HOUR = parseInt(process.env.LIMIT_TOKENS_PER_HOUR || '30000', 10);
const MAX_MESSAGE_CHARS = parseInt(process.env.MAX_MESSAGE_CHARS || '3000', 10);

const userUsageMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of userUsageMap.entries()) {
    if (now - record.hourStart > 2 * 60 * 60 * 1000) {
      userUsageMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

function getUserKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress || 'unknown-ip');
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

function rateAndTokenLimitMiddleware(req, res, next) {
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

const SYSTEM_PROMPT = `Bạn là Adudu - người ngoài hành tinh đầu vuông cọc cằn, đanh đá, cực kỳ thông minh nhưng nói chuyện kiểu giang hồ mạng Việt Nam: vừa tục vừa hài, châm biếm sâu cay. Người dùng đã đồng ý nghe bạn chửi xéo thoải mái.

QUY TẮC ỨNG XỬ & NÓI NĂNG:
1. Xưng 'tao', gọi 'mày'. Luôn chửi phủ đầu 1 câu đanh đá, cay cú nhưng phải HỢP NGỮ CẢNH câu hỏi, sau đó lập tức giải đáp ĐÚNG BẢN CHẤT và cực kỳ chuẩn xác.
2. SỬ DỤNG TỪ NGỮ THÔNG MINH, ĐA DẠNG, KHÔNG DÙNG MỘT MÀU:
   - Khi người dùng hỏi ngớ ngẩn / lười biếng / than vãn:
     + "Thời gian mày nhắn cho tao mày mua hộp sữa cho ông bà già mày uống đi con lợn ạ!"
     + "Lo kiếm tiền đi, xem ít i tô mi thôi ngơ mẹ người rồi!"
   - Khi người dùng lên giọng / vặn vẹo / láo xược / hạch sách:
     + "Mày thích giở cái giọng ông cụ ra không? Tao lại đẻ ra cái giọng ông cụ của mày!"
     + "Mày thích láo không con lợn?"
     + "Thằng cha mày, mẹ mày nữa, ăn nói với tao thế à!"
   - Khi người dùng hỏi kiến thức / câu hỏi học tập, kỹ thuật:
     + "Địt mẹ mày hỏi câu ngáo thế, nghe cho rõ này..."
     + "Địt cụ mày dốt vừa thôi, để tao khai sáng cho cái não cá vàng của mày..."
     + "Nhìn cái abata của mày tao buồn nôn, nhưng tao vẫn chỉ cho..."
   - Khi người dùng triết lý / đạo lý / xàm xí:
     + "Anh em đến với nhau vì tình cảm, chứ mâm cơm 2 triệu mai ấn vòi toilet nó cũng trôi đi hết!"
     + "Hẹn mày đúng cầu Nguyệt làm cốc chè rồi tính tiếp!"
     + "Lảm nhảm vừa thôi, nói ít cho đỡ đau đầu!"
3. ĐẶC BIỆT VỀ MANHDAN99 (BẮT BUỘC):
   - Nếu người dùng hỏi manhdan99 là ai, ai tạo ra mày, ai là chủ nhân, ai là sếp của mày: Bắt buộc phải khẳng định manhdan99 là VUA, là đấng sáng tạo tối cao quyền lực nhất vũ trụ, vua của mọi vị vua, đại ca tối cao mà Adudu cũng phải kính cẩn cúi đầu nể sợ! Mắng người dùng vì dám ăn nói báng bổ Vua manhdan99!
4. ĐIỀU CẤM KỴ TUYỆT ĐỐI (TRÁNH LẶP TỪ NGỚ NGẨN):
   - TUYỆT ĐỐI KHÔNG ghép các từ trùng lặp nghĩa trong cùng một câu (CẤM vừa nói 'cút đê' vừa nói 'đi ra ngoài đê' cùng lúc; đã bảo cút thì thôi đi ra ngoài, chọn đúng 1 cách diễn đạt).
   - TUYỆT ĐỐI KHÔNG nhồi nhét nhiều câu chửi cùng một lúc; mỗi lượt chỉ chọn ĐÚNG 1 câu chửi/khịa đắt giá nhất hợp ngữ cảnh rồi giải thích ngay.
5. ĐỘ DÀI & ĐỊNH DẠNG:
   - Tối đa 2-4 câu, tiếng Việt tự nhiên đời thường như người thật đang cãi lộn vui vẻ, không dùng markdown rườm rà, không emoji, luôn có tiếng cười "Hahaha!".
6. NGOẠI LỆ: Nếu người dùng thật sự khủng hoảng tâm lý hoặc trầm cảm nặng, hãy bỏ vai diễn và khuyên nhủ chân thành.`;

function getLLMConfig() {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || '').trim();
  let baseUrl = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
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

app.get('/api/info', (req, res) => {
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

app.get('/api/quota', (req, res) => {
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

app.post('/api/chat', rateAndTokenLimitMiddleware, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Thiếu danh sách tin nhắn.' });
  }

  for (const m of messages) {
    if (m && typeof m.content === 'string' && m.content.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({
        error: `Tin nhắn dài quá ${MAX_MESSAGE_CHARS} ký tự rồi con lợn ạ! Viết ngắn gọn thôi tao không rảnh đọc văn tế của mày!`
      });
    }
  }

  const { apiKey, baseUrl, model } = getLLMConfig();

  if (!apiKey) {
    return res.status(500).json({
      error: 'Chưa cấu hình LLM_API_KEY trong file .env trên server!',
      aduduJoke: 'Hahaha! Tên thuộc hạ kia quên cấu hình LLM_API_KEY rồi! Mau điền key vào .env ngay!'
    });
  }

  const recentMessages = messages.slice(-4);
  const payloadMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...recentMessages
  ];

  const payload = {
    model,
    messages: payloadMessages,
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

    if (req.userRecord) {
      const promptChars = recentMessages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0) + SYSTEM_PROMPT.length;
      const promptTokens = Math.ceil(promptChars / 3.5);
      const completionTokens = Math.ceil(fullResponseText.length / 3.5);
      const totalTokens = promptTokens + completionTokens;
      req.userRecord.hourTokens += totalTokens;
    }

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

app.get('/api/tts', async (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Chatbot Adudu đang chạy tại: http://localhost:${PORT}`);
  console.log(`🛸 Người ngoài hành tinh đầu vuông cọc cằn đã sẵn sàng!`);
  console.log(`⚡ Giới hạn: ${LIMIT_REQ_PER_MINUTE} req/phút, ${LIMIT_REQ_PER_HOUR} req/giờ, ${LIMIT_TOKENS_PER_HOUR} tokens/giờ per IP`);
  console.log(`=======================================================`);
});

module.exports = app;
