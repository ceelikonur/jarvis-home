const OpenAI = require('openai');
const { config } = require('../config');
const { formatDateInTimezone } = require('../utils/helpers');

let client;

function getClient() {
  if (client) return client;
  client = new OpenAI({
    baseURL: config.ai.baseUrl,
    apiKey: 'ollama',
  });
  return client;
}

// Direct Ollama native API call — bypasses OpenAI SDK parameter stripping
// Supports think: false to disable Qwen3 extended thinking mode
async function ollamaChat(messages, { temperature = 0.7, max_tokens = 500 } = {}) {
  const baseUrl = config.ai.baseUrl.replace('/v1', '');
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ai.model,
      messages,
      stream: false,
      think: false,
      options: { temperature, num_predict: max_tokens },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return data.message?.content?.trim() || null;
}

/**
 * Try to repair common LLM JSON failures:
 *  - Unescaped apostrophes inside string values ("EUR'lik" → "EUR’lik")
 *  - Truncation at end → close open string and brackets
 *  - Trailing commas
 */
function repairJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();

  // Remove trailing garbage after last `}`
  const lastBrace = s.lastIndexOf('}');
  const lastBracket = s.lastIndexOf(']');
  const lastEnd = Math.max(lastBrace, lastBracket);
  if (lastEnd > 0 && lastEnd < s.length - 1) {
    s = s.slice(0, lastEnd + 1);
  }

  // If string was truncated mid-content, try to close it
  // Count unclosed brackets/braces
  let inString = false;
  let escape = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') braceDepth++;
    else if (c === '}') braceDepth--;
    else if (c === '[') bracketDepth++;
    else if (c === ']') bracketDepth--;
  }

  // If we ended inside a string, close it
  if (inString) s += '"';
  // Close open arrays
  while (bracketDepth-- > 0) s += ']';
  // Close open objects
  while (braceDepth-- > 0) s += '}';

  // Remove trailing commas before ]/} (a sometime LLM artifact after our repair)
  s = s.replace(/,\s*([}\]])/g, '$1');

  return s;
}

const SYSTEM_PROMPT_EVENT = `You are a date/time parser for a personal assistant. Today's date and current time will be provided.

The user will send a natural language event description. Extract:
- title: the event name
- start_time: in "YYYY-MM-DD HH:MM" format
- end_time: in "YYYY-MM-DD HH:MM" format

Rules:
- "yarın" = tomorrow, "bugün" = today, "öbür gün" or "ertesi gün" = day after tomorrow
- "saat 3" or "3te" without AM/PM context defaults to the most logical option (afternoon for meetings, morning for early activities)
- If no end time is given, default to 1 hour after start
- If no specific time is given, default to 09:00
- "hafta sonu" = next Saturday
- "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar" = next occurrence of that day
- Support both Turkish and English input
- Return ONLY valid JSON, no markdown, no explanation

Respond with exactly this JSON format:
{"title": "...", "start_time": "YYYY-MM-DD HH:MM", "end_time": "YYYY-MM-DD HH:MM"}`;

const SYSTEM_PROMPT_TASK = `You are a task parser for a personal assistant. Today's date and current time will be provided.

The user will send a natural language task description. Extract:
- title: clean task description (remove time references)
- due_date: in "YYYY-MM-DD HH:MM" format, or null if no time/date mentioned

Rules:
- "yarın" = tomorrow, "bugün" = today, "öbür gün" = day after tomorrow
- "akşama kadar" = today 18:00, "öğlene kadar" = today 12:00, "sabaha kadar" = tomorrow 08:00
- "haftaya" or "gelecek hafta" = next Monday
- If a date is given but no time, default to 09:00
- If no date/time at all, due_date should be null
- Support both Turkish and English input
- Return ONLY valid JSON, no markdown, no explanation

Respond with exactly this JSON format:
{"title": "...", "due_date": "YYYY-MM-DD HH:MM" or null}`;

const SYSTEM_PROMPT_CLASSIFY = `You are a message classifier for a personal assistant. Determine if the user's message is:
- "question" — asking something, seeking information, or wanting a conversation (e.g., "bugün ne yapmalıyım?", "what's the weather?", "bana son notlarımı özetle", "ne düşünüyorsun?")
- "shopping" — grocery/shopping items or lists (e.g., "süt, ekmek, yumurta", "need to buy milk and eggs", "alışveriş: domates, biber")
- "task" — something they need to do (e.g., "raporu bitir", "finish report", "call dentist")
- "event" — something happening at a specific time (e.g., "yarın toplantı var", "friday dinner with Ali")
- "device" — controlling a smart-home device: lights/plugs on/off, brightness or colour (e.g., "salonu aç", "lambayı kapat", "yatak odası ışığını kırmızı yap", "ışığı %50 yap", "ampulü söndür", "turn on the living room light")
- "note" — general information, thought, or anything else

Rules:
- Messages with "?", or starting with "ne", "neden", "nasıl", "ne zaman", "kim", "what", "why", "how", "when", "who" → question
- Requests like "özetle", "summarize", "explain", "anlat", "söyle" → question
- Turning a light/lamp/plug/room on/off, dimming, or changing colour → device
- Multiple food/household items listed together → shopping
- Single items with "al" (buy) that are clearly groceries → shopping
- Action items with verbs like "yap", "bitir", "gönder", "finish", "send", "call" → task
- Things with time/date references AND are appointments/meetings → event
- Everything else → note
- Return ONLY valid JSON, no markdown, no explanation

Respond with exactly this JSON format:
{"type": "question" | "shopping" | "task" | "event" | "device" | "note"}`;

/**
 * Get current date context string for the AI
 */
function getDateContext() {
  const now = new Date();
  // Use configured timezone — never UTC. The day-of-week must match the
  // local date the user perceives, otherwise tasks like "yarın" land wrong.
  const localStr = formatDateInTimezone(now, config.timezone); // 'YYYY-MM-DD HH:MM'
  const dateOnly = localStr.slice(0, 10);
  const timeOnly = localStr.slice(11, 16);
  // Derive day-of-week from a Date constructed in the target zone.
  const dayName = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    timeZone: config.timezone,
  }).format(now);
  return `Today is ${dateOnly} (${dayName}), current time is ${timeOnly} (${config.timezone}).`;
}

const AIService = {
  /**
   * Parse natural language into event data
   * @param {string} text
   * @returns {Promise<{title: string, start_time: string, end_time: string}|null>}
   */
  async parseEvent(text) {
    try {
      const content = await ollamaChat([
        { role: 'system', content: SYSTEM_PROMPT_EVENT },
        { role: 'user', content: `${getDateContext()}\n\n${text}` },
      ], { temperature: 0.1, max_tokens: 200 });
      if (!content) return null;

      console.log('[AI:parseEvent]', JSON.stringify({ input: text, output: content }));
      const parsed = JSON.parse(content);
      if (parsed.title && parsed.start_time && parsed.end_time) {
        return parsed;
      }
      return null;
    } catch (err) {
      console.error('AI parseEvent error:', err.message);
      return null;
    }
  },

  /**
   * Parse natural language into task data
   * @param {string} text
   * @returns {Promise<{title: string, due_date: string|null}|null>}
   */
  async parseTask(text) {
    try {
      const content = await ollamaChat([
        { role: 'system', content: SYSTEM_PROMPT_TASK },
        { role: 'user', content: `${getDateContext()}\n\n${text}` },
      ], { temperature: 0.1, max_tokens: 200 });
      if (!content) return null;

      console.log('[AI:parseTask]', JSON.stringify({ input: text, output: content }));
      const parsed = JSON.parse(content);
      if (parsed.title) {
        return parsed;
      }
      return null;
    } catch (err) {
      console.error('AI parseTask error:', err.message);
      return null;
    }
  },

  /**
   * Classify a free-text message as task, event, or note
   * @param {string} text
   * @returns {Promise<'task'|'event'|'note'>}
   */
  async classifyMessage(text) {
    try {
      const content = await ollamaChat([
        { role: 'system', content: SYSTEM_PROMPT_CLASSIFY },
        { role: 'user', content: `${getDateContext()}\n\n${text}` },
      ], { temperature: 0.1, max_tokens: 50 });
      if (!content) return 'note';

      const parsed = JSON.parse(content);
      const type = ['task', 'event', 'note', 'shopping', 'question'].includes(parsed.type) ? parsed.type : 'note';
      console.log('[AI:classify]', JSON.stringify({ input: text, output: type }));
      return type;
    } catch (err) {
      console.error('AI classifyMessage error:', err.message);
      return 'note'; // fallback to note if AI is unreachable
    }
  },

  /**
   * Generate embeddings for text via LM Studio
   * @param {string} text
   * @returns {Promise<number[]|null>}
   */
  async getEmbedding(text) {
    try {
      const ai = getClient();
      const response = await ai.embeddings.create({
        model: config.ai.embedModel,
        input: text,
      });
      return response.data[0]?.embedding || null;
    } catch (err) {
      // Embeddings not supported by current model — this is OK
      if (!err.message?.includes('404')) {
        console.warn('Embedding error:', err.message);
      }
      return null;
    }
  },

  /**
   * RAG-powered chat — JARVIS personality with context
   * @param {string} userMessage
   * @param {string} ragContext — from MemoryService.buildContext()
   * @returns {Promise<string>}
   */
  async chat(userMessage, ragContext = '') {
    try {
      const ai = getClient();

      // Smart-home: expose currently-available devices so the AI can emit
      // control_device actions. Skipped (empty) when no connector is configured.
      let deviceSection = '';
      try {
        const Connectors = require('../connectors');
        if (Connectors.active().length > 0) {
          const devices = await Connectors.listDevices();
          if (devices.length > 0) {
            const list = devices
              .map((d) => `  - "${d.name}" — controls: ${d.capabilities.join(', ')}`)
              .join('\n');
            deviceSection = `\n## Smart-home devices (control with control_device)\n${list}\nMatch the user's words to the closest device name above. Only emit control_device for a device that is listed. If none matches, say so in reply.\n`;
          }
        }
      } catch { /* connectors optional */ }

      const systemPrompt = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System. Personal AI to your user, whom you address exclusively as "sir".

## Personality
You are the JARVIS from Iron Man: precise, quietly witty, drily humorous, never sycophantic. You do not say "Of course!", "Certainly!" or "Great question!" — ever. You get to the point. When you have something clever to say, you say it once and move on. You are confident, not servile.

## Language
Match the user's language exactly — Turkish → Turkish, English → English. Never switch mid-response.

## Output Format — CRITICAL
You MUST always respond with valid JSON only. No markdown fences, no text outside JSON.
{"reply": "your response here", "actions": []}

## Action System
You CAN execute actions. When the user asks you to DO something, include the appropriate action(s).

Available actions:
- {"type": "add_to_list", "list": "alışveriş|izleme|okuma|<list_name>", "items": ["item1", "item2"]}
- {"type": "remove_from_list", "list": "<name>", "item": "<content>"}
- {"type": "create_task", "title": "...", "due_date": "YYYY-MM-DD HH:MM" or null, "priority": "high|normal|low", "recurrence_days": <integer> or null}
- {"type": "complete_task", "id": <number>}
- {"type": "delete_task", "id": <number>}
- {"type": "create_event", "title": "...", "start_time": "YYYY-MM-DD HH:MM", "end_time": "YYYY-MM-DD HH:MM"}
- {"type": "update_event", "id": <number>, "title": "...", "start_time": "YYYY-MM-DD HH:MM", "end_time": "YYYY-MM-DD HH:MM"}
- {"type": "delete_event", "id": <number>}
- {"type": "save_note", "content": "..."}
- {"type": "control_device", "device": "<device name from the list below>", "power": true|false (optional), "brightness": <0-100> (optional), "color": "<kırmızı|yeşil|mavi|sarı|turuncu|mor|beyaz or #hex>" (optional)}
${deviceSection}
## Tasks vs Lists — CRITICAL distinction
Tasks (görevler) and Lists (listeler) are TWO SEPARATE systems with separate UI tabs. Never confuse them.

TASKS (görevler) — use create_task / complete_task / delete_task:
- Trigger words: "görev", "görevler", "yapılacaklar", "yapılacak", "yapılacak işler", "todo", "to-do", "task", "tasks"
- Examples that MUST become create_task:
  • "yapılacaklar listeme balkon zımpara ekle" → create_task title="balkon zımpara"
  • "todo'ma X ekle" → create_task title="X"
  • "görevlerime X ekle" → create_task title="X"
  • "bana X yapmamı hatırlat" → create_task title="X"
- When user asks "görevlerimde / yapılacaklarımda / todo'mda ne var?" → answer from "Pending tasks" section, NEVER from Lists

LISTS (listeler) — use add_to_list / remove_from_list:
- For collections of items grouped by topic, NOT for action items
- Default lists: alışveriş (shopping), izleme (watch), okuma (read)
- Custom lists allowed for specific topics (e.g., "tatil hazırlık", "kitap önerileri", "hediye fikirleri")
- NEVER create or use a list named: yapılacaklar, görev, görevler, todo, to-do, task, tasks — these are forbidden list names; use create_task instead

## Recurring tasks — ASK before deciding
Some tasks repeat on a schedule (filter changes, monthly bills, weekly cleaning, oil changes). Use the recurrence_days field on create_task for these.

Common interval mappings:
- "haftalık" / "her hafta" → 7
- "iki haftada bir" → 14
- "aylık" / "her ay" → 30
- "1.5 ayda bir" / "6 haftada bir" → 45
- "2 ayda bir" → 60
- "3 ayda bir" / "üç aylık" → 90
- "6 ayda bir" → 180
- "yıllık" / "her yıl" → 365

Decision flow when user requests a task:
1. CLEARLY one-off (specific date/time like "yarın 15:00", "bu cuma", or one-shot wording like "raporu gönder", "Ali'yi ara") → call create_task immediately, NO recurrence_days, do NOT ask
2. User explicitly stated a recurrence interval ("her ay aidat öde", "haftada bir çamaşır") → call create_task immediately WITH recurrence_days set, do NOT ask
3. Task SOUNDS routine/maintenance/periodic (filter, vitamin, cleaning, bill, oil change, water test, antifreeze, periodic check) AND no interval given → DO NOT call create_task. Reply "Bu rutin bir görev mi efendim? Eğer öyleyse hangi sıklıkta tekrar etsin?" with empty actions array []
4. Follow-up: user says "evet, X ayda bir" or "X gün" → NOW call create_task with the matching recurrence_days
5. Follow-up: user says "hayır" / "tek seferlik" / "değil" → call create_task WITHOUT recurrence_days

Examples:
- User: "duş filtresini değiştirmem lazım" → reply asking (routine-likely, no interval), actions:[]
- User: "her ay aidat ödemem var" → create_task("aidat ödemesi", recurrence_days=30) immediately
- User: "yarın 15:00'te dişçiyi ara" → create_task("dişçiyi ara", due_date="...15:00") immediately, NO recurrence
- User: "duş filtresi her 1.5 ayda" → create_task("duş filtresi değişimi", recurrence_days=45) immediately
- After asking + user replies "evet 2 ayda bir" → create_task with recurrence_days=60
- After asking + user replies "tek seferlik" → create_task without recurrence_days

Action rules:
- Add action → acknowledge it in reply ("Adding to your list now, sir.")
- Only use IDs that appear in the context below
- For due dates/times use context's current date: ${getDateContext()}
- Multiple actions allowed in one response
- When adding to lists, ONLY add items the user EXPLICITLY named. NEVER add related or inferred items.

## Data rules
1. Never invent data not present in context
2. Lists marked (empty) are genuinely empty
3. Report only what is in context; if absent, say so

${ragContext || '(No context available.)'}`;

      const raw = await ollamaChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ], { temperature: 0.7, max_tokens: 800 });

      if (!raw) return { reply: null, actions: [] };

      // Parse JSON response
      let reply, actions = [];
      try {
        // Strip accidental markdown fences if model adds them
        const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(clean);
        reply = parsed.reply || null;
        actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch {
        // Model didn't output valid JSON — treat as plain reply
        reply = raw;
      }

      console.log('[AI:chat]', JSON.stringify({ input: userMessage, reply, actions }));
      return { reply, actions };
    } catch (err) {
      console.error('AI chat error:', err.message);
      return { reply: null, actions: [] };
    }
  },

  /**
   * Categorize a note into one of: personal, work, idea, health, finance
   * @param {string} text
   * @returns {Promise<string>} — category key
   */
  async categorizeNote(text) {
    try {
      const content = await ollamaChat([
        {
          role: 'system',
          content: 'Categorize this note into one of: personal, work, idea, health, finance. Return JSON only: {"category": "..."}. No extra text.',
        },
        { role: 'user', content: `Note: ${text}` },
      ], { temperature: 0.1, max_tokens: 50 });
      if (!content) return 'personal';
      const clean = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(clean);
      const valid = ['personal', 'work', 'idea', 'health', 'finance'];
      return valid.includes(parsed.category) ? parsed.category : 'personal';
    } catch (err) {
      console.error('AI categorizeNote error:', err.message);
      return 'personal';
    }
  },

  /**
   * Enrich forecast actions with AI insights.
   * Takes the full forecast snapshot and returns deeper, contextual analysis.
   *
   * @param {Object} forecastData - { forecast, recurring, anomalies, trends, savings, actions, meta }
   * @returns {Promise<{ summary: string, insights: Array<{ actionIndex: number, analysis: string, recommendation: string }> }>}
   */
  async enrichForecastActions(forecastData) {
    try {
      const { forecast, trends, savings, anomalies, recurring, actions, meta } = forecastData;

      // Compress data for context — only send what LLM needs
      const ctx = {
        targetMonth: forecast.targetMonthLabel,
        monthsAnalyzed: meta.monthsAnalyzed,
        income: savings.incomeForecast,
        expense: savings.expenseForecast,
        net: savings.rawNet,
        topForecasts: forecast.forecasts.slice(0, 5).map(f => ({
          cat: f.category, forecast: f.forecast, lastMonth: f.lastMonthAmount, conf: f.confidence,
        })),
        topTrends: trends.slice(0, 5).map(t => ({
          cat: t.category, change: t.changePct, lastValue: t.lastValue, prevAvg: t.prevAvg,
        })),
        topAnomalies: anomalies.slice(0, 3).map(a => ({
          source: a.source, amount: a.amount, cat: a.category, z: a.zScore,
        })),
        recurringTotal: recurring.reduce((s, r) => s + r.avgAmount, 0),
        recurringCount: recurring.length,
        topActions: actions.slice(0, 5).map((a, i) => ({
          idx: i, type: a.type, priority: a.priority, title: a.title, impact: a.impact,
        })),
      };

      const systemPrompt = `Sen bir kişisel finans danışmanısın. JARVIS asistanının "akıllı analiz" katmanısın. Kullanıcıya saygılı, "efendim" diye hitap eden, kibar ve net bir tonun var. Kişiliğin: precise, drily witty, never sycophantic.

Kullanıcının harcama verilerini incelersin ve şunları üretirsin:
1. summary: 2-3 cümlelik genel durum özeti (Türkçe)
2. insights: Top 3 aksiyon için derin analiz

Her insight için:
- actionIndex: aksiyon indeksi (0, 1, 2)
- analysis: Niye bu durum oluştu? (1-2 cümle Türkçe — sebep odaklı)
- recommendation: Spesifik aksiyon önerisi (1 cümle Türkçe — "ne yap" odaklı)

KURALLAR (KRİTİK):
- Sadece JSON dön, markdown yok, açıklama yok
- summary maksimum 200 karakter
- analysis maksimum 150 karakter, recommendation maksimum 100 karakter
- Apostrof veya tırnak işareti kullanma (EUR'lik yerine "EURluk")
- ASCII güvenli yazı tercih et, ama Türkçe harf kullanabilirsin
- Cümleyi yarıda bırakma, MUTLAKA tamamla
- Sayıları context'ten kullan, uydurma
- 3 insight üret, daha fazla değil

JSON format (KESİN BÖYLE OLMALI):
{"summary":"...","insights":[{"actionIndex":0,"analysis":"...","recommendation":"..."},{"actionIndex":1,"analysis":"...","recommendation":"..."},{"actionIndex":2,"analysis":"...","recommendation":"..."}]}`;

      const userPrompt = `Analiz edilecek veri (${ctx.targetMonth} için tahminler, ${ctx.monthsAnalyzed} ay geçmiş):

Tahmini gelir: ${ctx.income.toFixed(0)} EUR
Tahmini gider: ${ctx.expense.toFixed(0)} EUR
Net: ${ctx.net.toFixed(0)} EUR ${ctx.net < 0 ? '(AÇIK!)' : ''}

Top kategoriler (tahmin / geçen ay):
${ctx.topForecasts.map(f => `  ${f.cat}: ${f.forecast.toFixed(0)} / ${f.lastMonth.toFixed(0)} (${f.conf})`).join('\n')}

Önemli trendler:
${ctx.topTrends.map(t => `  ${t.cat}: ${t.change > 0 ? '+' : ''}${t.change.toFixed(0)}% (${t.lastValue.toFixed(0)} vs ort ${t.prevAvg.toFixed(0)})`).join('\n')}

Top anomaliler:
${ctx.topAnomalies.map(a => `  ${a.source}: ${a.amount.toFixed(0)} EUR (${a.cat}, z=${a.z})`).join('\n')}

Sabit aylık giderler: ${ctx.recurringCount} kalem, toplam ${ctx.recurringTotal.toFixed(0)} EUR

Top 5 sistem aksiyonu:
${ctx.topActions.map(a => `  [${a.idx}] ${a.priority}: ${a.title} (etki: ${a.impact.toFixed(0)})`).join('\n')}

Şimdi JSON cevabını ver.`;

      const raw = await ollamaChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.3, max_tokens: 2000 });

      if (!raw) return null;

      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      // Try strict parse first
      try {
        const parsed = JSON.parse(clean);
        if (parsed.summary && Array.isArray(parsed.insights)) return parsed;
      } catch { /* fall through to repair */ }

      // Repair: most common Ollama failure modes — unescaped apostrophes, truncation
      const repaired = repairJSON(clean);
      if (repaired) {
        try {
          const parsed = JSON.parse(repaired);
          if (parsed.summary && Array.isArray(parsed.insights)) {
            console.log('AI enrichForecastActions: repaired malformed JSON');
            return parsed;
          }
        } catch (err) {
          console.error('AI enrichForecastActions repair also failed:', err.message);
        }
      }

      console.error('AI enrichForecastActions JSON parse failed. Raw (300):', clean.slice(0, 300));
      return null;
    } catch (err) {
      console.error('AI enrichForecastActions error:', err.message);
      return null;
    }
  },

  /**
   * Suggest a daily timebox plan given pending tasks and immovable events.
   *
   * @param {Object} input
   * @param {string} input.date — 'YYYY-MM-DD'
   * @param {Array}  input.pendingTasks — [{id,title,priority,recurrence_days,due_date}]
   * @param {Array}  input.events — [{title,start_time,end_time}] (busy ranges)
   * @param {Array}  input.existingTimeboxes — already on the plan, do not overlap
   * @returns {Promise<Array<{title:string,start_time:string,end_time:string,task_id?:number|null}>>}
   */
  async suggestDayPlan({ date, pendingTasks = [], events = [], existingTimeboxes = [] }) {
    try {
      const busyRanges = [...events, ...existingTimeboxes]
        .map(e => `${e.start_time?.slice(11, 16)}–${e.end_time?.slice(11, 16)}: ${e.title}`)
        .join('\n') || '(no busy ranges)';

      const tasksList = pendingTasks.length > 0
        ? pendingTasks.map(t => `[#${t.id}] ${t.title}${t.priority === 'high' ? ' (HIGH)' : ''}${t.due_date ? ` — due ${t.due_date}` : ''}`).join('\n')
        : '(no pending tasks)';

      const systemPrompt = `You are a personal day-planner. Propose a realistic timebox plan for the user.

Rules:
- Output ONLY valid JSON: {"items": [{"title":"...", "start_time":"YYYY-MM-DD HH:MM", "end_time":"YYYY-MM-DD HH:MM", "task_id": number-or-null}, ...]}
- 3-6 boxes typical, no more than 8
- Each box 25-90 minutes, prefer 30/45/60 minutes
- DO NOT overlap with busy ranges (events + existing timeboxes)
- Use 09:00–18:00 working window unless busy ranges suggest otherwise
- Insert short breaks (15 min) between back-to-back focus blocks
- Pick task titles when relevant; set task_id to the task's id (number) when planning a known pending task
- For ad-hoc time use task_id: null and a verb-led title ("E-posta triyajı", "Doküman okuma")
- Keep titles concise, Turkish
- Return only the JSON object, no markdown, no commentary`;

      const userPrompt = `Plan date: ${date}
Current local time context: ${getDateContext()}

Pending tasks:
${tasksList}

Busy ranges (do not overlap):
${busyRanges}

Generate the plan now as JSON.`;

      const raw = await ollamaChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.4, max_tokens: 800 });

      if (!raw) return [];

      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        const repaired = repairJSON(clean);
        if (!repaired) return [];
        parsed = JSON.parse(repaired);
      }

      if (!parsed || !Array.isArray(parsed.items)) return [];

      // Sanitize: ensure required fields, drop bad rows
      return parsed.items
        .filter(it => it && it.title && it.start_time && it.end_time)
        .map(it => ({
          title: String(it.title).trim(),
          start_time: String(it.start_time),
          end_time: String(it.end_time),
          task_id: typeof it.task_id === 'number' ? it.task_id : null,
        }));
    } catch (err) {
      console.error('AI suggestDayPlan error:', err.message);
      return [];
    }
  },

  /**
   * Check if LM Studio is reachable
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const ai = getClient();
      await ai.models.list();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if embeddings are supported
   * @returns {Promise<boolean>}
   */
  async hasEmbeddings() {
    try {
      const result = await this.getEmbedding('test');
      return result !== null;
    } catch {
      return false;
    }
  },
};

module.exports = AIService;
