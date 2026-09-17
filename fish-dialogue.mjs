import https from 'node:https';
import { storeFor, audioId, openAudioFolder } from './audio-store.mjs';
import { ProgressRegistry } from './progress.mjs';
const progress = new ProgressRegistry();

export const info = { id: 'fish-dialogue', name: 'Fish Dialogue Bridge', description: 'Fish TTS through SillyTavern requestProxy' };
export const KNOWN_ENGINES = ['s2.1-pro-free', 's2.1-pro', 's2-pro', 's1', 'drama-3-preview'];
let engineCatalog = [...KNOWN_ENGINES];

export function validateBase(value, extraHosts = process.env.FISH_ALLOWED_HOSTS || '') {
    const u = new URL(value || 'https://api.fish.audio');
    const hosts = new Set(['api.fish.audio', ...extraHosts.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)]);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !hosts.has(u.hostname.toLowerCase())) {
        throw new Error('Base URL 必须为 HTTPS，且主机在 FISH_ALLOWED_HOSTS 中（api.fish.audio 已允许）');
    }
    u.pathname = u.pathname.replace(/\/+$/, '').replace(/\/v1$/, '') + '/';
    return u;
}

export function proxyStatus() {
    return { agent: https.globalAgent?.constructor?.name || 'unknown', configured: /ProxyAgent/i.test(https.globalAgent?.constructor?.name || '') };
}

// node:https intentionally uses the CURRENT globalAgent installed by SillyTavern.
// Native fetch/Undici would bypass it. Never silently fall back to a direct request.
export function requestBytes(url, { method = 'GET', headers = {}, body, signal, maxBytes = 25 * 1024 * 1024, onProgress = () => {} } = {}) {
    if (!proxyStatus().configured) return Promise.reject(new Error('酒馆 requestProxy 未生效：未发现全局 ProxyAgent，请启用代理并重启酒馆'));
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method, headers, signal, agent: https.globalAgent }, res => {
            const parts = []; let size = 0;
            const length = Number(res.headers['content-length']);
            const totalBytes = Number.isFinite(length) && length > 0 ? length : null;
            onProgress({status:'receiving',receivedBytes:0,totalBytes});
            res.on('data', chunk => {
                size += chunk.length;
                if (size > maxBytes) { res.destroy(new Error('上游响应超过大小限制')); return; }
                parts.push(chunk);
                onProgress({status:'receiving',receivedBytes:size,totalBytes});
            });
            res.on('error', reject);
            res.on('end', () => resolve({ status: res.statusCode, type: String(res.headers['content-type'] || ''), bytes: Buffer.concat(parts) }));
        });
        const timer = setTimeout(() => req.destroy(new Error('Fish 请求超时（120 秒）')), 120000);
        req.on('close', () => clearTimeout(timer));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

export function ttsBody(input, base) {
    const text = input.text;
    if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 2000) throw new Error('对话不能为空或超过 2000 字符');
    const model = String(input.model || 's2.1-pro-free');
    if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(model)) throw new Error('模型名称格式不合法');
    if (base.hostname === 'api.fish.audio' && !engineCatalog.includes(model)) throw new Error('官方端点不接受未知引擎，避免其自动回退到付费模型；请先查询引擎');
    if (typeof input.voice !== 'string' || !input.voice.trim() || input.voice.length > 200) throw new Error('请先绑定音色 ID');
    return { model, payload: { text, reference_id: input.voice.trim(), format: 'mp3', latency: 'normal' } };
}

export async function init(router) {
    router.get('/health', (_req, res) => res.json({ version: '1.4.2', ...proxyStatus() }));
    const localRoute = (name, handler) => router.post(name, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); await handler(req, res, storeFor(req)); }
        catch (e) { if (!res.headersSent) res.status(400).json({ error: String(e.message).slice(0, 400) }); }
    });
    localRoute('/library', async (_req, res, store) => res.json(await store.list()));
    localRoute('/progress', async (req,res,store) => res.json({job:progress.read(store.directory,req.body?.jobId)}));
    localRoute('/library/limit', async (req, res, store) => res.json(await store.setLimit(req.body?.maxFiles)));
    localRoute('/library/open', async (req, res, store) => {
        const library = await store.list(); await openAudioFolder(req, library.path); res.json({ path: library.path, opened: true });
    });
    localRoute('/audio', async (req, res, store) => {
        const bytes = await store.read(req.body?.id);
        if (!bytes) return res.status(404).json({ error: '音频已清理；点击对应对白的播放按钮可重新生成' });
        return res.type('audio/mpeg').send(bytes);
    });
    for (const action of ['tts', 'voices', 'engines']) router.post('/' + action, async (req, res) => {
        const controller = new AbortController();
        let report = () => {};
        const onClose = () => { if (!res.writableEnded) { controller.abort(); report({status:'canceled'}); } };
        res.on('close', onClose);
        try {
            const input = req.body || {};
            if(action === 'tts' && input.jobId) report = progress.start(storeFor(req).directory,input.jobId);
            const base = validateBase(input.baseUrl);
            let persistentId, store;
            if (action === 'tts' && input.persist === true) {
                const validated = ttsBody(input, base);
                input.baseUrl = base.href; input.model = validated.model; input.voice = validated.payload.reference_id;
                persistentId = audioId(input); store = storeFor(req);
                const cached = await store.read(persistentId);
                if (cached) {
                    report({status:'ready',receivedBytes:cached.length,totalBytes:cached.length,cacheSource:'disk'});
                    res.set('Cache-Control', 'no-store'); res.set('X-Fish-Audio-Id', persistentId);
                    res.set('X-Fish-Cache', 'disk'); return res.type('audio/mpeg').send(cached);
                }
            }
            let url, headers = {}, body, method = 'GET';
            if (action === 'engines' && base.hostname === 'api.fish.audio') {
                url = new URL('https://docs.fish.audio/api-reference/openapi.json');
            } else {
                if (typeof input.apiKey !== 'string' || !input.apiKey.trim() || /[\r\n]/.test(input.apiKey)) throw new Error('请填写有效 API Key');
                headers.Authorization = `Bearer ${input.apiKey.trim()}`;
                if (action === 'tts') {
                    const validated = ttsBody(input, base);
                    url = new URL('v1/tts', base); method = 'POST';
                    headers.model = validated.model;
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify(validated.payload);
                } else if (action === 'voices') {
                    url = new URL('model', base);
                    url.searchParams.set('page_size', '20');
                    url.searchParams.set('page_number', String(Math.max(1, Math.min(1000, Number(input.page) || 1))));
                    if (input.title) url.searchParams.set('title', String(input.title).slice(0, 100));
                    if (input.self) url.searchParams.set('self', 'true');
                } else url = new URL('v1/models', base);
            }
            const result = await requestBytes(url, { method, headers, body, signal: controller.signal, onProgress:report, maxBytes: action === 'tts' ? 25 * 1024 * 1024 : 5 * 1024 * 1024 });
            if (result.status < 200 || result.status >= 300) {
                report({status:'failed',httpStatus:result.status});
                // Do not echo arbitrary upstream bodies: they may contain the key or dialogue.
                const hints = { 401: 'API Key 无效', 402: '额度或计费限制', 403: '权限不足', 404: '接口或音色不存在', 429: '请求过于频繁', 503: '服务暂不可用' };
                return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({ error: `Fish HTTP ${result.status}：${hints[result.status] || '请检查服务商接口'}；未自动重试` });
            }
            res.set('Cache-Control', 'no-store');
            if (action === 'tts') {
                if (!result.bytes.length || !/^(audio\/|application\/octet-stream)/i.test(result.type)) throw new Error('上游没有返回音频，请检查 Base URL 和模型');
                if (store && persistentId && !controller.signal.aborted) {
                    report({status:'saving'});
                    await store.save(persistentId, result.bytes, input);
                    res.set('X-Fish-Audio-Id', persistentId); res.set('X-Fish-Cache', 'generated');
                }
                report({status:controller.signal.aborted?'canceled':'ready',receivedBytes:result.bytes.length});
                return res.type('audio/mpeg').send(result.bytes);
            }
            const data = JSON.parse(result.bytes.toString('utf8'));
            if (action === 'voices') return res.json({ total: data.total, items: (data.items || []).map(x => ({ id: x._id, title: x.title, languages: x.languages })) });
            if (base.hostname === 'api.fish.audio') {
                const spec = data.paths?.['/v1/tts']?.post;
                const params = [...(data.paths?.['/v1/tts']?.parameters || []), ...(spec?.parameters || [])];
                const models = params.find(x => x.in === 'header' && x.name.toLowerCase() === 'model')?.schema?.enum;
                if (!Array.isArray(models) || !models.length) throw new Error('官方文档结构已变化；请继续使用预置引擎并查看文档');
                engineCatalog = models.filter(x => typeof x === 'string');
                return res.json({ models: engineCatalog, source: 'Fish 官方 OpenAPI 文档（不代表账户可用额度）' });
            }
            const models = (data.data || data.models || []).map(x => typeof x === 'string' ? x : x.id).filter(Boolean);
            if (!models.length) throw new Error('此服务未返回可识别的 /v1/models 列表，请手动填写引擎');
            return res.json({ models, source: '自定义服务 /v1/models' });
        } catch (e) {
            report({status:controller.signal.aborted?'canceled':'failed'});
            if (!res.destroyed && !res.headersSent) {
                const safe = String(e.message).replaceAll(String(req.body?.apiKey || '__NO_KEY__'), '[REDACTED]');
                res.status(502).json({ error: safe.slice(0, 400) });
            }
        } finally { res.off('close', onClose); }
    });
}
