// dashboard.js
// External JS for dashboard.html
// Matches behavior described earlier (search, friend requests, friends, realtime using BroadcastChannel).
// Delete message, clear chat, remove friend (no auto request).

(() => {
  const bc = new BroadcastChannel('chat_app_channel');
  const loggedInUser = localStorage.getItem('loggedInUser');
  if (!loggedInUser) {
    alert('No logged-in user found. Redirecting to login.');
    window.location.href = 'login.html';
  }

  // --- Helpers for storage ---
  function getUsers() {
    return JSON.parse(localStorage.getItem('users') || '[]');
  }
  function saveUsers(u){ localStorage.setItem('users', JSON.stringify(u)); }

  function getFriendRequests() {
    return JSON.parse(localStorage.getItem('friendRequests') || '[]');
  }
  function saveFriendRequests(req) {
    localStorage.setItem('friendRequests', JSON.stringify(req));
  }

  function getFriendsMap() {
    return JSON.parse(localStorage.getItem('friendsMap') || '{}');
  }
  function saveFriendsMap(m) {
    localStorage.setItem('friendsMap', JSON.stringify(m));
  }

  function chatKey(a,b) {
    return ['chat', ...[a,b].sort()].join(':');
  }
  function getChat(a,b){
    return JSON.parse(localStorage.getItem(chatKey(a,b)) || '[]');
  }
  function saveChat(a,b, messages){
    localStorage.setItem(chatKey(a,b), JSON.stringify(messages));
  }

  function nowTS(){ return new Date().toISOString(); }
  function makeId(){ return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9); }

  // --- UI elements ---
  const welcome = document.getElementById('welcome');
  const logoutBtn = document.getElementById('logout');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchResults = document.getElementById('searchResults');
  const friendsList = document.getElementById('friendsList');
  const chatTitle = document.getElementById('chatTitle');
  const chatSub = document.getElementById('chatSub');
  const chatArea = document.getElementById('chatArea');
  const composer = document.getElementById('composer');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const friendMeta = document.getElementById('friendMeta');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const removeFriendBtn = document.getElementById('removeFriendBtn');

  welcome.textContent = `Welcome, ${loggedInUser}`;

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('loggedInUser');
    window.location.href = 'login.html';
  });

  // --- Application state ---
  let openChatWith = null; // username

  // Render functions
  function renderSearchResults(q='') {
    const users = getUsers();
    const requests = getFriendRequests();
    const friends = getFriendsMap();
    searchResults.innerHTML = '';
    const qlower = q.trim().toLowerCase();
    const filtered = users.filter(u => u.username !== loggedInUser &&
      u.username.toLowerCase().includes(qlower));
    if (filtered.length === 0) {
      searchResults.innerHTML = '<div class="empty">No users found.</div>';
      return;
    }
    filtered.forEach(u => {
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = `<div>
          <div class="user-name">${u.username}</div>
          <div class="muted">${u.email}</div>
        </div>`;
      const actionWrap = document.createElement('div');

      const myFriends = friends[loggedInUser] || [];
      if (myFriends.includes(u.username)) {
        const btn = document.createElement('button');
        btn.className = 'disabled';
        btn.textContent = 'Friends';
        actionWrap.appendChild(btn);
      } else {
        const incoming = requests.find(r => r.from === u.username && r.to === loggedInUser);
        const outgoing = requests.find(r => r.from === loggedInUser && r.to === u.username);

        if (incoming) {
          const accept = document.createElement('button');
          accept.className = 'accept-btn';
          accept.textContent = 'Accept';
          accept.onclick = () => acceptRequest(u.username);
          actionWrap.appendChild(accept);
        } else if (outgoing) {
          const btn = document.createElement('button');
          btn.className = 'disabled';
          btn.textContent = 'Request sent';
          actionWrap.appendChild(btn);
        } else {
          const send = document.createElement('button');
          send.className = 'request-btn';
          send.textContent = 'Send Request';
          send.onclick = () => sendFriendRequest(u.username);
          actionWrap.appendChild(send);
        }
      }

      row.appendChild(actionWrap);
      searchResults.appendChild(row);
    });
  }

  function renderFriendsList() {
    const friendsMap = getFriendsMap();
    const friends = friendsMap[loggedInUser] || [];
    const enriched = friends.map(f => {
      const chat = getChat(loggedInUser, f);
      const last = chat.length ? chat[chat.length-1].time : null;
      const unread = chat.filter(m => m.to === loggedInUser && !m.read).length;
      return { name: f, last, unread };
    });
    enriched.sort((a,b) => {
      if ((b.unread - a.unread) !== 0) return b.unread - a.unread;
      if (!a.last && !b.last) return a.name.localeCompare(b.name);
      if (!a.last) return 1;
      if (!b.last) return -1;
      return new Date(b.last) - new Date(a.last);
    });

    friendsList.innerHTML = '';
    if (enriched.length === 0) {
      friendsList.innerHTML = '<div class="empty">You have no friends yet. Search and send requests!</div>';
      return;
    }
    enriched.forEach(f => {
      const r = document.createElement('div');
      r.className = 'friend-row';
      const left = document.createElement('div');
      left.innerHTML = `<div class="user-name">${f.name} ${f.unread?'<span class="small-badge">'+f.unread+'</span>':''}</div>
                        <div class="muted">${f.last?new Date(f.last).toLocaleString():'No messages yet'}</div>`;
      left.style.cursor = 'pointer';
      left.onclick = () => openChat(f.name);
      r.appendChild(left);

      const right = document.createElement('div');
      const btn = document.createElement('button');
      btn.textContent = 'Open';
      btn.onclick = (e) => { e.stopPropagation(); openChat(f.name); };
      right.appendChild(btn);
      r.appendChild(right);
      friendsList.appendChild(r);
    });
  }

  function openChat(friend) {
    openChatWith = friend;
    chatTitle.textContent = friend;
    chatSub.textContent = `Chatting with ${friend}`;
    composer.style.display = 'flex';
    renderChatArea();
    markMessagesRead(friend);
  }

  function renderChatArea() {
    chatArea.innerHTML = '';
    if (!openChatWith) {
      chatArea.innerHTML = '<div class="empty">Open a friend to start chatting in real time.</div>';
      composer.style.display = 'none';
      return;
    }
    const chat = getChat(loggedInUser, openChatWith);
    if (chat.length === 0) {
      chatArea.innerHTML = '<div class="empty">No messages yet. Say hi 👋</div>';
      return;
    }
    chat.forEach(m => {
      const msg = document.createElement('div');
      msg.className = 'message ' + (m.from === loggedInUser ? 'from-me' : 'from-them');
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '6px';
      header.innerHTML = `<div style="font-size:13px;"><strong>${m.from}</strong> <span class="muted" style="font-size:11px;">${new Date(m.time).toLocaleString()}</span></div>`;

      const controls = document.createElement('div');
      if (m.from === loggedInUser) {
        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.style.marginLeft = '8px';
        del.onclick = (e) => {
          e.stopPropagation();
          if (!confirm('Delete this message for everyone?')) return;
          deleteMessage(openChatWith, m.id);
        };
        controls.appendChild(del);
      }
      header.appendChild(controls);

      const body = document.createElement('div');
      body.innerHTML = escapeHtml(m.text);

      msg.appendChild(header);
      msg.appendChild(body);
      chatArea.appendChild(msg);
    });
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function sendFriendRequest(target) {
    const requests = getFriendRequests();
    if (requests.find(r => r.from === loggedInUser && r.to === target)) return;
    requests.push({ from: loggedInUser, to: target, time: nowTS() });
    saveFriendRequests(requests);
    bc.postMessage({ type:'friendRequest', from: loggedInUser, to: target, time: nowTS() });
    renderSearchResults(searchInput.value);
    alert('Friend request sent to ' + target);
  }

  function acceptRequest(fromUser) {
    let requests = getFriendRequests();
    requests = requests.filter(r => !(r.from === fromUser && r.to === loggedInUser));
    saveFriendRequests(requests);

    const map = getFriendsMap();
    map[loggedInUser] = map[loggedInUser] || [];
    map[fromUser] = map[fromUser] || [];
    if (!map[loggedInUser].includes(fromUser)) map[loggedInUser].push(fromUser);
    if (!map[fromUser].includes(loggedInUser)) map[fromUser].push(loggedInUser);
    saveFriendsMap(map);
    bc.postMessage({ type: 'friendAccepted', by: loggedInUser, with: fromUser, time: nowTS() });
    renderSearchResults(searchInput.value);
    renderFriendsList();
    alert('You are now friends with ' + fromUser);
  }

  function sendMessage(toUser, text) {
    const keyA = loggedInUser, keyB = toUser;
    const messages = getChat(keyA, keyB);
    const m = { id: makeId(), from: loggedInUser, to: toUser, text: text, time: nowTS(), read: false };
    messages.push(m);
    saveChat(keyA,keyB,messages);
    bc.postMessage({ type:'newMessage', from: loggedInUser, to: toUser, message: m });
    renderChatArea();
    renderFriendsList();
  }

  function deleteMessage(friend, messageId) {
    const a = loggedInUser, b = friend;
    let chat = getChat(a,b);
    const exists = chat.some(x => x.id === messageId && x.from === loggedInUser);
    if (!exists) {
      alert('You may only delete messages that you sent.');
      return;
    }
    chat = chat.filter(x => x.id !== messageId);
    saveChat(a,b,chat);
    bc.postMessage({ type: 'deleteMessage', by: loggedInUser, with: friend, messageId, time: nowTS() });
    renderChatArea();
    renderFriendsList();
  }

  function clearChat(friend) {
    saveChat(loggedInUser, friend, []);
    saveChat(friend, loggedInUser, []);
    bc.postMessage({ type: 'clearChat', by: loggedInUser, with: friend, time: nowTS() });
    renderChatArea();
    renderFriendsList();
    alert('Chat cleared with ' + friend);
  }

  function removeFriend(friend) {
    const map = getFriendsMap();
    map[loggedInUser] = (map[loggedInUser] || []).filter(x => x !== friend);
    map[friend] = (map[friend] || []).filter(x => x !== loggedInUser);
    saveFriendsMap(map);

    bc.postMessage({ type: 'removeFriend', by: loggedInUser, with: friend, time: nowTS() });

    if (openChatWith === friend) {
      openChatWith = null;
      chatTitle.textContent = 'Select a friend to chat';
      chatSub.textContent = 'No chat open';
      composer.style.display = 'none';
      chatArea.innerHTML = '<div class="empty">Open a friend to start chatting in real time.</div>';
    }
    renderFriendsList();
    renderSearchResults(searchInput.value);
    alert('Removed ' + friend + '. You can search and send a request again if you want.');
  }

  function markMessagesRead(friend) {
    const messages = getChat(loggedInUser, friend);
    let changed = false;
    messages.forEach(m => {
      if (m.to === loggedInUser && !m.read) { m.read = true; changed = true; }
    });
    if (changed) saveChat(loggedInUser, friend, messages);
    renderFriendsList();
  }

  function escapeHtml(s){
    return (s+'').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  // --- Events ---
  searchBtn.addEventListener('click', () => renderSearchResults(searchInput.value));
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') renderSearchResults(searchInput.value);
  });

  sendBtn.addEventListener('click', () => {
    const txt = messageInput.value.trim();
    if (!txt || !openChatWith) return;
    sendMessage(openChatWith, txt);
    messageInput.value = '';
  });

  messageInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendBtn.click(); });

  // wire the header buttons placed in HTML
  clearChatBtn.addEventListener('click', () => {
    if (!openChatWith) { alert('Open a friend chat first'); return; }
    if (!confirm('Clear entire chat with ' + openChatWith + '? This will delete all messages for both users.')) return;
    clearChat(openChatWith);
  });
  removeFriendBtn.addEventListener('click', () => {
    if (!openChatWith) { alert('Open a friend chat first'); return; }
    if (!confirm('Remove ' + openChatWith + ' from friends?')) return;
    removeFriend(openChatWith);
  });

  // BroadcastChannel messages (real-time simulation)
  bc.onmessage = (ev) => {
    const d = ev.data;
    if (!d || !d.type) return;
    if (d.type === 'friendRequest') {
      if (d.to === loggedInUser) {
        renderSearchResults(searchInput.value);
        renderFriendsList();
      }
    } else if (d.type === 'friendAccepted') {
      renderSearchResults(searchInput.value);
      renderFriendsList();
    } else if (d.type === 'newMessage') {
      const m = d.message;
      const keyA = d.from, keyB = d.to;
      const chat = getChat(keyA, keyB);
      const exists = chat.some(x => x.id === m.id);
      if (!exists) {
        chat.push(m);
        saveChat(keyA, keyB, chat);
      }
      if (d.to === loggedInUser && openChatWith === d.from) {
        const chat2 = getChat(loggedInUser, d.from);
        chat2.forEach(x => { if (x.to === loggedInUser) x.read = true; });
        saveChat(loggedInUser, d.from, chat2);
      }
      if (d.to === loggedInUser || d.from === loggedInUser) {
        renderChatArea();
        renderFriendsList();
      }
    } else if (d.type === 'deleteMessage') {
      const a = d.by, b = d.with;
      const chat = getChat(a,b).filter(x => x.id !== d.messageId);
      saveChat(a,b,chat);
      if (openChatWith === (d.by === loggedInUser ? d.with : d.by) || d.by === loggedInUser || d.with === loggedInUser) {
        renderChatArea();
        renderFriendsList();
      }
    } else if (d.type === 'clearChat') {
      saveChat(d.by, d.with, []);
      saveChat(d.with, d.by, []);
      if (openChatWith === d.with || openChatWith === d.by) {
        renderChatArea();
        renderFriendsList();
      }
    } else if (d.type === 'removeFriend') {
      const map = getFriendsMap();
      map[d.by] = (map[d.by] || []).filter(x => x !== d.with);
      map[d.with] = (map[d.with] || []).filter(x => x !== d.by);
      saveFriendsMap(map);
      renderFriendsList();
      renderSearchResults(searchInput.value);
      if (openChatWith === d.with || openChatWith === d.by) {
        if (openChatWith === d.with) {
          openChatWith = null;
          chatTitle.textContent = 'Select a friend to chat';
          chatSub.textContent = 'No chat open';
          composer.style.display = 'none';
          chatArea.innerHTML = '<div class="empty">Open a friend to start chatting in real time.</div>';
        } else {
          renderChatArea();
        }
      }
    }
  };

  window.addEventListener('storage', (e) => {
    renderSearchResults(searchInput.value);
    renderFriendsList();
    if (openChatWith) renderChatArea();
  });

  // --- Init: ensure maps exist ---
  (function initMaps(){
    const map = getFriendsMap();
    if (!map[loggedInUser]) map[loggedInUser] = map[loggedInUser] || [];
    saveFriendsMap(map);
  })();

  // --- initial render ---
  renderSearchResults('');
  renderFriendsList();

  // Debug helpers
  window.__chatApp = {
    getUsers, getFriendRequests, getFriendsMap, getChat
  };
})();
