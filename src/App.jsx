import React, { useState, useRef, useEffect } from 'react';

// --- SABİTLER VE YAPILANDIRMA ---
const COLORS = {
  bg: '#F5F6F8',
  card: '#FFFFFF',
  title: '#111111',
  textNormal: '#222222',
  textSecondary: '#666666',
  button: '#2D6AE3',
  buttonHover: '#2255B8',
  correct: '#23A559',
  wrong: '#D93C3C',
  warning: '#F59E0B',
  border: '#E5E7EB'
};

const SYSTEM_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// İkonlar (Harici bağımlılık olmaması için inline SVG)
const Icons = {
  Upload: () => <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>,
  Check: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>,
  Error: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>,
  Download: () => <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>,
  Plus: () => <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
};

// --- YARDIMCI FONKSİYONLAR ---
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

// --- API VE ANALİZ KATMANI ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const analyzeImageWithAI = async (base64Image, questionType) => {
  if (!apiKey) {
    throw new Error("Gemini API Key bulunamadı! Lütfen VITE_GEMINI_API_KEY ortam değişkenini yapılandırın.");
  }
  const mimeTypeMatch = base64Image.match(/data:(.*?);/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";
  const base64Data = base64Image.split(',')[1];
  
  const prompt = `Sen uzman bir eğitim içerik analizörüsün. Verilen görseldeki soruyu analiz et ve mantığını çıkar.
  Soru tipi: ${questionType}.
  
  Kritik Kurallar:
  1. Matematiksel ifadeler: Sorudaki veya seçeneklerdeki tüm matematiksel formülleri, denklemleri ve sembolleri kesinlikle standart HTML5 MathML (<math>...</math>) etiketleri kullanarak yaz. Harici kütüphane kullanılmayacağı için LaTeX kullanma, doğrudan MathML üret.
  2. Şekil/Grafik/Tablo Çizimi: Eğer soruda bir şekil, grafik, diyagram veya tablo varsa, bunu aslına uygun, temiz ve ölçeklenebilir bir satıriçi SVG (<svg>...</svg>) kodu olarak yeniden çiz ve JSON'daki "figureHtml" alanına koy. Şekil yoksa bu alanı boş bırak veya null gönder. Arka planı transparan veya beyaz yap, orijinal renkleri koru.

  Eğer soru tipi 'single' (Tek Doğru Çoktan Seçmeli) ise şu JSON'ı dön: { "questionText": "Soru metni", "figureHtml": "<svg>...</svg>", "options": ["A seçeneği", "B seçeneği"], "correctAnswers": [0] }
  Eğer 'multiple' (Birden Fazla Doğru) ise: { "questionText": "Soru", "figureHtml": "<svg>...</svg>", "options": ["Seçenek 1", "Seçenek 2"], "correctAnswers": [0, 1] }
  Eğer 'fill' (Boşluk Doldurma) ise: { "questionText": "Soru metnindeki boşluğu [___] şeklinde belirt", "figureHtml": "<svg>...</svg>", "blanks": [ ["kabul edilen cevap 1", "alternatif cevap"] ] }
  Eğer 'match' (Eşleştirme) ise: { "questionText": "Eşleştirme yönergesi", "figureHtml": "<svg>...</svg>", "leftColumn": ["Sol 1", "Sol 2"], "rightColumn": ["Sağ 1", "Sağ 2"], "matches": { "0": 0, "1": 1 } }
  
  Sadece geçerli, parse edilebilir JSON döndür. Markdown blokları kullanma.`;

  let attempt = 0;
  const maxAttempts = 5;
  const delays = [1000, 2000, 4000, 8000, 16000];

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: base64Data } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error('API Hatası');
      
      const result = await response.json();
      const textResult = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResult) throw new Error('Geçersiz yanıt formatı');
      
      return JSON.parse(textResult);
    } catch (error) {
      attempt++;
      if (attempt >= maxAttempts) {
        throw new Error("Yapay zeka analizi başarısız oldu. Lütfen tekrar deneyin.");
      }
      await wait(delays[attempt - 1]);
    }
  }
};

// --- HTML GENERATOR MOTORU (ÇEVRİMDIŞI ÇIKTI) ---
class HTMLGenerator {
  static generate(questionData, type) {
    const css = this.getCSS();
    const bodyContent = this.getBody(questionData, type);
    const scriptContent = this.getScript(questionData, type);

    return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Etkileşimli Soru</title>
    <style>${css}</style>
</head>
<body>
    <div class="container">
        ${bodyContent}
        
        <div id="controls" class="controls hidden">
            <button id="btn-check" class="btn btn-primary">Kontrol Et</button>
            <div id="post-check-controls" class="hidden" style="display:flex; gap:10px;">
                <button id="btn-retry" class="btn btn-secondary">Tekrar Dene</button>
                <button id="btn-show" class="btn btn-secondary">Cevabı Göster</button>
            </div>
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
      ${scriptContent}
    </script>
</body>
</html>`;
  }

  static getCSS() {
    return `
      :root {
        --bg: ${COLORS.bg}; --card: ${COLORS.card}; --title: ${COLORS.title};
        --text: ${COLORS.textNormal}; --text-sec: ${COLORS.textSecondary};
        --primary: ${COLORS.button}; --primary-hover: ${COLORS.buttonHover};
        --correct: ${COLORS.correct}; --wrong: ${COLORS.wrong}; --border: ${COLORS.border};
      }
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: ${SYSTEM_FONT}; }
      body { background-color: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
      .container { background: var(--card); padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 100%; max-width: 800px; }
      h1 { color: var(--title); font-size: 1.5rem; margin-bottom: 24px; line-height: 1.4; }
      
      /* Buttons */
      .btn { padding: 12px 24px; border-radius: 8px; border: none; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; }
      .btn-primary { background: var(--primary); color: white; }
      .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(45,106,227,0.2); }
      .btn-secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
      .btn-secondary:hover { background: #e5e7eb; }
      .controls { margin-top: 30px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 20px;}
      .hidden { display: none !important; }

      /* Toast */
      .toast { position: fixed; top: -100px; left: 50%; transform: translateX(-50%); padding: 16px 24px; border-radius: 8px; color: white; font-weight: bold; transition: top 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .toast.show { top: 20px; }
      .toast.correct { background: var(--correct); }
      .toast.wrong { background: var(--wrong); }

      /* Options (Single/Multiple) */
      .option { display: flex; align-items: center; padding: 16px; margin-bottom: 12px; border: 2px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; background: var(--card); }
      .option:hover { border-color: var(--primary); }
      .option.selected { border-color: var(--primary); background: rgba(45,106,227,0.05); }
      .option.correct-reveal { border-color: var(--correct) !important; background: rgba(35,165,89,0.1) !important; }
      .option-indicator { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--border); margin-right: 16px; display: flex; justify-content: center; align-items: center; }
      .option.selected .option-indicator { border-color: var(--primary); }
      .option.selected .option-indicator::after { content: ''; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); }
      .type-multiple .option-indicator { border-radius: 4px; }
      .type-multiple .option.selected .option-indicator::after { border-radius: 2px; }

      /* Fill in blanks */
      .fill-text { font-size: 1.2rem; line-height: 2; }
      .fill-input { border: none; border-bottom: 2px solid var(--text-sec); outline: none; font-size: 1.2rem; text-align: center; width: 120px; margin: 0 8px; padding: 4px; background: transparent; transition: border-color 0.3s; font-family: inherit;}
      .fill-input:focus { border-bottom-color: var(--primary); }
      .fill-input.correct-reveal { border-bottom-color: var(--correct); color: var(--correct); font-weight: bold; }
      .fill-input.wrong-reveal { border-bottom-color: var(--wrong); color: var(--wrong); }

      /* Match */
      .match-container { display: flex; justify-content: space-between; position: relative; margin-bottom: 40px; }
      .match-col { display: flex; flex-direction: column; gap: 20px; width: 40%; z-index: 10; }
      .match-item { padding: 16px; border: 2px solid var(--border); border-radius: 8px; background: var(--card); cursor: pointer; text-align: center; transition: all 0.2s; user-select: none; }
      .match-item:hover { border-color: var(--primary); }
      .match-item.selected { border-color: var(--primary); background: rgba(45,106,227,0.05); box-shadow: 0 0 0 2px rgba(45,106,227,0.2); }
      .match-item.correct-reveal { border-color: var(--correct); background: rgba(35,165,89,0.05); }
      .match-item.wrong-reveal { border-color: var(--wrong); background: rgba(217,60,60,0.05); }
      #match-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible; }
      .match-line { stroke: var(--text); stroke-width: 3; stroke-linecap: round; transition: stroke 0.3s; }
      .match-line.correct { stroke: var(--correct); }
      .match-line.wrong { stroke: var(--wrong); }
      
      /* Figure & Math */
      .figure-container { display: flex; justify-content: center; margin-bottom: 24px; width: 100%; overflow-x: auto; }
      .figure-container svg { max-width: 100%; height: auto; max-height: 400px; }
      math { font-family: 'Cambria Math', 'Latin Modern Math', 'STIX Two Math', serif; font-size: 1.15em; }

      @media (max-width: 600px) {
        .container { padding: 20px; }
        .controls { flex-direction: column; gap: 15px; }
        .controls button { width: 100%; }
        #post-check-controls { width: 100%; flex-direction: column; }
      }
    `;
  }

  static getBody(data, type) {
    let html = '';
    
    if (data.figureHtml && data.figureHtml.trim() !== '') {
      html += `<div class="figure-container">${data.figureHtml}</div>`;
    }

    html += `<h1 id="question-text">${data.questionText.replace(/\[___\]/g, '<input type="text" class="fill-input" aria-label="Boşluk doldurma">')}</h1>`;
    
    if (type === 'single' || type === 'multiple') {
      html += `<div id="options-container" class="${type === 'multiple' ? 'type-multiple' : ''}">`;
      data.options.forEach((opt, idx) => {
        html += `<div class="option" data-idx="${idx}" tabindex="0" role="${type === 'single' ? 'radio' : 'checkbox'}" aria-checked="false">
                  <div class="option-indicator"></div>
                  <div class="option-text">${opt}</div>
                 </div>`;
      });
      html += `</div>`;
    } 
    else if (type === 'match') {
      html += `<div class="match-container" id="match-container">
                  <svg id="match-svg"></svg>
                  <div class="match-col" id="col-left">`;
      data.leftColumn.forEach((item, idx) => {
        html += `<div class="match-item left-item" data-idx="${idx}" tabindex="0">${item}</div>`;
      });
      html += `</div><div class="match-col" id="col-right">`;
      data.rightColumn.forEach((item, idx) => {
        html += `<div class="match-item right-item" data-idx="${idx}" tabindex="0">${item}</div>`;
      });
      html += `</div></div>`;
    }

    return html;
  }

  static getScript(data, type) {
    return `
      const qData = ${JSON.stringify(data)};
      const qType = "${type}";
      
      const elements = {
        checkBtn: document.getElementById('btn-check'),
        controls: document.getElementById('controls'),
        postControls: document.getElementById('post-check-controls'),
        retryBtn: document.getElementById('btn-retry'),
        showBtn: document.getElementById('btn-show'),
        toast: document.getElementById('toast'),
        options: document.querySelectorAll('.option'),
        inputs: document.querySelectorAll('.fill-input'),
        leftItems: document.querySelectorAll('.left-item'),
        rightItems: document.querySelectorAll('.right-item'),
        svg: document.getElementById('match-svg')
      };

      let state = {
        selected: new Set(),
        userMatches: {},
        hasInteracted: false,
        isAnswered: false,
        activeLeftMatch: null
      };

      function showToast(isCorrect) {
        elements.toast.textContent = isCorrect ? "Tebrikler! Doğru cevapladınız." : "Yanlış cevap. Tekrar deneyebilirsiniz.";
        elements.toast.className = 'toast show ' + (isCorrect ? 'correct' : 'wrong');
        setTimeout(() => { elements.toast.className = 'toast'; }, 4000);
      }

      function checkInteraction() {
        if (!state.hasInteracted) {
          state.hasInteracted = true;
          elements.controls.classList.remove('hidden');
        }
      }

      if (qType === 'single' || qType === 'multiple') {
        elements.options.forEach(opt => {
          const toggleSelection = () => {
            if (state.isAnswered) return;
            checkInteraction();
            const idx = parseInt(opt.dataset.idx);
            
            if (qType === 'single') {
              elements.options.forEach(o => {
                o.classList.remove('selected');
                o.setAttribute('aria-checked', 'false');
              });
              state.selected.clear();
              opt.classList.add('selected');
              opt.setAttribute('aria-checked', 'true');
              state.selected.add(idx);
            } else {
              opt.classList.toggle('selected');
              const isSelected = opt.classList.contains('selected');
              opt.setAttribute('aria-checked', isSelected ? 'true' : 'false');
              if (isSelected) state.selected.add(idx);
              else state.selected.delete(idx);
            }
          };

          opt.addEventListener('click', toggleSelection);
          opt.addEventListener('keydown', (e) => { if(e.key === ' ' || e.key === 'Enter') toggleSelection(); });
        });
      }

      if (qType === 'fill') {
        elements.inputs.forEach(input => {
          input.addEventListener('input', checkInteraction);
        });
      }

      if (qType === 'match') {
        function drawLines() {
          if (!elements.svg) return;
          elements.svg.innerHTML = '';
          const svgRect = elements.svg.getBoundingClientRect();
          
          for (const [lIdx, rIdx] of Object.entries(state.userMatches)) {
            const lItem = document.querySelector(\`.left-item[data-idx="\${lIdx}"]\`);
            const rItem = document.querySelector(\`.right-item[data-idx="\${rIdx}"]\`);
            if (lItem && rItem) {
              const lRect = lItem.getBoundingClientRect();
              const rRect = rItem.getBoundingClientRect();
              
              const x1 = lRect.right - svgRect.left;
              const y1 = lRect.top + (lRect.height / 2) - svgRect.top;
              const x2 = rRect.left - svgRect.left;
              const y2 = rRect.top + (rRect.height / 2) - svgRect.top;
              
              const isChecking = state.isAnswered;
              let lineClass = 'match-line';
              if (isChecking) {
                 const isCorrect = qData.matches[lIdx] == rIdx;
                 lineClass += isCorrect ? ' correct' : ' wrong';
              }

              const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              line.setAttribute('x1', x1); line.setAttribute('y1', y1);
              line.setAttribute('x2', x2); line.setAttribute('y2', y2);
              line.setAttribute('class', lineClass);
              elements.svg.appendChild(line);
            }
          }
        }

        window.addEventListener('resize', drawLines);

        const handleMatchClick = (el, type) => {
          if (state.isAnswered) return;
          checkInteraction();
          const idx = el.dataset.idx;

          if (type === 'left') {
            if (state.userMatches[idx] !== undefined) {
               delete state.userMatches[idx];
               drawLines();
            }
            
            elements.leftItems.forEach(i => i.classList.remove('selected'));
            el.classList.add('selected');
            state.activeLeftMatch = idx;
          } else if (type === 'right' && state.activeLeftMatch !== null) {
             for(let k in state.userMatches) {
               if(state.userMatches[k] == idx) delete state.userMatches[k];
             }
             
             state.userMatches[state.activeLeftMatch] = parseInt(idx);
             elements.leftItems.forEach(i => i.classList.remove('selected'));
             state.activeLeftMatch = null;
             drawLines();
          }
        };

        elements.leftItems.forEach(item => {
          item.addEventListener('click', () => handleMatchClick(item, 'left'));
          item.addEventListener('keydown', (e) => { if(e.key === ' ' || e.key === 'Enter') handleMatchClick(item, 'left'); });
        });
        elements.rightItems.forEach(item => {
          item.addEventListener('click', () => handleMatchClick(item, 'right'));
          item.addEventListener('keydown', (e) => { if(e.key === ' ' || e.key === 'Enter') handleMatchClick(item, 'right'); });
        });
      }

      elements.checkBtn.addEventListener('click', () => {
        if (!state.hasInteracted) return;
        state.isAnswered = true;
        let isAllCorrect = true;
        elements.checkBtn.classList.add('hidden');

        if (qType === 'single' || qType === 'multiple') {
          const correctArr = qData.correctAnswers;
          const userArr = Array.from(state.selected);
          isAllCorrect = (correctArr.length === userArr.length) && correctArr.every(val => userArr.includes(val));
          
          elements.options.forEach(opt => {
            opt.style.pointerEvents = 'none';
          });
        }
        else if (qType === 'fill') {
          elements.inputs.forEach((input, index) => {
            input.disabled = true;
            const userVal = input.value.trim().toLowerCase();
            const correctVals = qData.blanks[index].map(v => v.trim().toLowerCase());
            if (!correctVals.includes(userVal)) {
              isAllCorrect = false;
              input.classList.add('wrong-reveal');
            } else {
              input.classList.add('correct-reveal');
            }
          });
        }
        else if (qType === 'match') {
          for(let lIdx in qData.matches) {
            if(state.userMatches[lIdx] !== qData.matches[lIdx]) {
              isAllCorrect = false;
            }
          }
          elements.leftItems.forEach(i => i.style.pointerEvents = 'none');
          elements.rightItems.forEach(i => i.style.pointerEvents = 'none');
          drawLines();
        }

        showToast(isAllCorrect);

        if (!isAllCorrect) {
          elements.postControls.classList.remove('hidden');
          elements.postControls.style.display = 'flex';
        } else {
           if (qType === 'single' || qType === 'multiple') {
              qData.correctAnswers.forEach(idx => {
                 document.querySelector(\`.option[data-idx="\${idx}"]\`).classList.add('correct-reveal');
              });
           }
        }
      });

      elements.retryBtn.addEventListener('click', () => {
        state.isAnswered = false;
        elements.postControls.classList.add('hidden');
        elements.postControls.style.display = 'none';
        elements.checkBtn.classList.remove('hidden');

        if (qType === 'single' || qType === 'multiple') {
          elements.options.forEach(opt => {
            opt.style.pointerEvents = 'auto';
            opt.classList.remove('correct-reveal');
            opt.classList.remove('selected');
            opt.setAttribute('aria-checked', 'false');
          });
          state.selected.clear();
        } else if (qType === 'fill') {
          elements.inputs.forEach(input => {
             input.disabled = false;
             input.classList.remove('wrong-reveal', 'correct-reveal');
             input.value = '';
          });
        } else if (qType === 'match') {
          state.userMatches = {};
          elements.leftItems.forEach(i => { i.style.pointerEvents = 'auto'; i.classList.remove('correct-reveal', 'wrong-reveal'); });
          elements.rightItems.forEach(i => { i.style.pointerEvents = 'auto'; i.classList.remove('correct-reveal', 'wrong-reveal'); });
          if(elements.svg) elements.svg.innerHTML = '';
        }
        state.hasInteracted = false;
        elements.controls.classList.add('hidden');
      });

      elements.showBtn.addEventListener('click', () => {
         if (qType === 'single' || qType === 'multiple') {
            elements.options.forEach(opt => {
               opt.classList.remove('correct-reveal', 'selected');
               if (qData.correctAnswers.includes(parseInt(opt.dataset.idx))) {
                  opt.classList.add('correct-reveal');
               }
            });
         } else if (qType === 'fill') {
            elements.inputs.forEach((input, index) => {
               input.value = qData.blanks[index][0];
               input.classList.remove('wrong-reveal');
               input.classList.add('correct-reveal');
            });
         } else if (qType === 'match') {
            state.userMatches = Object.assign({}, qData.matches);
            drawLines();
         }
         elements.postControls.classList.add('hidden');
         elements.postControls.style.display = 'none';
      });

      document.addEventListener('keydown', (e) => {
         if(e.key === 'Enter' && !elements.checkBtn.classList.contains('hidden') && state.hasInteracted && !state.isAnswered) {
             elements.checkBtn.click();
         }
      });
    `;
  }
}

// --- ANA BİLEŞEN ---
export default function App() {
  const [step, setStep] = useState('upload');
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [questionType, setQuestionType] = useState('single');
  const [questionData, setQuestionData] = useState(null);
  
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    setError('');
    if (!file) return;
    if (!file.type.match('image.*')) {
      return setError('Sadece resim dosyaları desteklenmektedir (PNG, JPG, WEBP).');
    }
    if (file.size > 10 * 1024 * 1024) {
      return setError('Dosya boyutu 10MB sınırını aşamaz.');
    }
    
    try {
      const base64 = await fileToBase64(file);
      setImage(base64);
      setStep('preview');
    } catch (err) {
      setError('Resim okunurken bir hata oluştu.');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  useEffect(() => {
    const handlePaste = (e) => {
      if (step !== 'upload') return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          handleFile(items[i].getAsFile());
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [step]);

  const startAnalysis = async () => {
    setStep('analyzing');
    setError('');
    try {
      const data = await analyzeImageWithAI(image, questionType);
      setQuestionData(data);
      setStep('editor');
    } catch (err) {
      setError(err.message || 'Analiz başarısız oldu. Lütfen tekrar deneyin.');
      setStep('preview');
    }
  };

  const handleDownload = () => {
    try {
      const htmlContent = HTMLGenerator.generate(questionData, questionType);
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Etkilesimli_Soru_${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(err) {
      setError('HTML oluşturulamadı.');
    }
  };

  const renderUpload = () => (
    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-300 rounded-xl bg-white hover:border-blue-500 transition-colors"
         onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <Icons.Upload />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Görsel Ekle</h2>
      <p className="text-gray-500 mb-6 text-center">Sürükleyip bırakın, <kbd className="bg-gray-100 px-2 py-1 rounded">Ctrl+V</kbd> ile yapıştırın<br/>veya bilgisayarınızdan seçin.</p>
      
      <input type="file" className="hidden" ref={fileInputRef} accept="image/png, image/jpeg, image/jpg, image/webp" onChange={(e) => handleFile(e.target.files[0])} />
      <button onClick={() => fileInputRef.current.click()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-sm">
        Dosya Seç
      </button>
      <p className="text-xs text-gray-400 mt-4">Maksimum 10 MB (PNG, JPG, WEBP)</p>
    </div>
  );

  const renderPreview = () => (
    <div className="flex flex-col gap-6 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Görsel Ön İzleme & Ayarlar</h2>
        <button onClick={() => {setImage(null); setStep('upload');}} className="text-sm text-gray-500 hover:text-red-500">İptal</button>
      </div>
      
      <div className="bg-gray-100 rounded-lg p-2 flex justify-center max-h-[400px] overflow-hidden">
        <img src={image} alt="Yüklenen Soru" className="max-h-full object-contain mix-blend-multiply" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Soru Tipini Seçin</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { id: 'single', label: 'Tek Doğru (Çoktan Seçmeli)' },
            { id: 'multiple', label: 'Birden Fazla Doğru' },
            { id: 'fill', label: 'Boşluk Doldurma' },
            { id: 'match', label: 'Eşleştirme' }
          ].map(type => (
            <button key={type.id} onClick={() => setQuestionType(type.id)}
                    className={`p-3 text-sm font-medium rounded-lg border-2 transition-all ${questionType === type.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={startAnalysis} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg font-bold text-lg transition-colors shadow-md mt-4">
        Analizi Başlat
      </button>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center p-16 bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Yapay Zeka Analiz Ediyor...</h2>
      <p className="text-gray-500 text-center max-w-sm">Soru kökü, seçenekler, boşluklar ve mantıksal kurgu ayrıştırılıyor. Lütfen bekleyin.</p>
    </div>
  );

  const renderEditor = () => {
    if (!questionData) return null;

    const handleUpdate = (field, value) => {
      setQuestionData(prev => ({ ...prev, [field]: value }));
    };

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
           <div>
             <h2 className="text-lg font-bold text-gray-900">İçeriği Düzenle</h2>
             <p className="text-xs text-gray-500">AI analizi tamamlandı. Gerekli düzeltmeleri yapabilirsiniz.</p>
           </div>
           <button onClick={handleDownload} className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              <Icons.Download /> HTML Oluştur ve İndir
           </button>
        </div>
        
        <div className="p-6 overflow-y-auto grow">
          <div className="mb-6 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-3 flex items-center gap-2">
               <Icons.Check /> Canlı Ön İzleme
            </h3>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center text-center">
               {questionData.figureHtml && (
                 <div className="figure-container mb-6 w-full flex justify-center max-h-[300px] overflow-hidden" 
                      dangerouslySetInnerHTML={{ __html: questionData.figureHtml }} />
               )}
               <h1 className="text-xl font-medium text-gray-900" 
                   dangerouslySetInnerHTML={{ __html: questionData.questionText.replace(/\[___\]/g, '____') }} />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">Soru Metni (MathML formatını destekler)</label>
            <textarea 
              value={questionData.questionText} 
              onChange={e => handleUpdate('questionText', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[100px]"
            />
            {questionType === 'fill' && <p className="text-xs text-gray-500 mt-1">Boşlukları <kbd>[___]</kbd> şeklinde belirtiniz.</p>}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">Şekil/Grafik Kodu (SVG)</label>
            <textarea 
              value={questionData.figureHtml || ''} 
              onChange={e => handleUpdate('figureHtml', e.target.value)}
              placeholder="Eğer soruda şekil varsa buraya aslına uygun SVG kodu gelecektir..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[80px] font-mono text-xs text-gray-600 bg-gray-50"
            />
          </div>

          { (questionType === 'single' || questionType === 'multiple') && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Seçenekler ve Doğru Cevaplar</label>
              <div className="space-y-3">
                {questionData.options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <input 
                      type={questionType === 'single' ? 'radio' : 'checkbox'} 
                      name="correctAnswer"
                      checked={questionData.correctAnswers.includes(idx)}
                      onChange={() => {
                        let newCorrect = [...questionData.correctAnswers];
                        if (questionType === 'single') newCorrect = [idx];
                        else {
                          if (newCorrect.includes(idx)) newCorrect = newCorrect.filter(i => i !== idx);
                          else newCorrect.push(idx);
                        }
                        handleUpdate('correctAnswers', newCorrect);
                      }}
                      className="w-5 h-5 text-green-600 cursor-pointer"
                    />
                    <input 
                      type="text" value={opt}
                      onChange={e => {
                        const newOpts = [...questionData.options];
                        newOpts[idx] = e.target.value;
                        handleUpdate('options', newOpts);
                      }}
                      className="flex-1 p-2 border border-gray-300 rounded-md"
                    />
                    <button onClick={() => {
                       const newOpts = questionData.options.filter((_, i) => i !== idx);
                       const newCorrect = questionData.correctAnswers.filter(i => i !== idx).map(i => i > idx ? i - 1 : i);
                       setQuestionData({...questionData, options: newOpts, correctAnswers: newCorrect});
                    }} className="text-gray-400 hover:text-red-500 p-2"><Icons.Trash /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => handleUpdate('options', [...questionData.options, "Yeni Seçenek"])} className="mt-4 flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium">
                <Icons.Plus /> Seçenek Ekle
              </button>
            </div>
          )}

          { questionType === 'fill' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Boşluklar İçin Kabul Edilen Cevaplar</label>
              {questionData.blanks.map((blankAnswers, blankIdx) => (
                <div key={blankIdx} className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <span className="font-bold text-gray-600 mb-2 block">{blankIdx + 1}. Boşluk</span>
                  <div className="flex flex-wrap gap-2">
                    {blankAnswers.map((ans, ansIdx) => (
                      <div key={ansIdx} className="flex items-center bg-white border border-gray-300 rounded-md overflow-hidden">
                        <input type="text" value={ans} 
                               onChange={e => {
                                 const newBlanks = [...questionData.blanks];
                                 newBlanks[blankIdx][ansIdx] = e.target.value;
                                 handleUpdate('blanks', newBlanks);
                               }}
                               className="p-1 px-2 w-32 text-sm outline-none" />
                        <button onClick={() => {
                           const newBlanks = [...questionData.blanks];
                           newBlanks[blankIdx] = newBlanks[blankIdx].filter((_, i) => i !== ansIdx);
                           handleUpdate('blanks', newBlanks);
                        }} className="px-2 text-gray-400 hover:text-red-500 bg-gray-100 h-full border-l border-gray-300">×</button>
                      </div>
                    ))}
                    <button onClick={() => {
                       const newBlanks = [...questionData.blanks];
                       newBlanks[blankIdx].push("yeni cevap");
                       handleUpdate('blanks', newBlanks);
                    }} className="px-3 py-1 text-xs bg-white border border-dashed border-gray-400 rounded-md text-gray-600 hover:border-blue-500 hover:text-blue-600">+ Alternatif</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          { questionType === 'match' && (
            <div className="grid grid-cols-2 gap-8">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Sol Sütun</label>
                {questionData.leftColumn.map((item, idx) => (
                  <input key={`l-${idx}`} type="text" value={item} 
                         onChange={e => {
                           const newCol = [...questionData.leftColumn];
                           newCol[idx] = e.target.value;
                           handleUpdate('leftColumn', newCol);
                         }}
                         className="w-full p-2 mb-2 border border-gray-300 rounded-md" />
                ))}
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Sağ Sütun</label>
                {questionData.rightColumn.map((item, idx) => {
                  const matchedLeftIdx = Object.keys(questionData.matches).find(key => questionData.matches[key] === idx);
                  return (
                    <div key={`r-${idx}`} className="flex items-center gap-2 mb-2">
                       <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">Sol {parseInt(matchedLeftIdx)+1} </span>
                       <input type="text" value={item} 
                             onChange={e => {
                               const newCol = [...questionData.rightColumn];
                               newCol[idx] = e.target.value;
                               handleUpdate('rightColumn', newCol);
                             }}
                             className="flex-1 p-2 border border-gray-300 rounded-md" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.bg, color: COLORS.textNormal }}>
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight" style={{ color: COLORS.title }}>Etkileşimli Soru Oluşturucu</h1>
        <div className="text-sm font-medium px-3 py-1 bg-blue-50 text-blue-700 rounded-full">Pro Sürüm</div>
      </header>

      <main className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 flex items-start">
            <div className="text-red-500 mt-0.5 mr-3"><Icons.Error /></div>
            <div>
              <h3 className="text-sm font-bold text-red-800">Hata</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {step === 'upload' && renderUpload()}
        {step === 'preview' && renderPreview()}
        {step === 'analyzing' && renderAnalyzing()}
        {step === 'editor' && renderEditor()}
      </main>
    </div>
  );
}
