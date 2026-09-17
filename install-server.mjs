import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = ['package.json', 'fish-dialogue.mjs', 'audio-store.mjs', 'progress.mjs'];
function isRoot(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).name.toLowerCase() === 'sillytavern'
            && fs.existsSync(path.join(dir,'src/plugin-loader.js'));
    } catch { return false; }
}
export function findRoot(start) {
    let dir = path.resolve(start);
    while (!isRoot(dir)) {
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error('无法自动定位酒馆。请将安装器放在酒馆扩展目录内，或执行 node install-server.mjs "酒馆根目录"。');
        dir = parent;
    }
    return fs.realpathSync(dir);
}
function noLinks(root, target) {
    const rel = path.relative(root,target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('目标路径超出酒馆目录');
    let current = root;
    for (const part of rel.split(path.sep).filter(Boolean)) {
        current = path.join(current,part);
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('安装路径包含符号链接或目录联接，请手动安装');
    }
}
export function installServer(source = path.join(here,'server'), rootInput = findRoot(here)) {
    const root = fs.realpathSync(rootInput);
    if (!isRoot(root)) throw new Error('指定路径不是 SillyTavern 根目录');
    // Read and validate the whole source before making any changes.
    const content = new Map(files.map(name=>[name,fs.readFileSync(path.join(source,name))]));
    const pkg = JSON.parse(content.get('package.json').toString());
    if (pkg.name !== 'fish-dialogue-server' || pkg.main !== 'fish-dialogue.mjs') throw new Error('服务端文件不匹配');
    const target = path.join(root,'plugins/fish-dialogue');
    const legacy = path.join(root,'plugins/fish-dialogue.mjs');
    noLinks(root,target); noLinks(root,legacy);
    for (const name of files) noLinks(root,path.join(target,name));
    if (fs.existsSync(target)) {
        if (!fs.statSync(target).isDirectory()) throw new Error('plugins/fish-dialogue 已存在且不是文件夹');
        const current = path.join(target,'package.json');
        if (!fs.existsSync(current) || JSON.parse(fs.readFileSync(current,'utf8')).name !== pkg.name) throw new Error('目标目录不是已知 Fish 服务端，拒绝覆盖');
    }
    const backup = path.join(root,'fish-dialogue-install-backups',Date.now()+'-'+randomUUID());
    noLinks(root,backup);
    const saved = [];
    if (fs.existsSync(target)) for (const name of files) {
        const p = path.join(target,name);
        if (fs.existsSync(p)) saved.push([name,fs.readFileSync(p)]);
    }
    if (fs.existsSync(legacy)) saved.push(['legacy-fish-dialogue.mjs',fs.readFileSync(legacy)]);
    if (saved.length) {
        fs.mkdirSync(backup,{recursive:true});
        for(const [name,bytes] of saved) fs.writeFileSync(path.join(backup,name),bytes,{flag:'wx'});
    }
    fs.mkdirSync(target,{recursive:true});
    try {
        for(const [name,bytes] of content) fs.writeFileSync(path.join(target,name),bytes);
        // Disable the old single-file loader only after its backup and the new install succeeded.
        if (fs.existsSync(legacy)) fs.renameSync(legacy,path.join(backup,'disabled-legacy.mjs'));
    } catch (error) {
        throw new Error(`安装未完成：${error.message}。旧文件备份：${saved.length ? backup : '无旧文件'}；请修复后重新运行安装器。`);
    }
    return { target, backup:saved.length ? backup : null, version:pkg.version };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = installServer(path.join(here,'server'),process.argv[2] ? path.resolve(process.argv[2]) : findRoot(here));
        console.log(`Fish 服务端 ${result.version} 已安装：${result.target}`);
        if(result.backup) console.log(`旧文件备份：${result.backup}`);
        console.log('请确认 config.yaml 中 enableServerPlugins: true，然后完全重启酒馆，再点击“检查酒馆代理”。\n安装器未改动配置、账户数据、音频或世界书。');
    } catch(error) { console.error('安装失败：'+error.message); process.exitCode=1; }
}
