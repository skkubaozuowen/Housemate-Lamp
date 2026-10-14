# Housemate · 文字情绪原型

独立网页，使用 Node.js + 原生 HTML/CSS/JavaScript。当前不连接灯或其他设备。

## 运行

Node.js 20+，无需安装依赖。将密钥放在项目目录的 `API Key.txt`，运行 `npm start`，打开 http://localhost:3000。

默认模型 `gpt-6-sol`，可用 `OPENAI_MODEL` 和 `PORT` 环境变量修改。密钥只由服务端读取，静态资源采用白名单，不会把密钥文件提供给浏览器。

## 使用

输入文字，回车或点击“听听我的心情”。Shift+Enter 换行。按钮可停止分析。“重新开始”清空当前对话；分析中点击则先停止本次分析。

返回主要情绪、次要情绪、表达强度、线索清晰程度、表达类型、原文依据、简短解释与回应。可以直接纠正 AI 的解读。信息不足时应返回“不明确”，不会把每句问候或命令强行归为一种情绪。

情绪标签是对文字的推测，不是心理诊断。每次发送最近 5 轮上下文给 OpenAI，使用 Responses API 的严格 JSON schema，服务端校验依据是否来自本次原文。请求设置 store:false；应用自身不写入对话日志或数据库，对话仅存在当前页面内存，刷新后消失。OpenAI 侧的数据处理依账户及服务政策而定。

## 检查

`node --test test/emotion.test.js`

## 网页光影模拟

情绪分析成功后，页面外围光晕用 4 秒渐变切换。开心为暖金，平静为浅绿；疲惫、难过、孤独为较暗暖光；焦虑、生气为稳定柔光；复杂为交融光色；不明确恢复默认微光。各场景以 19–46 秒周期缓慢流动。分析中、取消及失败时保留上一次场景，“重新开始”恢复默认。可暂停流动，颜色仍能响应情绪；系统开启减少动态效果时禁用动画与渐变。不控制任何实体设备。

情境理解支持从生日、团聚等事件推测情绪，并用“需要确认”标注隐含感受。会保留转折句里的共存情绪，同时尊重用户明确的否定和更正。幸福使用暖金光，忧郁使用蓝紫光；光影同时读取主要和次要情绪，在不同区域交融，不再只呈现主要情绪。

## Bright English interface

The page uses a full-screen white canvas with softly blurred, animated light colors. UI labels and AI replies/reflections are English, including for Chinese input; users can type in either language. Internal schema enums remain Chinese for compatibility and are translated for display. Brief replies and emotion tags stay visible; reflection text is collapsed by default. There is no dark chat panel. Sadness and loneliness use a bright blue/lavender palette, rest uses peach light, joy uses gold, and combined emotions continue to overlap.

## Railway deployment

Connect `skkubaozuowen/Housemate-Lamp`, branch `codex/housemate`. Use the repository root and start command `npm start`. Set `OPENAI_API_KEY` in Railway service Variables (never commit the key file). Optional: `OPENAI_MODEL=gpt-6-sol`. Railway provides `PORT`; when present the server listens on `0.0.0.0`. The same-origin check accepts the public HTTPS origin behind Railway's TLS proxy. After deployment, use Railway's assigned public domain to open the page from a phone.
