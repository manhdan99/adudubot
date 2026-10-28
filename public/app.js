

const STORAGE_KEYS = {
  CONVERSATIONS: 'adudu_conversations_v2',
  ACTIVE_ID: 'adudu_active_conversation_id_v2',
  SETTINGS: 'adudu_settings_v2',
  THEME: 'adudu_theme_v2'
};

const DEFAULT_SETTINGS = {
  showPopup: true,
  enableSpeech: true,
  speechRate: 1.05
};

const API_BASE_URL = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000'))
  ? 'http://localhost:3000'
  : '';

const state = {
  conversations: [],
  activeId: null,
  settings: { ...DEFAULT_SETTINGS },
  theme: 'dark',
  isStreaming: false,
  abortController: null,
  currentUtterance: null,
  lastSpokenText: '',
  userHasScrolledUp: false
};

const DOM = {
  
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  btnOpenMobileSidebar: document.getElementById('btnOpenMobileSidebar'),
  btnCloseSidebar: document.getElementById('btnCloseSidebar'),
  btnCollapseDesktop: document.getElementById('btnCollapseDesktop'),
  btnExpandDesktop: document.getElementById('btnExpandDesktop'),
  btnNewChat: document.getElementById('btnNewChat'),
  historyContainer: document.getElementById('historyContainer'),
  btnToggleTheme: document.getElementById('btnToggleTheme'),
  themeTextLabel: document.getElementById('themeTextLabel'),
  themeIconDark: document.querySelector('.theme-icon-dark'),
  themeIconLight: document.querySelector('.theme-icon-light'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),

  currentChatTitle: document.getElementById('currentChatTitle'),
  headerQuotaPill: document.getElementById('headerQuotaPill'),
  headerQuotaText: document.getElementById('headerQuotaText'),
  headerTogglePopup: document.getElementById('headerTogglePopup'),
  headerToggleSpeech: document.getElementById('headerToggleSpeech'),

  messagesViewport: document.getElementById('messagesViewport'),
  messagesColumn: document.getElementById('messagesColumn'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  chatMessageList: document.getElementById('chatMessageList'),
  btnScrollDown: document.getElementById('btnScrollDown'),
  suggestionCards: document.querySelectorAll('.suggestion-card'),

  chatForm: document.getElementById('chatForm'),
  messageInput: document.getElementById('messageInput'),
  btnSubmit: document.getElementById('btnSubmit'),
  sendIcon: document.getElementById('sendIcon'),
  stopIcon: document.getElementById('stopIcon'),

  aduduModal: document.getElementById('aduduModal'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  popupAvatarWrap: document.getElementById('popupAvatarWrap'),
  popupAvatarImg: document.getElementById('popupAvatarImg'),
  popupSpeechText: document.getElementById('popupSpeechText'),
  noVietnameseVoiceWarn: document.getElementById('noVietnameseVoiceWarn'),
  btnPopupReplay: document.getElementById('btnPopupReplay'),
  btnPopupClose: document.getElementById('btnPopupClose'),

  settingsDialog: document.getElementById('settingsDialog'),
  settingsDialogBackdrop: document.getElementById('settingsDialogBackdrop'),
  btnCloseSettingsDialog: document.getElementById('btnCloseSettingsDialog'),
  settingTogglePopup: document.getElementById('settingTogglePopup'),
  settingToggleSpeech: document.getElementById('settingToggleSpeech'),
  speechRateRange: document.getElementById('speechRateRange'),
  speechRateLabel: document.getElementById('speechRateLabel'),
  currentModelBadge: document.getElementById('currentModelBadge'),
  settingQuotaHint: document.getElementById('settingQuotaHint'),
  btnClearAllHistory: document.getElementById('btnClearAllHistory'),

  confirmDialog: document.getElementById('confirmDialog'),
  confirmDialogBackdrop: document.getElementById('confirmDialogBackdrop'),
  confirmDialogTitle: document.getElementById('confirmDialogTitle'),
  confirmDialogMessage: document.getElementById('confirmDialogMessage'),
  btnConfirmCancel: document.getElementById('btnConfirmCancel'),
  btnConfirmOk: document.getElementById('btnConfirmOk'),

  renameDialog: document.getElementById('renameDialog'),
  renameDialogBackdrop: document.getElementById('renameDialogBackdrop'),
  renameInput: document.getElementById('renameInput'),
  btnRenameCancel: document.getElementById('btnRenameCancel'),
  btnRenameOk: document.getElementById('btnRenameOk')
};

function loadSavedData() {
  
  try {
    const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (rawSettings) {
      state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) };
    }
  } catch (e) {
    console.warn('Lỗi đọc settings:', e);
  }

  try {
    const rawTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (rawTheme) {
      state.theme = rawTheme;
    } else {
      
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      state.theme = prefersDark ? 'dark' : 'light';
    }
  } catch (e) {
    state.theme = 'dark';
  }

  try {
    const rawConversations = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    if (rawConversations) {
      state.conversations = JSON.parse(rawConversations);
    }
    const rawActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
    if (rawActiveId && state.conversations.some(c => c.id === rawActiveId)) {
      state.activeId = rawActiveId;
    }
  } catch (e) {
    console.warn('Lỗi đọc conversations:', e);
    state.conversations = [];
  }

  if (!state.conversations || state.conversations.length === 0) {
    createNewConversation(true);
  } else if (!state.activeId || !state.conversations.some(c => c.id === state.activeId)) {
    state.activeId = state.conversations[0].id;
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(state.conversations));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, state.activeId || '');
  } catch (e) {
    console.warn('Không thể lưu conversations vào localStorage:', e);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
  } catch (e) {
    console.warn('Không thể lưu settings:', e);
  }
}

function saveTheme() {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
  } catch (e) {
    console.warn('Không thể lưu theme:', e);
  }
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function ensureLaughter(text) {
  let cleaned = text.trim();
  
  if (!/hahaha[!.]*$/i.test(cleaned)) {
    cleaned = cleaned + ' Hahaha!';
  }
  return cleaned;
}

function escapeHTML(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}

function getClientId() {
  let id = localStorage.getItem('adudu_client_id');
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('adudu_client_id', id);
  }
  return id;
}

async function fetchAndDisplayQuota() {
  try {
    const clientId = getClientId();
    const res = await fetch(`${API_BASE_URL}/api/quota?client_id=${encodeURIComponent(clientId)}`, {
      headers: { 'X-Client-Id': clientId }
    });
    if (!res.ok) return;
    const data = await res.json();

    if (DOM.headerQuotaText) {
      DOM.headerQuotaText.textContent = `${data.requestsRemaining}/${data.maxRequests} lượt`;
    }

    if (DOM.headerQuotaPill) {
      DOM.headerQuotaPill.title = `Bạn còn ${data.requestsRemaining}/${data.maxRequests} lượt hỏi và ${data.tokensRemaining}/${data.maxTokens} token trong giờ này (Hồi sau ${data.resetInMinutes} phút)`;
      DOM.headerQuotaPill.classList.remove('low', 'exceeded');

      if (data.requestsRemaining === 0 || data.tokensRemaining === 0) {
        DOM.headerQuotaPill.classList.add('exceeded');
        DOM.headerQuotaText.textContent = 'Hết hạn mức!';
      } else if (data.requestsRemaining <= 5 || data.tokensRemaining < 1000) {
        DOM.headerQuotaPill.classList.add('low');
      }
    }

    if (DOM.settingQuotaHint) {
      DOM.settingQuotaHint.textContent = `Lượt hỏi: ${data.requestsRemaining}/${data.maxRequests} | Token: ${data.tokensRemaining}/${data.maxTokens} (Hồi sau ${data.resetInMinutes}p)`;
    }
  } catch (e) {
    console.warn('Lỗi lấy quota:', e);
  }
}

function groupConversationsByDate(convs) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7DaysAgo = startOfToday - (6 * 86400000);

  const groups = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: []
  };

  convs.forEach(c => {
    const time = c.updatedAt || c.createdAt || 0;
    if (time >= startOfToday) {
      groups.today.push(c);
    } else if (time >= startOfYesterday) {
      groups.yesterday.push(c);
    } else if (time >= startOf7DaysAgo) {
      groups.last7Days.push(c);
    } else {
      groups.older.push(c);
    }
  });

  return groups;
}

function getActiveConversation() {
  return state.conversations.find(c => c.id === state.activeId) || null;
}

function createNewConversation(shouldSwitch = true) {
  const newId = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const newConv = {
    id: newId,
    title: 'Cuộc trò chuyện mới',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };

  state.conversations.unshift(newConv);
  if (shouldSwitch || !state.activeId) {
    state.activeId = newId;
  }
  saveConversations();
  renderSidebarHistory();
  renderChatMessages();

  closeMobileSidebar();
  DOM.messageInput.focus();
}

function switchConversation(id) {
  if (state.isStreaming) {
    abortStreaming();
  }
  state.activeId = id;
  saveConversations();
  renderSidebarHistory();
  renderChatMessages();
  closeMobileSidebar();
  DOM.messageInput.focus();
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.activeId === id) {
    state.activeId = state.conversations[0]?.id || null;
  }
  if (!state.activeId) {
    createNewConversation(false);
  }
  saveConversations();
  renderSidebarHistory();
  renderChatMessages();
}

function renameConversation(id, newTitle) {
  const conv = state.conversations.find(c => c.id === id);
  if (conv && newTitle.trim()) {
    conv.title = newTitle.trim();
    saveConversations();
    renderSidebarHistory();
    if (state.activeId === id) {
      DOM.currentChatTitle.textContent = conv.title;
    }
  }
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveTheme();

  if (theme === 'dark') {
    DOM.themeTextLabel.textContent = 'Giao diện sáng';
    DOM.themeIconDark.classList.remove('hidden');
    DOM.themeIconLight.classList.add('hidden');
  } else {
    DOM.themeTextLabel.textContent = 'Giao diện tối';
    DOM.themeIconDark.classList.add('hidden');
    DOM.themeIconLight.classList.remove('hidden');
  }
}

function renderSidebarHistory() {
  DOM.historyContainer.innerHTML = '';
  const groups = groupConversationsByDate(state.conversations);

  const groupConfigs = [
    { key: 'today', label: 'Hôm nay' },
    { key: 'yesterday', label: 'Hôm qua' },
    { key: 'last7Days', label: '7 ngày trước' },
    { key: 'older', label: 'Cũ hơn' }
  ];

  groupConfigs.forEach(grp => {
    const list = groups[grp.key];
    if (list && list.length > 0) {
      const groupEl = document.createElement('div');
      groupEl.className = 'history-group';

      const titleEl = document.createElement('div');
      titleEl.className = 'history-group-title';
      titleEl.textContent = grp.label;
      groupEl.appendChild(titleEl);

      list.forEach(c => {
        const itemEl = document.createElement('div');
        itemEl.className = `history-item ${c.id === state.activeId ? 'active' : ''}`;
        itemEl.setAttribute('role', 'button');
        itemEl.setAttribute('tabindex', '0');

        itemEl.innerHTML = `
          <span class="history-title" title="${escapeHTML(c.title)}">${escapeHTML(c.title)}</span>
          <div class="history-actions">
            <button class="btn-item-action btn-rename" title="Đổi tên" aria-label="Đổi tên hội thoại">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-item-action btn-delete" title="Xóa" aria-label="Xóa hội thoại">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        `;

        itemEl.addEventListener('click', (e) => {
          if (!e.target.closest('.history-actions')) {
            switchConversation(c.id);
          }
        });

        itemEl.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.history-actions')) {
            e.preventDefault();
            switchConversation(c.id);
          }
        });

        const renameBtn = itemEl.querySelector('.btn-rename');
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showRenameDialog(c.id, c.title);
        });

        const deleteBtn = itemEl.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showConfirmDialog('Xóa cuộc trò chuyện?', `Bạn có muốn xóa "${c.title}" không?`, () => {
            deleteConversation(c.id);
          });
        });

        groupEl.appendChild(itemEl);
      });

      DOM.historyContainer.appendChild(groupEl);
    }
  });
}

function renderChatMessages() {
  const currentConv = getActiveConversation();
  if (!currentConv) return;

  DOM.currentChatTitle.textContent = currentConv.title;
  DOM.chatMessageList.innerHTML = '';

  if (!currentConv.messages || currentConv.messages.length === 0) {
    DOM.welcomeScreen.classList.remove('hidden');
    return;
  }

  DOM.welcomeScreen.classList.add('hidden');

  currentConv.messages.forEach(msg => {
    appendMessageElement(msg.role, msg.content, msg.id, false);
  });

  scrollToBottom(false);
}

function appendMessageElement(role, content, msgId, isStreaming = false) {
  const isUser = role === 'user';
  const row = document.createElement('div');
  row.className = `msg-row ${isUser ? 'msg-user' : 'msg-bot'}`;
  if (msgId) row.id = `msg_${msgId}`;

  if (isUser) {
    row.innerHTML = `
      <div class="user-bubble-box">${escapeHTML(content)}</div>
    `;
  } else {
    row.innerHTML = `
      <div class="bot-avatar-col">
        <img class="bot-avatar-img" src="assets/adudu.png" alt="Adudu" onerror="this.src='assets/adudu-default.svg'">
      </div>
      <div class="bot-content-col">
        <div class="bot-text-body ${isStreaming ? 'streaming-cursor' : ''}">${escapeHTML(content)}</div>
        <div class="bot-action-row ${isStreaming ? 'hidden' : ''}">
          <button class="btn-msg-tool btn-copy-msg" title="Sao chép" aria-label="Sao chép câu trả lời">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="btn-msg-tool btn-replay-msg" title="Đọc lại" aria-label="Đọc lại câu trả lời">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </button>
          <button class="btn-msg-tool btn-regen-msg" title="Tạo lại câu trả lời" aria-label="Tạo lại câu trả lời">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </div>
    `;

    const copyBtn = row.querySelector('.btn-copy-msg');
    copyBtn.addEventListener('click', () => {
      const textToCopy = row.querySelector('.bot-text-body')?.textContent || '';
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9dff2e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 1500);
      });
    });

    const replayBtn = row.querySelector('.btn-replay-msg');
    replayBtn.addEventListener('click', () => {
      const textToSpeak = row.querySelector('.bot-text-body')?.textContent || '';
      speakText(textToSpeak);
    });

    const regenBtn = row.querySelector('.btn-regen-msg');
    regenBtn.addEventListener('click', () => {
      regenerateLastMessage();
    });
  }

  DOM.chatMessageList.appendChild(row);
  return row;
}

function scrollToBottom(smooth = true) {
  if (state.userHasScrolledUp) return;
  DOM.messagesViewport.scrollTo({
    top: DOM.messagesViewport.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
}

function openPopup() {
  DOM.aduduModal.classList.add('active');
  DOM.aduduModal.setAttribute('aria-hidden', 'false');
  DOM.popupSpeechText.textContent = 'Hừ... để tao nghĩ đã...';
  DOM.noVietnameseVoiceWarn.classList.add('hidden');
}

function closePopup() {
  DOM.aduduModal.classList.remove('active');
  DOM.aduduModal.setAttribute('aria-hidden', 'true');
  stopSpeaking();
  DOM.messageInput.focus();
}

function getVietnameseVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  return voices.find(v => v.lang && (v.lang.toLowerCase() === 'vi-vn' || v.lang.toLowerCase() === 'vi_vn')) ||
         voices.find(v => v.lang && v.lang.toLowerCase().startsWith('vi')) ||
         voices.find(v => v.name && v.name.toLowerCase().includes('vietnam')) ||
         null;
}

let currentAudioPlayer = null;

function speakText(text) {
  stopSpeaking();

  if (!state.settings.enableSpeech) return;

  const cleanText = stripMarkdown(text);
  if (!cleanText) return;
  state.lastSpokenText = cleanText;

  const audioUrl = `${API_BASE_URL}/api/tts?text=${encodeURIComponent(cleanText)}`;
  const audio = new Audio(audioUrl);
  currentAudioPlayer = audio;

  audio.preservesPitch = false;
  audio.mozPreservesPitch = false;
  audio.webkitPreservesPitch = false;

  const baseRate = state.settings.speechRate ? (state.settings.speechRate * 1.15) : 1.22;
  audio.playbackRate = Math.min(Math.max(baseRate, 1.0), 1.5);

  DOM.popupAvatarWrap.classList.add('wobbling');
  DOM.noVietnameseVoiceWarn.classList.add('hidden');

  audio.onended = () => {
    DOM.popupAvatarWrap.classList.remove('wobbling');
    currentAudioPlayer = null;
  };

  audio.onerror = () => {
    DOM.popupAvatarWrap.classList.remove('wobbling');
    currentAudioPlayer = null;
    
    speakTextFallback(cleanText);
  };

  audio.play().catch(e => {
    DOM.popupAvatarWrap.classList.remove('wobbling');
    console.warn('Audio play bị chặn hoặc lỗi:', e);
  });
}

function speakTextFallback(cleanText) {
  if (!('speechSynthesis' in window)) return;
  const viVoice = getVietnameseVoice();
  if (!viVoice) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'vi-VN';
  utterance.pitch = 1.35;
  utterance.rate = state.settings.speechRate || 1.05;
  utterance.voice = viVoice;

  utterance.onstart = () => DOM.popupAvatarWrap.classList.add('wobbling');
  utterance.onend = () => DOM.popupAvatarWrap.classList.remove('wobbling');
  utterance.onerror = () => DOM.popupAvatarWrap.classList.remove('wobbling');

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
    currentAudioPlayer.currentTime = 0;
    currentAudioPlayer = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  DOM.popupAvatarWrap.classList.remove('wobbling');
}

async function sendMessage(userText) {
  if (!userText || state.isStreaming) return;

  const currentConv = getActiveConversation();
  if (!currentConv) return;

  const userMsgId = 'msg_u_' + Date.now();
  const userMsg = { id: userMsgId, role: 'user', content: userText, timestamp: Date.now() };
  currentConv.messages.push(userMsg);

  if (currentConv.messages.filter(m => m.role === 'user').length === 1 && currentConv.title === 'Cuộc trò chuyện mới') {
    currentConv.title = userText.trim().slice(0, 36) + (userText.length > 36 ? '...' : '');
    DOM.currentChatTitle.textContent = currentConv.title;
  }

  currentConv.updatedAt = Date.now();
  saveConversations();
  renderSidebarHistory();

  DOM.welcomeScreen.classList.add('hidden');
  appendMessageElement('user', userText, userMsgId, false);
  scrollToBottom();

  if (state.settings.showPopup) {
    openPopup();
  }

  const botMsgId = 'msg_b_' + Date.now();
  const botRow = appendMessageElement('assistant', '', botMsgId, true);
  const botTextEl = botRow.querySelector('.bot-text-body');
  const botActionRow = botRow.querySelector('.bot-action-row');

  setStreamingState(true);

  const recentMessages = currentConv.messages.slice(-4).map(m => ({
    role: m.role,
    content: m.content
  }));

  state.abortController = new AbortController();
  let fullAssistantText = '';

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': getClientId()
      },
      body: JSON.stringify({
        messages: recentMessages
      }),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const customErr = new Error(errData.error || `HTTP ${response.status}: Lỗi máy chủ`);
      customErr.status = response.status;
      customErr.aduduJoke = errData.aduduJoke;
      customErr.code = errData.code;
      throw customErr;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed === 'data: [DONE]') {
          break;
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.token) {
              fullAssistantText += data.token;
              botTextEl.textContent = fullAssistantText;
              if (state.settings.showPopup) {
                DOM.popupSpeechText.textContent = fullAssistantText;
              }
              scrollToBottom();
            }
          } catch (e) {
            
          }
        }
      }
    }

    botTextEl.classList.remove('streaming-cursor');
    botActionRow.classList.remove('hidden');

    fullAssistantText = ensureLaughter(fullAssistantText);
    botTextEl.textContent = fullAssistantText;
    if (state.settings.showPopup) {
      DOM.popupSpeechText.textContent = fullAssistantText;
    }

    currentConv.messages.push({
      id: botMsgId,
      role: 'assistant',
      content: fullAssistantText,
      timestamp: Date.now()
    });
    currentConv.updatedAt = Date.now();
    saveConversations();
    renderSidebarHistory();

    if (state.settings.enableSpeech) {
      speakText(fullAssistantText);
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      botTextEl.classList.remove('streaming-cursor');
      botActionRow.classList.remove('hidden');
      if (fullAssistantText) {
        currentConv.messages.push({
          id: botMsgId,
          role: 'assistant',
          content: fullAssistantText,
          timestamp: Date.now()
        });
        saveConversations();
      }
    } else {
      console.error('Lỗi chat:', err);
      botTextEl.classList.remove('streaming-cursor');
      
      let detailMsg = err.message || 'Lỗi không xác định';
      if (err.message && err.message.includes('Failed to fetch')) {
        detailMsg = 'Không kết nối được server backend! Hãy chắc chắn server đang chạy lệnh "npm start" (http://localhost:3000).';
      }

      const isLimitError = err.status === 429;
      let joke = isLimitError ? err.message : (err.aduduJoke || "Hahaha! Tao đang nói thì đứt cáp rồi! Đám loài người các mày mau kiểm tra lại mạng đi!");
      if (isLimitError) {
        detailMsg = 'Đã chạm giới hạn yêu cầu hoặc token của người dùng (Rate/Token Limit)';
      }
      const banner = document.createElement('div');
      banner.className = 'bot-error-banner';
      banner.innerHTML = `
        <div class="error-joke">${escapeHTML(joke)}</div>
        <div class="error-tech-detail">Chi tiết: ${escapeHTML(detailMsg)}</div>
        ${!isLimitError ? '<button class="btn-retry">Thử lại</button>' : ''}
      `;

      const btnRetry = banner.querySelector('.btn-retry');
      if (btnRetry) {
        btnRetry.addEventListener('click', () => {
          banner.remove();
          botRow.remove();
          sendMessage(userText);
        });
      }

      botRow.querySelector('.bot-content-col').appendChild(banner);

      if (state.settings.showPopup) {
        DOM.popupSpeechText.textContent = `${joke}\n\n(${detailMsg})`;
      }

      if (state.settings.enableSpeech && isLimitError) {
        speakText(joke);
      }
    }
  } finally {
    setStreamingState(false);
    DOM.messageInput.disabled = false;
    DOM.messageInput.focus();
    fetchAndDisplayQuota();
  }
}

function abortStreaming() {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  setStreamingState(false);
  stopSpeaking();
}

function setStreamingState(isStreaming) {
  state.isStreaming = isStreaming;
  if (isStreaming) {
    DOM.sendIcon.classList.add('hidden');
    DOM.stopIcon.classList.remove('hidden');
    DOM.btnSubmit.disabled = false;
    DOM.btnSubmit.classList.add('btn-stop-stream');
    DOM.btnSubmit.setAttribute('aria-label', 'Dừng trả lời');
  } else {
    DOM.sendIcon.classList.remove('hidden');
    DOM.stopIcon.classList.add('hidden');
    DOM.btnSubmit.classList.remove('btn-stop-stream');
    DOM.btnSubmit.setAttribute('aria-label', 'Gửi tin nhắn');
    checkInputState();
  }
}

function regenerateLastMessage() {
  const currentConv = getActiveConversation();
  if (!currentConv || currentConv.messages.length === 0) return;

  const lastMsg = currentConv.messages[currentConv.messages.length - 1];
  if (lastMsg.role === 'assistant') {
    currentConv.messages.pop(); 
    const lastUserMsg = currentConv.messages[currentConv.messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === 'user') {
      currentConv.messages.pop(); 
      saveConversations();
      renderChatMessages();
      sendMessage(lastUserMsg.content);
    }
  }
}

let confirmCallback = null;

function showConfirmDialog(title, message, onOk) {
  DOM.confirmDialogTitle.textContent = title;
  DOM.confirmDialogMessage.textContent = message;
  confirmCallback = onOk;
  DOM.confirmDialog.classList.add('active');
  DOM.btnConfirmOk.focus();
}

function closeConfirmDialog() {
  DOM.confirmDialog.classList.remove('active');
  confirmCallback = null;
}

let renameTargetId = null;

function showRenameDialog(id, currentTitle) {
  renameTargetId = id;
  DOM.renameInput.value = currentTitle;
  DOM.renameDialog.classList.add('active');
  DOM.renameInput.focus();
  DOM.renameInput.select();
}

function closeRenameDialog() {
  DOM.renameDialog.classList.remove('active');
  renameTargetId = null;
}

function checkInputState() {
  const text = DOM.messageInput.value.trim();
  DOM.btnSubmit.disabled = !text && !state.isStreaming;
}

function autoResizeTextarea() {
  DOM.messageInput.style.height = 'auto';
  DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 160) + 'px';
  checkInputState();
}

function openMobileSidebar() {
  DOM.sidebar.classList.add('open');
  DOM.sidebarBackdrop.classList.add('active');
}

function closeMobileSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.sidebarBackdrop.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  loadSavedData();
  applyTheme(state.theme);
  renderSidebarHistory();
  renderChatMessages();

  DOM.headerTogglePopup.checked = state.settings.showPopup;
  DOM.settingTogglePopup.checked = state.settings.showPopup;

  DOM.headerToggleSpeech.checked = state.settings.enableSpeech;
  DOM.settingToggleSpeech.checked = state.settings.enableSpeech;

  DOM.speechRateRange.value = state.settings.speechRate || 1.05;
  DOM.speechRateLabel.textContent = `${(state.settings.speechRate || 1.05).toFixed(2)}x`;

  fetch(`${API_BASE_URL}/api/info`)
    .then(r => r.json())
    .then(data => {
      DOM.currentModelBadge.textContent = `${data.model} (${data.provider})`;
    })
    .catch(() => {
      DOM.currentModelBadge.textContent = 'Mặc định (Groq / Cerebras)';
    });

  fetchAndDisplayQuota();
  setInterval(fetchAndDisplayQuota, 30000);

  DOM.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.isStreaming) {
      abortStreaming();
      return;
    }
    const text = DOM.messageInput.value.trim();
    if (!text) return;
    DOM.messageInput.value = '';
    DOM.messageInput.style.height = 'auto';
    checkInputState();
    sendMessage(text);
  });

  DOM.messageInput.addEventListener('input', autoResizeTextarea);

  DOM.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      DOM.chatForm.dispatchEvent(new Event('submit'));
    }
  });

  DOM.suggestionCards.forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });

  DOM.messagesViewport.addEventListener('scroll', () => {
    const distFromBottom = DOM.messagesViewport.scrollHeight - DOM.messagesViewport.scrollTop - DOM.messagesViewport.clientHeight;
    state.userHasScrolledUp = distFromBottom > 120;
    if (state.userHasScrolledUp) {
      DOM.btnScrollDown.classList.remove('hidden');
    } else {
      DOM.btnScrollDown.classList.add('hidden');
    }
  });

  DOM.btnScrollDown.addEventListener('click', () => {
    state.userHasScrolledUp = false;
    DOM.btnScrollDown.classList.add('hidden');
    scrollToBottom();
  });

  DOM.btnOpenMobileSidebar.addEventListener('click', openMobileSidebar);
  DOM.btnCloseSidebar.addEventListener('click', closeMobileSidebar);
  DOM.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

  DOM.btnCollapseDesktop.addEventListener('click', () => {
    DOM.sidebar.classList.add('collapsed');
    DOM.btnExpandDesktop.classList.remove('hidden');
  });

  DOM.btnExpandDesktop.addEventListener('click', () => {
    DOM.sidebar.classList.remove('collapsed');
    DOM.btnExpandDesktop.classList.add('hidden');
  });

  DOM.btnNewChat.addEventListener('click', () => {
    createNewConversation(true);
  });

  DOM.btnToggleTheme.addEventListener('click', () => {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  DOM.headerTogglePopup.addEventListener('change', () => {
    state.settings.showPopup = DOM.headerTogglePopup.checked;
    DOM.settingTogglePopup.checked = state.settings.showPopup;
    saveSettings();
  });

  DOM.headerToggleSpeech.addEventListener('change', () => {
    state.settings.enableSpeech = DOM.headerToggleSpeech.checked;
    DOM.settingToggleSpeech.checked = state.settings.enableSpeech;
    saveSettings();
    if (!state.settings.enableSpeech) {
      stopSpeaking();
    }
  });

  DOM.btnPopupClose.addEventListener('click', closePopup);
  DOM.modalBackdrop.addEventListener('click', closePopup);
  DOM.btnPopupReplay.addEventListener('click', () => {
    if (state.lastSpokenText) {
      speakText(state.lastSpokenText);
    }
  });

  DOM.btnOpenSettings.addEventListener('click', () => {
    DOM.settingsDialog.classList.add('active');
  });

  DOM.btnCloseSettingsDialog.addEventListener('click', () => {
    DOM.settingsDialog.classList.remove('active');
  });

  DOM.settingsDialogBackdrop.addEventListener('click', () => {
    DOM.settingsDialog.classList.remove('active');
  });

  DOM.settingTogglePopup.addEventListener('change', () => {
    state.settings.showPopup = DOM.settingTogglePopup.checked;
    DOM.headerTogglePopup.checked = state.settings.showPopup;
    saveSettings();
  });

  DOM.settingToggleSpeech.addEventListener('change', () => {
    state.settings.enableSpeech = DOM.settingToggleSpeech.checked;
    DOM.headerToggleSpeech.checked = state.settings.enableSpeech;
    saveSettings();
    if (!state.settings.enableSpeech) {
      stopSpeaking();
    }
  });

  DOM.speechRateRange.addEventListener('input', () => {
    const rate = parseFloat(DOM.speechRateRange.value) || 1.05;
    state.settings.speechRate = rate;
    DOM.speechRateLabel.textContent = `${rate.toFixed(2)}x`;
    saveSettings();
  });

  DOM.btnClearAllHistory.addEventListener('click', () => {
    showConfirmDialog(
      'Xóa toàn bộ lịch sử?',
      'Hành động này sẽ xóa vĩnh viễn tất cả cuộc trò chuyện của bạn.',
      () => {
        state.conversations = [];
        state.activeId = null;
        createNewConversation(true);
        DOM.settingsDialog.classList.remove('active');
      }
    );
  });

  DOM.btnConfirmCancel.addEventListener('click', closeConfirmDialog);
  DOM.confirmDialogBackdrop.addEventListener('click', closeConfirmDialog);
  DOM.btnConfirmOk.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirmDialog();
  });

  DOM.btnRenameCancel.addEventListener('click', closeRenameDialog);
  DOM.renameDialogBackdrop.addEventListener('click', closeRenameDialog);
  DOM.btnRenameOk.addEventListener('click', () => {
    if (renameTargetId) {
      renameConversation(renameTargetId, DOM.renameInput.value);
    }
    closeRenameDialog();
  });

  DOM.renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      DOM.btnRenameOk.click();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.aduduModal.classList.contains('active')) {
        closePopup();
      } else if (DOM.settingsDialog.classList.contains('active')) {
        DOM.settingsDialog.classList.remove('active');
      } else if (DOM.confirmDialog.classList.contains('active')) {
        closeConfirmDialog();
      } else if (DOM.renameDialog.classList.contains('active')) {
        closeRenameDialog();
      }
    }
  });

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      getVietnameseVoice();
    };
  }

  DOM.messageInput.focus();
});
