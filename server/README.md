# Fish 对话音声 1.4.3

## 1.4.3：Windows 双击安装服务端

GitHub 扩展安装后，在安装好的 Fishdialogue 文件夹双击 **install-server.cmd**。安装器自动向上定位 SillyTavern 根目录，并将附带 server 的四个文件安装到 plugins/fish-dialogue。账户级和全用户安装均支持。

请先关闭酒馆，运行安装器，确认成功后再启动酒馆。enableServerPlugins 必须为 true，原 requestProxy 设置保留。安装器不修改 config.yaml，不读取或改写账户 Key、聊天、音频和世界书。

旧服务端文件备份到酒馆根目录 fish-dialogue-install-backups；旧单文件 plugins/fish-dialogue.mjs 在备份后移出 plugins，避免重复加载。备份不会自动清理。安装器遇到未知目标目录或路径联接时拒绝覆盖。

这不是浏览器自动部署：酒馆的 GitHub 安装接口不会执行安装器，所以需要双击一次，并重启酒馆。Node.js 必须在 PATH 中；找不到 Node 时请在启动酒馆使用的 Node 环境运行。

如文件在酒馆目录之外，可在安装包目录执行：

```text
node install-server.mjs "你的酒馆根目录"
```

Linux/macOS 在扩展文件夹执行 node install-server.mjs。当前一键入口针对 Windows；此版本未在 Linux/macOS 实机验证。

更新服务端时重复运行安装器即可。仅前端更新不需要重复执行。已经安装正常的 1.4.2 服务端可继续使用。


提取聊天中的 Talk-Emo 音声段，通过 Fish Audio 合成并保存音频。支持逐段播放、默认音色试听、角色音色绑定、多角色屏蔽、后台生成、进度和本地音频保留数量管理。插件本身不调用 LLM。

## 从 1.4.1 更新

覆盖前端全部文件，Ctrl+F5 刷新。在“语言与世界书”中选择中文、日语或英语，再点击“升级世界书”。旧世界书先备份，旧版五个专用条目替换为新版三个条目，其他条目保留。已有服务端和正则无需更新。

## 三语言世界书

Fish-Dialogue.json 与提供的文件逐字节一致。插件只改变启用状态，升级时为避免 UID 冲突可分配新 UID；不会改写标题、正文、提示词、示例或其他参数。

| 语言选项 | 唯一启用条目 |
| --- | --- |
| 中文 | FA_FORMAT · 中文 |
| 日语 | FA_FORMAT · 日语 |
| 英语 | FA_FORMAT · 英语 |
| 原文（关闭配音世界书） | 三项均关闭 |

新安装默认中文；保留老用户语言设置。原文模式供旧消息和普通双引号兼容使用，不提供第四份提示词。变更下拉选项后点“应用语言”才会改变世界书状态。旧五条目世界书应先点“升级世界书”。

协议：`<Talk-Emo>角色名|zh|"[happy] 台词"</Talk-Emo>`，语言字段可为 zh、en、ja。所有声音标签原样发送。展示隐藏与逐段按钮保持现有逻辑。正则仅在发送历史给模型时过滤音声段，不删除原始消息。

## 安装

前端需要独立服务端组件，扩展安装器不会安装服务端。

1. GitHub 仓库创建完成后，在酒馆“扩展程序 → 安装扩展”粘贴仓库首页链接。手动安装则把前端文件放入 `SillyTavern/public/scripts/extensions/third-party/fish-dialogue/`。
2. 将 server 目录的全部内容复制到 `SillyTavern/plugins/fish-dialogue/`。完整开发包的前端在 extension 内；GitHub 发布包的前端就在仓库根目录。不要遗漏 server/package.json；无需 npm install。
3. 如果已有旧的单文件 `plugins/fish-dialogue.mjs`，将其移到 plugins 外，避免重复加载。
4. 在酒馆 config.yaml 启用如下配置并重启：

```yaml
enableServerPlugins: true
requestProxy:
  enabled: true
  url: socks5://127.0.0.1:7890
  bypass:
    - localhost
    - 127.0.0.1
```

代理地址按实际配置填写。请求经服务端继承酒馆代理；未发现代理时拒绝直连。自定义 HTTPS 主机需在酒馆进程环境变量 FISH_ALLOWED_HOSTS 中允许。

5. 填写自己的 API Key 和音色 ID。模型文本框默认 s2.1-pro-free。选择中文、日语或英语，点“安装 / 挂载世界书”和“添加正则”。

## 使用与数据

- “新回复自动配音”和“聊天序号音频生成”仅生成、保存，不自动播放；聊天内按钮控制播放。
- 默认音色旁的“试听默认音色”会发起试听，再次点击停止。
- 音频按账户保存在 data/<账户>/fish-dialogue-audio/，包含音频及角色/音色等索引，不应上传到公开仓库。默认保留 200 个，可选 1–10000。
- “保存API KEY”将 Key 存到酒馆账户设置，清空再保存可删除；发布包不含账户设置。已有用户的本地配置不会因更新而清空。
- 普通双引号兼容仅在原文模式生效；旧 FA 和 talk 标签不再支持。
- 打开文件夹需要在运行酒馆的电脑上访问，否则使用下载功能。

## 发布与验证

请阅读 GITHUB发布指南.md 和 PRIVACY.md。1.0.0 仍是回退基准。开发版测试命令：`node --test --experimental-test-isolation=none tests/*.test.mjs`。
