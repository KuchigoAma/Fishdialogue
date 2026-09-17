import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const stores = new Map();
const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
export function audioId(input) {
    return createHash('sha256').update(JSON.stringify([
        input.baseUrl, input.model, input.voice, input.text,
        input.link?.chat || '', input.link?.message || '', input.link?.revision || '', input.link?.block ?? 0,
    ])).digest('hex');
}
export function storeFor(req) {
    const root = resolveAccountRoot(req);
    const dir = path.join(root, 'fish-dialogue-audio');
    if (!stores.has(dir)) stores.set(dir, new AudioStore(dir, root));
    return stores.get(dir);
}

export function resolveAccountRoot(req) {
    const supplied = req.user?.directories?.root;
    if (typeof supplied !== 'string' || !supplied.trim() || supplied.includes('\0')) {
        throw new Error('酒馆请求未提供有效账户目录（req.user.directories.root）；请确认已登录并查看服务端日志');
    }
    // SillyTavern joins DATA_ROOT and the account handle without requiring DATA_ROOT
    // to be absolute. Resolve its trusted server-side path against the same cwd.
    // Never take this path from the request body or guess a default user account.
    return path.resolve(supplied);
}

export class AudioStore {
    constructor(directory, userRoot = path.dirname(directory)) {
        this.directory = path.resolve(directory); this.userRoot = path.resolve(userRoot); this.tail = Promise.resolve();
    }
    transaction(fn) {
        const job = this.tail.catch(() => {}).then(async () => {
            await fs.mkdir(this.directory, { recursive: true });
            const [dir, root] = await Promise.all([fs.realpath(this.directory), fs.realpath(this.userRoot)]);
            if (path.dirname(dir) !== root) throw new Error('音频目录不能是指向账户目录之外的链接');
            let state;
            try { state = JSON.parse(await fs.readFile(path.join(dir, 'library.json'), 'utf8')); }
            catch (e) { if (e.code !== 'ENOENT') throw new Error('音频索引损坏，请备份目录后修复 library.json'); state = { maxFiles: 200, entries: [] }; }
            if (!Array.isArray(state.entries) || !Number.isInteger(state.maxFiles) || state.maxFiles < 1 || state.maxFiles > 10000) throw new Error('音频索引格式错误');
            return fn(state, dir);
        });
        this.tail = job; return job;
    }
    async commit(state, dir) {
        const temp = path.join(dir, `.library-${randomUUID()}.tmp`);
        await fs.writeFile(temp, JSON.stringify(state, null, 2), { flag: 'wx' });
        await fs.rename(temp, path.join(dir, 'library.json'));
    }
    async trim(state, dir) {
        state.entries.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        let removed = 0;
        while (state.entries.length > state.maxFiles) {
            const entry = state.entries[0];
            if (!validId(entry.id)) throw new Error('非法音频索引');
            // Only our indexed SHA-256 filename is removed, never a user-supplied path.
            await fs.unlink(path.join(dir, entry.id + '.mp3')).catch(e => { if (e.code !== 'ENOENT') throw e; });
            state.entries.shift(); removed++;
        }
        return removed;
    }
    list() {
        return this.transaction(async (state, dir) => {
            const present = [];
            for (const e of state.entries) {
                if (!validId(e.id)) continue;
                try { const st = await fs.lstat(path.join(dir, e.id + '.mp3')); if (st.isFile() && !st.isSymbolicLink()) present.push(e); }
                catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
            if (present.length !== state.entries.length) { state.entries = present; await this.commit(state, dir); }
            return { path: dir, maxFiles: state.maxFiles, entries: [...state.entries].sort((a, b) => b.createdAt - a.createdAt) };
        });
    }
    read(id) {
        if (!validId(id)) throw new Error('无效音频 ID');
        return this.transaction(async (state, dir) => {
            if (!state.entries.some(e => e.id === id)) return null;
            const filename = path.join(dir, id + '.mp3');
            try {
                const st = await fs.lstat(filename);
                if (!st.isFile() || st.isSymbolicLink()) throw new Error('音频不是普通文件');
                return await fs.readFile(filename);
            } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
        });
    }
    save(id, bytes, input) {
        if (!validId(id)) throw new Error('无效音频 ID');
        return this.transaction(async (state, dir) => {
            const temp = path.join(dir, `.audio-${randomUUID()}.tmp`);
            await fs.writeFile(temp, bytes, { flag: 'wx' });
            await fs.rename(temp, path.join(dir, id + '.mp3'));
            const old = state.entries.find(e => e.id === id);
            const entry = { id, createdAt: old?.createdAt || Math.max(Date.now(), ...state.entries.map(e => e.createdAt + 1)), bytes: bytes.length,
                speaker: String(input.speaker || '默认').slice(0, 100), language: String(input.language || 'orig').slice(0, 12),
                model: String(input.model || '').slice(0, 100),
                link: { chat: String(input.link?.chat || '').slice(0, 100), message: String(input.link?.message || '').slice(0, 100),
                    revision: String(input.link?.revision || '').slice(0, 100), block: Number(input.link?.block) || 0 },
            };
            state.entries = state.entries.filter(e => e.id !== id); state.entries.push(entry);
            await this.trim(state, dir); await this.commit(state, dir); return entry;
        });
    }
    setLimit(value) {
        if (!Number.isInteger(value) || value < 1 || value > 10000) throw new Error('最大保留数量必须是 1–10000 的整数');
        return this.transaction(async (state, dir) => {
            state.maxFiles = value; const removed = await this.trim(state, dir); await this.commit(state, dir);
            return { maxFiles: value, removed };
        });
    }
}

export async function openAudioFolder(req, directory) {
    const remote = req.socket?.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) throw new Error('远程访问时不能打开服务器桌面；请使用显示的目录路径或下载音频');
    const commands = { win32: ['explorer.exe', [directory]], darwin: ['open', [directory]], linux: ['xdg-open', [directory]] };
    const command = commands[process.platform];
    if (!command) throw new Error('当前系统不支持自动打开目录');
    await new Promise((resolve, reject) => {
        const child = spawn(command[0], command[1], { shell: false, windowsHide: false, stdio: 'ignore', detached: true });
        child.on('error', reject); child.on('spawn', () => { child.unref(); resolve(); });
    });
}
