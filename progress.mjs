export class ProgressRegistry {
    constructor() { this.users = new Map(); }
    valid(id) { return typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id); }
    start(user,id) {
        if (!this.valid(id)) throw new Error('进度任务 ID 无效');
        const now=Date.now();
        for(const [key,map] of this.users) {
            for(const [job,value] of map) if(now-value.updatedAt>15*60*1000)map.delete(job);
            if(!map.size)this.users.delete(key);
        }
        const map=this.users.get(user)||new Map(); this.users.set(user,map);
        while(map.size>=300)map.delete(map.keys().next().value);
        const state={id,status:'requesting',receivedBytes:0,totalBytes:null,startedAt:now,updatedAt:now}; map.set(id,state);
        return patch=>{ Object.assign(state,patch,{updatedAt:Date.now()}); };
    }
    read(user,id) { const state=this.users.get(user)?.get(id); return state ? {...state,elapsedMs:Date.now()-state.startedAt}:null; }
}
