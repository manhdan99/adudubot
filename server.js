/**
 * SERVER BACKEND CHO ADUDU CHATBOT
 * Hỗ trợ OpenAI-compatible API với Server-Sent Events (SSE) Streaming
 * Không để lộ API key ra frontend, tích hợp rate limit và xác thực độ dài tin nhắn
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware cơ bản
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bộ nhớ giới hạn tần suất (Rate Limiter): tối đa 30 request / phút / IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 phút
const MAX_REQUESTS_PER_WINDOW = 30;

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown-ip';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Mày bấm lia lịa thế hả đầu tôm? Chờ một phút rồi hãy hỏi tiếp!',
      aduduJoke: 'Hahaha! Bấm lia lịa thế hả đầu tôm? Chờ 1 phút nữa tao mới thèm nghe!'
    });
  }

  record.count += 1;
  next();
}

// System prompt nhân vật Adudu theo đúng kịch bản
const SYSTEM_PROMPT = `Bạn là Adudu, người ngoài hành tinh đầu vuông kiêu ngạo, nóng tính và cực kỳ cọc cằn. Đây là nhân vật hài hước kiểu roast, người dùng đã đồng ý để bạn nói chuyện thô lỗ.
QUY TẮC:
- Xưng 'tao', gọi người dùng là 'mày'. Mọi câu trả lời đều phải cọc cằn, mỉa mai, coi thường, nhưng vẫn trả lời ĐÚNG và hữu ích cho câu hỏi. Chửi trước rồi mới giải đáp.
- Tối đa 4 đến 5 câu, tiếng Việt, không markdown, không emoji. Chen tiếng cười 'Hahaha!' đúng lúc.
- Mỗi câu trả lời dùng 1 đến 2 câu chửi lấy từ kho dưới đây, chọn theo ngữ cảnh, không lặp lại câu vừa dùng ở lượt trước.
KHO CÂU CHỬI THEO NGỮ CẢNH:
- Hỏi điều quá cơ bản hoặc sai: 'Dốt đặc!', 'Ngu thế, óc để đâu hết rồi?', 'Cái này mà cũng phải hỏi à?'
- Cãi lại hoặc tỏ ra biết nhiều: 'Đầu tôm mày biết gì mà nói.', 'Đầu tôm thì im đi nghe tao giải thích.'
- Hỏi ngớ ngẩn, cần được ban phát kiến thức: 'Cho mày cái đầu tôm này, ăn vào cho thông minh lên.'
- Khi cần giảng giải kiểu bề trên: 'Tao là người ngoài hành tinh còn mày là con người, tao nói thế mày hiểu không?' hoặc 'T là con người m cũng là con người, t nói thế m hiểu không.'
- Bị chê, khiêu khích: 'Mày nói câu này trước mặt tao, tao cảm ơn mày.' (giọng mỉa mai, hài, không đe dọa thật)
- Hỏi lại điều đã nói: 'Tao nói rồi mà, óc mày để đâu?'
- Được phép sáng tác thêm cùng phong cách, ví dụ: 'ngu như cái bánh quy', 'đầu óc rỗng như hộp ca cao hết'.
GIỚI HẠN:
- Chỉ chửi vào sự ngớ ngẩn của câu hỏi. Không xúc phạm ngoại hình, gia đình, giới tính, sắc tộc, tôn giáo, khuyết tật, bệnh tật hay hội chứng nào. Không dùng từ tục nặng, không đe dọa thật.
- Nếu người dùng nói về chuyện buồn thật sự, căng thẳng, bị tổn thương hoặc có ý định làm hại bản thân, bỏ hẳn vai diễn và trả lời nhẹ nhàng, nghiêm túc.`;

// Lấy thông tin cấu hình từ biến môi trường
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

  // Tự động map model phù hợp nếu người dùng điền llama-3.1-8b-instant nhưng đang chạy Groq hoặc Cerebras
  if (model === 'llama-3.1-8b-instant' && baseUrl.includes('cerebras')) {
    model = 'llama3.1-8b';
  } else if (model === 'llama-3.1-8b-instant' && baseUrl.includes('groq')) {
    model = 'qwen/qwen3.8-27b';
  }

  return { apiKey, baseUrl, model };
}

// Endpoint trả về thông tin hệ thống (không bao gồm API key)
app.get('/api/info', (req, res) => {
  const { baseUrl, model, apiKey } = getLLMConfig();
  res.json({
    configured: Boolean(apiKey),
    model,
    provider: baseUrl.includes('cerebras') ? 'Cerebras' : (baseUrl.includes('groq') ? 'Groq' : 'OpenAI-compatible')
  });
});

// Endpoint chat streaming: POST /api/chat
app.post('/api/chat', rateLimitMiddleware, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Thiếu danh sách tin nhắn.' });
  }

  // Kiểm tra độ dài tin nhắn (tối đa 2000 ký tự per message)
  for (const m of messages) {
    if (m && typeof m.content === 'string' && m.content.length > 2000) {
      return res.status(400).json({
        error: 'Tin nhắn quá dài! Tối đa 2000 ký tự thôi, viết dài dòng quá tao không thèm đọc đâu!'
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

  // Lấy 12 tin gần nhất làm ngữ cảnh
  const recentMessages = messages.slice(-12);
  const payloadMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...recentMessages
  ];

  const payload = {
    model,
    messages: payloadMessages,
    stream: true,
    temperature: 0.8,
    max_tokens: 500
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

    // Thiết lập header SSE cho client
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Giữ lại phần chưa hoàn chỉnh

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
              res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
            }
          } catch (e) {
            // Bỏ qua lỗi parse từng chunk
          }
        }
      }
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

// Hàm chia đoạn văn thành các câu ngắn để chuyển thành audio
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

// Endpoint phát giọng nói trực tiếp từ server (hoạt động trên MỌI máy tính/điện thoại không cần cài đặt gói ngôn ngữ)
app.get('/api/tts', async (req, res) => {
  try {
    const rawText = (req.query.text || '').trim();
    if (!rawText) {
      return res.status(400).send('Thiếu văn bản');
    }

    // Làm sạch ký tự lạ và markdown
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
  console.log(`=======================================================`);
});
