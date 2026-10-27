/* ==========================================================================
   Aura Transcribe JavaScript - Speech Recognition & Data Flow
   ========================================================================== */

// Global Error Handler for debugging
window.onerror = function(message, source, lineno, colno, error) {
  alert("JS 에러 발생: " + message + "\n파일: " + source + "\n라인: " + lineno);
  return false;
};

// Speech Recognition Instance
let recognition = null;
let isRecording = false;
let autoRestart = true;
let isAutoTranslate = true; // Flag for real-time translation toggle

// Active Session Data
let activeSpeakerId = 1;
let speakerCount = 3;
const speakers = {
  1: { name: "화자 1", id: 1, lang: "ja-JP", flag: "🇯🇵" },
  2: { name: "화자 2", id: 2, lang: "en-US", flag: "🇺🇸" },
  3: { name: "화자 3", id: 3, lang: "ko-KR", flag: "🇰🇷" }
};

// Transcript Records Database
let transcriptRecords = []; // Array of { speakerId, name, timestamp, text, langCode, langLabel, langFlag }

// Timers
let meetingTimerId = null;
let elapsedSeconds = 0;

// Interview Simulation State
let isInterviewMode = false;
let interviewTopic = '';
let interviewStep = 0;
let interviewTimeoutId = null;
let interviewLang = 'ko-KR'; // Active interview language
const interviewerId = 99;

// Interviewer voice attributes (configured via the setup modal)
let interviewerGender = 'male';   // 'male' | 'female'
let interviewerRate = 0.95;       // speech rate 0.5 ~ 1.5
let interviewerVoiceURI = '';     // selected SpeechSynthesisVoice.voiceURI

// Randomized question queue built per session: [{ text, isFollowup }, ...]
let interviewQueue = [];
let interviewAnswerStartIndex = 0; // transcriptRecords index where the current answer begins
const MAX_INTERVIEW_QUESTIONS = 8; // Safety cap including opening/closing + follow-ups

// Fixed opening / closing questions (always first / always last)
const interviewOpeningQuestions = {
  'ko-KR': "안녕하세요. {topic} 가상 면담을 시작하겠습니다. 먼저 지원자님의 자기소개와 지원 동기를 말씀해 주세요.",
  'en-US': "Hello. We will begin the virtual interview for {topic}. First, please introduce yourself and tell us about your motivation for applying.",
  'ja-JP': "こんにちは。{topic}の模擬面接を開始いたします。まず、自己紹介と志望動機についてお聞かせください。"
};
const interviewClosingQuestions = {
  'ko-KR': "마지막으로 가상 면담을 마치며, 저희 회사에 궁금한 점이나 본인이 꼭 어필하고 싶으신 말씀이 있다면 자유롭게 나누어 주세요. 감사합니다.",
  'en-US': "Lastly, as we conclude the interview, feel free to ask any questions you have for us or share anything you would like to emphasize. Thank you.",
  'ja-JP': "最後に、面接を終えるにあたり、弊社について気になる点や、ご自身がアピールしたいことがあれば自由にお話しください。お疲れ様でした。"
};

// General behavioral questions used regardless of topic category
const interviewCommonQuestionBank = {
  'ko-KR': [
    "이번에는 {topic} 직무와 관련하여 본인이 가장 보람을 느꼈거나 크게 성공했던 프로젝트 경험에 대해 말씀해 주세요.",
    "업무 도중 예상치 못한 팀원 간의 갈등이나 일정 지연 등의 어려움이 생긴다면, 어떻게 대처하시는지 경험을 들어 설명해 주세요.",
    "본인이 생각하시는 {topic} 직무에서 가장 중요한 핵심 역량은 무엇이며, 그 역량을 얼마나 갖추고 있다고 생각하시나요?",
    "최근에 새로운 지식이나 기술을 습득하기 위해 노력했던 경험이 있다면 소개해 주세요."
  ],
  'en-US': [
    "Please tell us about a project related to {topic} where you felt most rewarded or achieved great success.",
    "If you encounter unexpected team conflicts or schedule delays during work, how would you handle it? Please explain with an example.",
    "What do you think is the most important core competency for {topic}, and how well do you possess it?",
    "Please share a recent experience where you made an effort to learn a new skill or piece of knowledge."
  ],
  'ja-JP': [
    "{topic}に関連して、最もやりがいを感じた、あるいは大きな成果を上げたプロジェクトの経験について教えてください。",
    "業務中に予期せぬチーム内の対立やスケジュールの遅延が生じた場合、どのように対処しますか？経験を交えて説明してください。",
    "{topic}の職務において最も重要だと思う核心的な強みは何ですか？また、ご自身はその強みをどの程度備えていますか？",
    "最近、新しい知識やスキルを習得するために努力した経験があれば教えてください。"
  ]
};

// Topic-category-specific question pools, mixed into the common pool and shuffled
const interviewCategoryQuestionBank = {
  tech: {
    'ko-KR': [
      "{topic} 업무를 수행하면서 기술적으로 가장 어려웠던 문제와 그 해결 과정을 설명해 주세요.",
      "코드 품질이나 유지보수성을 높이기 위해 평소에 어떤 원칙을 지키려고 하시나요?",
      "새로운 기술 스택을 도입할지 결정할 때, 본인만의 판단 기준이 있다면 말씀해 주세요.",
      "동료의 코드리뷰를 받았을 때, 의견이 다르면 어떻게 조율하시는 편인가요?"
    ],
    'en-US': [
      "Tell us about the most technically challenging problem you faced while working on {topic}, and how you solved it.",
      "What principles do you try to follow to keep code quality and maintainability high?",
      "How do you decide whether to adopt a new technology stack?",
      "When you receive code review feedback you disagree with, how do you handle that?"
    ],
    'ja-JP': [
      "{topic}の業務で技術的に最も難しかった問題と、その解決プロセスを教えてください。",
      "コードの品質や保守性を高めるために、普段心掛けていることはありますか？",
      "新しい技術スタックを導入するかどうかを判断する際の基準はありますか？",
      "同僚のコードレビューで意見が違った場合、どのように調整しますか？"
    ]
  },
  marketing: {
    'ko-KR': [
      "{topic} 관련 캠페인이나 프로젝트를 기획할 때 가장 먼저 고려하는 것은 무엇인가요?",
      "데이터를 활용해 마케팅 성과를 개선했던 경험이 있다면 구체적으로 말씀해 주세요.",
      "예산이나 리소스가 제한된 상황에서 성과를 내야 했던 경험을 설명해 주세요.",
      "고객이나 타겟 오디언스를 분석할 때 본인만의 방법이 있다면 소개해 주세요."
    ],
    'en-US': [
      "When planning a campaign or project related to {topic}, what do you consider first?",
      "Please describe a specific experience where you used data to improve marketing performance.",
      "Tell us about a time you had to deliver results with a limited budget or resources.",
      "Do you have your own method for analyzing customers or target audiences?"
    ],
    'ja-JP': [
      "{topic}に関するキャンペーンやプロジェクトを企画する際、最初に考慮することは何ですか？",
      "データを活用してマーケティング成果を改善した具体的な経験を教えてください。",
      "予算やリソースが限られた状況で成果を出さなければならなかった経験を教えてください。",
      "顧客やターゲットオーディエンスを分析する際の、ご自身の方法があれば教えてください。"
    ]
  },
  design: {
    'ko-KR': [
      "{topic} 작업을 진행할 때 사용자 관점을 어떻게 반영하시나요?",
      "디자인 시안에 대해 이해관계자와 의견이 부딪혔던 경험과 해결 방법을 말씀해 주세요.",
      "완성도와 일정 사이에서 타협해야 했던 경험이 있다면 설명해 주세요.",
      "본인의 디자인 스타일이나 강점을 한 문장으로 표현한다면 무엇인가요?"
    ],
    'en-US': [
      "How do you incorporate the user's perspective when working on {topic}?",
      "Tell us about a time you disagreed with a stakeholder on a design draft, and how you resolved it.",
      "Describe an experience where you had to balance quality and deadlines.",
      "If you had to describe your design style or strength in one sentence, what would it be?"
    ],
    'ja-JP': [
      "{topic}の作業を進める際、ユーザーの視点をどのように反映していますか？",
      "デザイン案について関係者と意見が対立した経験と、その解決方法を教えてください。",
      "完成度とスケジュールの間で妥協しなければならなかった経験があれば教えてください。",
      "ご自身のデザインスタイルや強みを一言で表すとしたら何ですか？"
    ]
  },
  service: {
    'ko-KR': [
      "까다로운 고객을 응대했던 경험과 그 상황을 해결한 방법을 말씀해 주세요.",
      "{topic} 업무에서 고객 만족도를 높이기 위해 본인이 실천하는 것은 무엇인가요?",
      "반복적인 불만이나 문의를 개선하기 위해 시도했던 경험이 있다면 소개해 주세요.",
      "감정적으로 힘들었던 상담 상황을 어떻게 관리하시는 편인가요?"
    ],
    'en-US': [
      "Tell us about a time you dealt with a difficult customer and how you resolved the situation.",
      "In {topic}, what do you personally do to improve customer satisfaction?",
      "Describe an experience where you tried to improve recurring complaints or inquiries.",
      "How do you manage emotionally difficult customer interactions?"
    ],
    'ja-JP': [
      "対応が難しい顧客への対応経験と、その解決方法を教えてください。",
      "{topic}の業務で顧客満足度を高めるために実践していることは何ですか？",
      "繰り返し発生するクレームや問い合わせを改善しようとした経験があれば教えてください。",
      "感情的に大変だった対応をどのように管理していますか？"
    ]
  }
};

// Keyword-triggered follow-up questions, generated from the interviewee's last answer
const interviewFollowupTriggers = {
  'ko-KR': [
    { keywords: ['갈등', '트러블', '다툼', '싸움', '대립'], question: "방금 말씀하신 갈등 상황에서, 구체적으로 어떻게 해결하셨는지 조금 더 자세히 설명해 주시겠어요?" },
    { keywords: ['실패', '실수', '어려움', '힘들', '문제'], question: "그 어려움을 겪으며 느낀 점이나 이후 달라진 점이 있다면 말씀해 주세요." },
    { keywords: ['성공', '성과', '달성', '완료', '뿌듯'], question: "그 성과를 내는 과정에서 본인이 가장 크게 기여한 부분은 무엇이었나요?" },
    { keywords: ['팀', '협업', '동료', '팀원'], question: "팀원들과 협업할 때 본인만의 방식이나 원칙이 있다면 소개해 주세요." }
  ],
  'en-US': [
    { keywords: ['conflict', 'argument', 'disagreement'], question: "Could you elaborate on exactly how you resolved that conflict?" },
    { keywords: ['fail', 'mistake', 'difficult', 'struggle', 'problem'], question: "What did you learn from that difficulty, or what changed afterward?" },
    { keywords: ['success', 'achieve', 'accomplish', 'proud'], question: "What part of that achievement did you personally contribute the most to?" },
    { keywords: ['team', 'collaborate', 'colleague'], question: "Do you have your own approach or principles when collaborating with teammates?" }
  ],
  'ja-JP': [
    { keywords: ['対立', '葛藤', '衝突', 'トラブル'], question: "その対立をどのように具体的に解決したのか、もう少し詳しく教えていただけますか？" },
    { keywords: ['失敗', 'ミス', '困難', '問題'], question: "その困難から学んだことや、その後変わった点があれば教えてください。" },
    { keywords: ['成功', '成果', '達成'], question: "その成果を出す過程で、ご自身が最も貢献した部分は何ですか？" },
    { keywords: ['チーム', '協力', '同僚'], question: "チームメンバーと協力する際、ご自身なりのやり方や原則があれば教えてください。" }
  ]
};
// Fallback follow-up when the answer was too short to trigger a keyword match
const interviewFollowupFallback = {
  'ko-KR': "조금 더 구체적인 사례를 들어 자세히 설명해 주시겠어요?",
  'en-US': "Could you give a more specific example and elaborate a bit further?",
  'ja-JP': "もう少し具体的な事例を挙げて詳しく説明していただけますか？"
};

const interviewEndText = {
  'ko-KR': "모든 가상 면담 질문이 완료되었습니다. 대화 기록을 복기해 보시고, 우측 하단의 [회의록 저장]을 눌러 파일로 내려받아 검토해 보세요. 면담 시뮬레이션을 종료합니다. 수고하셨습니다!",
  'en-US': "All virtual interview questions have been completed. Please review the conversation logs, and you can download the entire record by clicking [Export Transcript] at the bottom right. The interview simulation is now finished. Thank you for your hard work!",
  'ja-JP': "すべての模擬面接の質問が終了しました。対話記録を振り返り、右下の「会議録保存」をクリックしてファイルとしてダウンロードし、検討してみてください。模擬面接を終了します。お疲れ様でした！"
};
// DOM Elements cache
const chatStream = document.getElementById('chat-stream');
const chatContainer = document.getElementById('chat-container');
const recordBtn = document.getElementById('record-btn');
const micIcon = document.getElementById('mic-icon');
const recordLabel = document.getElementById('record-label');
const statusDot = document.getElementById('status-dot');
const meetingTimer = document.getElementById('meeting-timer');
const interimPreviewCard = document.getElementById('interim-preview-card');
const interimText = document.getElementById('interim-text');
const previewSpeaker = document.getElementById('preview-speaker');
const speakerContainer = document.getElementById('speaker-container');
const saveModal = document.getElementById('save-modal');
const meetingTitleInput = document.getElementById('meeting-title');

// Initialize Web Speech API
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    alert("이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다. Chrome, Safari, Edge 브라우저를 사용해 주세요.");
    recordBtn.disabled = true;
    recordLabel.textContent = "지원 안 함";
    return false;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = document.getElementById('recognition-lang').value;
  
  recognition.onstart = () => {
    isRecording = true;
    recordBtn.classList.add('recording');
    micIcon.className = 'ph-fill ph-microphone-slash';
    recordLabel.textContent = "기록 중지";
    statusDot.className = 'pulse-dot recording';
    startTimer();
  };
  
  recognition.onend = () => {
    // Web Speech API naturally times out after short silence.
    // If the user didn't explicitly click stop, auto-restart it.
    if (isRecording && autoRestart) {
      try {
        recognition.start();
      } catch (e) {
        console.error("Auto restart failed:", e);
      }
    } else {
      isRecording = false;
      recordBtn.classList.remove('recording');
      micIcon.className = 'ph-fill ph-microphone';
      recordLabel.textContent = "녹음 시작";
      statusDot.className = 'pulse-dot idle';
      stopTimer();
      hideInterimCard();
    }
  };
  
  recognition.onerror = (event) => {
    console.error("Speech Recognition Error:", event.error);
    isRecording = false;
    autoRestart = false;
    
    if (event.error === 'not-allowed') {
      alert("마이크 사용 권한이 거부되었습니다. 주소창의 잠금 아이콘을 눌러 마이크 권한을 허용해 주세요.");
    } else if (event.error === 'network') {
      alert("네트워크 오류 또는 권한 문제로 음성 인식을 시작할 수 없습니다.\n\n로컬 파일(file://)로 실행 중이라면 크롬 보안 정책으로 인해 마이크가 작동하지 않습니다. Electron 앱(npm start)으로 실행하거나 로컬 웹 서버(localhost)를 통해 접속해 주세요.");
    } else {
      alert("음성 인식 오류 발생: " + event.error);
    }
    
    try {
      recognition.stop();
    } catch(e) {}
  };
  
  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    
    // 1. Process Final Output
    if (finalTranscript.trim().length > 0) {
      handleFinalTranscript(finalTranscript.trim());
    }
    
    // 2. Process Interim Output (show real-time feedback card)
    if (interimTranscript.trim().length > 0) {
      showInterimCard(interimTranscript);
    }
  };
  
  return true;
}

// Phonetic Translation Maps for dynamic transcription conversion
const englishTranslationMap = {
  '헬로': 'Hello',
  '헬로우': 'Hello',
  '오케이': 'Okay',
  '오케': 'Okay',
  '웰컴': 'Welcome',
  '하우아유': 'How are you?',
  '굿모닝': 'Good morning',
  '굿바이': 'Goodbye',
  '플리즈': 'Please',
  '땡큐': 'Thank you',
  '생큐': 'Thank you',
  '탱큐': 'Thank you',
  '아임': 'I am',
  '유': 'you',
  '디스': 'this',
  '이즈': 'is',
  '예스': 'Yes',
  '노': 'No',
  '하이': 'Hi',
  '바이': 'Bye',
  '굿': 'Good',
  '미팅': 'Meeting',
  '프로젝트': 'Project',
  '스타트': 'Start',
  '피니시': 'Finish'
};

const japaneseTranslationMap = {
  '아리가또': 'ありがとう',
  '아리가토': 'ありがとう',
  '아리가또고자이마스': 'ありがとうございます',
  '아리가토고자이마스': 'ありがとうございます',
  '곤니찌와': 'こんにちは',
  '곤니치와': 'こんにちは',
  '오하이오': 'おはよう',
  '오하요': 'おはよう',
  '오하이요고자이마스': 'おはようございます',
  '오하요고자이마스': 'おはようございます',
  '스미마센': 'すみません',
  '스이마센': 'すみません',
  '도조': 'どうぞ',
  '사요나라': 'さようなら',
  '하지메마시테': 'はじめまして',
  '하지메마시떼': 'はじめまして',
  '데스': 'です',
  '마스': 'ます',
  '하이': 'はい',
  '이이에': 'いいえ',
  '오네가이시마스': 'お願いします',
  '와카리마시타': 'わかりました',
  '와카리마시따': 'わかりました',
  '다이죠부': '大丈夫',
  '다이죠부데스': '大丈夫です',
  '오케이': 'OK',
  '미팅': 'ミーティング',
  '프로젝트': 'プロジェクト'
};

function translatePhonetics(text, targetLang) {
  let translatedText = text;
  
  if (targetLang === 'ja-JP') {
    // Sort keys by length descending to replace multi-word phrases first
    const keys = Object.keys(japaneseTranslationMap).sort((a, b) => b.length - a.length);
    keys.forEach(key => {
      const regex = new RegExp(key, 'g');
      translatedText = translatedText.replace(regex, japaneseTranslationMap[key]);
    });
  } else if (targetLang === 'en-US') {
    const keys = Object.keys(englishTranslationMap).sort((a, b) => b.length - a.length);
    keys.forEach(key => {
      const regex = new RegExp(key, 'g');
      translatedText = translatedText.replace(regex, englishTranslationMap[key]);
    });
  }
  
  return translatedText;
}

// ==========================================================================
// Speech Processing Logic
// ==========================================================================
async function handleFinalTranscript(text) {
  hideInterimCard();
  
  // A. Determine spoken language
  const detected = detectLanguage(text);
  
  // B. Translate phonetic Hangul into native characters if foreign language is detected
  let finalChatText = text;
  if (detected.code !== 'ko-KR') {
    finalChatText = translatePhonetics(text, detected.code);
  }
  
  // C. Construct record
  const now = new Date();
  const timeStr = formatAmPm(now);
  
  const record = {
    speakerId: activeSpeakerId,
    speakerName: speakers[activeSpeakerId].name,
    timestamp: timeStr,
    text: finalChatText,
    langCode: detected.code,
    langLabel: detected.label,
    langFlag: detected.flag
  };
  
  // D. Save record
  transcriptRecords.push(record);
  
  // E. Append bubble to Chat Stream
  appendMessageBubble(record);

  // F. Translate to Korean if the spoken language is Japanese (or other foreign languages)
  if (isAutoTranslate && detected.code !== 'ko-KR' && !isInterviewMode) {
    try {
      const sourceLang = detected.code.split('-')[0]; // e.g. 'ja', 'en'
      const translatedText = await translateToKorean(finalChatText, sourceLang);
      
      if (translatedText && translatedText.trim() !== finalChatText.trim()) {
        const translationRecord = {
          speakerId: activeSpeakerId,
          speakerName: `${speakers[activeSpeakerId].name} (번역)`,
          timestamp: timeStr,
          text: `📝 번역: ${translatedText}`,
          langCode: 'ko-KR',
          langLabel: '한국어 번역',
          langFlag: '🇰🇷'
        };
        
        // Save and display translation bubble
        transcriptRecords.push(translationRecord);
        appendTranslationBubble(translationRecord);
      }
    } catch (e) {
      console.error("Translation error:", e);
    }
  }
}

// Translate foreign text to Korean using public translation API
async function translateToKorean(text, sourceLang) {
  if (!text.trim()) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Translation request failed');
    const data = await response.json();
    if (data && data[0] && data[0][0] && data[0][0][0]) {
      return data[0][0][0];
    }
    return '';
  } catch (e) {
    console.error("Translation API error:", e);
    return '';
  }
}

function detectLanguage(text) {
  const cleanText = text.trim();
  if (!cleanText) return { code: 'ko-KR', label: '한국어', flag: '🇰🇷' };
  
  // Prioritize the active speaker's explicitly configured language
  if (speakers[activeSpeakerId]) {
    const activeLang = speakers[activeSpeakerId].lang;
    if (activeLang === 'ja-JP') return { code: 'ja-JP', label: '日本語', flag: '🇯🇵' };
    if (activeLang === 'en-US') return { code: 'en-US', label: 'English', flag: '🇺🇸' };
    if (activeLang === 'ko-KR') return { code: 'ko-KR', label: '한국어', flag: '🇰🇷' };
  }
  
  const lowercaseText = cleanText.toLowerCase();
  
  // 1. Smart Phonetic overrides for common foreign greetings
  const englishPhonetics = [
    '헬로', '헬로우', '오케이', '웰컴', '하우아유', '굿모닝', '굿바이', '플리즈', '땡큐', 
    '아임', '유', '디스', '이즈', '예스', '노', '생큐', '탱큐', '하이', '바이', '굿', '미팅', '프로젝트'
  ];
  
  const japanesePhonetics = [
    '아리가또', '아리가토', '곤니찌와', '곤니치와', '오하이오', '스미마센', '스이마센', 
    '도조', '사요나라', '하지메마시테', '하지메마시떼', '데스', '마스'
  ];
  
  const hasEnglishPhonetic = englishPhonetics.some(word => lowercaseText.includes(word));
  const hasJapanesePhonetic = japanesePhonetics.some(word => lowercaseText.includes(word));
  
  // Regular expressions for character sets
  const hangulRegex = /[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/g;
  const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/g; // Hiragana & Katakana count
  const englishRegex = /[a-zA-Z]/g;
  
  const hangulCount = (cleanText.match(hangulRegex) || []).length;
  const jpCount = (cleanText.match(japaneseRegex) || []).length;
  const englishCount = (cleanText.match(englishRegex) || []).length;
  const totalLetters = cleanText.replace(/\s/g, '').length;
  
  // Phonetic matches override standard scripts
  if (hasJapanesePhonetic && hangulCount > 0) {
    return { code: 'ja-JP', label: '日本語 (음성 감지)', flag: '🇯🇵' };
  }
  if (hasEnglishPhonetic && hangulCount > 0) {
    return { code: 'en-US', label: 'English (음성 감지)', flag: '🇺🇸' };
  }
  
  // 2. Main Character Set Check
  // Japanese kana presence
  if (jpCount > 0) {
    return { code: 'ja-JP', label: '日本語', flag: '🇯🇵' };
  }
  
  // English alphabet presence (30%+)
  if (englishCount > totalLetters * 0.3) {
    return { code: 'en-US', label: 'English', flag: '🇺🇸' };
  }
  
  // Korean Hangul presence
  if (hangulCount > 0) {
    return { code: 'ko-KR', label: '한국어', flag: '🇰🇷' };
  }
  
  // Fallback to active speaker's preferred language configuration
  if (speakers[activeSpeakerId]) {
    const activeLang = speakers[activeSpeakerId].lang;
    if (activeLang === 'ja-JP') return { code: 'ja-JP', label: '日本語', flag: '🇯🇵' };
    if (activeLang === 'en-US') return { code: 'en-US', label: 'English', flag: '🇺🇸' };
  }
  
  return { code: 'ko-KR', label: '한국어', flag: '🇰🇷' };
}

function appendMessageBubble(record) {
  const msgGroup = document.createElement('div');
  
  // Map class sp-1, sp-2 etc based on ID for distinct CSS colors
  const spClass = record.speakerId <= 4 ? `sp-${record.speakerId}` : 'sp-default';
  msgGroup.className = `message-group ${spClass}`;
  
  // Design element: highlight active user with self style class if desired
  // Currently, we maintain clean sequential meeting style.
  
  msgGroup.innerHTML = `
    <div class="avatar">${record.speakerId}</div>
    <div class="message-content">
      <div class="message-meta">
        <span class="speaker-name">${escapeHtml(record.speakerName)}</span>
        <span class="lang-badge">${record.langFlag} ${record.langLabel}</span>
      </div>
      <div class="bubbles-row">
        <div class="bubble">${escapeHtml(record.text)}</div>
      </div>
    </div>
    <span class="timestamp">${record.timestamp}</span>
  `;
  
  chatStream.appendChild(msgGroup);
  
  // Smooth scroll to bottom
  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: 'smooth'
  });
}

function appendTranslationBubble(record) {
  const lastMsgGroup = chatStream.lastElementChild;
  if (!lastMsgGroup) return;
  
  const bubblesRow = lastMsgGroup.querySelector('.bubbles-row');
  if (!bubblesRow) return;
  
  const translationBubble = document.createElement('div');
  translationBubble.className = 'bubble translation-bubble';
  translationBubble.innerHTML = escapeHtml(record.text);
  
  // Custom styled emerald green bubble with dashed border for translation
  translationBubble.style.backgroundColor = 'var(--speaker-2-bg)';
  translationBubble.style.color = 'var(--speaker-2-text)';
  translationBubble.style.borderRadius = '4px 18px 18px 18px';
  translationBubble.style.border = '1px dashed var(--speaker-2-avatar)';
  
  bubblesRow.appendChild(translationBubble);
  
  // Smooth scroll to bottom
  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: 'smooth'
  });
}

// Interim Preview Management
function showInterimCard(text) {
  previewSpeaker.textContent = speakers[activeSpeakerId].name;
  
  // Apply speaker specific border colors matching standard design
  const previewTag = document.getElementById('preview-speaker');
  previewTag.className = 'speaker-tag';
  if (activeSpeakerId <= 4) {
    previewTag.style.backgroundColor = `var(--speaker-${activeSpeakerId}-bg)`;
    previewTag.style.color = `var(--speaker-${activeSpeakerId}-text)`;
  } else {
    previewTag.style.backgroundColor = 'var(--speaker-5-bg)';
    previewTag.style.color = 'var(--speaker-5-text)';
  }
  
  interimText.textContent = text;
  interimPreviewCard.classList.add('visible');
}

function hideInterimCard() {
  interimPreviewCard.classList.remove('visible');
}

// ==========================================================================
// Transcription controls
// ==========================================================================
function toggleAutoTranslation() {
  const btn = document.getElementById('translation-toggle-btn');
  isAutoTranslate = !isAutoTranslate;
  
  if (isAutoTranslate) {
    btn.classList.add('active');
    btn.title = "실시간 한글 번역 켬";
  } else {
    btn.classList.remove('active');
    btn.title = "실시간 한글 번역 끎";
  }
}

function toggleTranscription() {
  if (!recognition && !initSpeechRecognition()) return;
  
  if (isRecording) {
    // User requested stop
    autoRestart = false;
    isRecording = false;
    recognition.stop();
  } else {
    // User requested start
    autoRestart = true;
    isRecording = true;
    recognition.lang = document.getElementById('recognition-lang').value;
    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start:", e);
    }
  }
}

function changeRecognitionLanguage() {
  const newLang = document.getElementById('recognition-lang').value;
  
  // Update current active speaker's language preference
  if (speakers[activeSpeakerId]) {
    speakers[activeSpeakerId].lang = newLang;
    
    // Update flag mapping for UI
    let flag = "🇰🇷";
    if (newLang === "en-US") flag = "🇺🇸";
    else if (newLang === "ja-JP") flag = "🇯🇵";
    speakers[activeSpeakerId].flag = flag;
    
    // Update the flag on the active speaker's tab text
    const activeTab = document.querySelector(`.speaker-tab[data-id="${activeSpeakerId}"] .speaker-name`);
    if (activeTab) {
      activeTab.textContent = `화자 ${activeSpeakerId} ${flag}`;
    }
  }
  
  if (recognition) {
    recognition.lang = newLang;
    
    // If running, restart to apply language changes
    if (isRecording) {
      autoRestart = true;
      recognition.stop(); // End triggers restart in onend handler
    }
  }
}

// ==========================================================================
// Speaker Management
// ==========================================================================
function setActiveSpeaker(id) {
  activeSpeakerId = parseInt(id);
  
  // Update speaker switcher UI buttons
  const tabs = document.querySelectorAll('.speaker-tab');
  tabs.forEach(tab => {
    tab.classList.remove('active');
    if (parseInt(tab.dataset.id) === activeSpeakerId) {
      tab.classList.add('active');
    }
  });
  
  // Update the dropdown value to match this speaker's preferred language
  const langSelect = document.getElementById('recognition-lang');
  if (langSelect && speakers[activeSpeakerId]) {
    langSelect.value = speakers[activeSpeakerId].lang;
  }
  
  // Apply language update to active Speech Recognition
  if (recognition && speakers[activeSpeakerId]) {
    recognition.lang = speakers[activeSpeakerId].lang;
    
    // If running, restart to apply language changes
    if (isRecording) {
      autoRestart = true;
      recognition.stop(); // End triggers restart in onend handler
    }
  }
  
  // Dynamic update on interim card speaker name
  if (interimPreviewCard.classList.contains('visible')) {
    previewSpeaker.textContent = speakers[activeSpeakerId].name;
  }
}

function addNewSpeaker() {
  speakerCount++;
  const newId = speakerCount;
  speakers[newId] = { name: `화자 ${newId}`, id: newId, lang: "ko-KR", flag: "🇰🇷" };
  
  // Create speaker element inside dock
  const btn = document.createElement('button');
  btn.className = 'speaker-tab';
  btn.dataset.id = newId;
  btn.onclick = () => setActiveSpeaker(newId);
  
  const avatarClass = newId <= 4 ? `avatar-${newId}` : 'avatar-5';
  btn.innerHTML = `
    <span class="avatar ${avatarClass}">${newId}</span>
    <span class="speaker-name">화자 ${newId} 🇰🇷</span>
  `;
  
  // Insert before the add-speaker-btn
  const addBtn = speakerContainer.querySelector('.add-speaker-btn');
  speakerContainer.insertBefore(btn, addBtn);
  
  // Auto scroll speaker switcher to show new item
  speakerContainer.scrollLeft = speakerContainer.scrollWidth;
  
  // Set new speaker active immediately
  setActiveSpeaker(newId);
}

// ==========================================================================
// Storage and Clear functions
// ==========================================================================
function clearChatStream() {
  if (confirm("정말로 모든 대화 기록을 지우시겠습니까?")) {
    transcriptRecords = [];
    chatStream.innerHTML = `
      <div class="system-notice">
        <i class="ph-bold ph-info"></i>
        <span>회의록 기록이 초기화되었습니다. 마이크를 켜고 발언을 시작해 주세요.</span>
      </div>
    `;
    elapsedSeconds = 0;
    meetingTimer.textContent = "00:00";
    hideInterimCard();
  }
}

// ==========================================================================
// Export / Save Minutes Functionalities
// ==========================================================================
let currentPreviewMode = 'chrono';

function openSaveModal() {
  if (transcriptRecords.length === 0) {
    alert("저장할 회의 기록 내용이 없습니다. 먼저 발언을 기록해 주세요.");
    return;
  }
  saveModal.classList.add('visible');
  switchPreviewMode('chrono');
}

function closeSaveModal() {
  saveModal.classList.remove('visible');
}

function switchPreviewMode(mode) {
  currentPreviewMode = mode;
  
  const btnChrono = document.getElementById('btn-preview-chrono');
  const btnSpeaker = document.getElementById('btn-preview-speaker');
  
  if (mode === 'chrono') {
    btnChrono.style.backgroundColor = 'var(--accent-primary)';
    btnChrono.style.borderColor = 'var(--accent-primary)';
    btnChrono.style.color = 'white';
    
    btnSpeaker.style.backgroundColor = 'var(--bg-app)';
    btnSpeaker.style.borderColor = 'var(--border-color)';
    btnSpeaker.style.color = 'var(--text-secondary)';
  } else {
    btnSpeaker.style.backgroundColor = 'var(--accent-primary)';
    btnSpeaker.style.borderColor = 'var(--accent-primary)';
    btnSpeaker.style.color = 'white';
    
    btnChrono.style.backgroundColor = 'var(--bg-app)';
    btnChrono.style.borderColor = 'var(--border-color)';
    btnChrono.style.color = 'var(--text-secondary)';
  }
  
  updateTranscriptPreview();
}

function updateTranscriptPreview() {
  const previewArea = document.getElementById('transcript-preview-area');
  if (!previewArea) return;
  
  if (currentPreviewMode === 'chrono') {
    previewArea.value = generateFullTranscriptText();
  } else {
    previewArea.value = generateSpeakerTranscriptText();
  }
}

function generateFullTranscriptText() {
  const title = meetingTitleInput.value.trim() || "실시간 회의록";
  const now = new Date();
  
  let content = `==================================================\n`;
  content += ` 회의록: ${title}\n`;
  content += ` 작성 일시: ${now.toLocaleString('ko-KR')}\n`;
  content += ` 총 기록 시간: ${meetingTimer.textContent}\n`;
  content += `==================================================\n\n`;
  
  transcriptRecords.forEach((record, index) => {
    content += `[${record.speakerName}] (${record.timestamp}) [${record.langFlag} ${record.langLabel}]\n`;
    content += `${record.text}\n\n`;
  });
  
  return content;
}

function generateSpeakerTranscriptText() {
  const title = meetingTitleInput.value.trim() || "실시간 회의록";
  const now = new Date();
  
  let content = `==================================================\n`;
  content += ` 회의록: ${title} (화자별 묶음)\n`;
  content += ` 작성 일시: ${now.toLocaleString('ko-KR')}\n`;
  content += ` 총 기록 시간: ${meetingTimer.textContent}\n`;
  content += `==================================================\n\n`;
  
  const grouped = {};
  transcriptRecords.forEach(record => {
    if (!grouped[record.speakerId]) {
      grouped[record.speakerId] = {
        name: record.speakerName,
        lines: []
      };
    }
    grouped[record.speakerId].lines.push(record);
  });
  
  Object.keys(grouped).forEach(spId => {
    const group = grouped[spId];
    content += `=== ${group.name} 발언 기록 ===\n`;
    
    if (group.lines.length === 0) {
      content += `(발언 내용 없음)\n`;
    } else {
      group.lines.forEach(line => {
        content += `- [${line.timestamp}] [${line.langFlag} ${line.langLabel}] : ${line.text}\n`;
      });
    }
    content += `\n`;
  });
  
  return content;
}

function downloadCurrentTranscript() {
  const title = meetingTitleInput.value.trim() || "실시간 회의록";
  const textContent = document.getElementById('transcript-preview-area').value;
  const suffix = currentPreviewMode === 'chrono' ? "전체_회의록" : "화자별_회의록";
  
  triggerTxtDownload(`${title}_${suffix}.txt`, textContent);
  closeSaveModal();
}

function triggerTxtDownload(filename, textContent) {
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a');
  
  element.setAttribute('href', url);
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  
  element.click();
  
  document.body.removeChild(element);
  URL.revokeObjectURL(url);
}

// ==========================================================================
// Helper Utility Functions
// ==========================================================================
function startTimer() {
  if (meetingTimerId) return;
  meetingTimerId = setInterval(() => {
    elapsedSeconds++;
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
    meetingTimer.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (meetingTimerId) {
    clearInterval(meetingTimerId);
    meetingTimerId = null;
  }
}

function formatAmPm(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? '오후' : '오전';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 hour represents 12
  return `${ampm} ${hours}:${minutes}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================================
// 6. Camera Monitoring Stream Logic
// ==========================================================================
let cameraStream = null;
let isCameraOn = false;

function toggleCamera() {
  const video = document.getElementById('camera-video');
  const wrapper = document.getElementById('camera-wrapper');
  const btn = document.getElementById('camera-toggle-btn');
  
  if (isCameraOn) {
    // Turn camera OFF
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    video.srcObject = null;
    wrapper.classList.remove('visible');
    
    btn.classList.remove('active');
    btn.innerHTML = `<i class="ph-bold ph-video-camera-slash"></i>`;
    btn.title = "카메라 켜기";
    
    isCameraOn = false;
  } else {
    // Turn camera ON
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("이 브라우저에서는 카메라 기능을 지원하지 않습니다.");
      return;
    }
    
    // Request only video (no audio to prevent conflict with STT mic)
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        cameraStream = stream;
        video.srcObject = stream;
        wrapper.classList.add('visible');
        
        btn.classList.add('active');
        btn.innerHTML = `<i class="ph-bold ph-video-camera"></i>`;
        btn.title = "카메라 끄기";
        
        isCameraOn = true;
      })
      .catch(err => {
        console.error("Camera accessibility error:", err);
        alert("카메라 스트림을 시작할 수 없습니다. 카메라가 장치에 꽂혀 있고 브라우저의 카메라 접근 권한을 확인해 주세요.");
      });
  }
}

function checkCameraAvailability() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    const btn = document.getElementById('camera-toggle-btn');
    if (btn) btn.style.display = 'none';
    return;
  }
  
  navigator.mediaDevices.enumerateDevices()
    .then(devices => {
      const hasVideo = devices.some(device => device.kind === 'videoinput');
      const btn = document.getElementById('camera-toggle-btn');
      if (btn) {
        if (!hasVideo) {
          btn.style.opacity = '0.4';
          btn.title = "연결된 카메라 장치 없음";
          btn.disabled = true;
        } else {
          btn.style.opacity = '1';
          btn.disabled = false;
        }
      }
    })
    .catch(err => {
      console.log("Device check failed:", err);
    });
}

// Initial checks on load
checkCameraAvailability();
makeDraggable(document.getElementById('camera-wrapper'));

// Make the camera window draggable within the app-container
function makeDraggable(element) {
  if (!element) return;
  
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  
  element.addEventListener('mousedown', onMouseDown);
  element.addEventListener('touchstart', onTouchStart, { passive: false });
  
  function onMouseDown(e) {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = element.getBoundingClientRect();
    const container = document.querySelector('.app-container');
    const containerRect = container.getBoundingClientRect();
    
    startLeft = rect.left - containerRect.left;
    startTop = rect.top - containerRect.top;
    
    element.style.cursor = 'grabbing';
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  
  function onMouseMove(e) {
    e.preventDefault();
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    updatePosition(startLeft + deltaX, startTop + deltaY);
  }
  
  function onMouseUp() {
    element.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  
  function onTouchStart(e) {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    
    const rect = element.getBoundingClientRect();
    const container = document.querySelector('.app-container');
    const containerRect = container.getBoundingClientRect();
    
    startLeft = rect.left - containerRect.left;
    startTop = rect.top - containerRect.top;
    
    element.style.cursor = 'grabbing';
    
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }
  
  function onTouchMove(e) {
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    
    e.preventDefault();
    updatePosition(startLeft + deltaX, startTop + deltaY);
  }
  
  function onTouchEnd() {
    element.style.cursor = 'grab';
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  }
  
  function updatePosition(newLeft, newTop) {
    const container = document.querySelector('.app-container');
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    const minLeft = 0;
    const maxLeft = containerRect.width - elementRect.width;
    const minTop = 0;
    const maxTop = containerRect.height - elementRect.height;
    
    const clampedLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
    const clampedTop = Math.max(minTop, Math.min(newTop, maxTop));
    
    element.style.left = `${clampedLeft}px`;
    element.style.top = `${clampedTop}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
}

// ==========================================================================
// 7. Interview Simulation Logic
// ==========================================================================
function startInterviewSimulation() {
  const selectedLang = document.getElementById('recognition-lang').value;
  interviewLang = selectedLang;

  if (isInterviewMode) {
    const cancelConfirmText = interviewLang === 'ja-JP' ? "模擬面接を中断しますか？" : (interviewLang === 'en-US' ? "Stop the virtual interview?" : "현재 가상 면담이 진행 중입니다. 면담을 중단하시겠습니까?");
    if (confirm(cancelConfirmText)) {
      stopInterviewSimulation();
    }
    return;
  }

  openInterviewSetupModal();
}

// ==========================================================================
// Interview Setup Modal (topic + interviewer voice attributes)
// ==========================================================================
function openInterviewSetupModal() {
  const modal = document.getElementById('interview-setup-modal');
  if (!modal) return;

  document.getElementById('interview-topic-input').value = '';

  const maleRadio = document.querySelector('input[name="interviewer-gender"][value="male"]');
  if (maleRadio) maleRadio.checked = true;
  interviewerGender = 'male';

  const rateSlider = document.getElementById('interview-rate-slider');
  rateSlider.value = 0.95;
  onInterviewRateChange();

  populateVoiceSelect();

  modal.classList.add('visible');
}

function closeInterviewSetupModal() {
  const modal = document.getElementById('interview-setup-modal');
  if (modal) modal.classList.remove('visible');
}

function onInterviewerGenderChange() {
  const checked = document.querySelector('input[name="interviewer-gender"]:checked');
  if (checked) interviewerGender = checked.value;
  populateVoiceSelect();
}

function onInterviewRateChange() {
  const slider = document.getElementById('interview-rate-slider');
  const label = document.getElementById('interview-rate-value');
  if (slider && label) {
    label.textContent = `${parseFloat(slider.value).toFixed(2)}x`;
  }
}

function classifyVoiceGender(voice) {
  const nameLower = voice.name.toLowerCase();
  const femaleKeywords = ['female', '여성', 'woman', 'girl', 'lady', 'samantha', 'sara', 'susan', 'karen', 'moira', 'yuna', 'aria', 'zira', 'heami'];
  const maleKeywords = ['male', '남성', 'man', 'guy', 'boy', 'david', 'george', 'james', 'mark', 'daniel', 'ichiro', 'injun', 'han', 'gentleman'];

  if (femaleKeywords.some(k => nameLower.includes(k))) return 'female';
  if (maleKeywords.some(k => nameLower.includes(k))) return 'male';
  return 'unknown';
}

function getVoicesForLang(lang) {
  if (!window.speechSynthesis) return [];
  const targetLang = lang.split('-')[0].toLowerCase();
  return window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(targetLang));
}

function populateVoiceSelect() {
  const select = document.getElementById('interview-voice-select');
  if (!select) return;

  select.innerHTML = '';

  if (!window.speechSynthesis) {
    const opt = document.createElement('option');
    opt.textContent = "음성 합성을 지원하지 않는 브라우저입니다";
    select.appendChild(opt);
    return;
  }

  const langVoices = getVoicesForLang(interviewLang);
  const matching = langVoices.filter(v => classifyVoiceGender(v) === interviewerGender);
  const others = langVoices.filter(v => classifyVoiceGender(v) !== interviewerGender);
  const orderedVoices = [...matching, ...others];

  if (orderedVoices.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = "기본 음성 (사용 가능한 목소리 없음)";
    select.appendChild(opt);
    return;
  }

  orderedVoices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    select.appendChild(opt);
  });
}

function confirmInterviewSetup() {
  const topicInput = document.getElementById('interview-topic-input');
  const topic = topicInput.value.trim();

  if (!topic) {
    alert("면접 주제를 입력해 주세요.");
    return;
  }

  const genderChecked = document.querySelector('input[name="interviewer-gender"]:checked');
  interviewerGender = genderChecked ? genderChecked.value : 'male';
  interviewerRate = parseFloat(document.getElementById('interview-rate-slider').value) || 0.95;
  interviewerVoiceURI = document.getElementById('interview-voice-select').value;

  closeInterviewSetupModal();
  beginInterviewSimulation(topic);
}

function beginInterviewSimulation(topic) {
  isInterviewMode = true;
  interviewTopic = topic;
  interviewStep = 0;
  interviewQueue = buildInterviewQueue(interviewTopic, interviewLang);

  const btn = document.getElementById('interview-btn');
  if (btn) {
    btn.classList.add('active');
    btn.title = interviewLang === 'ja-JP' ? "模擬面接中断" : (interviewLang === 'en-US' ? "Stop Interview" : "가상 면담 중단");
  }

  // Show submit and stop buttons
  const submitBtn = document.getElementById('interview-submit-btn');
  if (submitBtn) {
    submitBtn.style.display = 'inline-flex';
  }
  const stopBtn = document.getElementById('interview-stop-btn');
  if (stopBtn) {
    stopBtn.style.display = 'inline-flex';
  }
  
  // Set up interviewer speaker config based on language
  let namePrefix = "면접관";
  let flag = "👤";
  let langLabel = "한국어";
  
  if (interviewLang === 'en-US') {
    namePrefix = "Interviewer";
    langLabel = "English";
    flag = "🇺🇸";
  } else if (interviewLang === 'ja-JP') {
    namePrefix = "面接官";
    langLabel = "日本語";
    flag = "🇯🇵";
  }
  
  speakers[interviewerId] = { name: `${namePrefix} (${interviewTopic})`, id: interviewerId, lang: interviewLang, flag: flag };
  
  // Force recording on if not already recording
  if (!isRecording) {
    toggleTranscription();
  }
  
  // Ask the first question
  askNextInterviewQuestion();
}

// ==========================================================================
// Randomized, topic-aware question queue + answer-driven follow-ups
// ==========================================================================
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function detectInterviewCategory(topic) {
  const t = topic.toLowerCase();
  const techKeywords = ['개발', '프로그래머', '엔지니어', '백엔드', '프론트', '풀스택', '데이터', 'developer', 'engineer', 'programmer', 'software', 'devops', 'it '];
  const marketingKeywords = ['마케팅', '영업', '세일즈', '광고', '브랜드', 'marketing', 'sales', 'brand'];
  const designKeywords = ['디자인', '디자이너', 'design', 'ux', 'ui'];
  const serviceKeywords = ['고객', '서비스', '상담', 'cs', 'service', 'customer'];

  if (techKeywords.some(k => t.includes(k))) return 'tech';
  if (marketingKeywords.some(k => t.includes(k))) return 'marketing';
  if (designKeywords.some(k => t.includes(k))) return 'design';
  if (serviceKeywords.some(k => t.includes(k))) return 'service';
  return null;
}

// Builds a randomized session queue: fixed opening -> shuffled common+category questions -> fixed closing
function buildInterviewQueue(topic, lang) {
  const category = detectInterviewCategory(topic);
  const commonBank = interviewCommonQuestionBank[lang] || interviewCommonQuestionBank['ko-KR'];
  const categoryBank = (category && interviewCategoryQuestionBank[category] && interviewCategoryQuestionBank[category][lang]) || [];

  const pool = shuffleArray([...commonBank, ...categoryBank]);
  const middleCount = Math.min(pool.length, 3 + Math.floor(Math.random() * 2)); // pick 3~4 questions
  const middleQuestions = pool.slice(0, middleCount);

  const opening = interviewOpeningQuestions[lang] || interviewOpeningQuestions['ko-KR'];
  const closing = interviewClosingQuestions[lang] || interviewClosingQuestions['ko-KR'];

  const queue = [{ text: opening, isFollowup: false }];
  middleQuestions.forEach(q => queue.push({ text: q, isFollowup: false }));
  queue.push({ text: closing, isFollowup: false });
  return queue;
}

// Gathers everything the interviewee said since the current question was asked
function collectIntervieweeAnswerText() {
  return transcriptRecords
    .slice(interviewAnswerStartIndex)
    .filter(r => r.speakerId !== interviewerId)
    .map(r => r.text)
    .join(' ')
    .trim();
}

// Picks a reactive follow-up question based on keywords found in the interviewee's answer,
// falling back to a generic elaboration prompt when the answer was too short
function pickFollowupQuestion(answerText, lang) {
  if (!answerText) return null;

  const triggers = interviewFollowupTriggers[lang] || interviewFollowupTriggers['ko-KR'];
  const lower = answerText.toLowerCase();
  const matched = triggers.filter(t => t.keywords.some(k => lower.includes(k.toLowerCase())));

  if (matched.length > 0) {
    return matched[Math.floor(Math.random() * matched.length)].question;
  }

  const isKorean = lang === 'ko-KR';
  const answerLength = isKorean ? answerText.replace(/\s/g, '').length : answerText.split(/\s+/).filter(Boolean).length;
  const threshold = isKorean ? 12 : 6;

  if (answerLength > 0 && answerLength < threshold) {
    return interviewFollowupFallback[lang] || interviewFollowupFallback['ko-KR'];
  }

  return null;
}

async function askNextInterviewQuestion() {
  if (!isInterviewMode) return;

  const timeStr = formatAmPm(new Date());

  if (interviewStep >= interviewQueue.length || interviewStep >= MAX_INTERVIEW_QUESTIONS) {
    const endText = interviewEndText[interviewLang] || interviewEndText['ko-KR'];
    
    const record = {
      speakerId: interviewerId,
      speakerName: speakers[interviewerId] ? speakers[interviewerId].name : "면접관",
      timestamp: timeStr,
      text: endText,
      langCode: interviewLang,
      langLabel: interviewLang === 'en-US' ? 'English' : (interviewLang === 'ja-JP' ? '日本語' : '한국어'),
      langFlag: interviewLang === 'en-US' ? '🇺🇸' : (interviewLang === 'ja-JP' ? '🇯🇵' : '🇰🇷')
    };
    
    transcriptRecords.push(record);
    appendMessageBubble(record);
    
    // Speak final message
    speakTts(endText);
    
    stopInterviewSimulation();
    return;
  }
  
  const questionTemplate = interviewQueue[interviewStep].text;
  const questionText = questionTemplate.replace(/{topic}/g, interviewTopic);
  
  const record = {
    speakerId: interviewerId,
    speakerName: speakers[interviewerId].name,
    timestamp: timeStr,
    text: questionText,
    langCode: interviewLang,
    langLabel: interviewLang === 'en-US' ? 'English' : (interviewLang === 'ja-JP' ? '日本語' : '한국어'),
    langFlag: interviewLang === 'en-US' ? '🇺🇸' : (interviewLang === 'ja-JP' ? '🇯🇵' : '🇰🇷')
  };
  
  transcriptRecords.push(record);
  appendMessageBubble(record);
  
  // Translate interviewer's question to Korean if auto-translate is enabled and language is not Korean
  if (isAutoTranslate && interviewLang !== 'ko-KR') {
    try {
      const sourceLang = interviewLang.split('-')[0];
      const translatedText = await translateToKorean(questionText, sourceLang);
      if (translatedText) {
        const translationRecord = {
          speakerId: interviewerId,
          speakerName: `${speakers[interviewerId].name} (번역)`,
          timestamp: timeStr,
          text: `📝 번역: ${translatedText}`,
          langCode: 'ko-KR',
          langLabel: '한국어 번역',
          langFlag: '🇰🇷'
        };
        transcriptRecords.push(translationRecord);
        appendTranslationBubble(translationRecord);
      }
    } catch (e) {
      console.error("Failed to translate interviewer question:", e);
    }
  }
  
  // Mark where the interviewee's answer will start being recorded
  interviewAnswerStartIndex = transcriptRecords.length;

  // Speak question and pause speech recognition while speaking
  speakTts(questionText);
}

// Find a voice matching the requested gender, falling back to a URI match or first available voice
function findVoiceByGender(lang, gender) {
  const langVoices = getVoicesForLang(lang);
  if (langVoices.length === 0) return null;

  for (const voice of langVoices) {
    if (classifyVoiceGender(voice) === gender) return voice;
  }

  // Fallback to first available voice for the language
  return langVoices[0];
}

function speakTts(text) {
  if (!window.speechSynthesis) {
    console.warn("Speech Synthesis is not supported in this browser.");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = interviewLang; // Dynamic voice language

  // Prefer the voice explicitly selected in the setup modal, otherwise pick by gender
  const voices = window.speechSynthesis.getVoices();
  const selectedVoice = voices.find(v => v.voiceURI === interviewerVoiceURI) || findVoiceByGender(interviewLang, interviewerGender);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  // Set speaking rate from the setup modal slider (0.5 ~ 1.5, comfortable default: 0.95)
  utterance.rate = interviewerRate;

  // Lower pitch for a deeper male tone, raise it for a lighter female tone (range: 0 to 2, default is 1)
  utterance.pitch = interviewerGender === 'female' ? 1.15 : 0.70;

  utterance.onstart = () => {
    // Temporarily pause Speech Recognition to prevent mic from hearing the computer's speaker
    if (recognition && isRecording) {
      autoRestart = false;
      recognition.stop();
    }
  };
  
  utterance.onend = () => {
    // Resume Speech Recognition after speaking so the user can answer
    if (isInterviewMode && recognition && !isRecording) {
      autoRestart = true;
      isRecording = true;
      recognition.lang = document.getElementById('recognition-lang').value;
      try {
        recognition.start();
      } catch (e) {
        console.error("Failed to restart recognition after TTS:", e);
      }
    }
  };
  
  utterance.onerror = (e) => {
    console.error("SpeechSynthesis error:", e);
    // Safety fallback to turn mic back on
    if (isInterviewMode && recognition && !isRecording) {
      autoRestart = true;
      isRecording = true;
      try { recognition.start(); } catch(err) {}
    }
  };
  
  window.speechSynthesis.speak(utterance);
}

function stopInterviewSimulation() {
  isInterviewMode = false;
  interviewQueue = [];
  interviewAnswerStartIndex = 0;
  if (interviewTimeoutId) {
    clearTimeout(interviewTimeoutId);
    interviewTimeoutId = null;
  }

  const btn = document.getElementById('interview-btn');
  if (btn) {
    btn.classList.remove('active');
    btn.title = "가상 면담 시작";
  }
  
  if (speakers[interviewerId]) {
    delete speakers[interviewerId];
  }
  
  // Stop speaking
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // Hide submit and stop buttons
  const submitBtn = document.getElementById('interview-submit-btn');
  if (submitBtn) {
    submitBtn.style.display = 'none';
  }
  const stopBtn = document.getElementById('interview-stop-btn');
  if (stopBtn) {
    stopBtn.style.display = 'none';
  }
}

function submitInterviewAnswer() {
  if (!isInterviewMode) return;

  if (interviewTimeoutId) {
    clearTimeout(interviewTimeoutId);
    interviewTimeoutId = null;
  }

  // Only chain a follow-up off an original question, never off a follow-up itself
  const currentItem = interviewQueue[interviewStep];
  if (currentItem && !currentItem.isFollowup) {
    const answerText = collectIntervieweeAnswerText();
    const followupQuestion = pickFollowupQuestion(answerText, interviewLang);
    if (followupQuestion && interviewQueue.length < MAX_INTERVIEW_QUESTIONS) {
      interviewQueue.splice(interviewStep + 1, 0, { text: followupQuestion, isFollowup: true });
    }
  }

  interviewStep++;
  askNextInterviewQuestion();
}

function confirmStopInterview() {
  const cancelConfirmText = interviewLang === 'ja-JP' ? "模擬面接を終了しますか？" : (interviewLang === 'en-US' ? "End the virtual interview?" : "가상 면담을 종료하시겠습니까?");
  if (confirm(cancelConfirmText)) {
    stopInterviewSimulation();
  }
}

// Chrome loads TTS voices asynchronously; repopulate the voice select once they arrive
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    const modal = document.getElementById('interview-setup-modal');
    if (modal && modal.classList.contains('visible')) {
      populateVoiceSelect();
    }
  };
}

// Heartbeat ping to keep local server alive
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  setInterval(() => {
    fetch('/ping').catch(() => {});
  }, 2000);
}

