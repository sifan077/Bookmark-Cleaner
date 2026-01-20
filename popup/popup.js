let duplicateBookmarks = [];

document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scanBtn');
  const cleanBtn = document.getElementById('cleanBtn');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('resultList');

  scanBtn.addEventListener('click', scanDuplicates);
  cleanBtn.addEventListener('click', cleanDuplicates);
});

async function scanDuplicates() {
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('resultList');
  const scanBtn = document.getElementById('scanBtn');
  const cleanBtn = document.getElementById('cleanBtn');

  statusEl.textContent = '正在扫描...';
  scanBtn.disabled = true;
  cleanBtn.disabled = true;
  resultEl.innerHTML = '';

  try {
    const bookmarks = await getAllBookmarks();
    duplicateBookmarks = findDuplicates(bookmarks);

    if (duplicateBookmarks.length === 0) {
      statusEl.textContent = '扫描完成：未发现重复书签';
      resultEl.innerHTML = '<div class="no-duplicates">没有重复的书签</div>';
    } else {
      statusEl.textContent = `扫描完成：发现 ${duplicateBookmarks.length} 组重复书签`;
      displayResults(duplicateBookmarks);
      cleanBtn.disabled = false;
    }
  } catch (error) {
    statusEl.textContent = '扫描失败：' + error.message;
    console.error(error);
  }

  scanBtn.disabled = false;
}

async function getAllBookmarks() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((bookmarkTree) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        const bookmarks = [];
        traverseBookmarks(bookmarkTree, bookmarks);
        resolve(bookmarks);
      }
    });
  });
}

function traverseBookmarks(nodes, bookmarks) {
  for (const node of nodes) {
    if (node.url) {
      bookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        dateAdded: node.dateAdded
      });
    }
    if (node.children) {
      traverseBookmarks(node.children, bookmarks);
    }
  }
}

function findDuplicates(bookmarks) {
  const urlMap = new Map();

  for (const bookmark of bookmarks) {
    const normalizedUrl = normalizeUrl(bookmark.url);
    if (!urlMap.has(normalizedUrl)) {
      urlMap.set(normalizedUrl, []);
    }
    urlMap.get(normalizedUrl).push(bookmark);
  }

  const duplicates = [];
  for (const [url, items] of urlMap) {
    if (items.length > 1) {
      duplicates.push({
        url: items[0].url,
        items: items.sort((a, b) => b.dateAdded - a.dateAdded)
      });
    }
  }

  return duplicates;
}

function normalizeUrl(url) {
  try {
    let normalized = url.trim().toLowerCase();
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  } catch (error) {
    return url;
  }
}

function displayResults(duplicates) {
  const resultEl = document.getElementById('resultList');

  duplicates.forEach((group, index) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'duplicate-group';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'duplicate-title';
    titleDiv.textContent = `重复组 ${index + 1}: ${group.items.length} 个重复项`;
    groupDiv.appendChild(titleDiv);

    group.items.forEach((item, itemIndex) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'duplicate-item';
      const badge = itemIndex === 0 ? ' [保留]' : ' [删除]';
      itemDiv.textContent = `${item.title}${badge}`;
      itemDiv.title = item.url;
      groupDiv.appendChild(itemDiv);
    });

    resultEl.appendChild(groupDiv);
  });
}

async function cleanDuplicates() {
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('resultList');
  const cleanBtn = document.getElementById('cleanBtn');

  if (!confirm(`确定要删除 ${duplicateBookmarks.length} 组重复书签吗？每组将保留最新的一个。`)) {
    return;
  }

  statusEl.textContent = '正在清理...';
  cleanBtn.disabled = true;

  try {
    let deletedCount = 0;

    for (const group of duplicateBookmarks) {
      for (let i = 1; i < group.items.length; i++) {
        await removeBookmark(group.items[i].id);
        deletedCount++;
      }
    }

    statusEl.textContent = `清理完成：已删除 ${deletedCount} 个重复书签`;
    resultEl.innerHTML = '<div class="no-duplicates">重复书签已清理</div>';
    duplicateBookmarks = [];
  } catch (error) {
    statusEl.textContent = '清理失败：' + error.message;
    console.error(error);
  }
}

function removeBookmark(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.remove(id, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}