// ===== 心智圖編輯器（改寫自「剛好系列 心智圖工具」）=====
// 三種模式：
//   ?embed=<id>       放在大屏畫面的視窗中，資料直接讀寫上層頁面的 mindmapItems
//   /m/<存檔>/<id>    分享頁面，從 API 讀取心智圖，只能瀏覽
//   其他              單純的心智圖編輯器（不儲存）

function initMind() {
  const jm = new jsMind({
    container: 'jsmind_container',
    theme: 'greensea',
    editable: true,
    support_html: true,
    view: { engine: 'canvas', draggable: true }
  });
  jm.show({
    meta: { name: 'xmind_clone' },
    format: 'node_tree',
    data: { id: 'root', topic: 'Root', children: [] }
  });
  return jm;
}

function parseMarkdown(mdText) {
  const lines = mdText.split('\n').filter(l => l.trim());
  const root = { id: 'root', topic: 'Root', children: [] }, stack = [root];
  const linkRegex = /\!\[([^\]]*)\]\(([^\)]*)\)|\[([^\]]*)\]\(([^\)]*)\)/; // ![alt](src) or [text](href)

  lines.forEach(line => {
    let level = 0, text = '';
    const m = line.match(/^(#+)\s+(.*)/);
    if (m) { level = m[1].length; text = m[2]; } 
    else if (/^-\s+/.test(line)) { level = 4; text = line.replace(/^-\s+/, ''); } 
    else if (/^(\s*)\*\s+(.*)/.test(line)) {
      const asteriskMatch = line.match(/^(\s*)\*\s+(.*)/);
      const indentLength = asteriskMatch[1].length;
      level = Math.floor(indentLength / 2) + 1; // Convert spaces to levels (2 spaces = 1 level)
      text = asteriskMatch[2];
    }
    else return;

    let nodeData = {};
    let topicText = text;
    const linkMatch = text.match(linkRegex);

    if (linkMatch) {
      if (linkMatch[1] !== undefined) { // Image ![alt](src)
        topicText = linkMatch[1];
        nodeData.image_url = linkMatch[2];
      } else { // Link [text](href)
        topicText = linkMatch[3];
        nodeData.hyperlink = linkMatch[4];
      }
    }

    const html = buildTopic(nodeData, marked.parseInline(topicText));

    if (level === 1 && stack.length === 1) { 
        root.topic = html; 
        root.data = nodeData;
        return; 
    }
    while (stack.length >= level) stack.pop();
    const nid = jsMind.util.uuid.newid();
    const node = { id: nid, topic: html, children: [], data: nodeData };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  return { meta: { name: 'md_import' }, format: 'node_tree', data: root };
}

const getCleanTopic = (topic) => {
  if (!topic) return '';
  // Removes all icon span/anchor tags
  return topic.replace(/<(a|span)[^>]*>.*?<\/\1>\s*/g, '');
};

  const buildTopic = (nodeData, cleanTopic) => {
    if (nodeData && nodeData.image_url) {
      // 圖片可能是很長的 data URL，點擊時從 data-image-url 讀取，不在 onclick 中再存一份
      return `<a href="javascript:void(0)" class="mindmap-image-link" onclick="viewLargeImage(event, this.dataset.imageUrl)" data-image-url="${nodeData.image_url}">🖼️</a> ${cleanTopic}`;
    }
    if (nodeData && nodeData.hyperlink) {
      return `<a href="${nodeData.hyperlink}" target="_blank" onclick="event.stopPropagation()" data-hyperlink="${nodeData.hyperlink}">🔗</a> ${cleanTopic}`;
    }
    return cleanTopic;
  }
function getDepth(node) {
  let d = 0, c = node;
  while (c.parent) { d++; c = c.parent; }
  return d;
}

function applyLayerColors(jm) {
  const palette = ['#e53935', '#1e88e5', '#fb8c00', '#9c27b0', '#8e24aa'];
  Object.values(jm.mind.nodes).forEach(n => {
    const d = getDepth(n);
    if (d > 0) jm.set_node_color(n.id, palette[(d - 1) % palette.length], null);
  });
}

function enablePanAndZoom(container) {
    const panel = container.querySelector('.jsmind-inner') || container;
    let isPanning = false, startX = 0, startY = 0;
    let scale = 1, panX = 0, panY = 0;
    let lastTouchDistance = 0;

    function getTransformValues() {
        const transform = panel.style.transform;
        const scaleMatch = transform.match(/scale\(([^)]+)\)/); 
        const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/); 
        scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
        panX = translateMatch ? parseFloat(translateMatch[1]) : 0;
        panY = translateMatch ? parseFloat(translateMatch[2]) : 0;
    }
    
    function updateTransform() { panel.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`; }

    function onMouseDown(e) { if (e.target.closest('.jsmind-node') || e.target.hasAttribute('nodeid') || e.target.classList.contains('jsmind-editor-input')) return; if (e.button !== 0) return; isPanning = true; container.classList.add('grabbing'); startX = e.clientX; startY = e.clientY; getTransformValues(); e.preventDefault(); }    function onMouseMove(e) { if (!isPanning) return; const dx = e.clientX - startX, dy = e.clientY - startY; panX += dx; panY += dy; startX = e.clientX; startY = e.clientY; updateTransform(); e.preventDefault(); }    function onMouseUp(e) { if (!isPanning) return; isPanning = false; container.classList.remove('grabbing'); e.preventDefault(); }    function onWheel(e) { e.preventDefault(); getTransformValues(); const rect = container.getBoundingClientRect(), mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top; const oldScale = scale, delta = e.deltaY > 0 ? 0.9 : 1.1; scale = Math.max(0.1, Math.min(5, scale * delta)); panX = mouseX - (mouseX - panX) * (scale / oldScale); panY = mouseY - (mouseY - panY) * (scale / oldScale); updateTransform(); }    function onTouchStart(e) { if (e.target.closest('.jsmind-node') || e.target.hasAttribute('nodeid') || e.target.classList.contains('jsmind-editor-input')) return; getTransformValues(); if (e.touches.length === 1) { isPanning = true; container.classList.add('grabbing'); startX = e.touches[0].clientX; startY = e.touches[0].clientY; } else if (e.touches.length === 2) { isPanning = false; const t1 = e.touches[0], t2 = e.touches[1]; lastTouchDistance = Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2)); } e.preventDefault(); }    function onTouchMove(e) { e.preventDefault(); if (e.touches.length === 1 && isPanning) { const touch = e.touches[0], dx = touch.clientX - startX, dy = touch.clientY - startY; panX += dx; panY += dy; startX = touch.clientX; startY = touch.clientY; updateTransform(); } else if (e.touches.length === 2) { const t1 = e.touches[0], t2 = e.touches[1]; const currentTouchDistance = Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2)); const rect = container.getBoundingClientRect(), centerX = (t1.clientX + t2.clientX) / 2 - rect.left, centerY = (t1.clientY + t2.clientY) / 2 - rect.top; const oldScale = scale, delta = currentTouchDistance / lastTouchDistance; scale = Math.max(0.1, Math.min(5, scale * delta)); panX = centerX - (centerX - panX) * (scale / oldScale); panY = centerY - (centerY - panY) * (scale / oldScale); lastTouchDistance = currentTouchDistance; updateTransform(); } }     function onTouchEnd(e) { if (isPanning) { isPanning = false; container.classList.remove('grabbing'); } if (e.touches.length < 2) { lastTouchDistance = 0; } }    container.addEventListener('mousedown', onMouseDown); container.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);    container.addEventListener('wheel', onWheel, { passive: false });    container.addEventListener('touchstart', onTouchStart, { passive: false }); container.addEventListener('touchmove', onTouchMove, { passive: false }); container.addEventListener('touchend', onTouchEnd); 
}

function nodeToMarkdown(node, depth = 1) { 
  let md = ''; 
  if (!node) return md; 

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = node.topic;

  const plainTopic = (tempDiv.textContent || tempDiv.innerText || '').replace(/^(🔗|🖼️)\s*/, '').replace(/\n/g, ' ');
  let line = '#'.repeat(depth) + ' ';

  const imageEl = tempDiv.querySelector('a[data-image-url]');
  const linkEl = tempDiv.querySelector('a[data-hyperlink]');

  if (imageEl) {
    line += `![${plainTopic}](${imageEl.getAttribute('data-image-url')})`;
  } else if (linkEl) {
    line += `[${plainTopic}](${linkEl.getAttribute('data-hyperlink')})`;
  } else {
    line += plainTopic;
  }
  md += line + '\n';

  if (node.children && node.children.length > 0) { 
    for (const child of node.children) { 
      md += nodeToMarkdown(child, depth + 1); 
    } 
  } 
  return md; 
}

function exportToMarkdown(jm) {
  const mindData = jm.get_data('node_tree');
  if (!mindData || !mindData.data) {
    alert('沒有可以匯出的心智圖資料');
    return;
  }
  const markdown = nodeToMarkdown(mindData.data),
        title = (mindData.data.topic || 'mindmap').replace(/<[^>]+>/g, '');
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = title + '.md';
  link.click();
}

function expandAllNodes(jm) {
  const rootNode = jm.get_root();
  const expandNode = (node) => {
    if (node && !node.isroot) {
      jm.expand_node(node.id);
    }
    if (node && node.children) {
      node.children.forEach(child => expandNode(child));
    }
  };
  expandNode(rootNode);
}

function exportToPNG(jm, showNotificationFn) {
  const mindData = jm.get_data('node_tree');
  if (!mindData || !mindData.data) {
    showNotificationFn('沒有可以匯出的心智圖資料', true);
    return;
  }

  const title = (mindData.data.topic || 'mindmap').replace(/<[^>]+>/g, '');

  // 顯示處理中的通知
  showNotificationFn('正在展開所有節點並截圖...');

  // 展開所有節點
  expandAllNodes(jm);

  // 等待DOM更新後進行截圖
  setTimeout(() => {
    const container = document.getElementById('jsmind_container');
    const jsmindInner = container.querySelector('.jsmind-inner');

    if (!jsmindInner) {
      showNotificationFn('找不到心智圖內容', true);
      return;
    }

    // 保存原始樣式
    const originalContainerOverflow = container.style.overflow;
    const originalContainerWidth = container.style.width;
    const originalContainerHeight = container.style.height;
    const originalInnerTransform = jsmindInner.style.transform;

    try {
      // 暫時移除 transform，讓元素回到原始位置
      jsmindInner.style.transform = 'none';

      // 取得心智圖的實際邊界
      const bbox = jsmindInner.getBoundingClientRect();

      // 計算實際內容的寬高（考慮所有子元素）
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const nodes = jsmindInner.querySelectorAll('jmnode, jmnodes');
      nodes.forEach(node => {
        const rect = node.getBoundingClientRect();
        const innerRect = jsmindInner.getBoundingClientRect();
        const relativeLeft = rect.left - innerRect.left;
        const relativeTop = rect.top - innerRect.top;
        minX = Math.min(minX, relativeLeft);
        minY = Math.min(minY, relativeTop);
        maxX = Math.max(maxX, relativeLeft + rect.width);
        maxY = Math.max(maxY, relativeTop + rect.height);
      });

      // 加上邊距
      const padding = 50;
      const contentWidth = maxX - minX + padding * 2;
      const contentHeight = maxY - minY + padding * 2;

      // 暫時調整容器樣式以顯示完整內容
      container.style.overflow = 'visible';
      container.style.width = contentWidth + 'px';
      container.style.height = contentHeight + 'px';

      // 調整 jsmindInner 的位置，確保所有內容都在可見區域內
      jsmindInner.style.transform = `translate(${padding - minX}px, ${padding - minY}px)`;

      // 使用 requestAnimationFrame 確保樣式已應用
      requestAnimationFrame(() => {
        // 使用html2canvas截圖
        html2canvas(jsmindInner, {
          backgroundColor: '#ecf0f1',
          scale: 2, // 提高解析度
          logging: false,
          useCORS: true,
          allowTaint: true,
          width: contentWidth,
          height: contentHeight,
          windowWidth: contentWidth,
          windowHeight: contentHeight,
          x: 0,
          y: 0
        }).then(canvas => {
          // 恢復原始樣式
          container.style.overflow = originalContainerOverflow;
          container.style.width = originalContainerWidth;
          container.style.height = originalContainerHeight;
          jsmindInner.style.transform = originalInnerTransform;

          // 將canvas轉換為blob並下載
          canvas.toBlob((blob) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = title + '.png';
            link.click();
            showNotificationFn('PNG 圖片已下載！');
          }, 'image/png');
        }).catch(err => {
          // 恢復原始樣式
          container.style.overflow = originalContainerOverflow;
          container.style.width = originalContainerWidth;
          container.style.height = originalContainerHeight;
          jsmindInner.style.transform = originalInnerTransform;

          console.error('截圖失敗:', err);
          showNotificationFn('截圖失敗，請稍後再試', true);
        });
      });
    } catch (error) {
      // 確保發生錯誤時也能恢復樣式
      container.style.overflow = originalContainerOverflow;
      container.style.width = originalContainerWidth;
      container.style.height = originalContainerHeight;
      jsmindInner.style.transform = originalInnerTransform;

      console.error('準備截圖時發生錯誤:', error);
      showNotificationFn('截圖準備失敗，請稍後再試', true);
    }
  }, 500); // 等待500ms讓節點完全展開
}

// --- Main Logic ---
document.addEventListener('DOMContentLoaded', () => {
  // --- 模式判斷 ---
  const embedId = new URLSearchParams(location.search).get('embed');
  const shareMatch = location.pathname.match(/^\/m\/([^/]+)\/([^/]+)$/);
  const host = embedId && window.parent !== window ? window.parent : null;
  const viewOnly = !!shareMatch;
  if (viewOnly) document.body.classList.add('view-only');

  // 分享頁面先以可編輯模式建立（節點上色需要），載入後再關閉編輯
  const jm = initMind();
  window.jm = jm; // 投影片影片匯出功能從 window.jm 取得心智圖
  applyLayerColors(jm);

  // 放在畫面上時，每次修改（稍作延遲）就寫回上層頁面的心智圖清單，隨畫面一起雲端存檔
  let saveTimer = null;
  const scheduleSave = () => {
    if (!host) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => host.updateMindmapData(embedId, jm.get_data('node_tree')), 300);
  };
  jm.add_event_listener(type => {
    if (jm.get_editable()) applyLayerColors(jm);
    if (type === jsMind.event_type.edit) scheduleSave();
  });

  // --- Element References ---
  const menuToggle = document.getElementById('menu_toggle'), topMenu = document.getElementById('top_menu');
  const linkModalOverlay = document.getElementById('link_modal_overlay'), linkUrlInput = document.getElementById('link_url_input');
  const imageUrlModalOverlay = document.getElementById('image_url_modal_overlay'), imageUrlInput = document.getElementById('image_url_input');
  const imageFileInput = document.getElementById('image_file_input'), uploadStatus = document.getElementById('upload_status');
  const mdImportModalOverlay = document.getElementById('md_import_modal_overlay'), mdFileInput = document.getElementById('md_file_input'), mdTextInput = document.getElementById('md_text_input');
  const notificationLayer = document.getElementById('notification_layer');
  let notificationTimer;
  let linkEditingNodeId = null;
  let imageEditingNodeId = null;

  // --- Presentation Mode Variables ---
  let presentationSlides = [];
  let currentSlideIndex = 0;
  let isInPresentationMode = false;

  // --- Helper Functions ---
  const showNotification = (message, isError = false) => {
    clearTimeout(notificationTimer);
    notificationLayer.textContent = message;
    notificationLayer.className = isError ? 'error' : 'success';
    notificationLayer.classList.add('show');
    notificationTimer = setTimeout(() => { notificationLayer.classList.remove('show'); }, isError ? 5000 : 3000);
  };

  function copyTextToClipboard(text, successMessage, errorMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          showNotification(successMessage || '已複製到剪貼簿！');
        })
        .catch(err => {
          fallbackCopyText(text, successMessage, errorMessage);
        });
    } else {
      fallbackCopyText(text, successMessage, errorMessage);
    }
  }

  function fallbackCopyText(text, successMessage, errorMessage) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showNotification(successMessage || '已複製到剪貼簿！');
      } else {
        showNotification(errorMessage || '複製失敗，請手動複製。', true);
      }
    } catch (err) {
      showNotification(errorMessage || '複製失敗，請手動複製。', true);
    }
    document.body.removeChild(textArea);
  }

  // --- Local Image Upload and Compression (Max 800px) ---
  if (imageFileInput) {
    imageFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // 檢查是否為圖片檔案
      if (!file.type.startsWith('image/')) {
        showNotification('請選擇圖片檔案！', true);
        return;
      }

      uploadStatus.textContent = '讀取圖片中...';
      uploadStatus.style.color = '#ffd54f';

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // 計算等比例壓縮
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            if (width > height) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            } else {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          // 繪製到 Canvas 上
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // 壓縮為 JPEG，畫質設定為 0.82
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);

          // 壓縮後的圖片直接存在心智圖中（隨畫面一起雲端存檔）
          imageUrlInput.value = compressedBase64;
          uploadStatus.textContent = '圖片已壓縮（約 ' + Math.round(compressedBase64.length * 3 / 4 / 1024) + ' KB），點選儲存以插入圖片。';
          uploadStatus.style.color = '#388e3c';
        };
        img.onerror = () => {
          uploadStatus.textContent = '圖片解析失敗！';
          uploadStatus.style.color = '#e74c3c';
        };
        img.src = event.target.result;
      };
      reader.onerror = () => {
        uploadStatus.textContent = '讀取檔案失敗！';
        uploadStatus.style.color = '#e74c3c';
      };
      reader.readAsDataURL(file);
    });
  }

  // --- Presentation Mode Functions ---
  const generatePresentationSlides = (mindData) => {
    const slides = [];
    const rootNode = mindData.data;
    
    const traverseNode = (node, breadcrumb = [], parentNode = null) => {
      const cleanTopic = getCleanTopic(node.topic);
      slides.push({
        title: cleanTopic,
        parentNode: parentNode,
        breadcrumb: [...breadcrumb],
        node: node
      });
      
      if (node.children && node.children.length > 0) {
        const currentBreadcrumb = [...breadcrumb, cleanTopic];
        node.children.forEach(child => {
          traverseNode(child, currentBreadcrumb, node);
        });
      }
    };
    traverseNode(rootNode);
    return slides;
  };

  const showPresentationSlide = (index, direction = 'none') => {
    if (index < 0 || index >= presentationSlides.length) return;
    
    const slide = presentationSlides[index];
    const overlay = document.getElementById('presentation_overlay');
    const breadcrumbCorner = overlay.querySelector('.presentation-breadcrumb-corner');
    const title = overlay.querySelector('.presentation-title');
    const counter = overlay.querySelector('.slide-counter');
    const prevBtn = document.getElementById('btn_prev_slide');
    const nextBtn = document.getElementById('btn_next_slide');
    
    breadcrumbCorner.innerHTML = slide.parentNode ? slide.parentNode.topic : '';
    
    let titleText = slide.node.topic || slide.title;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = titleText;
    const cleanText = tempDiv.textContent || tempDiv.innerText || '';
    const formattedText = cleanText.replace(/([。、，；：！？])/g, '$1<br>');
    
    if (direction !== 'none') {
      title.className = 'presentation-title fade-out';
      setTimeout(() => {
        title.innerHTML = formattedText;
        title.className = 'presentation-title fade-in';
        setTimeout(() => {
          title.className = 'presentation-title active';
        }, 50);
      }, 1200);
    } else {
      title.innerHTML = formattedText;
      title.className = 'presentation-title active';
    }
    
    counter.textContent = `${index + 1} / ${presentationSlides.length}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === presentationSlides.length - 1;
    currentSlideIndex = index;
  };

  const startPresentationMode = () => {
    const mindData = jm.get_data('node_tree');
    if (!mindData || !mindData.data) {
      showNotification('沒有可以播放的心智圖資料', true);
      return;
    }
    
    presentationSlides = generatePresentationSlides(mindData);
    if (presentationSlides.length === 0) {
      showNotification('心智圖沒有內容可以播放', true);
      return;
    }
    
    isInPresentationMode = true;
    currentSlideIndex = 0;
    const overlay = document.getElementById('presentation_overlay');
    overlay.style.display = 'block';
    showPresentationSlide(0);
    showNotification('簡報模式已啟動，使用方向鍵或按鈕導航');
  };

  const exitPresentationMode = () => {
    isInPresentationMode = false;
    document.getElementById('presentation_overlay').style.display = 'none';
    showNotification('已退出簡報模式');
  };

  const nextSlide = () => {
    if (currentSlideIndex < presentationSlides.length - 1) {
      showPresentationSlide(currentSlideIndex + 1, 'slide');
    }
  };

  const prevSlide = () => {
    if (currentSlideIndex > 0) {
      showPresentationSlide(currentSlideIndex - 1, 'slide');
    }
  };

  // --- Menu Logic ---
  menuToggle.addEventListener('click', () => { menuToggle.classList.toggle('active'); topMenu.classList.toggle('active'); });

  // --- Node Operations ---
  document.getElementById('btn_add_child').onclick = () => { const sel = jm.get_selected_node(), nid = jsMind.util.uuid.newid(); jm.add_node(sel, nid, 'New Node'); jm.select_node(nid); };
  document.getElementById('btn_add_sibling').onclick = () => { const sel = jm.get_selected_node(); if (sel.isroot) return alert('根節點無法新增同階'); jm.add_node(sel.parent, jsMind.util.uuid.newid(), 'New Node'); };
  document.getElementById('btn_delete').onclick = () => { const sel = jm.get_selected_node(); if (sel.isroot) return alert('無法刪除根節點'); jm.remove_node(sel.id); };
  
  // --- Toggle All Nodes ---
  let allExpanded = true;
  document.getElementById('btn_toggle_all').onclick = () => {
    const rootNode = jm.get_root();
    if (allExpanded) {
      const collapseNode = (node) => {
        if (node && !node.isroot && node.children && node.children.length > 0) {
          jm.collapse_node(node.id);
        }
        if (node && node.children) {
          node.children.forEach(child => collapseNode(child));
        }
      };
      collapseNode(rootNode);
      allExpanded = false;
      showNotification('已收合所有節點');
    } else {
      const expandNode = (node) => {
        if (node && !node.isroot) {
          jm.expand_node(node.id);
        }
        if (node && node.children) {
          node.children.forEach(child => expandNode(child));
        }
      };
      expandNode(rootNode);
      allExpanded = true;
      showNotification('已展開所有節點');
    }
  };

  // --- Presentation Mode Click bindings ---
  document.getElementById('btn_presentation').onclick = startPresentationMode;
  document.getElementById('btn_exit_presentation').onclick = exitPresentationMode;
  document.getElementById('btn_prev_slide').onclick = prevSlide;
  document.getElementById('btn_next_slide').onclick = nextSlide;

  let isReordered = false;
  document.getElementById('btn_reorder').onclick = () => {
    const root = jm.get_root();
    if (!root || !root.children || root.children.length < 2) {
      showNotification('至少需要2個二階節點才能重新排列', true);
      return;
    }
    isReordered = !isReordered;
    const children = root.children;
    const midpoint = Math.ceil(children.length / 2);

    if (isReordered) {
      for (let i = 0; i < children.length; i++) {
        const direction = i < midpoint ? jsMind.direction.right : jsMind.direction.left;
        children[i].direction = direction;
      }
      showNotification('已切換為左右排列');
    } else {
      for (const child of children) {
        child.direction = jsMind.direction.right;
      }
      showNotification('已恢復單側排列');
    }
    jm.layout.layout();
    jm.view.show(false);
    scheduleSave();
  };

  // --- File Operations ---
  // --- Markdown Import ---
  document.getElementById('btn_open_md_import').onclick = () => {
    mdImportModalOverlay.style.display = 'flex';
  };

  document.getElementById('btn_cancel_md_import').onclick = () => {
    mdImportModalOverlay.style.display = 'none';
  };

  document.getElementById('btn_process_md_import').onclick = () => {
    const text = mdTextInput.value;
    const file = mdFileInput.files[0];

    const processText = (markdownText) => {
      if (markdownText) {
        jm.show(parseMarkdown(markdownText));
        applyLayerColors(jm);
        scheduleSave();
        topMenu.classList.remove('active');
        menuToggle.classList.remove('active');
        mdImportModalOverlay.style.display = 'none';
        mdTextInput.value = '';
        mdFileInput.value = '';
      } else {
        showNotification('沒有提供 Markdown 內容', true);
      }
    };

    if (text) {
      processText(text);
    } else if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        processText(e.target.result);
      };
      reader.readAsText(file);
    } else {
      showNotification('請貼上文字或選擇檔案', true);
    }
  };

  // --- Export to HTML ---
  document.getElementById('btn_download').onclick = () => {
    const data = jm.get_data();
    const title = (data.data.topic || 'mindmap').replace(new RegExp(String.fromCharCode(60) + '[^' + String.fromCharCode(62) + ']+' + String.fromCharCode(62), 'g'), '');
    const panAndZoomFnString = enablePanAndZoom.toString();
    // 輔助函數: 建構 HTML 標籤，避免在原始碼中直接寫出 <tag> 字面量
    const LT = String.fromCharCode(60);
    const GT = String.fromCharCode(62);
    const tag = (name, attrs, inner) => {
      let s = LT + name;
      if (attrs) s += ' ' + attrs;
      s += GT;
      if (inner !== undefined) s += inner + LT + '/' + name + GT;
      return s;
    };

    const presentationJS = [
      'let presentationSlides=[];',
      'let currentSlideIndex=0;',
      'let isInPresentationMode=false;',
      'const getCleanTopic=(topic)=>{',
      '  if(!topic)return \'\';',
      '  var re=new RegExp(String.fromCharCode(60)+"(a|span)[^"+String.fromCharCode(62)+"]*"+String.fromCharCode(62)+".*?"+String.fromCharCode(60)+"/\\\\1"+String.fromCharCode(62)+"\\\\s*","g");',
      '  return topic.replace(re,\'\');',
      '};',
      'const generatePresentationSlides=(mindData)=>{',
      '  const slides=[];const rootNode=mindData.data;',
      '  const traverseNode=(node,breadcrumb,parentNode)=>{',
      '    breadcrumb=breadcrumb||[];parentNode=parentNode||null;',
      '    const cleanTopic=getCleanTopic(node.topic);',
      '    slides.push({title:cleanTopic,parentNode:parentNode,breadcrumb:[...breadcrumb],node:node});',
      '    if(node.children&&node.children.length>0){',
      '      const cb=[...breadcrumb,cleanTopic];',
      '      node.children.forEach(child=>{traverseNode(child,cb,node);});',
      '    }',
      '  };traverseNode(rootNode);return slides;',
      '};',
      'const showPresentationSlide=(index,direction)=>{',
      '  direction=direction||"none";',
      '  if(index<0||index>=presentationSlides.length)return;',
      '  const slide=presentationSlides[index];',
      '  const overlay=document.getElementById("presentation_overlay");',
      '  const bc=overlay.querySelector(".presentation-breadcrumb-corner");',
      '  const ti=overlay.querySelector(".presentation-title");',
      '  const ct=overlay.querySelector(".slide-counter");',
      '  const pb=document.getElementById("btn_prev_slide");',
      '  const nb=document.getElementById("btn_next_slide");',
      '  bc.innerHTML=slide.parentNode?slide.parentNode.topic:"";',
      '  let tt=slide.node.topic||slide.title;',
      '  const td=document.createElement("div");td.innerHTML=tt;',
      '  const ct2=td.textContent||td.innerText||"";',
      '  const brTag=String.fromCharCode(60)+"br"+String.fromCharCode(62);',
      '  const ft=ct2.replace(/([。、，；：！？])/g,"$1"+brTag);',
      '  if(direction!=="none"){',
      '    ti.className="presentation-title fade-out";',
      '    setTimeout(()=>{ti.innerHTML=ft;ti.className="presentation-title fade-in";setTimeout(()=>{ti.className="presentation-title active";},50);},1200);',
      '  }else{ti.innerHTML=ft;ti.className="presentation-title active";}',
      '  ct.textContent=(index+1)+" / "+presentationSlides.length;',
      '  pb.disabled=index===0;nb.disabled=index===presentationSlides.length-1;',
      '  currentSlideIndex=index;',
      '};',
      'const startPresentationMode=()=>{',
      '  const md=jm2.get_data("node_tree");',
      '  if(!md||!md.data){alert("沒有可以播放的心智圖資料");return;}',
      '  presentationSlides=generatePresentationSlides(md);',
      '  if(presentationSlides.length===0){alert("心智圖沒有內容可以播放");return;}',
      '  isInPresentationMode=true;currentSlideIndex=0;',
      '  document.getElementById("presentation_overlay").style.display="block";',
      '  showPresentationSlide(0);',
      '};',
      'const exitPresentationMode=()=>{isInPresentationMode=false;document.getElementById("presentation_overlay").style.display="none";};',
      'const nextSlide=()=>{if(currentSlideIndex<presentationSlides.length-1)showPresentationSlide(currentSlideIndex+1,"slide");};',
      'const prevSlide=()=>{if(currentSlideIndex>0)showPresentationSlide(currentSlideIndex-1,"slide");};',
      'document.getElementById("presentation_btn").onclick=startPresentationMode;',
      'document.getElementById("btn_exit_presentation").onclick=exitPresentationMode;',
      'document.getElementById("btn_prev_slide").onclick=prevSlide;',
      'document.getElementById("btn_next_slide").onclick=nextSlide;',
      'document.addEventListener("keydown",(e)=>{',
      '  if(!isInPresentationMode)return;',
      '  if(e.key==="ArrowRight"||e.key===" "){e.preventDefault();nextSlide();}',
      '  else if(e.key==="ArrowLeft"){e.preventDefault();prevSlide();}',
      '  else if(e.key==="Escape"){e.preventDefault();exitPresentationMode();}',
      '});'
    ].join('\n');

    const css = 'html,body{height:100%;margin:0;overflow:hidden;}#jsmind_container{width:100%;height:100vh;background:#ecf0f1;cursor:grab;overflow:hidden;}.jsmind-inner{overflow:visible!important;transform-origin:0 0;}#jsmind_container.grabbing{cursor:grabbing;}#attribution{position:absolute;bottom:10px;right:10px;padding:4px 8px;background:rgba(0,0,0,0.5);color:#fff;border-radius:4px;font-size:12px;z-index:10;}#attribution a{color:#ffd54f;text-decoration:none;}#toggle_btn{position:fixed;top:20px;right:20px;width:48px;height:48px;border-radius:50%;border:none;color:white;font-size:20px;cursor:pointer;background:linear-gradient(45deg,#ab47bc,#8e24aa);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.2s;z-index:100;}#toggle_btn:hover{transform:scale(1.1);box-shadow:0 6px 16px rgba(0,0,0,0.4);}#presentation_btn{position:fixed;top:80px;right:20px;width:48px;height:48px;border-radius:50%;border:none;color:white;font-size:20px;cursor:pointer;background:linear-gradient(45deg,#5c6bc0,#3f51b5);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.2s;z-index:100;}#presentation_btn:hover{transform:scale(1.1);box-shadow:0 6px 16px rgba(0,0,0,0.4);}#btn_reorder{position:fixed;top:140px;right:20px;width:48px;height:48px;border-radius:50%;border:none;color:white;font-size:20px;cursor:pointer;background:linear-gradient(45deg,#546e7a,#37474f);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.2s;z-index:100;}.presentation-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#1e3c72,#2a5298);display:none;z-index:2000;}.presentation-content{width:100%;height:100%;display:flex;flex-direction:column;color:white;}.presentation-header{display:flex;justify-content:space-between;align-items:center;padding:20px 40px;background:rgba(0,0,0,0.2);}.presentation-breadcrumb{font-size:14px;opacity:0.7;}.presentation-controls{display:flex;align-items:center;gap:15px;}.presentation-btn{background:rgba(255,255,255,0.2);border:none;color:white;padding:8px 12px;border-radius:5px;cursor:pointer;font-size:16px;transition:background 0.2s;}.presentation-btn:hover{background:rgba(255,255,255,0.3);}.presentation-btn:disabled{opacity:0.5;cursor:not-allowed;}.slide-counter{font-size:14px;min-width:60px;text-align:center;}.presentation-main{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center;position:relative;}.presentation-breadcrumb-corner{position:absolute;top:30px;left:30px;font-size:16px;opacity:0.5;line-height:1.4;max-width:300px;}.presentation-title{font-size:8em;font-weight:bold;line-height:1.1;text-shadow:3px 3px 6px rgba(0,0,0,0.4);max-width:90%;word-wrap:break-word;transition:opacity 1.2s ease-in-out;opacity:1;}.presentation-title.active{opacity:1;}.presentation-title.fade-out{opacity:0!important;}.presentation-title.fade-in{opacity:0!important;}.presentation-children{display:none;}.presentation-child{display:none;}';

    const jsBody = [
      '(function(){',
      'const jm2=new jsMind({container:"jsmind_container",theme:"greensea",editable:false,support_html:true,view:{engine:"canvas",draggable:true}});',
      'jm2.show(' + JSON.stringify(data) + ');',
      'let allExpanded=true;',
      'document.getElementById("toggle_btn").onclick=()=>{const rn=jm2.get_root();if(allExpanded){const cn=(n)=>{if(n&&!n.isroot&&n.children&&n.children.length>0)jm2.collapse_node(n.id);if(n&&n.children)n.children.forEach(c=>cn(c));};cn(rn);allExpanded=false;}else{const en=(n)=>{if(n&&!n.isroot)jm2.expand_node(n.id);if(n&&n.children)n.children.forEach(c=>en(c));};en(rn);allExpanded=true;}};',
      presentationJS,
      panAndZoomFnString + ';',
      'enablePanAndZoom(document.getElementById("jsmind_container"));',
      'let isReordered=false;',
      'document.getElementById("btn_reorder").onclick=()=>{const root=jm2.get_root();if(!root||!root.children||root.children.length<2){alert("至少需要2個二階節點才能重新排列");return;}isReordered=!isReordered;const ch=root.children;const mp=Math.ceil(ch.length/2);if(isReordered){for(let i=0;i<ch.length;i++){ch[i].direction=i<mp?jsMind.direction.right:jsMind.direction.left;}alert("已切換為左右排列");}else{for(const c of ch)c.direction=jsMind.direction.right;alert("已恢復單側排列");}jm2.layout.layout();jm2.view.show(false);};',
      '})();'
    ].join('\n');

    const html = '<!DOCTYPE html>' +
      tag('html', 'lang="zh-Hant"',
        tag('head', '',
          LT + 'meta charset="UTF-8"' + GT +
          tag('title', '', title) +
          tag('style', '', css) +
          LT + 'link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsmind@0.6.1/style/jsmind.css"' + GT
        ) +
        tag('body', '',
          tag('div', 'id="jsmind_container"', '') +
          tag('button', 'id="toggle_btn" title="展開/收合所有節點"', '⚡') +
          tag('button', 'id="presentation_btn"', '📺') +
          tag('button', 'id="btn_reorder"', '↔') +
          tag('div', 'id="presentation_overlay" class="presentation-overlay"',
            tag('div', 'class="presentation-content"',
              tag('div', 'class="presentation-header"',
                tag('div', 'class="presentation-breadcrumb"', '') +
                tag('div', 'class="presentation-controls"',
                  tag('button', 'class="presentation-btn" id="btn_prev_slide"', '◀') +
                  tag('span', 'class="slide-counter"', '') +
                  tag('button', 'class="presentation-btn" id="btn_next_slide"', '▶') +
                  tag('button', 'class="presentation-btn" id="btn_exit_presentation"', '✕')
                )
              ) +
              tag('div', 'class="presentation-main"',
                tag('div', 'class="presentation-breadcrumb-corner"', '') +
                tag('div', 'class="presentation-title"', '') +
                tag('div', 'class="presentation-children"', '')
              )
            )
          ) +
          tag('div', 'id="attribution"', 'Made by ' + tag('a', 'href="https://kentxchang.blogspot.tw" target="_blank" rel="noopener"', '阿剛老師')) +
          tag('script', 'src="https://cdn.jsdelivr.net/npm/jsmind@0.6.1/js/jsmind.js"', '') +
          tag('script', 'src="https://cdn.jsdelivr.net/npm/jsmind@0.6.1/js/jsmind.draggable-node.js"', '') +
          tag('script', 'src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"', '') +
          tag('script', '', jsBody)
        )
      );

    const blob = new Blob([html], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = title + '.html';
    link.click();
  };
  document.getElementById('btn_export_md').onclick = () => { exportToMarkdown(jm); };
  document.getElementById('btn_download_png').onclick = () => { exportToPNG(jm, showNotification); };

  // --- Hyperlink & Image Logic ---
  const updateNodeHyperlink = (nodeId, url) => {
    const node = jm.get_node(nodeId);
    if (!node) return;
    if (!node.data) node.data = {};
    if (url && node.data.image_url) {
      showNotification('此節點已有圖片，無法新增超連結', true);
      return;
    }
    if (url) {
      node.data.hyperlink = url;
    } else {
      delete node.data.hyperlink;
    }
    const cleanTopic = getCleanTopic(node.topic);
    const newTopic = buildTopic(node.data, cleanTopic);
    jm.update_node(nodeId, newTopic);
  };

  const updateNodeImage = (nodeId, url) => {
    const node = jm.get_node(nodeId);
    if (!node) return;
    if (!node.data) node.data = {};
    if (url && node.data.hyperlink) {
      showNotification('此節點已有超連結，無法新增圖片', true);
      return;
    }
    if (url) {
      node.data.image_url = url;
    } else {
      delete node.data.image_url;
    }
    const cleanTopic = getCleanTopic(node.topic);
    const newTopic = buildTopic(node.data, cleanTopic);
    jm.update_node(nodeId, newTopic);
  };

  document.getElementById('btn_add_link').onclick = () => {
    const selectedNode = jm.get_selected_node();
    if (!selectedNode) {
      showNotification('請先選取一個節點', true);
      return;
    }
    if (selectedNode.isroot) {
        showNotification('根節點無法設定超連結', true);
        return;
    }
    linkEditingNodeId = selectedNode.id;
    const node = jm.get_node(linkEditingNodeId);
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = node.topic;
    const linkEl = tempDiv.querySelector('a[data-hyperlink]');
    const currentUrl = linkEl ? linkEl.getAttribute('data-hyperlink') : '';

    linkUrlInput.value = currentUrl;
    linkModalOverlay.style.display = 'flex';
    linkUrlInput.focus();
  };

  document.getElementById('btn_cancel_link').onclick = () => {
    linkModalOverlay.style.display = 'none';
    linkEditingNodeId = null;
  };

  document.getElementById('btn_save_link').onclick = () => {
    if (!linkEditingNodeId) return;
    const url = linkUrlInput.value.trim();
    updateNodeHyperlink(linkEditingNodeId, url);
    linkModalOverlay.style.display = 'none';
    linkEditingNodeId = null;
  };

  document.getElementById('btn_add_image').onclick = () => {
    const selectedNode = jm.get_selected_node();
    if (!selectedNode) {
      showNotification('請先選取一個節點', true);
      return;
    }
    if (selectedNode.isroot) {
        showNotification('根節點無法設定圖片', true);
        return;
    }
    imageEditingNodeId = selectedNode.id;
    const node = jm.get_node(imageEditingNodeId);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = node.topic;
    const imageEl = tempDiv.querySelector('a[data-image-url]');
    const currentUrl = imageEl ? imageEl.getAttribute('data-image-url') : '';

     imageUrlInput.value = currentUrl;
     if (imageFileInput) imageFileInput.value = '';
     if (uploadStatus) uploadStatus.textContent = '';
     imageUrlModalOverlay.style.display = 'flex';
     imageUrlInput.focus();
   };

  document.getElementById('btn_cancel_image_url').onclick = () => {
    imageUrlModalOverlay.style.display = 'none';
    imageEditingNodeId = null;
  };

  document.getElementById('btn_save_image_url').onclick = () => {
    if (!imageEditingNodeId) return;
    const url = imageUrlInput.value.trim();
    updateNodeImage(imageEditingNodeId, url);
    imageUrlModalOverlay.style.display = 'none';
    imageEditingNodeId = null;
  };

  // --- Node Double Click Edit Handler ---
  jm.view.container.addEventListener('dblclick', e => {
    const nid = e.target.getAttribute('nodeid');
    if (!nid || viewOnly) return;
    const node = jm.get_node(nid);
    if (!node) return;

    jm.edit_node(nid);
    
    setTimeout(() => {
      const inp = document.querySelector('.jsmind-editor-input');
      if (!inp) return;
      
      inp.value = getCleanTopic(node.topic);

      const blurHandler = () => {
        const newText = marked.parseInline(inp.value);
        const newTopic = buildTopic(node.data, newText);
        jm.update_node(nid, newTopic);
        inp.removeEventListener('blur', blurHandler);
      };

      inp.addEventListener('blur', blurHandler);
    }, 50);
  });

  enablePanAndZoom(document.getElementById('jsmind_container'));

  // --- Keyboard Event Handler for Slides Preview & Presentation ---
  document.addEventListener('keydown', (e) => {
    if (!isInPresentationMode) return;
    
    switch(e.key) {
      case 'ArrowRight':
      case ' ':
        e.preventDefault();
        nextSlide();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevSlide();
        break;
      case 'Escape':
        e.preventDefault();
        exitPresentationMode();
        break;
    }
  });

  // --- Reference Prompt Modal ---
  const promptModalOverlay = document.getElementById('prompt_modal_overlay');
  const btnShowPrompt = document.getElementById('btn_show_prompt');
  if (btnShowPrompt && promptModalOverlay) {
    btnShowPrompt.onclick = () => {
      promptModalOverlay.style.display = 'flex';
    };
  }
  const btnClosePrompt = document.getElementById('btn_close_prompt');
  if (btnClosePrompt && promptModalOverlay) {
    btnClosePrompt.onclick = () => {
      promptModalOverlay.style.display = 'none';
    };
  }
  const btnCopyPrompt = document.getElementById('btn_copy_prompt');
  if (btnCopyPrompt) {
    btnCopyPrompt.onclick = () => {
      const promptTextBlock = document.getElementById('prompt_text_block');
      if (promptTextBlock) {
        copyTextToClipboard(promptTextBlock.textContent, 'Prompt 已複製！', '複製失敗，請手動複製。');
      }
    };
  }

  // --- Image Lightbox Click to Close ---
  const lightboxOverlay = document.getElementById('image_lightbox_overlay');
  if (lightboxOverlay) {
    lightboxOverlay.onclick = () => {
      lightboxOverlay.style.display = 'none';
    };
  }

  // --- 載入心智圖 ---
  // 尚未開啟編輯過的心智圖只有建立時貼上的 Markdown（md），在此轉成心智圖
  const showItem = (item) => {
    jm.show(item.data || parseMarkdown(item.md || '# ' + item.name));
    applyLayerColors(jm);
    if (viewOnly) jm.disable_edit();
    document.title = item.name + ' - 心智圖';
  };

  if (host) {
    const item = host.getMindmapItem(embedId);
    if (item) {
      showItem(item);
      if (!item.data) scheduleSave();
    }
  } else if (shareMatch) {
    fetch('/api/mindmaps/' + shareMatch[1] + '/' + shareMatch[2])
      .then(res => res.json())
      .then(result => {
        if (!result.success) throw new Error(result.error);
        showItem(result.mindmap);
      })
      .catch(err => showNotification('載入失敗：' + err.message, true));
  }
});

// --- View Large Image Lightbox (Global scope for onclick access) ---
window.viewLargeImage = (event, url) => {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const lightbox = document.getElementById('image_lightbox_overlay');
  const lightboxImg = document.getElementById('lightbox_image');
  if (lightbox && lightboxImg) {
    lightboxImg.src = url;
    lightbox.style.display = 'flex';
  }
};

  (function () {
    'use strict';

    /* ── 配色常數 ─────────────────────────────────────────── */
    var C = {
      h1: '#FFD700',   /* 金黃 — 根節點 / H1 標題 */
      h2: '#64B5F6',   /* 天藍 — H2 主分支         */
      h3: '#81C784',   /* 嫩綠 — H3 子分支         */
      h4: '#EEEEEE',   /* 淺灰白 — H4 細節         */
    };

    var slideList    = [];
    var previewIndex = 0;
    var animTimers   = [];
    var currentBg    = '#000000';
    var fontScale    = 1.0;   /* 1.0=預設 / 1.3=較大 / 1.6=最大 */

    /* ── 取得 jsMind 實例（主程式建立後掛在 window.jm）────────── */
    function getJM() {
      return window.jm || null;
    }

    /* ── 從 jsMind 資料產生投影片陣列 ───────────────────────── */
    function buildSlides() {
      var jmInst = getJM();
      if (!jmInst) {
        alert('⚠️ 無法取得心智圖資料。\n\n請先確認心智圖已完整載入，再點選🎬匯出投影片影片。');
        return [];
      }
      var root   = jmInst.mind.root;
      var slides = [];

      /* H1：根節點 → 標題投影片 */
      slides.push({
        type: 'h1', title: root.topic,
        lines: [{ level: 'h1', text: root.topic }]
      });

      var h2s = root.children || [];
      for (var i = 0; i < h2s.length; i++) {
        var h2 = h2s[i];
        /* H2 → 章節標題投影片 */
        slides.push({
          type: 'h2', title: h2.topic,
          lines: [{ level: 'h2', text: h2.topic }]
        });

        var h3s = h2.children || [];
        for (var j = 0; j < h3s.length; j++) {
          var h3 = h3s[j];
          /* H3 + H4 → 內容投影片 */
          var lines = [{ level: 'h3', text: h3.topic }];
          var h4s = h3.children || [];
          for (var k2 = 0; k2 < h4s.length; k2++) {
            lines.push({ level: 'h4', text: '• ' + h4s[k2].topic });
          }
          slides.push({ type: 'content', title: h3.topic, lines: lines });
        }
      }
      return slides;
    }

    /* ── 清除動畫計時器 ──────────────────────────────────────── */
    function clearAnims() {
      for (var i = 0; i < animTimers.length; i++) clearTimeout(animTimers[i]);
      animTimers = [];
    }

    /* ── 渲染一張投影片到 DOM 容器（帶逐行淡入）─────────────── */
    function renderSlidePreview(slide, container, bgColor) {
      clearAnims();
      container.innerHTML = '';
      container.style.background = bgColor || '#000';

      var isCenter = (slide.type === 'h1' || slide.type === 'h2');

      var wrapper = document.createElement('div');
      wrapper.style.cssText =
        'width:100%;height:100%;display:flex;flex-direction:column;box-sizing:border-box;' +
        'justify-content:center;align-items:center;' +
        (isCenter ? 'padding:40px 12%;' : 'padding:55px 9%;') +
        'gap:' + (isCenter ? '0' : '14px') + ';';
      container.appendChild(wrapper);

      var lineEls = [];
      for (var i = 0; i < slide.lines.length; i++) {
        var line = slide.lines[i];
        var el   = document.createElement('div');
        el.textContent = line.text;
        /* 共用：初始透明 + 過渡 */
        el.style.opacity    = '0';
        el.style.transition = 'opacity 0.65s ease';

        var s = fontScale;   /* 字體倍率 */
        if (line.level === 'h1') {
          el.style.color         = C.h1;
          el.style.fontSize      = 'clamp(' + (2*s) + 'rem,' + (6.5*s) + 'vw,' + (5.2*s) + 'rem)';
          el.style.fontWeight    = '900';
          el.style.textAlign     = 'center';
          el.style.textShadow    = '0 0 48px rgba(255,215,0,0.55),0 2px 10px rgba(0,0,0,0.9)';
          el.style.lineHeight    = '1.22';
          el.style.letterSpacing = '0.04em';
        } else if (line.level === 'h2') {
          el.style.color      = C.h2;
          el.style.fontSize   = 'clamp(' + (1.7*s) + 'rem,' + (5.2*s) + 'vw,' + (4.2*s) + 'rem)';
          el.style.fontWeight = '800';
          el.style.textAlign  = 'center';
          el.style.textShadow = '0 0 36px rgba(100,181,246,0.5),0 2px 8px rgba(0,0,0,0.9)';
          el.style.lineHeight = '1.28';
        } else if (line.level === 'h3') {
          el.style.color        = C.h3;
          el.style.fontSize     = 'clamp(' + (1.3*s) + 'rem,' + (3.3*s) + 'vw,' + (2.8*s) + 'rem)';
          el.style.fontWeight   = '700';
          el.style.textAlign    = 'center';
          el.style.textShadow   = '0 0 22px rgba(129,199,132,0.4)';
          el.style.lineHeight   = '1.35';
          el.style.marginBottom = '6px';
          el.style.width        = '100%';
        } else {
          el.style.color      = C.h4;
          el.style.fontSize   = 'clamp(' + (0.95*s) + 'rem,' + (2.3*s) + 'vw,' + (1.85*s) + 'rem)';
          el.style.lineHeight = '1.58';
          el.style.textAlign  = 'center';
          el.style.width      = '100%';
        }

        wrapper.appendChild(el);
        lineEls.push(el);
      }

      /* 逐行淡入 */
      for (var n = 0; n < lineEls.length; n++) {
        (function (el, delay) {
          var t = setTimeout(function () { el.style.opacity = '1'; }, delay);
          animTimers.push(t);
        })(lineEls[n], n * 490 + 90);
      }
    }

    /* ── 更新預覽畫面 ────────────────────────────────────────── */
    function updatePreview() {
      var slide     = slideList[previewIndex];
      var container = document.getElementById('sv_preview_inner');
      renderSlidePreview(slide, container, currentBg);
      document.getElementById('sv_counter').textContent =
        (previewIndex + 1) + ' / ' + slideList.length;
      document.getElementById('sv_slide_title').textContent = slide.title || '';
      document.getElementById('btn_sv_prev').disabled = (previewIndex === 0);
      document.getElementById('btn_sv_next').disabled = (previewIndex === slideList.length - 1);
    }

    /* ══════════════════════════════════════════════════════════
       事件繫結
    ══════════════════════════════════════════════════════════ */

    /* 開啟設定 Modal */
    document.getElementById('btn_slide_video').addEventListener('click', function () {
      document.getElementById('sv_modal_overlay').style.display = 'flex';
    });
    document.getElementById('btn_sv_cancel').addEventListener('click', function () {
      document.getElementById('sv_modal_overlay').style.display = 'none';
    });

    /* 色票互動 */
    var swatches = document.querySelectorAll('.sv-swatch');
    var bgInput  = document.getElementById('sv_bg_color');
    var bgHex    = document.getElementById('sv_bg_hex');
    swatches.forEach(function (sw) {
      sw.addEventListener('click', function () {
        swatches.forEach(function (s) { s.classList.remove('active'); });
        sw.classList.add('active');
        bgInput.value        = sw.dataset.color;
        bgHex.textContent    = sw.dataset.color.toUpperCase();
      });
    });
    bgInput.addEventListener('input', function () {
      swatches.forEach(function (s) { s.classList.remove('active'); });
      bgHex.textContent = bgInput.value.toUpperCase();
    });

    /* 時間滑桿雙向同步 */
    var durRange = document.getElementById('sv_duration_range');
    var durNum   = document.getElementById('sv_duration');
    durRange.addEventListener('input', function () { durNum.value   = durRange.value; });
    durNum.addEventListener('input',   function () { durRange.value = durNum.value;   });

    /* 字體大小按鈕 */
    var sizeBtns = document.querySelectorAll('.sv-size-btn');
    sizeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        sizeBtns.forEach(function (b) {
          b.style.background = '#f5f5f5';
          b.style.color      = '#444';
        });
        btn.style.background = '#5c6bc0';
        btn.style.color      = '#fff';
        fontScale = parseFloat(btn.dataset.scale) || 1.0;
      });
    });

    /* 開啟預覽 */
    document.getElementById('btn_sv_open_preview').addEventListener('click', function () {
      currentBg  = bgInput.value || '#000000';
      slideList  = buildSlides();
      if (slideList.length === 0) return;
      previewIndex = 0;
      document.getElementById('sv_modal_overlay').style.display = 'none';
      document.getElementById('sv_preview_overlay').style.display = 'flex';
      updatePreview();
    });

    /* 預覽導航 */
    document.getElementById('btn_sv_prev').addEventListener('click', function () {
      if (previewIndex > 0) { previewIndex--; updatePreview(); }
    });
    document.getElementById('btn_sv_next').addEventListener('click', function () {
      if (previewIndex < slideList.length - 1) { previewIndex++; updatePreview(); }
    });
    document.getElementById('btn_sv_back').addEventListener('click', function () {
      clearAnims();
      document.getElementById('sv_preview_overlay').style.display = 'none';
      document.getElementById('sv_modal_overlay').style.display   = 'flex';
    });

    /* 鍵盤快速鍵（預覽時）*/
    document.addEventListener('keydown', function (e) {
      if (document.getElementById('sv_preview_overlay').style.display !== 'flex') return;
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') {
        if (previewIndex > 0) { previewIndex--; updatePreview(); }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (previewIndex < slideList.length - 1) { previewIndex++; updatePreview(); }
      } else if (e.key === 'Escape') {
        clearAnims();
        document.getElementById('sv_preview_overlay').style.display = 'none';
        document.getElementById('sv_modal_overlay').style.display   = 'flex';
      }
    });

    /* 匯出影片 */
    document.getElementById('btn_sv_export').addEventListener('click', function () {
      var bgColor     = currentBg;
      var durationSec = parseFloat(durNum.value) || 6;
      clearAnims();
      document.getElementById('sv_preview_overlay').style.display  = 'none';
      document.getElementById('sv_progress_overlay').style.display = 'flex';
      exportVideo(bgColor, durationSec)
        .catch(function (err) { alert('匯出失敗：' + err.message); })
        .finally(function ()  {
          document.getElementById('sv_progress_overlay').style.display = 'none';
        });
    });

    /* ══════════════════════════════════════════════════════════
       Canvas 影片錄製核心
    ══════════════════════════════════════════════════════════ */

    function setProgress(txt) {
      document.getElementById('sv_progress_text').textContent = txt;
    }

    function nextFrame() {
      return new Promise(function (resolve) { requestAnimationFrame(resolve); });
    }

    /* Canvas 字型 */
    var FF = "'Microsoft JhengHei','PingFang TC','Noto Sans TC',Arial,sans-serif";

    /* 自動縮小字體以適應最大寬度 */
    function fitFontSize(ctx, text, maxW, basePx, weight) {
      var size = basePx;
      ctx.font = weight + ' ' + size + 'px ' + FF;
      while (ctx.measureText(text).width > maxW && size > 18) {
        size -= 2;
        ctx.font = weight + ' ' + size + 'px ' + FF;
      }
      return size;
    }

    /* 計算每行在 canvas 上的佈局資訊（fontScale 全域套用）*/
    function buildCanvasLines(slide, W, H) {
      var s      = fontScale;   /* 字體倍率：1.0 / 1.3 / 1.6 */
      var result = [];
      if (slide.type === 'h1') {
        result.push({
          text: slide.lines[0].text, level: 'h1',
          color: C.h1, shadow: 'rgba(255,215,0,0.6)', shadowBlur: 50,
          basePx: Math.round(98 * s), weight: '900',
          align: 'center', x: W / 2, y: H / 2,
          borderLeft: false
        });
      } else if (slide.type === 'h2') {
        result.push({
          text: slide.lines[0].text, level: 'h2',
          color: C.h2, shadow: 'rgba(100,181,246,0.5)', shadowBlur: 38,
          basePx: Math.round(82 * s), weight: '800',
          align: 'center', x: W / 2, y: H / 2,
          borderLeft: false
        });
      } else {
        /* 內容投影片：垂直置中、水平置中 */
        var n      = slide.lines.length;
        var lineH  = Math.min(Math.round(116 * s), Math.max(Math.round(68 * s), (H - 220) / n));
        var totalH = n * lineH;
        var startY = (H - totalH) / 2 + lineH * 0.5;

        for (var i = 0; i < slide.lines.length; i++) {
          var line = slide.lines[i];
          if (line.level === 'h3') {
            result.push({
              text: line.text, level: 'h3',
              color: C.h3, shadow: 'rgba(129,199,132,0.4)', shadowBlur: 26,
              basePx: Math.round(60 * s), weight: '700',
              align: 'center', x: W / 2, y: startY + i * lineH,
              borderLeft: false
            });
          } else {
            result.push({
              text: line.text, level: 'h4',
              color: C.h4, shadow: null, shadowBlur: 0,
              basePx: Math.round(44 * s), weight: '400',
              align: 'center', x: W / 2, y: startY + i * lineH,
              borderLeft: false
            });
          }
        }
      }
      return result;
    }

    /* 繪製一個 canvas 畫面 */
    function drawFrame(ctx, W, H, bgColor, lines, alphas) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, W, H);

      for (var i = 0; i < lines.length; i++) {
        var alpha = alphas[i];
        if (alpha <= 0) continue;
        var ln   = lines[i];
        var maxW = (ln.align === 'center') ? W * 0.86 : W - ln.x - 80;

        ctx.save();
        ctx.globalAlpha   = alpha;
        ctx.textBaseline  = 'middle';
        ctx.textAlign     = ln.align;

        var px = fitFontSize(ctx, ln.text, maxW, ln.basePx, ln.weight);

        if (ln.shadow) {
          ctx.shadowColor = ln.shadow;
          ctx.shadowBlur  = ln.shadowBlur;
        }

        if (ln.borderLeft) {
          /* 左側色條 */
          var bH = px * 1.35;
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur  = 0;
          ctx.fillStyle   = ln.borderColor;
          ctx.fillRect(ln.x - 32 - 6, ln.y - bH / 2, 7, bH);
          ctx.fillStyle = ln.color;
          if (ln.shadow) { ctx.shadowColor = ln.shadow; ctx.shadowBlur = ln.shadowBlur; }
        } else {
          ctx.fillStyle = ln.color;
        }

        ctx.fillText(ln.text, ln.x, ln.y, maxW);
        ctx.restore();
      }
    }

    /* 將一張投影片渲染到 canvas（含時間軸控制）*/
    async function renderSlideToCanvas(ctx, W, H, slide, bgColor, durationSec) {
      var FADE_MS         = 680;   /* 每行淡入時長 */
      var HOLD_BETWEEN_MS = 460;   /* 行與行之間的停頓 */
      var durationMs      = durationSec * 1000;

      var lines  = buildCanvasLines(slide, W, H);
      var alphas = [];
      for (var a = 0; a < lines.length; a++) alphas.push(0);

      var totalStart = performance.now();

      /* 逐行淡入 */
      for (var i = 0; i < lines.length; i++) {
        var fadeStart = performance.now();
        /* Fade in */
        while (true) {
          var elapsed = performance.now() - fadeStart;
          alphas[i]   = Math.min(elapsed / FADE_MS, 1);
          drawFrame(ctx, W, H, bgColor, lines, alphas);
          await nextFrame();
          if (elapsed >= FADE_MS) break;
        }
        alphas[i] = 1;
        /* 行間停頓（最後一行不需要）*/
        if (i < lines.length - 1) {
          var holdEnd = performance.now() + HOLD_BETWEEN_MS;
          while (performance.now() < holdEnd) {
            drawFrame(ctx, W, H, bgColor, lines, alphas);
            await nextFrame();
          }
        }
      }

      /* 剩餘時間靜止展示 */
      var used      = performance.now() - totalStart;
      var remaining = durationMs - used;
      if (remaining > 0) {
        var endAt = performance.now() + remaining;
        while (performance.now() < endAt) {
          drawFrame(ctx, W, H, bgColor, lines, alphas);
          await nextFrame();
        }
      }
    }

    /* 主匯出函式 */
    async function exportVideo(bgColor, durationSec) {
      var W = 1920, H = 1080;
      var canvas    = document.createElement('canvas');
      canvas.width  = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');

      /* 選擇最佳編碼格式 */
      var mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';

      var stream   = canvas.captureStream(30);
      var recorder = new MediaRecorder(stream, {
        mimeType: mimeType, videoBitsPerSecond: 8000000
      });
      var chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      var stopped = new Promise(function (resolve) { recorder.onstop = resolve; });

      recorder.start(100);
      setProgress('準備中...');

      for (var i = 0; i < slideList.length; i++) {
        setProgress('正在處理第 ' + (i + 1) + ' / ' + slideList.length + ' 張投影片...');
        await renderSlideToCanvas(ctx, W, H, slideList[i], bgColor, durationSec);
      }

      setProgress('正在完成影片封裝...');
      recorder.stop();
      await stopped;

      /* 下載 */
      var blob = new Blob(chunks, { type: mimeType });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'mindmap_slides.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
    }

  })();
