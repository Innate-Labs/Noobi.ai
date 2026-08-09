# GameAgent API 配置

## 当前推荐组合

| 能力                | Provider        | Base URL                         | Model                | 密钥策略                  |
| ------------------- | --------------- | -------------------------------- | -------------------- | ------------------------- |
| 主 Agent            | `openai-compat` | `https://api.deepseek.com`       | `deepseek-v4-flash`  | 填写一枚新的 DeepSeek Key |
| 类型识别 / GDD      | `openai-compat` | `https://api.deepseek.com`       | `deepseek-v4-pro`    | 自动复用主 Agent Key      |
| 图像生成            | `tongyi`        | `https://dashscope.aliyuncs.com` | `wan2.5-t2i-preview` | 填写一枚北京地域百炼 Key  |
| 视频 / 动画         | `tongyi`        | `https://dashscope.aliyuncs.com` | `wan2.5-i2v-preview` | 自动复用图像模型 Key      |
| 音乐结构 / 音效描述 | `openai-compat` | `https://api.deepseek.com`       | `deepseek-v4-flash`  | 自动复用主 Agent Key      |

只需要两枚凭据：一枚 DeepSeek Key 和一枚阿里云百炼 DashScope Key。

## 已验证的链路

- DeepSeek V4-Flash 主 Agent 流式请求：通过。
- 主 Agent Function Call → `classify_game_type` → DeepSeek V4-Pro：通过。
- renderer 不可读取明文密钥：通过。
- 同 Provider 密钥复用：通过自动化测试。
- DashScope 图像/视频：接口和模型已预填；必须在用户填入自己的北京地域 Key 后才能进行付费连通性测试。

## 在桌面端填写

1. 打开“模型与素材服务”。
2. “主 Agent”只填写 DeepSeek API Key；策划模型与音频模型会自动复用。
3. “图像模型”只填写 DashScope API Key；视频模型会自动复用。
4. 点击“保存设置”。导航左侧出现绿色状态点即表示凭据已经安全保存或继承。

API Key 只填写原始值，不要添加 `Bearer `。Base URL 不要自行附加 `/chat/completions` 或 `/api/v1`，GameAgent 会按 Provider 协议拼接请求路径。

## 能力边界

- DeepSeek 是文本模型，不能生成图片或视频。
- “音频模型”先让 LLM 生成 ABC 乐谱，再在本地合成 WAV，不是 DeepSeek 直接返回音频文件。
- Tilemap、图像去背景和代码构建主要在本地完成，不需要额外 API Key。
- 当前豆包静态文生图可以接入，但本项目的豆包视频适配仍是旧协议；完整素材流程优先使用通义。

## 官方入口

- DeepSeek API Key：<https://platform.deepseek.com/api_keys>
- DeepSeek 当前模型：<https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>
- DeepSeek 思考模式：<https://api-docs.deepseek.com/guides/thinking_mode/>
- 阿里云百炼 API Key：<https://help.aliyun.com/zh/model-studio/get-api-key>
- 百炼地域与 Base URL：<https://help.aliyun.com/zh/model-studio/base-url>
- 百炼图像与视频首次调用：<https://help.aliyun.com/zh/model-studio/first-call-to-image-and-video-api>

## 密钥安全

桌面端使用系统 `safeStorage` 加密。运行 Agent 时，密钥通过匿名 fd 管道一次性传入内置 Runtime，不进入命令行、环境变量、项目文件、浏览器存储或会话日志。

任何已经发送到聊天、截图、日志或代码仓库中的密钥都应立即吊销并重新创建。
