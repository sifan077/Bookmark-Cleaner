let duplicateBookmarks = [];
let selectedBookmarks = new Set();
let bookmarkPathMap = new Map();

document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scanBtn');
  const cleanBtn = document.getElementById('cleanBtn');
  const selectAll = document.getElementById('selectAll');

  scanBtn.addEventListener('click', scanDuplicates);
  cleanBtn.addEventListener('click', cleanDuplicates);
  selectAll.addEventListener('change', toggleSelectAll);
});

async function scanDuplicates() {
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('resultList');
  const scanBtn = document.getElementById('scanBtn');
  const cleanBtn = document.getElementById('cleanBtn');
  const selectSection = document.getElementById('selectSection');

  statusEl.textContent = '正在扫描...';
  scanBtn.disabled = true;
  cleanBtn.disabled = true;
  resultEl.innerHTML = '';
  selectSection.style.display = 'none';
  selectedBookmarks.clear();

  try {
    const stats = await getBookmarkStats();
    displayStats(stats);

    const bookmarks = await getAllBookmarks();
    duplicateBookmarks = findDuplicates(bookmarks);

    if (duplicateBookmarks.length === 0) {
      statusEl.textContent = '扫描完成：未发现重复书签';
      resultEl.innerHTML = '<div class="no-duplicates">没有重复的书签</div>';
    } else {
      statusEl.textContent = `扫描完成：发现 ${duplicateBookmarks.length} 组重复书签`;
      displayResults(duplicateBookmarks);
      selectSection.style.display = 'flex';
      cleanBtn.disabled = true;
    }
  } catch (error) {
    statusEl.textContent = '扫描失败：' + error.message;
    console.error(error);
  }

  scanBtn.disabled = false;
}

async function getBookmarkStats() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((bookmarkTree) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        let totalBookmarks = 0;
        let totalFolders = 0;
        const pathMap = new Map();

        function traverse(nodes, path) {
          for (const node of nodes) {
            const currentPath = path ? `${path} / ${node.title}` : node.title;
            pathMap.set(node.id, currentPath);

            if (node.url) {
              totalBookmarks++;
            } else if (node.children) {
              totalFolders++;
              traverse(node.children, currentPath);
            }
          }
        }

        traverse(bookmarkTree, '');
        bookmarkPathMap = pathMap;

        resolve({
          totalBookmarks,
          totalFolders,
          duplicateGroups: 0
        });
      }
    });
  });
}

function displayStats(stats) {
  document.getElementById('totalBookmarks').textContent = stats.totalBookmarks;
  document.getElementById('totalFolders').textContent = stats.totalFolders;
  document.getElementById('duplicateGroups').textContent = stats.duplicateGroups;
  document.getElementById('selectedToDelete').textContent = '0';
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
        dateAdded: node.dateAdded,
        path: bookmarkPathMap.get(node.id) || '未知文件夹'
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
  const stats = {
    totalBookmarks: parseInt(document.getElementById('totalBookmarks').textContent),
    totalFolders: parseInt(document.getElementById('totalFolders').textContent),
    duplicateGroups: duplicates.length
  };
  document.getElementById('duplicateGroups').textContent = stats.duplicateGroups;

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
      itemDiv.dataset.id = item.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `bookmark-${item.id}`;
      checkbox.disabled = itemIndex === 0;
      checkbox.addEventListener('change', (e) => toggleBookmarkSelection(item.id, e.target));

      const contentDiv = document.createElement('div');
      contentDiv.className = 'duplicate-item-content';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'duplicate-item-title';
      titleDiv.textContent = item.title || '(无标题)';
      contentDiv.appendChild(titleDiv);

      const folderDiv = document.createElement('div');
      folderDiv.className = 'duplicate-item-folder';
      folderDiv.textContent = item.path;
      contentDiv.appendChild(folderDiv);

      const urlDiv = document.createElement('div');
      urlDiv.className = 'duplicate-item-url';
      urlDiv.textContent = item.url;
      contentDiv.appendChild(urlDiv);

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(contentDiv);
      groupDiv.appendChild(itemDiv);
    });

    resultEl.appendChild(groupDiv);
  });
}

function toggleBookmarkSelection(id, checkbox) {
  const itemDiv = checkbox.closest('.duplicate-item');
  
  if (checkbox.checked) {
    selectedBookmarks.add(id);
    itemDiv.classList.add('selected');
  } else {
    selectedBookmarks.delete(id);
    itemDiv.classList.remove('selected');
  }

  document.getElementById('selectedToDelete').textContent = selectedBookmarks.size;
  document.getElementById('cleanBtn').disabled = selectedBookmarks.size === 0;
  
  updateSelectAllCheckbox();
}

function toggleSelectAll(e) {
  const checkboxes = document.querySelectorAll('.duplicate-item input[type="checkbox"]:not(:disabled)');
  
  checkboxes.forEach(checkbox => {
    const id = parseInt(checkbox.id.replace('bookmark-', ''));
    checkbox.checked = e.target.checked;
    
    const itemDiv = checkbox.closest('.duplicate-item');
    if (e.target.checked) {
      selectedBookmarks.add(id);
      itemDiv.classList.add('selected');
    } else {
      selectedBookmarks.delete(id);
      itemDiv.classList.remove('selected');
    }
  });

  document.getElementById('selectedToDelete').textContent = selectedBookmarks.size;
  document.getElementById('cleanBtn').disabled = selectedBookmarks.size === 0;
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('selectAll');
  const checkboxes = document.querySelectorAll('.duplicate-item input[type="checkbox"]:not(:disabled)');
  
  if (checkboxes.length === 0) {
    selectAll.checked = false;
    return;
  }

  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  selectAll.checked = allChecked;
}

async function cleanDuplicates() {
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('resultList');
  const cleanBtn = document.getElementById('cleanBtn');

  if (selectedBookmarks.size === 0) {
    return;
  }

  if (!confirm(`确定要删除选中的 ${selectedBookmarks.size} 个重复书签吗？`)) {
    return;
  }

  statusEl.textContent = '正在清理...';
  cleanBtn.disabled = true;

  try {
    let deletedCount = 0;

    for (const id of selectedBookmarks) {
      await removeBookmark(id);
      deletedCount++;
    }

    statusEl.textContent = `清理完成：已删除 ${deletedCount} 个重复书签`;
    resultEl.innerHTML = '<div class="no-duplicates">重复书签已清理</div>';
    document.getElementById('selectSection').style.display = 'none';
    selectedBookmarks.clear();
    duplicateBookmarks = [];
    
    await getBookmarkStats().then(displayStats);
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